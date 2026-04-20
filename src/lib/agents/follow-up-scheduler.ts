/**
 * Agent: follow-up-scheduler
 *
 * Cron-triggered (daily 9am ET). Finds Attio people who:
 *   - Are in Lead/Qualified/Discovery stages
 *   - Have `last_contacted` older than 14 days (or never)
 *   - Have at least one prior activity (so there's context)
 *
 * Drafts a warm bump referencing the prior thread, pushes to Smartlead as a
 * sequence step, and logs the activity.
 *
 * Honors DRY_RUN=1 and MAX_FOLLOWUPS_PER_RUN (default 10) so a single run can't
 * blow out the daily Smartlead send budget.
 */

import { claude, MODELS, OBSIDIAN_VOICE, textOf } from '../claude.js';
import {
  listRecords,
  getRecord,
  logActivity,
  peopleNeedingFollowUp,
  type AttioRecord,
} from '../attio.js';
import { addLeadToCampaign } from '../smartlead.js';
import { safeError } from '../pii-scrub.js';
import { logSecurityEvent } from '../audit-log.js';

type FollowUp = {
  personId: string;
  personName: string;
  email: string;
  priorContext: string;
  subject: string;
  body: string;
  smartleadOk: boolean;
  tokensUsed: number;
};

export type RunOutput = {
  ok: boolean;
  output?: {
    processed: number;
    drafted: number;
    sent: number;
    skipped: number;
    followUps: FollowUp[];
  };
  error?: string;
  tokensUsed: number;
};

const MAX_PER_RUN = Number(process.env.MAX_FOLLOWUPS_PER_RUN ?? 10);

const SYSTEM = `${OBSIDIAN_VOICE}

You draft a SHORT follow-up email to a prospect who Drake already emailed once and hasn't replied.

Hard constraints:
- Body: under 60 words (SHORTER than initial cold email).
- Subject: same as or similar to the prior email's subject, or leave empty to thread via "Re:"
- Reference the prior note in the first sentence. ONE line max.
- No em-dashes.
- One ask, usually a softer version of the original ("Still worth a quick look?" / "Want me to resend the audit?" / "Bad time? Happy to circle back in a few weeks.")
- NEVER apologize for following up. NEVER say "Just bumping this" — that phrase is banned.

Output STRICT JSON only:
{
  "subject": string,
  "body": string
}`;

function extractText(record: AttioRecord | undefined, slug: string): string {
  const raw = record?.values?.[slug]?.[0];
  if (!raw) return '';
  if (typeof raw === 'object' && raw !== null) {
    const r = raw as Record<string, unknown>;
    return (
      (r.value as string | undefined) ??
      (r.email_address as string | undefined) ??
      ((r.option as { title?: string } | undefined)?.title) ??
      ''
    );
  }
  return String(raw);
}

/** Get the 1 most recent activity for a person (for prior context). */
async function priorActivityFor(personId: string): Promise<string> {
  try {
    const activities = await listRecords('activities', {
      filter: { person: { $eq: personId } },
      sorts: [{ attribute: 'created_at', direction: 'desc' }],
      limit: 1,
    });
    const latest = activities[0];
    if (!latest) return '';
    const title = extractText(latest, 'title');
    const body = extractText(latest, 'content').slice(0, 400);
    return `Prior activity: "${title}"\n${body}`;
  } catch {
    return '';
  }
}

export async function run(): Promise<RunOutput> {
  const dryRun = process.env.DRY_RUN === '1';
  let totalTokens = 0;

  let candidates: AttioRecord[];
  try {
    candidates = await peopleNeedingFollowUp(14);
  } catch (err) {
    return {
      ok: false,
      error: `Attio query failed: ${err instanceof Error ? err.message : err}`,
      tokensUsed: 0,
    };
  }

  // Cap per-run
  const toProcess = candidates.slice(0, MAX_PER_RUN);
  const followUps: FollowUp[] = [];
  let drafted = 0;
  let sent = 0;
  let skipped = 0;

  for (const person of toProcess) {
    const personId = person.id.record_id;
    const firstName =
      (person.values.name?.[0] as { first_name?: string } | undefined)?.first_name ??
      'there';
    const email = extractText(person, 'email_addresses');

    if (!email) {
      skipped++;
      continue;
    }

    const priorContext = await priorActivityFor(personId);
    if (!priorContext) {
      // No prior activity — skip; this is a brand-new lead, the cold-email-writer should handle
      skipped++;
      continue;
    }

    // Load associated company for industry/city flavor
    let companyDetail = '';
    try {
      const companyRef = person.values.company?.[0] as { target_record_id?: string } | undefined;
      if (companyRef?.target_record_id) {
        const company = await getRecord('companies', companyRef.target_record_id);
        const industry = extractText(company, 'industry');
        const name = extractText(company, 'name');
        companyDetail = `${name} (${industry})`;
      }
    } catch {
      // non-fatal
    }

    const userPrompt = `Prospect:
- First name: ${firstName}
- Company: ${companyDetail}

${priorContext}

Draft the follow-up.`;

    let subject = '';
    let body = '';
    let tokens = 0;

    try {
      const response = await claude().messages.create({
        model: MODELS.sonnet,
        max_tokens: 384,
        system: SYSTEM,
        messages: [{ role: 'user', content: userPrompt }],
      });
      tokens =
        (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
      totalTokens += tokens;
      const raw = textOf(response.content).trim();
      const parsed = JSON.parse(raw) as { subject: string; body: string };
      subject = parsed.subject;
      body = parsed.body;
      drafted++;
    } catch (err) {
      if (!dryRun) {
        await logActivity({
          title: `follow-up-scheduler failed for ${firstName}`,
          body: `Error: ${err instanceof Error ? err.message : err}`,
          kind: 'agent-run',
          agent_name: 'follow-up-scheduler',
          person_id: personId,
        }).catch(() => undefined);
      }
      skipped++;
      continue;
    }

    let smartleadOk = false;
    if (!dryRun) {
      try {
        await addLeadToCampaign({
          email,
          first_name: firstName,
          attio_person_id: personId,
          custom_fields: {
            followup_subject: subject,
            followup_body: body,
            sequence_step: 'follow-up-bump',
          },
        });
        smartleadOk = true;
        sent++;
      } catch (err) {
        console.error('follow-up-scheduler: Smartlead push failed:', safeError(err));
      }

      try {
        await logActivity({
          title: `Follow-up drafted for ${firstName}`,
          body: `Subject: ${subject}\n\n${body}`,
          kind: 'email-sent',
          agent_name: 'follow-up-scheduler',
          person_id: personId,
          tokens_used: tokens,
        });
      } catch {
        // swallow
      }
    }

    followUps.push({
      personId,
      personName: firstName,
      email,
      priorContext,
      subject,
      body,
      smartleadOk,
      tokensUsed: tokens,
    });
  }

  void logSecurityEvent('agent_run', {
    agent_name: 'follow-up-scheduler',
    tokens_used: totalTokens,
    status: 'ok',
    processed: toProcess.length,
    drafted,
    sent,
    skipped,
  });

  return {
    ok: true,
    output: {
      processed: toProcess.length,
      drafted,
      sent,
      skipped,
      followUps,
    },
    tokensUsed: totalTokens,
  };
}
