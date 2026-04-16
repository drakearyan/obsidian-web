/**
 * Shared industry color map — single source of truth for portfolio thumbnails.
 *
 * Consumed by PortfolioPreview.astro (homepage) and portfolio.astro (index
 * page) so the same industry always gets the same tint on both views.
 *
 * Values reference the brand CSS custom properties defined in global.css
 * so any palette shift upstream propagates everywhere.
 */
export interface IndustryColors {
  bg: string;
  fg: string;
  /** Editorial tint name, rendered as a #tag in portfolio previews. */
  name: string;
}

export const INDUSTRY_COLORS: Record<string, IndustryColors> = {
  restaurant: { bg: 'var(--ember-deep)', fg: 'var(--text)',          name: 'cinnabar' },
  legal:      { bg: 'var(--jade)',       fg: 'var(--text)',          name: 'ink' },
  fitness:    { bg: 'var(--flame)',      fg: 'var(--text)',          name: 'flame' },
  healthcare: { bg: 'var(--surface2)',   fg: 'var(--ember)',         name: 'basalt' },
  trades:     { bg: 'var(--ember)',      fg: 'var(--text-on-ember)', name: 'ember' },
  ecommerce:  { bg: 'var(--ice)',        fg: 'var(--text-on-cream)', name: 'ice' },
};

/** Fallback for unknown industries — uses surface + ember so anything renders. */
export const INDUSTRY_COLORS_DEFAULT: IndustryColors = {
  bg: 'var(--surface2)',
  fg: 'var(--ember)',
  name: 'void',
};
