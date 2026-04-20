/**
 * POST /api/checkout/create-session
 *
 * Creates a Stripe Checkout Session for a project deposit.
 *
 * Called by:
 *   - Dashboard UI when Drake clicks "Generate deposit link" on a proposal
 *   - proposal-drafter agent when generating a fresh proposal email
 *
 * Flow:
 *   1. Verify auth (reuses the middleware's HMAC cookie — this route sits
 *      behind /dashboard/* protection in MIGRATION.md once Astro is wired).
 *   2. Create Product + deposit Price (unique per proposal, see lib/stripe.ts).
 *   3. Create a Checkout Session referencing the deposit Price.
 *   4. Return { url, session_id, product_id, deposit_price_id } so the caller
 *      can persist the IDs on the Attio Deal for future reconciliation.
 *
 * Expected JSON body:
 * {
 *   "client_name":   "Blue Ridge Eats",
 *   "client_email":  "owner@blueridgeeats.com",
 *   "project_name":  "Website Redesign + Launch",
 *   "tier":          "professional",
 *   "total_dollars": 1800,
 *   "attio_deal_id": "rec_abc123"   // optional but strongly recommended
 * }
 */
import type { APIRoute } from 'astro';
import {
  createProductForProposal,
  createDepositCheckoutSession,
} from '../../../lib/stripe';

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'Invalid JSON body');
  }

  const input = parseCreateSessionInput(body);
  if ('error' in input) {
    return jsonError(400, input.error);
  }

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
    console.error('create-session: Stripe error', err);
    const message = err instanceof Error ? err.message : 'Unknown Stripe error';
    return jsonError(502, `Stripe call failed: ${message}`);
  }
};

// ─── helpers ──────────────────────────────────────────────────────────────

type CreateSessionInput = {
  client_name: string;
  client_email: string;
  project_name: string;
  tier: 'starter' | 'professional' | 'premium';
  total_dollars: number;
  attio_deal_id?: string;
};

function parseCreateSessionInput(
  body: unknown,
): CreateSessionInput | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Body must be an object' };
  const b = body as Record<string, unknown>;

  const client_name = str(b.client_name);
  const client_email = str(b.client_email);
  const project_name = str(b.project_name);
  const tier = str(b.tier);
  const total = num(b.total_dollars);

  if (!client_name) return { error: 'client_name is required' };
  if (!client_email || !client_email.includes('@')) return { error: 'client_email must be a valid email' };
  if (!project_name) return { error: 'project_name is required' };
  if (tier !== 'starter' && tier !== 'professional' && tier !== 'premium') {
    return { error: `tier must be 'starter' | 'professional' | 'premium' (got: ${tier})` };
  }
  if (total === null || total <= 0) return { error: 'total_dollars must be a positive number' };
  if (total < 100) return { error: 'total_dollars seems too low — is this cents instead of dollars?' };

  return {
    client_name,
    client_email,
    project_name,
    tier,
    total_dollars: total,
    attio_deal_id: typeof b.attio_deal_id === 'string' ? b.attio_deal_id : undefined,
  };
}

function str(v: unknown): string { return typeof v === 'string' ? v.trim() : ''; }
function num(v: unknown): number | null { return typeof v === 'number' && Number.isFinite(v) ? v : null; }

function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

// Server-side only. Don't prerender.
export const prerender = false;
