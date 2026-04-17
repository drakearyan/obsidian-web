/**
 * Client roster — used by ClientLogoGrid on the homepage.
 *
 * Initials-as-monograms is the editorial choice (matches the
 * overall wordmark-over-logo brand direction). When/if real
 * client logos are licensed for use, swap the `initials` field
 * for a `logo` path and update the component.
 */
export interface Client {
  /** Internal key, matches the slug used in portfolio data. */
  slug: string;
  /** Display name shown beneath the monogram. */
  name: string;
  /** Short industry label ("Restaurant", "Legal", etc). */
  industry: string;
  /** 2–3 letter monogram rendered as the logo stand-in. */
  initials: string;
  /** Palette key referenced from industry-colors.ts. */
  palette: 'restaurant' | 'legal' | 'fitness' | 'healthcare' | 'trades' | 'ecommerce';
}

export const clients: Client[] = [
  {
    slug: 'blue-ridge-eats',
    name: 'Blue Ridge Eats',
    industry: 'Restaurant',
    initials: 'BR',
    palette: 'restaurant',
  },
  {
    slug: 'caldwell-associates',
    name: 'Caldwell & Assoc.',
    industry: 'Legal',
    initials: 'C&A',
    palette: 'legal',
  },
  {
    slug: 'forest-auto',
    name: 'Forest Auto Repair',
    industry: 'Trades',
    initials: 'FA',
    palette: 'trades',
  },
  {
    slug: 'mendez-dental',
    name: 'Mendez Dental',
    industry: 'Healthcare',
    initials: 'MD',
    palette: 'healthcare',
  },
  {
    slug: 'peak-fitness',
    name: 'Peak Fitness Lynchburg',
    industry: 'Fitness',
    initials: 'PF',
    palette: 'fitness',
  },
  {
    slug: 'ridgepoint-supply',
    name: 'Ridgepoint Supply',
    industry: 'E-commerce',
    initials: 'RS',
    palette: 'ecommerce',
  },
];
