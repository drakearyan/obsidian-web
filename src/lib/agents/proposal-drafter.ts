/**
 * Agent: proposal-drafter
 *
 * Reads Drake's discovery-call notes + questionnaire answers + tier choice →
 * drafts a full proposal email body + subject line + generates a Stripe
 * deposit Checkout link → returns all pieces so the dashboard UI can show
 * a "review + send" screen.
 *
 * Drake reviews the draft, tweaks if needed, clicks "Send proposal" in the
 * dashboard. The actual send goes out from drake@obsidianwebco.com via
 * Gmail API (when wired) or is copied to clipboard for manual send (v1).
 *
 * Default model: Sonnet 4.6 (proposals need coherent structure — Haiku
 * drifts on 500+ word outputs). Override via PROPOSAL_MODEL env.
 *
 * This agent is NEW in the Stripe integration flow. It's the piece that
 * turns a discovery call into a ready-to-send proposal with a working
 * "pay deposit" button. Without it, Drake writes proposals by hand —
 * ~45 minutes each. With it, ~10 minutes of review + edits.
 */

import { claude, MODELS, OBSIDIAN_VOICE, textOf } from '../claude.js';
import { createProductForProposal, createDepositCheckoutSession } from '../stripe.js';

export type ProposalTier = 'starter' | 'professional' | 'premium';

export interface ProposalInput {
  /** Client business name (e.g. "Blue Ridge Eats"). */
  clientName: string;
  /** Client email — will be prefilled on Stripe checkout. */
  clientEmail: string;
  /** Project name — shows on Stripe receipts + invoices. */
  projectName: string;
  /** Tier from the quiz / discovery call. */
  tier: ProposalTier;
  /** Total project price in dollars. 50% of this becomes the deposit. */
  totalDollars: number;
  /** Plain-text transcript or bullet notes from the discovery call. */
  discoveryNotes: string;
  /** Questionnaire answers, if the client filled it already (can be empty). */
  questionnaireAnswers?: string;
  /** Optional Attio deal ID — passes through to Stripe metadata so the
   *  webhook can find the deal on payment. */
  attioDealId?: string;
  /** If true, skip the Stripe API call (for unit tests or preview). */
  dryRun?: boolean;
}

export interface ProposalDraft {
  /** Email subject line sent TO the client. */
  subject: string;
  /** Body of the email — Markdown so Drake can see structure before sending. */
  body: string;
  /** The line items list (name + price) the LLM extracted, for Drake's review. */
  scope: { item: string; note: string }[];
  /** Word count for sanity (Obsidian proposals run 400-800 words). */
  wordCount: number;
  /** Flags the LLM raised about quality — empty array if clean. */
  flags: string[];
}

export interface ProposalResult {
  draft: ProposalDraft;
  /** Stripe Checkout URL for the deposit — embedded in the email body. Null if dryRun. */
  depositCheckoutUrl: string | null;
  /** Stripe session ID — persist on the Attio deal for later reconciliation. */
  stripeSessionId: string | null;
  /** Stripe product ID — kept so the final-invoice price can be created later. */
  stripeProductId: string | null;
  /** Total + deposit amounts the client will see. */
  totalDollars: number;
  depositDollars: number;
  /** Tokens used, for cost tracking in Attio Activity. */
  tokensUsed: number;
}

function modelId(): string {
  const override = process.env.PROPOSAL_MODEL;
  if (override === 'opus') return MODELS.opus;
  if (override === 'haiku') return MODELS.haiku;
  return MODELS.sonnet;
}

const SYSTEM_PROMPT = `${OBSIDIAN_VOICE}

You are drafting a project proposal email from Drake Ryan (Obsidian Web Co.) to a prospect who just finished a discovery call.

Hard structure (DO NOT skip sections):

1. Subject line: "[Client Name] — [Project Name] proposal" (exact format, no creativity)
2. Opening paragraph: 2-3 sentences that reference ONE specific thing from the discovery notes. Shows you listened. No "Thanks for meeting with me today" filler.
3. Scope: bullet list of exactly what's included (5-10 bullets)
4. What's NOT included: bullet list of 3-5 common scope items that aren't in this proposal (sets expectations, prevents scope creep)
5. Timeline: 4-6 week breakdown in paragraph form (Week 1: kickoff + intake; Week 2: wireframes; etc.)
6. Investment: "Total: $X (50% deposit to start, 50% on launch)." The LLM receives the total — don't calculate new numbers.
7. Payment link line: "Pay the deposit via Stripe: [DEPOSIT_LINK_PLACEHOLDER]" — leave exactly this placeholder, the deposit link gets injected after.
8. Guarantees: 3-4 short bullets (Lighthouse 95+ mobile, client owns domain/code, 30/60/90-day support depending on tier, zero lock-in)
9. Closing: "Reply to this email or drop me a message at drake@obsidianwebco.com if anything's unclear. If this looks right, click the Stripe link above and we start [Week 1 start date]."

Rules:
- Write in Drake's voice: direct, plain-English, confident but not salesy, 8th-grade reading level.
- Do NOT use em-dashes. Use commas or periods.
- Do NOT say "In today's digital landscape" or any corporate filler.
- Do NOT invent new services or promise things not in the discovery notes.
- Do NOT use emojis.
- Word count target: 400-700 words. Flag if you go over 800.

Output STRICT JSON only — no prose before or after:
{
  "subject": "string",
  "body": "string (markdown)",
  "scope": [{"item": "string", "note": "string"}, ...],
  "wordCount": number,
  "flags": ["string", ...]
}`;

