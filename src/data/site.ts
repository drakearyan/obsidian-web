/**
 * Central business config. Edit here to update site-wide.
 */
export const site = {
  name: 'Obsidian Web Co.',
  shortName: 'Obsidian',
  domain: 'obsidianwebco.com',
  url: 'https://obsidianwebco.com',
  tagline: 'Websites That Work as Hard as You Do',
  description:
    'Obsidian Web Co. designs and builds custom websites for Lynchburg-area small businesses. Fast, beautiful, built to convert.',
  owner: 'Drake Ryan',
  email: 'drake@obsidianwebco.com',
  phone: '', // Google Voice number — fill in when set up
  location: {
    city: 'Lynchburg',
    state: 'VA',
    region: 'Virginia',
    zip: '24515',
  },
  social: {
    linkedin: '',
    instagram: '',
    facebook: '',
  },
  responseTime: 'within 24 hours',
  founded: 2026,
} as const;

export const nav_links = [
  { href: '/', label: 'Home' },
  { href: '/services', label: 'Services' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/about', label: 'About' },
  { href: '/blog', label: 'Blog' },
  { href: '/contact', label: 'Contact' },
];
