/**
 * POST /api/webhooks/stripe
 *
 * Receives Stripe webhook events. Every event is signature-verified before we
 * act on it — spoofed webhooks are how attackers trigger false "payment
 * succeeded" flows, so this is non-negotiable.
 *
 * Stripe Dashboard setup (once, per environment):
 *   1. Developers → Webhooks → + Add endpoint
 *   2. Endpoint URL: https://obsidianwebco.com/api/webhooks/stripe
 *   3. Events to send (enable only what's handled below):
 *        - checkout.session.completed
 *        - checkout.session.expired
 *        - payment_intent.payment_failed
 *        - invoice.paid
 *        - invoice.payment_failed
 *   4. Copy the "Signing secret" (whsec_...) → set as STRIPE_WEBHOOK_SECRET
 *      in Vercel env vars.
 *
 * Flow on `checkout.session.completed`:
 *   1. Verify signature (throws if fail → 400 back to Stripe, it retries).
 *   2. Mark the Attio Deal (via session.metadata.attio_deal_id) as Won.
 *   3. Create Activity in Attio: "Deposit paid — {{amount}}"
 *   4. Trigger downstream: kickoff email, Drive folder creation, calendar events.
 *      (Those are stubs right now — wire them as the features get built.)
 *   5. Email Drake a push notification (via Resend/Postmark when set up;
 *      until then, console.log — Vercel surfaces that in the Functions tab).
 *
 * The handler is idempotent: Stripe retries events up to 3 days on any non-2xx.
 * We enforce this with an event.id set in lib/rate-limit.ts — any duplicate
 * delivery within the 3-day retry window is acknowledged 200 and skipped (S2).
 */
import type { APIRoute } from 'astro';
import type { StripeCheckoutSession, StripeEvent } from '../../../lib/stripe';
import { verifyWebhookSignature } from '../../../lib/stripe';
import { markAndCheckSeen } from '../../../lib/rate-limit';
import { safeError } from '../../../lib/pii-scrub';
import { logSecurityEvent } from '../../../lib/audit-log';

// S2: Stripe retries unacknowledged events for up to 3 days. We track event
// IDs for the same window so a replayed delivery is a no-op. In-memory for
// MVP — acceptable because duplicates within a single instance's lifetime
// are the common case; cross-instance duplicates still hit Attio's upsert-
// by-deal-id semantics downstream.
const IDEMPOTENCY_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export const POST: APIRoute = async ({ request }) => {
  // CRITICAL: read the RAW body for signature verification. Astro + Vercel
  // don't body-parse automatically on API routes, but if something else
  // pre-parses JSON, the signature check will fail.
  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature');

  let event: StripeEvent;
  try {
    event = verifyWebhookSignature(rawBody, signature);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('stripe webhook: signature verification failed', safeError(err));
    void logSecurityEvent('webhook_signature_fail', {
      endpoint: 'stripe',
      reason: message,
    });
    // 400 tells Stripe to retry later. 401 would be more semantically correct
    // but Stripe's docs recommend 400 for signature failures.
    return new Response(`Webhook signature error: ${message}`, { status: 400 });
  }

  // S2: idempotency gate — if we've already processed this event.id within
  // the retry window, acknowledge with 200 and skip the handler. Must be
  // AFTER signature verification (otherwise we'd poison the cache with
  // attacker-supplied event IDs) and BEFORE routing (so replays truly no-op).
  if (markAndCheckSeen(`stripe:${event.id}`, IDEMPOTENCY_TTL_MS)) {
    console.log(`stripe webhook: duplicate event ${event.id} (${event.type}) — skipping`);
    return new Response('ok (duplicate)', { status: 200 });
  }

  try {
    await routeEvent(event);
    void logSecurityEvent('stripe_webhook_processed', {
      event_id: event.id,
      type: event.type,
    });
    return new Response('ok', { status: 200 });
  } catch (err) {
    // Returning 500 tells Stripe to retry. Only do this for transient issues —
    // for bad data we should still 200 to stop retries, but we don't have that
    // distinction yet. For now, lean on retries; they stop after 3 days.
    console.error(`stripe webhook: handler error on ${event.type}`, safeError(err));
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(`Handler error: ${message}`, { status: 500 });
  }
};

// ─── Event router ──────────────────────────────────────────────────────────

