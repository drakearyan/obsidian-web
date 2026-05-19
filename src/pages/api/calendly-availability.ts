/*
 * Calendly availability proxy.
 *
 * Returns the next 3 open discovery-call slots if the project has
 * Calendly v2 API credentials wired up via env vars. Otherwise
 * returns { configured: false } so the frontend can fall back to a
 * plain "View available times" link.
 *
 * Why a proxy instead of calling Calendly from the browser:
 *   - The API token is private; it must stay server-side.
 *   - We can cache in-memory for 5 minutes so a busy day doesn't
 *     hammer Calendly's rate limit.
 *   - Frontend gets a stable JSON shape regardless of whether the
 *     env vars are present, so the UI never breaks.
 *
 * Env vars (both required to light up live data):
 *   CALENDLY_API_TOKEN    — Calendly personal access token
 *   CALENDLY_EVENT_TYPE_URI — full event-type URI from Calendly
 */
import type { APIRoute } from 'astro';

export const prerender = false;

interface Slot {
  start_time: string; // ISO timestamp
  scheduling_url: string;
}

interface CacheEntry {
  expires_at: number;
  payload: { configured: boolean; slots: Slot[]; error?: string };
}

// Module-scoped cache. Vercel may cold-start between requests, in
// which case the cache resets — totally fine for a 5-min TTL.
let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export const GET: APIRoute = async () => {
  if (cache && cache.expires_at > Date.now()) {
    return Response.json(cache.payload);
  }

  const token = import.meta.env.CALENDLY_API_TOKEN;
  const event_type = import.meta.env.CALENDLY_EVENT_TYPE_URI;

  if (!token || !event_type) {
    const payload = { configured: false, slots: [] as Slot[] };
    cache = { expires_at: Date.now() + CACHE_TTL_MS, payload };
    return Response.json(payload);
  }

  try {
    // Calendly limits available_times queries to a 7-day window.
    const now = new Date();
    const week_out = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const params = new URLSearchParams({
      event_type,
      start_time: now.toISOString(),
      end_time: week_out.toISOString(),
    });
    const res = await fetch(`https://api.calendly.com/event_type_available_times?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const payload = { configured: true, slots: [], error: `Calendly returned ${res.status}` };
      // Cache the failure too so we don't retry instantly on every hit.
      cache = { expires_at: Date.now() + CACHE_TTL_MS, payload };
      return Response.json(payload);
    }

    const data = await res.json();
    const slots: Slot[] = (data.collection || [])
      .slice(0, 3)
      .map((c: { start_time: string; scheduling_url: string }) => ({
        start_time: c.start_time,
        scheduling_url: c.scheduling_url,
      }));

    const payload = { configured: true, slots };
    cache = { expires_at: Date.now() + CACHE_TTL_MS, payload };
    return Response.json(payload);
  } catch (err) {
    const payload = { configured: true, slots: [] as Slot[], error: 'fetch failed' };
    cache = { expires_at: Date.now() + CACHE_TTL_MS, payload };
    return Response.json(payload);
  }
};
