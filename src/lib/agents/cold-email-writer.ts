/**
 * Agent: cold-email-writer
 *
 * Reads an Attio person + company record, drafts a personalized cold email
 * under 90 words using OBSIDIAN_VOICE, and:
 *   - DRY_RUN=1: returns the draft only, no side effects
 *   - otherwise: pushes to Smartlead campaign + logs activity to Attio
 *
 * Default model: Sonnet 4.6 (Opus 4.6 is better quality but at ~20 drafts/day
 * exceeds the $20/mo Anthropic cap. Override via env COLD_EMAIL_MODEL.)
 */

import { claude, MODELS, OBSIDIAN_VOICE, textOf } from '../claude.js';
import { getRecord, logActivity, type AttioRecord } from '../attio.js';
import { addLeadToCampaign } from '../smartlead.js';

export type Draft = {
  subject: string;
  body: string;
  wordCount: number;
  flags: string[]; // e.g. ['too long', 'contains em-dash']
};

export type RunInput = {
  personId: string;
  companyId?: string;
};

export type RunOutput = {
  ok: boolean;
  output?: { draft: Draft; smartleadOk?: boolean; activityId?: string };
  error?: string;
  tokensUsed: number;
};

function modelId(): string {
  const override = process.env.COLD_EMAIL_MODEL;
  if (override === 'opus') return MODELS.opus;
  if (override === 'haiku') return MODELS.haiku;
  return MODELS.sonnet;
}

const SYSTEM = `${OBSIDIAN_VOICE}

Your job is to draft ONE cold email to a prospect.

Hard constraints:
- Subject line: 4-7 words, lowercase except first word, no emojis, no "Re:" tricks.
- Body: under 90 words total.
- No em-dashes (—). Use commas or periods instead.
- Mention one SPECIFIC detail from the prospect input (city, industry, site state). Generic = delete.
- One clear ask. Pick ONE:
  a) "I made a quick 2-minute audit of your site. Want it?"
  b) "Want a 15-minute call Thursday or Friday?"
  c) "I'll write a free 1-paragraph teardown of your homepage. Reply 'yes' if you want it."
- Do NOT: mention the Obsidian price tiers, brag, or add a PS line.
- Do NOT: sound like a template. Each email should feel like Drake typed it this morning.

Output STRICT JSON only:
{
  "subject": string,
  "body": string
}`;

function extractAttr(record: AttioRecord | undefined, slug: string): string | undefined {
  const raw = record?.values?.[slug]?.[0];
  if (!raw) return undefined;
  if (typeof raw === 'object' && raw !== null) {
    const r = raw as Record<string, unknown>;
    return (
      (r.value as string | undefined) ??
      (r.email_address as string | undefined) ??
      (r.phone_number as string | undefined) ??
      ((r.option as { title?: string } | undefined)?.title) ??
      undefined
    );
  }
  return String(raw);
}

function countWords(s: string): number {
  return s.trim().split(/\s+/).length;
}

function validateDraft(draft: { subject: string; body: string }): Draft {
  const flags: string[] = [];
  const wordCount = countWords(draft.body);
  if (wordCount > 90) flags.push('over 90 words');
  if (draft.body.includes('—')) flags.push('contains em-dash');
  if (/In today's digital landscape|synergy|leverage|unlock|elevate|cutting-edge|game-changing/i.test(draft.body)) {
    flags.push('buzzword detected');
  }
  if (draft.body.includes('\nWe ') || draft.body.includes('our team')) {
    flags.push('plural voice (should be solo)');
  }
  return { subject: draft.subject, body: draft.body, wordCount, flags };
}

export async function run(input: RunInput): Promise<RunOutput> {
  const dryRun = process.env.DRY_RUN === '1';

  let person: AttioRecord;
  let company: AttioRecord | undefined;
  try {
    person = await getRecord('people', input.personId);
    if (input.companyId) company = await getRecord('companies', input.companyId);
  } catch (err) {
    return {
      ok: false,
      error: `Attio fetch failed: ${err instanceof Error ? err.message : err}`,
      tokensUsed: 0,
    };
  }

  const firstName =
    (person.values.name?.[0] as { first_name?: string } | undefined)?.first_name ??
    'there';
  const email = extractAttr(person, 'email_addresses') ?? '';
  const city = extractAttr(person, 'city') ?? '';
  const companyName = extractAttr(company, 'name') ?? '';
  const industry = extractAttr(company, 'industry') ?? '';
  const websiteState = extractAttr(company, 'website_state') ?? 'Unknown';
  const rating = extractAttr(company, 'google_rating') ?? '';
  const reviewCount = extractAttr(company, 'review_count') ?? '';

  const userPrompt = `Prospect:
- First name: ${firstName}
- Company: ${companyName}
- Industry: ${industry}
- City: ${city}
- Website state: ${websiteState} (None / Facebook-only / DIY builder / Outdated / Decent)
- Google rating: ${rating} (${reviewCount} reviews)

Draft the cold email per the constraints. Return JSON only.`;

  let draft: Draft;
  let tokensUsed = 0;
  try {
    const response = await claude().messages.create({
      model: modelId(),
      max_tokens: 512,
      system: SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    });
    tokensUsed =
      (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
    const raw = textOf(response.content).trim();
    const parsed = JSON.parse(raw) as { subject: string; body: string };
    draft = validateDraft(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!dryRun) {
      try {
        await logActivity({
          title: `cold-email-writer failed for ${companyName || firstName}`,
          body: `Error: ${message}\nInput person: ${input.personId}`,
          kind: 'agent-run',
          agent_name: 'cold-email-writer',
          person_id: input.personId,
          company_id: input.companyId,
        });
      } catch {
        // swallow
      }
    }
    return { ok: false, error: message, tokensUsed };
  }

  if (dryRun) {
    return { ok: true, output: { draft }, tokensUsed };
  }

  // Push to Smartlead
  let smartleadOk = false;
  if (email) {
    try {
      await addLeadToCampaign({
        email,
        first_name: firstName,
        company_name: companyName,
        attio_person_id: input.personId,
        custom_fields: {
          subject: draft.subject,
          personalized_body: draft.body,
          industry,
          city,
          website_state: websiteState,
        },
      });
      smartleadOk = true;
    } catch (err) {
      console.error('cold-email-writer: Smartlead push failed:', err);
    }
  }

  // Log activity
  let activityId: string | undefined;
  try {
    const activity = await logActivity({
      title: `Drafted cold email to ${companyName || firstName}`,
      body: `Subject: ${draft.subject}\n\n${draft.body}\n\n---\nWord count: ${draft.wordCount}\nFlags: ${draft.flags.join(', ') || 'none'}\nSmartlead: ${smartleadOk ? 'pushed' : 'skipped'}`,
      kind: 'email-sent',
      agent_name: 'cold-email-writer',
      person_id: input.personId,
      company_id: input.companyId,
      tokens_used: tokensUsed,
    });
    activityId = activity.id.record_id;
  } catch (err) {
    console.error('cold-email-writer: activity log failed:', err);
  }

  return { ok: true, output: { draft, smartleadOk, activityId }, tokensUsed };
}
