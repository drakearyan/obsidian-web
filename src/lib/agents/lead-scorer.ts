/**
 * Agent: lead-scorer
 *
 * Takes a row from `lead_finder_lynchburg.py` CSV output and scores it 0–100
 * against Obsidian Web Co.'s fit criteria:
 *   - No website / FB-only / DIY builder  → higher score
 *   - Small local business (not a chain)  → higher
 *   - Google rating ≥ 3.5, reviews ≥ 10   → higher (real business, not dead)
 *   - Not a national chain                → required, else 0
 *   - Target towns (Lynchburg + 7 neighbors) → higher
 *
 * Upserts to Attio with score + reasoning, then logs an activity.
 *
 * Honors DRY_RUN=1 — returns draft score without writing to Attio.
 */

import { claude, MODELS, textOf } from '../claude.js';
import { logActivity, upsertRecord, type AttioRecord } from '../attio.js';

export type LeadCsvRow = {
  name: string;
  address?: string;
  phone?: string;
  website?: string;
  rating?: string | number;
  review_count?: string | number;
  types?: string;
  place_id?: string;
  email?: string;
  /** Optional notes from the scraper (e.g. 'facebook-only', 'diy-wix'). */
  flags?: string;
};

export type ScoreResult = {
  score: number;
  reasoning: string;
  signals: {
    websiteState: 'None' | 'Facebook-only' | 'DIY builder' | 'Outdated' | 'Decent' | 'Unknown';
    isChain: boolean;
    inTargetArea: boolean;
    activeBusiness: boolean;
  };
  recommendedTier: 'Starter' | 'Growth' | 'Premier' | 'Unknown';
};

export type RunOutput = {
  ok: boolean;
  output?: {
    score: ScoreResult;
    personId?: string;
    companyId?: string;
    activityId?: string;
  };
  error?: string;
  tokensUsed: number;
};

const TARGET_TOWNS = [
  'Lynchburg', 'Forest', 'Madison Heights', 'Amherst',
  'Bedford', 'Appomattox', 'Altavista', 'Rustburg',
];

const SYSTEM = `You score local business leads for Drake Ryan's solo web design agency in Lynchburg, Virginia.

You return STRICT JSON only — no prose, no markdown, no commentary outside the JSON object.

Schema:
{
  "score": number 0-100,
  "reasoning": string (2-3 sentences, specific),
  "signals": {
    "websiteState": "None" | "Facebook-only" | "DIY builder" | "Outdated" | "Decent" | "Unknown",
    "isChain": boolean,
    "inTargetArea": boolean,
    "activeBusiness": boolean
  },
  "recommendedTier": "Starter" | "Growth" | "Premier" | "Unknown"
}

Scoring rubric:
- 90-100: no site or FB-only, active business (≥10 reviews, ≥3.5 rating), in target area, not a chain
- 70-89: DIY builder (Wix/Squarespace/GoDaddy) or clearly outdated site, active, in target area
- 50-69: decent site but stale content / poor mobile, or active business with any kind of site in target area
- 20-49: outside target area but strong signals, or target area but weak business signals
- 0-19: chain, dead business (<3 reviews in 2 years), suspended listing, or irrelevant industry

Tier heuristic (for recommendedTier):
- Starter ($500-$800): solo operator, very small biz, no existing site, budget-constrained signals
- Growth ($1,200-$2,500): established small biz, has employees, needs proper site with content
- Premier ($3,000-$6,000+): multi-location, higher transaction value (legal, medical, boutique), ecommerce
- Unknown: can't tell from input

CRITICAL: return only the JSON object. Nothing before or after.`;

