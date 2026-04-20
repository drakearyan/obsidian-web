/**
 * PII scrubbing for logs + Attio activity bodies (S8).
 *
 * Goal: keep record IDs + error shapes useful for debugging, but never leak
 * emails/phones/addresses into Vercel logs or Attio Activities where a
 * support person or teammate might see them.
 *
 * Rules:
 *   - Emails are masked to `***@***` regardless of which field they sit in.
 *   - US-style phone numbers are masked to `***-***-****`.
 *   - Object keys named like PII (`email`, `phone`, `phone_number`,
 *     `address`, `street`, `client_email`) get their value replaced with
 *     `'[redacted]'` even if the value is non-string (numbers, nested obj).
 *   - Keys ending in `_id` are always preserved — needed to trace which
 *     record blew up.
 *   - Walks objects + arrays recursively; circular refs are broken by a
 *     seen-set.
 */

const EMAIL_RX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// Loose US 10-digit: (123) 456-7890 | 123-456-7890 | 123.456.7890 | 1234567890
const PHONE_RX = /(?<![0-9])(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?![0-9])/g;

const PII_KEYS = new Set([
  'email',
  'phone',
  'phone_number',
  'phonenumber',
  'address',
  'street',
  'client_email',
  'contact_email',
  'contact_phone',
]);

function scrubString(s: string): string {
  return s.replace(EMAIL_RX, '***@***').replace(PHONE_RX, '***-***-****');
}

/**
 * Recursively remove PII from any value. Returns a new value; does not
 * mutate the input.
 */
export function stripPii(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return scrubString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();

  if (Array.isArray(value)) {
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    return value.map((v) => stripPii(v, seen));
  }

  if (typeof value === 'object') {
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (PII_KEYS.has(k.toLowerCase())) {
        out[k] = '[redacted]';
      } else {
        out[k] = stripPii(v, seen);
      }
    }
    return out;
  }

  // functions, symbols, etc. — render as type
  return `[${typeof value}]`;
}

/**
 * Collapse an unknown error value into a single-line, PII-free string safe
 * to pass to `console.error(prefix, safeError(err))`. Preserves error
 * message + first 3 stack frames.
 */
export function safeError(err: unknown): string {
  if (err == null) return 'null';
  if (err instanceof Error) {
    const msg = scrubString(err.message ?? '');
    const stack = err.stack
      ? err.stack
          .split('\n')
          .slice(1, 4) // skip the message line, keep 3 frames
          .map((l) => scrubString(l.trim()))
          .join(' | ')
      : '';
    return stack ? `${err.name}: ${msg} @ ${stack}` : `${err.name}: ${msg}`;
  }
  if (typeof err === 'string') return scrubString(err);
  try {
    return scrubString(JSON.stringify(stripPii(err)));
  } catch {
    return '[unserializable error]';
  }
}
