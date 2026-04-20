/**
 * Dashboard auth — v0 is a single shared password compared server-side and
 * exchanged for a signed, HttpOnly session cookie.
 *
 * This is intentionally primitive — good enough for one user (Drake) on
 * obsidianwebco.com/dashboard. Upgrade path:
 *   v1: magic link via Resend
 *   v2: Clerk
 *
 * Env required:
 *   DASHBOARD_PASSWORD   (plain — compared with timingSafeEqual)
 *   SESSION_SECRET     (random 32+ byte hex for HMAC signing the cookie)
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { env, requireEnv } from './env.js';

const COOKIE_NAME = 'obsidian_sess';
// S10: 24 hours (was 7 days) — short enough to limit stolen-cookie damage,
// long enough that Drake isn't re-logging in multiple times a day.
const COOKIE_MAX_AGE = 60 * 60 * 24;

/**
 * S9 — Session rotation.
 * Millisecond timestamp. Any token with `issuedAt < minValidIssuedAt` is
 * rejected. Incrementing this on every successful login invalidates every
 * cookie issued before that moment (kills stolen cookies the moment Drake
 * re-logs in, and kills previous browser sessions on fresh login).
 *
 * Cold-start caveat: serverless restart resets to 0, which means pre-restart
 * tokens pass the rotation check again. Acceptable for MVP; future upgrade
 * is to persist this in Vercel KV.
 */
let minValidIssuedAt = 0;

function getPassword(): string {
  return requireEnv('DASHBOARD_PASSWORD');
}

function getSecret(): string {
  const s = env('SESSION_SECRET');
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be ≥32 chars');
  return s;
}

/** Constant-time string equality. */
function equal(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Build the HMAC for a given payload. */
function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('hex');
}

/** Serialize a session token: `{issuedAt}.{hmac}`. */
function mintToken(): string {
  const issuedAt = Date.now().toString();
  return `${issuedAt}.${sign(issuedAt)}`;
}

/** Validate a session token from cookie value. */
export function isValidToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const [issuedAt, hmac] = token.split('.');
  if (!issuedAt || !hmac) return false;
  const issuedMs = Number(issuedAt);
  if (!Number.isFinite(issuedMs)) return false;
  if (Date.now() - issuedMs > COOKIE_MAX_AGE * 1000) return false;
  // S9: reject anything issued before the latest session rotation.
  if (issuedMs < minValidIssuedAt) return false;
  try {
    return equal(sign(issuedAt), hmac);
  } catch {
    return false;
  }
}

/**
 * S9 — invalidate every session issued before now.
 * Call on every successful login. Any subsequent call to `buildSessionCookie`
 * must happen after this so the fresh token has `issuedAt >= minValidIssuedAt`.
 */
export function rotateSession(): void {
  minValidIssuedAt = Date.now();
}

/** Check the submitted password against the env-configured one. */
export function checkPassword(submitted: string): boolean {
  try {
    return equal(submitted, getPassword());
  } catch {
    return false;
  }
}

/** Secure flag only in production — localhost dev is http:// and browsers
 *  refuse to save Secure cookies over non-HTTPS. Vercel prod is https://. */
const SECURE_FLAG =
  process.env.NODE_ENV === 'production' ? 'Secure; ' : '';

/** Build a Set-Cookie header for a fresh session. */
export function buildSessionCookie(): string {
  return (
    `${COOKIE_NAME}=${mintToken()}; ` +
    `Path=/; HttpOnly; ${SECURE_FLAG}SameSite=Strict; ` +
    `Max-Age=${COOKIE_MAX_AGE}`
  );
}

/** Clear cookie — for logout. */
export function buildLogoutCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; ${SECURE_FLAG}SameSite=Strict; Max-Age=0`;
}

/** Read cookie value from a Request's Cookie header. */
export function readSessionCookie(req: Request): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, v] = part.trim().split('=');
    if (k === COOKIE_NAME) return v ?? null;
  }
  return null;
}

/** Convenience: is this request authorized? */
export function isAuthorized(req: Request): boolean {
  return isValidToken(readSessionCookie(req));
}
