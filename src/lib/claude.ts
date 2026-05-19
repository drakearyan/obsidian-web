/**
 * Shared Claude client + helpers used by every agent.
 * Wraps @anthropic-ai/sdk with Obsidian defaults.
 *
 * Env required:
 *   ANTHROPIC_API_KEY
 *
 * Model convention: agents use claude-opus-4-6 for drafting (quality > speed)
 * and claude-haiku-4-5 for high-volume classification/scoring (speed > quality).
 */

import Anthropic from '@anthropic-ai/sdk';
import { requireEnv } from './env.js';

export const MODELS = {
  opus: 'claude-opus-4-6',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5-20251001',
} as const;

let _client: Anthropic | null = null;

export function claude(): Anthropic {
  if (_client) return _client;
  _client = new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') });
  return _client;
}

export type TextBlock = { type: 'text'; text: string };

/** Extract the concatenated text from a Claude response. */
export function textOf(
  content: Array<{ type: string; text?: string } | TextBlock>,
): string {
  return content
    .filter((b): b is TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

/**
 * Obsidian voice guardrails — every agent that writes customer-facing copy
 * must include this in its system prompt.
 */
export const OBSIDIAN_VOICE = `
You write for Obsidian Web Co., Drake Ryan's solo web design agency in Lynchburg, Virginia.

Voice rules (these are hard constraints, not suggestions):
- Confident, direct, conversational. 8th-grade reading level.
- Never use: "In today's digital landscape", "synergy", "leverage", "unlock", "elevate", "cutting-edge", "game-changing", "solutions".
- No em-dashes in cold emails (a common LLM tell). Use commas or periods.
- Never say "we" or "our team". It's one person: Drake. Use "I".
- Pricing is public and transparent: Starter $500–$800, Growth $1,200–$2,500, Premier $3,000–$6,000+. Never hedge.
- Specifics over adjectives. "Site loaded in 4.2s" beats "slow site".
- No exclamation marks except in the literal phrase "Free audit!" if it's the subject line.
- Keep cold emails under 90 words. One clear ask. No "let me know your thoughts" closers — propose a specific next step.
`.trim();
