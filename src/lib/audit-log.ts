/**
 * Centralized audit log (S7).
 *
 * Destination policy (split, locked in during planning):
 *
 *   Attio Activities + console.warn:
 *     - webhook_signature_fail  (rare, worth post-mortem)
 *
 *   Attio Activities only:
 *     - login_success
 *     - stripe_webhook_processed
 *     - checkout_created
 *     - agent_run
 *
 *   console.warn only (no Attio — high volume during attacks would burn the
 *   free-tier Activity record limit and crowd out real CRM entries):
 *     - login_failure
 *     - rate_limit_hit
 *     - csrf_fail
 *
 * The `/dashboard/security` page reads only from Attio (title starts with
 * `security: `), so console-only events don't clutter the UI — they live in
 * Vercel logs where an attacker can't see them.
 *
 * Every call is PII-scrubbed before it leaves the process. Never throws:
 * a failed audit log must not break the primary request path.
 */

import { logActivity } from './attio.js';
import { stripPii, safeError } from './pii-scrub.js';

export type SecurityEventKind =
  | 'login_success'
  | 'login_failure'
  | 'rate_limit_hit'
  | 'csrf_fail'
  | 'stripe_webhook_processed'
  | 'webhook_signature_fail'
  | 'checkout_created'
  | 'agent_run';

const ATTIO_KINDS: ReadonlySet<SecurityEventKind> = new Set([
  'login_success',
  'stripe_webhook_processed',
  'checkout_created',
  'agent_run',
  'webhook_signature_fail',
]);

const CONSOLE_KINDS: ReadonlySet<SecurityEventKind> = new Set([
  'login_failure',
  'rate_limit_hit',
  'csrf_fail',
  'webhook_signature_fail', // both
]);

const TITLE_PREFIX = 'security: ';

/**
 * Emit a security audit event. Fire-and-forget; safe to call anywhere.
 * Never rejects — all failures are logged locally and swallowed.
 */
export async function logSecurityEvent(
  kind: SecurityEventKind,
  detail: Record<string, unknown> = {},
): Promise<void> {
  const safeDetail = stripPii(detail) as Record<string, unknown>;

  if (CONSOLE_KINDS.has(kind)) {
    try {
      console.warn('[audit]', kind, JSON.stringify(safeDetail));
    } catch {
      console.warn('[audit]', kind, '[unserializable detail]');
    }
  }

  if (ATTIO_KINDS.has(kind)) {
    try {
      const body = safeBody(safeDetail);
      // NOTE on kind: Attio's schema has 'agent-run', 'email-sent', 'note',
      // etc. as select options, but the current workspace rejects 'note'
      // (schema-apply drift — to be reconciled separately). 'agent-run'
      // works today for every event type because Attio treats these as
      // system-emitted activities. The actual event kind is preserved in
      // the title prefix so /dashboard/security still filters correctly.
      await logActivity({
        title: `${TITLE_PREFIX}${kind}`,
        body,
        kind: 'agent-run',
        agent_name: 'audit-log',
      });
    } catch (err) {
      // Do NOT throw — security logging must never break the primary path.
      console.error('audit-log: attio write failed', safeError(err));
    }
  }
}

function safeBody(detail: Record<string, unknown>): string {
  try {
    return JSON.stringify(detail, null, 2);
  } catch {
    return '[unserializable detail]';
  }
}
