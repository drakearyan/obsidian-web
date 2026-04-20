/**
 * Stripe API client — wraps the Stripe SDK for the three operations we actually
 * use in the Obsidian Web Co. sales flow:
 *
 *   1. createProductForProposal    — one-shot Product + Price per signed proposal
 *   2. createDepositCheckoutSession — hosted checkout URL emailed to the client
 *   3. verifyWebhookSignature       — confirms webhook events are really from Stripe
 *
 * Why per-proposal products instead of a static catalog?
 * Each signed proposal has a unique amount (tier-dependent, potential add-ons).
 * Creating a Product + Price at proposal time keeps Stripe's invoice reporting
 * aligned 1:1 with actual projects — one SKU per project, no generic "deposit"
 * line items cluttering revenue reports.
 *
 * Env required:
 *   STRIPE_SECRET_KEY        — sk_test_* or sk_live_* from Stripe Dashboard → Developers → API keys
 *   STRIPE_WEBHOOK_SECRET    — whsec_* from Stripe Dashboard → Webhooks → your endpoint
 *   PUBLIC_SITE_URL          — used to build success_url / cancel_url (e.g. https://obsidianwebco.com)
 *
 * Docs: https://docs.stripe.com/api
 */
import Stripe from 'stripe';
import { env, requireEnv } from './env.js';

function getSecretKey(): string {
  return requireEnv('STRIPE_SECRET_KEY');
}

function getWebhookSecret(): string {
  return requireEnv('STRIPE_WEBHOOK_SECRET');
}

function getSiteUrl(): string {
  return env('PUBLIC_SITE_URL') ?? 'https://obsidianwebco.com';
}

/**
 * Lazy-initialized Stripe client. The SDK's default API version is intentionally
 * used (matches the account's pinned version) — do NOT hardcode a version unless
 * upgrading across a breaking change.
 */
let _stripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(getSecretKey());
  }
  return _stripe;
}

// ─── Product + Price creation ─────────────────────────────────────────────

export interface ProposalProductInput {
  /** Client-facing name — e.g. "Blue Ridge Eats — Website Redesign". Shows on Stripe receipts. */
  name: string;
  /** Total project price in dollars. We convert to cents internally. */
  totalDollars: number;
  /** Obsidian tier slug: 'starter' | 'professional' | 'premium' */
  tier: 'starter' | 'professional' | 'premium';
  /** Attio deal id — stored in product metadata so the webhook can find the deal later. */
  attioDealId?: string;
}

export interface ProposalProduct {
  productId: string;
  priceId: string;
  depositPriceId: string;
  totalDollars: number;
  depositDollars: number;
}

/**
 * Creates a per-proposal Product plus two Prices:
 *   - full: the total project amount (used for reporting / invoicing final 50%)
 *   - deposit: 50% of total (used for the Checkout Session the client pays upfront)
 *
 * Idempotency note: this is NOT idempotent. If called twice for the same proposal
 * you'll get duplicate products. The caller (proposal-drafter agent) should
 * persist the returned IDs on the Attio Deal so it never creates twice.
 */
export async function createProductForProposal(
  input: ProposalProductInput,
): Promise<ProposalProduct> {
  const stripe = getStripe();
  const totalCents = Math.round(input.totalDollars * 100);
  const depositCents = Math.round(totalCents / 2);

  const product = await stripe.products.create({
    name: input.name,
    description: `Custom website build — ${input.tier} tier`,
    metadata: {
      obsidian_tier: input.tier,
      attio_deal_id: input.attioDealId ?? '',
    },
    default_price_data: {
      currency: 'usd',
      unit_amount: totalCents,
    },
  });

  const defaultPriceId = typeof product.default_price === 'string'
    ? product.default_price
    : product.default_price?.id;

  if (!defaultPriceId) {
    throw new Error(`Stripe returned product ${product.id} without a default_price`);
  }

  // Create the deposit price as a separate Price object on the same product.
  const depositPrice = await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: depositCents,
    nickname: '50% deposit',
    metadata: {
      is_deposit: 'true',
      obsidian_tier: input.tier,
    },
  });

  return {
    productId: product.id,
    priceId: defaultPriceId,
    depositPriceId: depositPrice.id,
    totalDollars: input.totalDollars,
    depositDollars: depositCents / 100,
  };
}

// ─── Checkout Session creation ─────────────────────────────────────────────

export interface DepositSessionInput {
  /** Price ID from createProductForProposal — must be the deposit price, not the full. */
  depositPriceId: string;
  /** Client's email — prefills the Stripe Checkout form. */
  clientEmail: string;
  /** Attio deal id — travels through to the webhook so we can update the deal on payment. */
  attioDealId?: string;
  /** Optional override of success URL. Defaults to /checkout/success?session_id={CHECKOUT_SESSION_ID} */
  successUrl?: string;
  cancelUrl?: string;
}

/**
 * Creates a Checkout Session for a project deposit. Returns the hosted URL which
 * the caller emails to the client (via comms-templates.md proposal flow).
 *
 * `{CHECKOUT_SESSION_ID}` is a Stripe-side placeholder — leave it unencoded in
 * the success_url so Stripe fills it in at redirect time.
 */
export async function createDepositCheckoutSession(
  input: DepositSessionInput,
): Promise<{ sessionId: string; url: string }> {
  const stripe = getStripe();
  const site = getSiteUrl();

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: input.depositPriceId, quantity: 1 }],
    customer_email: input.clientEmail,
    success_url: input.successUrl ?? `${site}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: input.cancelUrl ?? `${site}/checkout/cancelled`,
    // Collect billing address for fraud checks + future invoicing.
    billing_address_collection: 'required',
    // Allow Link + saved cards for returning clients.
    payment_method_types: ['card', 'us_bank_account'],
    // Metadata travels to the webhook; use it to pivot back to the Attio deal.
    metadata: {
      attio_deal_id: input.attioDealId ?? '',
      kind: 'project_deposit',
    },
    // Payment intent metadata duplicates session metadata — handy when you only
    // see a payment_intent in the dashboard (not the session).
    payment_intent_data: {
      metadata: {
        attio_deal_id: input.attioDealId ?? '',
        kind: 'project_deposit',
      },
      // Statement descriptor shown on the client's card statement.
      statement_descriptor_suffix: 'DEPOSIT',
    },
  });

  if (!session.url) {
    throw new Error(`Stripe created session ${session.id} but returned no url`);
  }
  return { sessionId: session.id, url: session.url };
}

// ─── Webhook signature verification ────────────────────────────────────────

/**
 * Verifies a Stripe webhook signature + parses the event. Call this from the
 * webhook route handler on every incoming request. Stripe signs the raw body,
 * so the caller MUST pass the unparsed request body (Buffer or string) — NOT
 * the JSON-parsed object. Astro's API route gets the raw body via `request.text()`.
 *
 * Throws if the signature doesn't verify (invalid, stale, or wrong secret).
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signatureHeader: string | null | undefined,
): Stripe.Event {
  if (!signatureHeader) {
    throw new Error('Missing Stripe-Signature header');
  }
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(payload, signatureHeader, getWebhookSecret());
}

// Re-export the types other files consume, so downstream code can avoid
// importing Stripe directly.
export type StripeEvent = Stripe.Event;
export type StripeCheckoutSession = Stripe.Checkout.Session;
