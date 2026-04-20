/**
 * Astro middleware — gates /dashboard/* behind the cookie-based auth from
 * lib/auth.ts. Runs on every request (SSR mode only; marketing pages stay
 * prerendered and bypass this).
 *
 * Allow-list:
 *   /dashboard/login     — show the form
 *   /dashboard/auth      — POST target, validates password, sets cookie
 *   /dashboard/logout    — clears cookie
 *
 * Everything else under /dashboard/* requires a valid session cookie.
 */

import { defineMiddleware } from 'astro:middleware';
import { isAuthorized } from './lib/auth.js';
import { check, clientIp, tooManyRequestsResponse } from './lib/rate-limit.js';
import { logSecurityEvent } from './lib/audit-log.js';

const ALLOW = new Set([
  '/dashboard/login',
  '/dashboard/auth',
  '/dashboard/logout',
]);

// S1: login POSTs are capped at 5 per 15 min per IP.
// S4's lockout lives on the same bucket — if recordFailure() sets a
// `lockedUntil`, check() returns allowed=false with locked=true for the
// remaining lockout window (up to 30 min).
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = new URL(context.request.url);
  const method = context.request.method;

  // S1/S4: gate POSTs to /dashboard/auth regardless of auth state.
  // This is the only endpoint that accepts a password, so it's the only
  // brute-force surface worth the complexity. Runs BEFORE the allow-list so
  // a flood can't slip through by being in ALLOW.
  if (pathname === '/dashboard/auth' && method === 'POST') {
    const ip = clientIp(context.request);
    const result = check(`login:${ip}`, {
      windowMs: LOGIN_WINDOW_MS,
      max: LOGIN_MAX_ATTEMPTS,
    });
    if (!result.allowed) {
      void logSecurityEvent('rate_limit_hit', {
        endpoint: 'dashboard/auth',
        ip,
        locked: result.locked,
      });
      return tooManyRequestsResponse(
        result.retryAfterMs,
        result.locked
          ? 'Account temporarily locked after repeated failed attempts. Try again later.'
          : 'Too many login attempts. Try again in a few minutes.',
      );
    }
  }

  // Non-dashboard routes pass straight through
  if (!pathname.startsWith('/dashboard')) {
    return next();
  }

  // Allow-listed auth endpoints
  if (ALLOW.has(pathname) || ALLOW.has(pathname.replace(/\/$/, ''))) {
    return next();
  }

  // Gate everything else
  if (!isAuthorized(context.request)) {
    return context.redirect('/dashboard/login', 302);
  }

  return next();
});