export async function run(row: LeadCsvRow): Promise<RunOutput> {
  const dryRun = process.env.DRY_RUN === '1';
  const now = new Date().toISOString();

  const userPrompt = `Lead input (CSV row):
name: ${row.name}
address: ${row.address ?? ''}
phone: ${row.phone ?? ''}
website: ${row.website ?? '(none)'}
rating: ${row.rating ?? ''}
review_count: ${row.review_count ?? ''}
types: ${row.types ?? ''}
flags: ${row.flags ?? ''}
email: ${row.email ?? ''}

Target towns: ${TARGET_TOWNS.join(', ')}

Score this lead.`;

  let score: ScoreResult;
  let tokensUsed = 0;

  try {
    const response = await claude().messages.create({
      model: MODELS.haiku,
      max_tokens: 512,
      system: SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    });
    tokensUsed =
      (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

    const raw = textOf(response.content).trim();
    score = JSON.parse(raw) as ScoreResult;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!dryRun) {
      try {
        await logActivity({
          title: `lead-scorer failed on ${row.name}`,
          body: `Error: ${message}\n\nInput: ${JSON.stringify(row)}`,
          kind: 'agent-run',
          agent_name: 'lead-scorer',
        });
      } catch {
        // swallow — don't compound the failure
      }
    }
    return { ok: false, error: message, tokensUsed };
  }

  if (dryRun) {
    return { ok: true, output: { score }, tokensUsed };
  }

  // Upsert company (by domain if we have a website, else by place_id)
  let companyId: string | undefined;
  try {
    const domain = row.website
      ? row.website.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase()
      : undefined;
    const matchAttr = domain ? 'domains' : 'place_id';
    const companyValues: Record<string, unknown> = {
      name: [{ value: row.name }],
      industry: [{ option: guessIndustry(row.types) }],
      website_state: [{ option: score.signals.websiteState }],
      review_count: [{ value: Number(row.review_count ?? 0) }],
      google_rating: [{ value: Number(row.rating ?? 0) }],
      is_chain: [{ value: score.signals.isChain }],
      place_id: [{ value: row.place_id ?? '' }],
      scrape_source: [{ value: `lead_finder_lynchburg.py ${now.slice(0, 10)}` }],
    };
    if (domain) companyValues.domains = [{ domain }];
    const company = (await upsertRecord('companies', matchAttr, companyValues)) as AttioRecord;
    companyId = company.id.record_id;
  } catch (err) {
    // Not fatal for the person upsert — continue
    console.error('lead-scorer: company upsert failed:', err);
  }

  // Upsert person (by email if present — skip if no email, can't reach them)
  let personId: string | undefined;
  if (row.email) {
    try {
      const personValues: Record<string, unknown> = {
        name: [{ first_name: row.name.split(' ')[0] ?? '', last_name: '' }],
        email_addresses: [{ email_address: row.email }],
        score: [{ value: score.score }],
        score_reasoning: [{ value: score.reasoning }],
        lifecycle_stage: [{ option: 'Lead' }],
        source: [{ option: 'Cold email' }],
        city: [{ value: extractCity(row.address ?? '') }],
        budget_tier: [{ option: score.recommendedTier }],
        first_contacted: [{ value: now }],
      };
      if (row.phone) personValues.phone_numbers = [{ phone_number: row.phone }];
      const person = (await upsertRecord('people', 'email_addresses', personValues)) as AttioRecord;
      personId = person.id.record_id;
    } catch (err) {
      console.error('lead-scorer: person upsert failed:', err);
    }
  }

  // Log activity
  let activityId: string | undefined;
  try {
    const activity = await logActivity({
      title: `Scored ${row.name}: ${score.score}`,
      body: `${score.reasoning}\n\nSignals: ${JSON.stringify(score.signals)}\nRecommended tier: ${score.recommendedTier}`,
      kind: 'agent-run',
      agent_name: 'lead-scorer',
      person_id: personId,
      company_id: companyId,
      tokens_used: tokensUsed,
    });
    activityId = activity.id.record_id;
  } catch (err) {
    console.error('lead-scorer: activity log failed:', err);
  }

  return {
    ok: true,
    output: { score, personId, companyId, activityId },
    tokensUsed,
  };
}

/** Run the scorer against a list — used by CSV ingestion jobs. */
export async function runBatch(rows: LeadCsvRow[]): Promise<{
  scored: number;
  failed: number;
  results: Array<{ name: string; result: RunOutput }>;
}> {
  let scored = 0;
  let failed = 0;
  const results: Array<{ name: string; result: RunOutput }> = [];

  for (const row of rows) {
    const result = await run(row);
    if (result.ok) scored++; else failed++;
    results.push({ name: row.name, result });
    // Light rate-limit to stay friendly with Anthropic + Attio
    await new Promise((r) => setTimeout(r, 1500));
  }

  return { scored, failed, results };
}

function extractCity(address: string): string {
  // Naive: last comma-separated chunk before ", VA"
  const m = address.match(/,\s*([^,]+),\s*VA/i);
  return m?.[1]?.trim() ?? '';
}

function guessIndustry(types?: string): string {
  if (!types) return 'Other';
  const t = types.toLowerCase();
  if (t.includes('restaurant') || t.includes('food') || t.includes('bar')) return 'Restaurant';
  if (t.includes('lawyer') || t.includes('attorney') || t.includes('legal')) return 'Legal';
  if (t.includes('doctor') || t.includes('dentist') || t.includes('health')) return 'Healthcare';
  if (t.includes('store') || t.includes('shopping') || t.includes('retail')) return 'E-commerce';
  if (t.includes('contractor') || t.includes('plumbing') || t.includes('electrical') || t.includes('hvac')) return 'Local Service';
  if (t.includes('accountant') || t.includes('consultant') || t.includes('marketing')) return 'Professional';
  return 'Other';
}
