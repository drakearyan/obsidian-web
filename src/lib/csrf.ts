/**
 * CSRF tokens for public POST endpoints (S3).
 *
 * The checkout endpoint (`/api/checkout/create-session`) is callable from
 * public marketing pages (not just from behind `/dashboard/*` auth), so a
 * session-cookie gate would break the flow. Instead:
 *
 *   - GET /api/checkout/create-session issues a random nonce, signs it with
 *     `SESSION_SECRET` (same HMAC key used by auth.ts), and sets a
 *     HttpOnly + SameSite=Strict cookie `obsidian_csrf`.
 *   - The response body returns the same nonce as `csrf_token`.
 *   - The page then POSTs with `{ csrf_token, ...payload }`. We verify the
 *     signed cookie decodes to the same nonce before touching Stripe.
 *
 * This is the "double-submit cookie" pattern: both the cookie AND the body
 * must carry the same nonce, so an attacker who can make cross-origin
 * requests still can't read the cookie to forge a matching body.
 *
 * Tokens expire after 2 hours.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from './env.js';

const COOKIE_NAME = 'obsidian_csrf';
const TTL_SECONDS = 2 * 60 * 60; // 2 hours

function getSecret(): string {
  const s = env('SESSION_SECRET');
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be ≥32 chars');
  return s;
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('hex');
}

function equal(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

const SECURE_FLAG =
  process.env.NODE_ENV === 'production' ? 'Secure; ' : '';

/** Result type mirrors buildSessionCookie()'s return shape. */
export type CsrfIssue = {
  /** Nonce the client echoes in the POST body. */
  token: string;
  /** Set-Cookie header value to attach to the response. */
  cookieHeader: string;
};

/**
 * Issue a fresh CSRF token + its matching cookie. Caller attaches the
 * cookieHeader to their Response and returns the token in the body.
 */
export function issueCsrfToken(): CsrfIssue {
  const nonce = randomBytes(32).toString('hex');
  const issuedAt = Date.now().toString();
  const payload = `${nonce}.${issuedAt}`;
  const cookieValue = `${payload}.${sign(payload)}`;
  const cookieHeader =
    `${COOKIE_NAME}=${cookieValue}; ` +
    `Path=/; HttpOnly; ${SECURE_FLAG}SameSite=Strict; ` +
    `Max-Age=${TTL_SECONDS}`;
  return { token: nonce, cookieHeader };
}

/** Extract the CSRF cookie value from a Request. */
function readCsrfCookie(req: Request): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, v] = part.trim().split('=');
    if (k === COOKIE_NAME) return v ?? null;
  }
  return null;
}

/**
 * Check that the body token matches the cookie, the HMAC is valid, and the
 * token hasn't expired. Returns true iff all three hold.
 */
export function verifyCsrfToken(req: Request, bodyToken: string | undefined | null): boolean {
  if (!bodyToken) return false;
  const cookie = readCsrfCookie(req);
  if (!cookie) return false;

  const parts = cookie.split('.');
  if (parts.length !== 3) return false;
  const [nonce, issuedAt, hmac] = parts as [string, string, string];

  // HMAC integrity
  const expected = sign(`${nonce}.${issuedAt}`);
  try {
    if (!equal(expected, hmac)) return false;
  } catch {
    return false;
  }

  // Expiry
  const issuedMs = Number(issuedAt);
  if (!Number.isFinite(issuedMs)) return false;
  if (Date.now() - issuedMs > TTL_SECONDS * 1000) return false;

  // Body must match cookie nonce (double-submit)
  try {
    return equal(nonce, bodyToken);
  } catch {
    return false;
  }
}
