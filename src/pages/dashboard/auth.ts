/**
 * POST /dashboard/auth
 * Validates the submitted password; sets a signed session cookie on success
 * and redirects to /dashboard. On failure, redirects back to login with ?error=1.
 *
 * Middleware (middleware.ts) rate-limits requests to this endpoint at 5 per 15
 * min per IP before they land here (S1). This handler additionally tracks
 * consecutive failures: after 5 wrong passwords in 15 min, the IP is locked
 * for 30 min regardless of whether the password is eventually correct (S4).
 * On success, the session is rotated (S9) so any previously-issued cookie
 * becomes invalid.
 */

import type { APIRoute } from 'astro';
import {
  checkPassword,
  buildSessionCookie,
  rotateSession,
} from '../../lib/auth.js';
import {
  clientIp,
  recordFailure,
  recordSuccess,
} from '../../lib/rate-limit.js';

export const prerender = false;

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const LOCKOUT_MS = 30 * 60 * 1000;

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const password = String(form.get('password') ?? '');
  const ip = clientIp(request);
  const key = `login:${ip}`;

  if (!checkPassword(password)) {
    const result = recordFailure(key, {
      windowMs: LOGIN_WINDOW_MS,
      maxFailures: MAX_FAILURES,
      lockoutMs: LOCKOUT_MS,
    });
    const errParam = result.locked ? 'locked' : '1';
    return new Response(null, {
      status: 302,
      headers: { Location: `/dashboard/login?error=${errParam}` },
    });
  }

  // S4: clear failure counter + any active lockout for this IP
  recordSuccess(key);
  // S9: rotate session — any previously-issued cookie now fails validation.
  // Must happen BEFORE buildSessionCookie so the new token's issuedAt
  // is >= minValidIssuedAt.
  rotateSession();

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/dashboard',
      'Set-Cookie': buildSessionCookie(),
    },
  });
};
