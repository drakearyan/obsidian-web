/**
 * Attio API client — minimal typed wrapper.
 * Docs: https://developers.attio.com/reference
 *
 * Env required:
 *   ATTIO_API_KEY        (server-side only, never exposed)
 *   ATTIO_WORKSPACE_ID   (optional if key is workspace-scoped)
 *
 * Convention: Attio objects used by Obsidian Web Co.:
 *   - people       (every lead/contact)
 *   - companies    (every business lead)
 *   - deals        (pipeline opportunities)
 *   - activities   (agent runs, emails sent, notes)
 */

import { requireEnv } from './env.js';

const ATTIO_BASE = 'https://api.attio.com/v2';

type AttioObject = 'people' | 'companies' | 'deals' | 'activities';

type AttioError = {
  status_code: number;
  type: string;
  message: string;
};

export type AttioRecord = {
  id: { workspace_id: string; object_id: string; record_id: string };
  values: Record<string, unknown[]>;
  created_at: string;
};

type QueryBody = {
  filter?: Record<string, unknown>;
  sorts?: Array<{ attribute: string; direction: 'asc' | 'desc' }>;
  limit?: number;
  offset?: number;
};

function getKey(): string {
  return requireEnv('ATTIO_API_KEY');
}

async function attioFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${ATTIO_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getKey()}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    let detail: AttioError | string;
    try {
      detail = (await res.json()) as AttioError;
    } catch {
      detail = await res.text();
    }
    throw new Error(
      `Attio ${res.status}: ${typeof detail === 'string' ? detail : detail.message}`,
    );
  }
  return res.json() as Promise<T>;
}

/** List records from an object (paginated). */
export async function listRecords(
  object: AttioObject,
  body: QueryBody = {},
): Promise<AttioRecord[]> {
  const data = await attioFetch<{ data: AttioRecord[] }>(
    `/objects/${object}/records/query`,
    { method: 'POST', body: JSON.stringify({ limit: 50, ...body }) },
  );
  return data.data;
}

/** Get a single record by id. */
export async function getRecord(
  object: AttioObject,
  recordId: string,
): Promise<AttioRecord> {
  const data = await attioFetch<{ data: AttioRecord }>(
    `/objects/${object}/records/${recordId}`,
  );
  return data.data;
}

/**
 * Upsert a record by a unique attribute (e.g., email for people, domain for
 * companies). Creates if not found, updates if found.
 */
export async function upsertRecord(
  object: AttioObject,
  matching_attribute: string,
  values: Record<string, unknown>,
): Promise<AttioRecord> {
  const data = await attioFetch<{ data: AttioRecord }>(
    `/objects/${object}/records?matching_attribute=${encodeURIComponent(matching_attribute)}`,
    { method: 'PUT', body: JSON.stringify({ data: { values } }) },
  );
  return data.data;
}

/** Create an activity — used by agents to log their runs as first-class records. */
export async function logActivity(params: {
  title: string;
  body: string;
  person_id?: string;
  company_id?: string;
  deal_id?: string;
  kind: 'agent-run' | 'email-sent' | 'note' | 'call' | 'meeting';
  agent_name?: string;
  tokens_used?: number;
}): Promise<AttioRecord> {
  const values: Record<string, unknown> = {
    title: [{ value: params.title }],
    content: [{ value: params.body }],
    kind: [{ option: params.kind }],
  };
  if (params.person_id) values.person = [{ target_record_id: params.person_id }];
  if (params.company_id) values.company = [{ target_record_id: params.company_id }];
  if (params.deal_id) values.deal = [{ target_record_id: params.deal_id }];
  if (params.agent_name) values.agent_name = [{ value: params.agent_name }];
  if (params.tokens_used !== undefined)
    values.tokens_used = [{ value: params.tokens_used }];

  const data = await attioFetch<{ data: AttioRecord }>(
    `/objects/activities/records`,
    { method: 'POST', body: JSON.stringify({ data: { values } }) },
  );
  return data.data;
}

/** People with no "last_contacted" in N days — drives the follow-up queue. */
export async function peopleNeedingFollowUp(daysStale = 14): Promise<AttioRecord[]> {
  const cutoff = new Date(Date.now() - daysStale * 24 * 60 * 60 * 1000)
    .toISOString();
  return listRecords('people', {
    filter: {
      $or: [
        { last_contacted: { $lt: cutoff } },
        { last_contacted: { $empty: true } },
      ],
      lifecycle_stage: { $in: ['Lead', 'Qualified', 'Discovery'] },
    },
    sorts: [{ attribute: 'last_contacted', direction: 'asc' }],
    limit: 25,
  });
}

/** Sum-of-weighted-value revenue forecast from open deals. */
export async function revenueForecast(): Promise<{
  total: number;
  byStage: Record<string, number>;
}> {
  const deals = await listRecords('deals', {
    filter: { stage: { $nin: ['Won', 'Lost'] } },
    limit: 100,
  });
  const byStage: Record<string, number> = {};
  let total = 0;
  for (const deal of deals) {
    const value = Number(
      (deal.values.value?.[0] as { value?: number } | undefined)?.value ?? 0,
    );
    const probability = Number(
      (deal.values.probability?.[0] as { value?: number } | undefined)?.value ??
        0,
    ) / 100;
    const stage = String(
      (deal.values.stage?.[0] as { option?: { title?: string } } | undefined)
        ?.option?.title ?? 'Unstaged',
    );
    const weighted = value * probability;
    byStage[stage] = (byStage[stage] ?? 0) + weighted;
    total += weighted;
  }
  return { total, byStage };
}
