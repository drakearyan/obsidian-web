/*
 * Northern Virginia service-area data.
 *
 * Drives the /web-design-northern-virginia hub page and the
 * /web-design-[city] dynamic landing pages. Add a city here and it
 * shows up everywhere — hub list, dynamic route, footer, sitemap.
 *
 * Framing rule: the target niche is "restaurants without a real
 * website" — small family-run, single-location, Facebook-only or
 * aggregator-only spots. We do not say "ethnic restaurants" in
 * public copy; instead we mention concrete local anchors (Eden
 * Center, Heritage Drive, Little River Tpke, etc.) and let the
 * geography do the targeting.
 */

export interface ServiceArea {
  /** kebab-case URL slug used by /web-design-[city].astro */
  slug: string;
  /** Display name in headlines + nav */
  name: string;
  /** Primary ZIP — surfaced in copy so locals recognize themselves */
  zip: string;
  /** County for breadcrumb / schema */
  county: string;
  /** One sentence describing what makes this town's small-business
   *  scene distinct. Drives hero subtitle without naming cuisines. */
  scene: string;
  /** Local anchors — landmarks, corridors, plazas. Mentioned in copy
   *  to prove the page wasn't written from across the country. */
  anchors: string[];
  /** Estimated drive minutes from a typical Fairfax County home */
  driveMinutes: string;
}

export const service_areas: ServiceArea[] = [
  {
    slug: 'annandale',
    name: 'Annandale',
    zip: '22003',
    county: 'Fairfax County',
    scene: 'A dense, second-generation small-business corridor where dozens of family-run restaurants still operate without a real website.',
    anchors: ['Heritage Drive', 'Little River Turnpike', 'Markham Street', 'Columbia Pike'],
    driveMinutes: '5-15',
  },
  {
    slug: 'falls-church',
    name: 'Falls Church',
    zip: '22042',
    county: 'Fairfax County',
    scene: 'Home to Eden Center and one of the densest concentrations of family-owned restaurants in the DMV — most of whom share a single Facebook page across two languages.',
    anchors: ['Eden Center', 'Wilson Boulevard', 'Seven Corners', 'Arlington Boulevard'],
    driveMinutes: '10-20',
  },
  {
    slug: 'centreville',
    name: 'Centreville',
    zip: '20120',
    county: 'Fairfax County',
    scene: 'Newer suburbs with deep small-business roots — restaurants, salons, and trades who built loyal followings before they ever needed a website, and now realize they do.',
    anchors: ['Lee Highway', 'Stone Road', 'Centreville Square', 'Old Centreville'],
    driveMinutes: '10-25',
  },
  {
    slug: 'fairfax',
    name: 'Fairfax City',
    zip: '22030',
    county: 'City of Fairfax',
    scene: 'Old Town Fairfax + the corridors radiating out — small businesses ranging from third-generation diners to first-year contractors, most still running on a Facebook page or a builder-subdomain.',
    anchors: ['Old Town Fairfax', 'Main Street', 'Chain Bridge Road', 'University Drive'],
    driveMinutes: '5-15',
  },
  {
    slug: 'vienna',
    name: 'Vienna',
    zip: '22180',
    county: 'Fairfax County',
    scene: 'Premium small-business pool with a Main-Street feel — restaurants, boutiques, dental and legal practices that look the part in person but vanish online.',
    anchors: ['Maple Avenue', 'Church Street', 'Nutley Street', 'Vienna Metro'],
    driveMinutes: '5-15',
  },
  {
    slug: 'alexandria',
    name: 'Alexandria',
    zip: '22312',
    county: 'Fairfax County',
    scene: 'The West End side of Alexandria — diverse small-business density, family-owned restaurants and shops that built reputations on word of mouth alone.',
    anchors: ['Landmark Mall area', 'Duke Street', 'Beauregard Street', 'Van Dorn Street'],
    driveMinutes: '15-25',
  },
];

/** Helper for getStaticPaths */
export function getServiceAreaSlugs() {
  return service_areas.map((a) => ({ params: { city: a.slug }, props: { area: a } }));
}

export function findServiceArea(slug: string): ServiceArea | undefined {
  return service_areas.find((a) => a.slug === slug);
}
