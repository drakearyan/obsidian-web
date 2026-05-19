/**
 * Smartlead API client — minimal wrapper for pushing drafted cold emails into
 * a campaign queue. Smartlead handles warm-up, deliverability, bounce handling.
 *
 * Docs: https://api.smartlead.ai/reference
 *
 * Env required:
 *   SMARTLEAD_API_KEY
 *   SMARTLEAD_CAMPAIGN_ID    (the "Obsidian cold outbound" campaign id)
 */

import { requireEnv } from './env.js';

const SMARTLEAD_BASE = 'https://server.smartlead.ai/api/v1';

function getKey(): string {
  return requireEnv('SMARTLEAD_API_KEY');
}

function getCampaignId(): string {
  return requireEnv('SMARTLEAD_CAMPAIGN_ID');
}

async function smartleadFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(
    `${SMARTLEAD_BASE}${path}${sep}api_key=${getKey()}`,
    {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Smartlead ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export type Lead = {
  email: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  website?: string;
  phone_number?: string;
  /** Attio record id — stored in Smartlead custom fields so agents can join later. */
  attio_person_id?: string;
  /** Arbitrary personalization fields for {{mergeTag}} substitution in templates. */
  custom_fields?: Record<string, string | number>;
};

/** Push a single lead into the configured campaign. */
export async function addLeadToCampaign(lead: Lead): Promise<{ ok: boolean }> {
  const { custom_fields, ...rest } = lead;
  const payload = {
    lead_list: [
      {
        ...rest,
        custom_fields: {
          ...(custom_fields ?? {}),
          attio_person_id: lead.attio_person_id ?? '',
        },
      },
    ],
    settings: { ignore_global_block_list: false, ignore_unsubscribe_list: false },
  };
  await smartleadFetch(
    `/campaigns/${getCampaignId()}/leads`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
  return { ok: true };
}

/** Bulk push — capped at 100 per call. Smartlead accepts up to 1000 but we stay defensive. */
export async function addLeadsBatch(leads: Lead[]): Promise<number> {
  let added = 0;
  for (let i = 0; i < leads.length; i += 100) {
    const batch = leads.slice(i, i + 100);
    for (const lead of batch) {
      try {
        await addLeadToCampaign(lead);
        added++;
      } catch (err) {
        console.error(`Smartlead: failed to add ${lead.email}:`, err);
      }
    }
  }
  return added;
}

/** Campaign metrics — drives the dashboard "sent / opened / replied" tile. */
export async function campaignMetrics(): Promise<{
  sent: number;
  opened: number;
  replied: number;
  bounced: number;
  unsubscribed: number;
}> {
  const data = await smartleadFetch<{
    total_sent_count: number;
    open_count: number;
    reply_count: number;
    bounce_count: number;
    unsubscribe_count: number;
  }>(`/campaigns/${getCampaignId()}/analytics`);

  return {
    sent: data.total_sent_count ?? 0,
    opened: data.open_count ?? 0,
    replied: data.reply_count ?? 0,
    bounced: data.bounce_count ?? 0,
    unsubscribed: data.unsubscribe_count ?? 0,
  };
}

/** Pause the campaign — circuit breaker for agent runaway or deliverability incident. */
export async function pauseCampaign(): Promise<void> {
  await smartleadFetch(
    `/campaigns/${getCampaignId()}/status`,
    { method: 'POST', body: JSON.stringify({ status: 'PAUSED' }) },
  );
}