async function routeEvent(event: StripeEvent): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as StripeCheckoutSession;
      await handleCheckoutCompleted(session);
      return;
    }
    case 'checkout.session.expired': {
      const session = event.data.object as StripeCheckoutSession;
      await handleCheckoutExpired(session);
      return;
    }
    case 'payment_intent.payment_failed': {
      await handlePaymentFailed(event);
      return;
    }
    case 'invoice.paid': {
      await handleInvoicePaid(event);
      return;
    }
    case 'invoice.payment_failed': {
      await handleInvoicePaymentFailed(event);
      return;
    }
    default:
      // Intentionally silent on unknown events — Stripe sometimes sends events
      // we didn't subscribe to, and we don't want to spam logs.
      return;
  }
}

// ─── Handlers ──────────────────────────────────────────────────────────────

async function handleCheckoutCompleted(session: StripeCheckoutSession): Promise<void> {
  const attioDealId = session.metadata?.attio_deal_id;
  const kind = session.metadata?.kind ?? 'unknown';
  const amountDollars = (session.amount_total ?? 0) / 100;
  const customerEmail = session.customer_email ?? session.customer_details?.email ?? '(no email)';

  console.log(
    `stripe webhook: deposit PAID — $${amountDollars.toFixed(2)} from ${customerEmail}` +
    ` (kind=${kind}, attio_deal_id=${attioDealId || 'none'}, session_id=${session.id})`
  );

  // TODO(attio): mark deal Won + log Activity once lib/attio.ts gets the
  // updateDealStage + createActivity helpers. Tracked in the plan's Phase 4
  // "Project kickoff" automation.
  //
  //   import { updateDealStage, createActivity } from './attio';
  //   if (attioDealId) {
  //     await updateDealStage(attioDealId, 'Won');
  //     await createActivity({
  //       deal: attioDealId,
  //       kind: 'payment-received',
  //       title: `Deposit paid — $${amountDollars.toFixed(2)}`,
  //       content: `Stripe session ${session.id}. Client: ${customerEmail}.`,
  //     });
  //   }

  // TODO(drive): create project folder. Uses the template laid out in
  // agency/operations/project-file-organization.md. Implement with Google Drive
  // API once OAuth scope is set up.

  // TODO(email): send kickoff email from comms-templates.md 'project-kickoff'.
  // Uses Resend or direct Gmail via Workspace.

  // TODO(calendar): create kickoff + weekly check-in + launch events on the
  // Client Calls calendar per GOOGLE CALENDAR ARCHITECTURE section of the plan.
}

async function handleCheckoutExpired(session: StripeCheckoutSession): Promise<void> {
  const attioDealId = session.metadata?.attio_deal_id;
  console.log(
    `stripe webhook: checkout session expired without payment ` +
    `(session_id=${session.id}, attio_deal_id=${attioDealId || 'none'})`
  );
  // TODO: flag the Attio deal as "Proposal expired — follow up"
}

async function handlePaymentFailed(event: StripeEvent): Promise<void> {
  const paymentIntent = event.data.object as { id: string; last_payment_error?: { message?: string } };
  console.log(
    `stripe webhook: payment FAILED — ${paymentIntent.id}: ${paymentIntent.last_payment_error?.message ?? 'no error message'}`
  );
  // TODO: email Drake so he can reach out + offer alternate payment method (ACH)
}

async function handleInvoicePaid(event: StripeEvent): Promise<void> {
  const invoice = event.data.object as { id: string; amount_paid: number; customer_email?: string };
  console.log(
    `stripe webhook: invoice paid — ${invoice.id} for $${(invoice.amount_paid / 100).toFixed(2)} from ${invoice.customer_email ?? '(unknown)'}`
  );
  // TODO: if this is a final-invoice (detect via metadata or invoice.description),
  // move Attio deal to "Project Complete" and queue post-launch emails.
}

async function handleInvoicePaymentFailed(event: StripeEvent): Promise<void> {
  const invoice = event.data.object as { id: string; amount_due: number; customer_email?: string };
  console.log(
    `stripe webhook: invoice payment FAILED — ${invoice.id} for $${(invoice.amount_due / 100).toFixed(2)} from ${invoice.customer_email ?? '(unknown)'}`
  );
  // TODO: escalate per agency/operations/automation-workflows.md Workflow 3 (dunning sequence)
}

// Server-side only. Don't prerender.
export const prerender = false;

// Disable Astro's default body parsing — we need the raw body for signature
// verification. Astro already gives us raw access via request.text(), but
// setting this explicitly is documentation for future devs.
export const config = {
  runtime: 'nodejs',
};
