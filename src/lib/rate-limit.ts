/**
 * In-memory IP-keyed rate limit + failure tracker.
 *
 * Per-instance on Vercel serverless (not shared across cold-start instances).
 * Acceptable for MVP — attackers can't reliably hit a specific instance, and
 * lockout still activates within a single instance's lifetime. Move to Vercel
 * KV when we see real attack traffic.
 *
 * One Map services three concerns to keep the surface small:
 *   - rolling windowed request count (S1 login limiter, S2 webhook flood limiter)
 *   - consecutive-failure count with timed lockout (S4 account lockout)
 *   - idempotency-key "seen" set (S2 Stripe webhook dedupe)
 */

type Bucket = {
  /** Total requests in the current window. */
  count: number;
  /** Millisecond timestamp when the window resets. */
  resetAt: number;
  /** Consecutive failures (S4). Cleared on recordSuccess. */
  failures: number;
  /** Millisecond timestamp until which the key is fully blocked. */
  lockedUntil: number;
};

const buckets = new Map<string, Bucket>();
const seenIds = new Map<string, number>(); // event/request id -> expiresAt

// Hard caps to prevent unbounded memory use.
const BUCKETS_MAX = 10_000;
const SEEN_MAX = 50_000;

function getOrCreate(key: string, windowMs: number): Bucket {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = {
      count: 0,
      resetAt: now + windowMs,
      failures: bucket?.failures ?? 0,
      lockedUntil: bucket?.lockedUntil ?? 0,
    };
    buckets.set(key, bucket);
  }
  maybeEvictBuckets();
  return bucket;
}

function maybeEvictBuckets(): void {
  if (buckets.size < BUCKETS_MAX) return;
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (b.resetAt < now && b.lockedUntil < now) buckets.delete(k);
    if (buckets.size < BUCKETS_MAX / 2) break;
  }
}

function maybeEvictSeen(): void {
  if (seenIds.size < SEEN_MAX) return;
  const now = Date.now();
  for (const [k, exp] of seenIds) {
    if (exp < now) seenIds.delete(k);
    if (seenIds.size < SEEN_MAX / 2) break;
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
  locked: boolean;
};

/**
 * Windowed counter — allow up to `max` requests per `windowMs`.
 * Also respects an active lockout (set via recordFailure).
 */
export function check(
  key: string,
  opts: { windowMs: number; max: number },
): RateLimitResult {
  const now = Date.now();
  const bucket = getOrCreate(key, opts.windowMs);

  if (bucket.lockedUntil > now) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: bucket.lockedUntil - now,
      locked: true,
    };
  }

  bucket.count++;
  const allowed = bucket.count <= opts.max;
  const remaining = Math.max(0, opts.max - bucket.count);
  const retryAfterMs = allowed ? 0 : bucket.resetAt - now;
  return { allowed, remaining, retryAfterMs, locked: false };
}

/**
 * Record a failed auth attempt. When `maxFailures` is reached within
 * `windowMs`, the key is locked for `lockoutMs`.
 */
export function recordFailure(
  key: string,
  opts: { windowMs: number; maxFailures: number; lockoutMs: number },
): RateLimitResult {
  const now = Date.now();
  const bucket = getOrCreate(key, opts.windowMs);
  bucket.failures++;
  if (bucket.failures >= opts.maxFailures) {
    bucket.lockedUntil = now + opts.lockoutMs;
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: opts.lockoutMs,
      locked: true,
    };
  }
  return {
    allowed: true,
    remaining: opts.maxFailures - bucket.failures,
    retryAfterMs: 0,
    locked: false,
  };
}

/** Reset failure count and clear any lockout. Call on successful auth. */
export function recordSuccess(key: string): void {
  const bucket = buckets.get(key);
  if (!bucket) return;
  bucket.failures = 0;
  bucket.lockedUntil = 0;
}

/** Returns true the FIRST time `id` is seen; subsequent calls return true indicating seen. */
export function markAndCheckSeen(id: string, ttlMs: number): boolean {
  const now = Date.now();
  const existing = seenIds.get(id);
  if (existing && existing > now) return true;
  seenIds.set(id, now + ttlMs);
  maybeEvictSeen();
  return false;
}

/** Extract the client IP from Vercel/Node headers. Falls back to 'unknown'. */
export function clientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real;
  return 'unknown';
}

/** Standard 429 response body for rate-limited endpoints. */
export function tooManyRequestsResponse(retryAfterMs: number, message?: string): Response {
  const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return new Response(
    JSON.stringify({
      error: message ?? 'Too many requests',
      retry_after_seconds: retryAfterSec,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSec),
      },
    },
  );
}

// Export for tests only — do not use in production code paths.
export const __internal = { buckets, seenIds };