function buildUserPrompt(input: ProposalInput): string {
  return [
    `CLIENT: ${input.clientName}`,
    `PROJECT: ${input.projectName}`,
    `TIER: ${input.tier}`,
    `TOTAL (USD): $${input.totalDollars}`,
    `DEPOSIT (USD, auto-calculated): $${Math.round(input.totalDollars / 2)}`,
    '',
    'DISCOVERY CALL NOTES:',
    input.discoveryNotes,
    '',
    input.questionnaireAnswers
      ? `QUESTIONNAIRE ANSWERS:\n${input.questionnaireAnswers}`
      : 'QUESTIONNAIRE: not yet filled — draft based on discovery notes only.',
  ].join('\n');
}

function parseDraft(raw: string): ProposalDraft {
  // Extract JSON even if the model wraps it in prose by mistake.
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`proposal-drafter: model output didn't contain JSON: ${raw.slice(0, 200)}`);
  }
  const parsed = JSON.parse(jsonMatch[0]) as Partial<ProposalDraft>;
  if (!parsed.subject || !parsed.body) {
    throw new Error(`proposal-drafter: JSON missing subject or body`);
  }
  return {
    subject: parsed.subject,
    body: parsed.body,
    scope: parsed.scope ?? [],
    wordCount: parsed.wordCount ?? parsed.body.split(/\s+/).filter(Boolean).length,
    flags: parsed.flags ?? [],
  };
}

/**
 * Run the proposal-drafter agent. Returns the finished draft plus a Stripe
 * deposit checkout URL you can paste into the email (or, after migration,
 * inject into the email body automatically before send).
 */
export async function draftProposal(input: ProposalInput): Promise<ProposalResult> {
  // 1. Call the model for a draft
  const response = await claude().messages.create({
    model: modelId(),
    max_tokens: 2500,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(input) }],
  });

  const text = textOf(response.content);
  const draft = parseDraft(text);

  // 2. Create the Stripe Product + deposit Checkout Session (unless dryRun)
  let depositCheckoutUrl: string | null = null;
  let stripeSessionId: string | null = null;
  let stripeProductId: string | null = null;
  let depositDollars = Math.round(input.totalDollars / 2);

  if (!input.dryRun) {
    try {
      const product = await createProductForProposal({
        name: `${input.clientName} — ${input.projectName}`,
        totalDollars: input.totalDollars,
        tier: input.tier,
        attioDealId: input.attioDealId,
      });
      stripeProductId = product.productId;
      depositDollars = product.depositDollars;

      const session = await createDepositCheckoutSession({
        depositPriceId: product.depositPriceId,
        clientEmail: input.clientEmail,
        attioDealId: input.attioDealId,
      });
      stripeSessionId = session.sessionId;
      depositCheckoutUrl = session.url;

      // Inject the real URL into the body (replace the placeholder left by the model)
      draft.body = draft.body.replace(
        /\[?DEPOSIT_LINK_PLACEHOLDER\]?/g,
        depositCheckoutUrl,
      );
    } catch (err) {
      // Don't fail the whole agent if Stripe is down. The draft is still usable —
      // Drake can create a payment link manually and paste it in.
      console.error('proposal-drafter: Stripe session creation failed', err);
      draft.flags.push(
        'stripe_error: deposit link not generated, paste a Payment Link manually before sending',
      );
    }
  } else {
    // In dry-run mode, leave the placeholder so callers can see what would go where.
  }

  // 3. Compute tokens used (Anthropic SDK returns usage on the response object)
  const usage = (response as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
  const tokensUsed = (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0);

  return {
    draft,
    depositCheckoutUrl,
    stripeSessionId,
    stripeProductId,
    totalDollars: input.totalDollars,
    depositDollars,
    tokensUsed,
  };
}

/**
 * Quality guard — call this before showing the draft to Drake. Returns a
 * list of human-readable issues. Empty = draft is send-ready.
 *
 * Kept separate so the dashboard UI can re-check if Drake edits the draft.
 */
export function validateDraft(draft: ProposalDraft): string[] {
  const issues: string[] = [];
  if (draft.wordCount < 300) issues.push('body is too short (under 300 words) — will read as low-effort');
  if (draft.wordCount > 900) issues.push('body is too long (over 900 words) — tighten before sending');
  if (/—/.test(draft.body)) issues.push('contains an em-dash (—) — replace with commas or periods');
  if (/in today's digital/i.test(draft.body)) issues.push('contains generic corporate filler');
  if (!draft.subject.includes(' — ') && !draft.subject.includes(' - ')) {
    issues.push(`subject line doesn't follow "[Client] — [Project] proposal" format: "${draft.subject}"`);
  }
  if (!/stripe/i.test(draft.body)) {
    issues.push('body doesn\'t reference the Stripe payment link');
  }
  return [...issues, ...draft.flags];
}
