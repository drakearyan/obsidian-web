export interface ServiceTier {
  id: string;
  name: string;
  tagline: string;
  icon: string;
  accent: string;
  priceMin: number;
  priceMax: number;
  priceDisplay: string;
  timeline: string;
  features: string[];
  popular?: boolean;
  deliverables: { heading: string; body: string }[];
}

export const service_tiers: ServiceTier[] = [
  {
    id: 'starter',
    name: 'Starter Site',
    tagline: 'A clean, professional presence for local businesses just getting online.',
    icon: '◆',
    accent: 'var(--ember)',
    priceMin: 500,
    priceMax: 800,
    priceDisplay: '$500 – $800',
    timeline: '5–7 business days',
    features: [
      '1–3 page website (Home, About, Contact)',
      'Mobile-responsive design',
      'Basic SEO setup (meta tags, sitemap)',
      'Contact form with email notifications',
      'Google Analytics setup',
      '1 round of revisions',
      'Free SSL certificate',
      '30-day launch support',
    ],
    deliverables: [
      { heading: 'Design', body: 'Custom design tailored to your brand using a modern template foundation. Delivered as a live preview within 3 days.' },
      { heading: 'Development', body: 'Hand-coded HTML/CSS or WordPress depending on your needs. Fast, clean, maintainable.' },
      { heading: 'Launch', body: 'We handle domain setup, SSL, and deployment. Your site goes live on your schedule.' },
    ],
  },
  {
    id: 'professional',
    name: 'Professional Site',
    tagline: 'A full-featured site with blog, SEO, and speed optimization built for growth.',
    icon: '◈',
    accent: 'var(--flame)',
    priceMin: 1200,
    priceMax: 2500,
    priceDisplay: '$1,200 – $2,500',
    timeline: '10–14 business days',
    popular: true,
    features: [
      '5–8 page custom-designed website',
      'Blog or portfolio section',
      'Google Analytics + Search Console setup',
      'Social media integration',
      'Speed optimization (90+ PageSpeed score)',
      'Advanced on-page SEO',
      '2 rounds of revisions',
      'Free SSL certificate',
      '60-day launch support',
    ],
    deliverables: [
      { heading: 'Discovery & Strategy', body: 'Kickoff call to understand your business, audience, and goals. We map your sitemap and content strategy together.' },
      { heading: 'Custom Design', body: 'Unique design built for your brand. Desktop + mobile mockups in Figma before we write a line of code.' },
      { heading: 'Development & SEO', body: 'Performance-first build targeting 90+ PageSpeed scores. On-page SEO and analytics baked in.' },
      { heading: 'Launch & Support', body: 'We handle deployment, DNS, and SSL. You get 60 days of hands-on support after launch.' },
    ],
  },
  {
    id: 'premium',
    name: 'Premium / E-Commerce',
    tagline: 'Full custom builds, e-commerce, and advanced functionality for serious growth.',
    icon: '◉',
    accent: 'var(--ember-deep)',
    priceMin: 3000,
    priceMax: 6000,
    priceDisplay: '$3,000 – $6,000+',
    timeline: '3–5 weeks',
    features: [
      'Fully custom design with wireframes & mockups',
      'E-commerce (Shopify / WooCommerce / custom)',
      'Payment gateway integration',
      'Product catalog (up to 50 products)',
      'Email marketing integration (Mailchimp, Klaviyo)',
      'Advanced SEO + local SEO setup',
      'Custom animations & interactions',
      '3 rounds of revisions',
      '90-day launch support',
    ],
    deliverables: [
      { heading: 'Strategy & Wireframes', body: 'Deep-dive strategy session. We produce wireframes for every key template before mockups begin.' },
      { heading: 'Design System', body: 'Complete design system — colors, typography, components, animations — delivered in Figma.' },
      { heading: 'Custom Development', body: 'Hand-built on your platform of choice. Payments, email, analytics, and any integrations you need.' },
      { heading: 'Launch & Training', body: 'Full launch handholding, DNS cutover, training session on how to manage your new site.' },
    ],
  },
];

export interface Addon {
  id: string;
  name: string;
  price: string;
  description: string;
}

export const addons: Addon[] = [
  {
    id: 'maintenance',
    name: 'Monthly Maintenance & Hosting',
    price: '$50 – $150/mo',
    description: 'Security updates, backups, uptime monitoring, and content tweaks.',
  },
  {
    id: 'seo',
    name: 'Monthly SEO Management',
    price: '$300 – $800/mo',
    description: 'Ongoing keyword research, on-page optimization, and content recommendations.',
  },
  {
    id: 'content',
    name: 'Content Updates Retainer',
    price: '$200/mo',
    description: 'Up to 4 content updates per month — new pages, images, copy changes.',
  },
  {
    id: 'care',
    name: 'Website Care Plan',
    price: '$75 – $125/mo',
    description: 'Security monitoring, weekly backups, uptime alerts, priority support.',
  },
];
