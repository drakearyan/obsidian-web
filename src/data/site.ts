/**
 * Central business config. Edit here to update site-wide.
 */
export const site = {
  name: 'Obsidian Web Co.',
  shortName: 'Obsidian',
  domain: 'obsidianwebco.com',
  url: 'https://obsidianwebco.com',
  tagline: 'Websites built to outwork you.',
  description:
    'Custom websites built to outwork you — for small businesses in Northern Virginia and Central VA. Fast, hand-coded, owned by you.',
  owner: 'Drake Ryan',
  email: 'drake@obsidianwebco.com',
  phone: '', // Google Voice number — fill in when set up
  location: {
    city: 'Fairfax',
    state: 'VA',
    region: 'Northern Virginia',
    zip: '22030',
  },
  social: {
    linkedin: '',
    instagram: '',
    facebook: '',
  },
  responseTime: 'within 24 hours',
  founded: 2026,

  /** Mailchimp embedded form endpoint. Never commit secrets — the
   *  action URL is public by design (it's on the embedded form). */
  mailchimp: {
    action: 'https://obsidianwebco.us16.list-manage.com/subscribe/post?u=1b3b188705690aaba0356db38&id=a6930823f9&f_id=0088c2e1f0',
    /** Honeypot field name Mailchimp auto-generates for bot detection.
     *  Pattern: b_{userId}_{audienceId}. Must be included as a hidden
     *  input on every signup form. */
    honeypot: 'b_1b3b188705690aaba0356db38_a6930823f9',
  },

  /** Calendly booking URL for discovery calls. */
  calendly: 'https://calendly.com/drake-obsidianwebco/discovery-call-obsidian-web-co',
} as const;

export const nav_links = [
  { href: '/', label: 'Home' },
  { href: '/services', label: 'Services' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/about', label: 'About' },
  { href: '/blog', label: 'Blog' },
  { href: '/contact', label: 'Contact' },
];
