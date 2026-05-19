/**
 * /api/checkout/create-session — Stripe Checkout Session for project deposits.
 *
 * Called by:
 *   - Dashboard UI when Drake clicks "Generate deposit link" on a proposal
 *   - proposal-drafter agent when generating a fresh proposal email
 *   - Public marketing pages with an embedded checkout button (future)
 *
 * GET  — issues a CSRF token + cookie. Clients call this before POST.
 * POST — validates body (zod) + rate-limits + verifies CSRF → Stripe calls.
 *
 * Security posture (S3):
 *   - zod-validated body (no hand-rolled parsing).
 *   - CSRF double-submit cookie (HMAC-signed via SESSION_SECRET).
 *   - IP rate-limit 20/15 min.
 *   - Unauthenticated POST → 401. Malformed body → 400 with safe message.
 *   - Errors go through safeError() — no PII/stack-trace leakage.
 *   - Audit events emitted via logSecurityEvent().
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import {
  createProductForProposal,
  createDepositCheckoutSession,
} from '../../../lib/stripe';
import { issueCsrfToken, verifyCsrfToken } from '../../../lib/csrf';
import { check, clientIp, tooManyRequestsResponse } from '../../../lib/rate-limit';
import { safeError } from '../../../lib/pii-scrub';
import { logSecurityEvent } from '../../../lib/audit-log';

const CHECKOUT_WINDOW_MS = 15 * 60 * 1000;
const CHECKOUT_MAX = 20;

const CreateSessionSchema = z.object({
  client_name: z.string().trim().min(1, 'client_name required').max(200),
  client_email: z.string().trim().email('client_email must be a valid email'),
  project_name: z.string().trim().min(1, 'project_name required').max(200),
  tier: z.enum(['starter', 'professional', 'premium']),
  total_dollars: z.number().finite().min(100).max(50_000),
  attio_deal_id: z.string().trim().min(1).max(200).optional(),
  csrf_token: z.string().min(16, 'csrf_token required'),
});

/** GET — issue a fresh CSRF token + cookie. */
export const GET: APIRoute = async () => {
  const { token, cookieHeader } = issueCsrfToken();
  return new Response(JSON.stringify({ csrf_token: token }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Set-Cookie': cookieHeader,
    },
  });
};

/** POST — validate, authorize via CSRF, create Stripe session. */
export const POST: APIRoute = async ({ request }) => {
  const ip = clientIp(request);

  // 1. Rate limit (shared primitive from lib/rate-limit.ts).
  const rl = check(`checkout:${ip}`, {
    windowMs: CHECKOUT_WINDOW_MS,
    max: CHECKOUT_MAX,
  });
  if (!rl.allowed) {
    void logSecurityEvent('rate_limit_hit', { endpoint: 'checkout', ip });
    return tooManyRequestsResponse(rl.retryAfterMs, 'Too many checkout requests.');
  }

  // 2. Parse JSON.
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError(400, 'Invalid JSON body');
  }

  // 3. Validate shape.
  const parsed = CreateSessionSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const message = first ? `${first.path.join('.') || 'body'}: ${first.message}` : 'Invalid body';
    return jsonError(400, message);
  }
  const input = parsed.data;

  // 4. Authorize via CSRF double-submit.
  if (!verifyCsrfToken(request, input.csrf_token)) {
    void logSecurityEvent('csrf_fail', { endpoint: 'checkout', ip });
    return jsonError(401, 'Invalid or missing CSRF token. Call GET first.');
  }

  // 5. Stripe calls.
  try {
    const product = await createProductForProposal({
      name: `${input.client_name} — ${input.project_name}`,
      totalDollars: input.total_dollars,
      tier: input.tier,
      attioDealId: input.attio_deal_id,
    });

    const session = await createDepositCheckoutSession({
      depositPriceId: product.depositPriceId,
      clientEmail: input.client_email,
      attioDealId: input.attio_deal_id,
    });

    void logSecurityEvent('checkout_created', {
      session_id: session.sessionId,
      product_id: product.productId,
      attio_deal_id: input.attio_deal_id,
      tier: input.tier,
      total_dollars: input.total_dollars,
    });

    return Response.json({
      url: session.url,
      session_id: session.sessionId,
      product_id: product.productId,
      deposit_price_id: product.depositPriceId,
      full_price_id: product.priceId,
      deposit_dollars: product.depositDollars,
      total_dollars: product.totalDollars,
    });
  } catch (err) {
    console.error('create-session: Stripe error', safeError(err));
    return jsonError(502, 'Stripe call failed. See server logs for details.');
  }
};

function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

export const prerender = false;
