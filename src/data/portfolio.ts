export interface CaseStudy {
  slug: string;
  title: string;
  client: string;
  industry: string;
  industrySlug: string;
  summary: string;
  challenge: string;
  solution: string;
  results: { metric: string; value: string }[];
  tech: string[];
  thumbnail: string;
  featured?: boolean;
}

export const case_studies: CaseStudy[] = [
  {
    slug: 'blue-ridge-eats',
    title: 'Blue Ridge Eats — Local restaurant doubles online reservations',
    client: 'Blue Ridge Eats',
    industry: 'Restaurant',
    industrySlug: 'restaurant',
    summary:
      'A farm-to-table restaurant in Lynchburg needed a modern site to showcase their seasonal menu and drive reservations.',
    challenge:
      'Their old Wix site loaded in 7 seconds, had no mobile menu, and relied on phone-only reservations. Bounce rate on mobile was 72%.',
    solution:
      'Custom Astro build with hero video, dynamic menu sections, embedded OpenTable reservations, and Google Business integration.',
    results: [
      { metric: 'PageSpeed score', value: '98/100' },
      { metric: 'Mobile bounce rate', value: '−41%' },
      { metric: 'Monthly reservations', value: '+112%' },
      { metric: 'Time to launch', value: '11 days' },
    ],
    tech: ['Astro', 'Tailwind CSS', 'OpenTable API', 'Vercel'],
    thumbnail: 'restaurant',
    featured: true,
  },
  {
    slug: 'caldwell-legal',
    title: 'Caldwell & Associates — Law firm triples qualified leads',
    client: 'Caldwell & Associates',
    industry: 'Legal',
    industrySlug: 'legal',
    summary:
      'A small estate planning firm needed to stop losing leads to bigger firms with better websites and local SEO.',
    challenge:
      'No website at all — relying entirely on referrals. Competitors ranked for "Lynchburg estate planning" while they were invisible online.',
    solution:
      'Professional tier build with dedicated service pages per practice area, structured data for local SEO, and a free-consultation booking flow.',
    results: [
      { metric: 'Google rankings', value: '#3 for primary keyword' },
      { metric: 'Qualified leads/month', value: '+218%' },
      { metric: 'Bookings via website', value: '14/month avg' },
      { metric: 'Cost per lead', value: '−67%' },
    ],
    tech: ['Astro', 'Schema.org', 'Calendly', 'GA4'],
    thumbnail: 'legal',
    featured: true,
  },
  {
    slug: 'peakfit-gym',
    title: 'PeakFit Lynchburg — Gym grows trial memberships 3x',
    client: 'PeakFit Lynchburg',
    industry: 'Fitness',
    industrySlug: 'fitness',
    summary:
      'A boutique gym wanted to convert website visitors into trial memberships without the usual "chase you around" sales tactics.',
    challenge:
      'Their WordPress site was cluttered, confused visitors about class schedules, and had no clear path to sign up for a trial.',
    solution:
      'Clean redesign with live class schedule, trial signup form with automated email sequence, member testimonials, and mobile-first design.',
    results: [
      { metric: 'Trial signups/month', value: '+204%' },
      { metric: 'Site load time', value: '1.1s' },
      { metric: 'Avg time on site', value: '3:42' },
      { metric: 'Mobile conversion rate', value: '8.4%' },
    ],
    tech: ['Astro', 'Formspree', 'Mailchimp', 'Cloudinary'],
    thumbnail: 'fitness',
    featured: true,
  },
  {
    slug: 'madison-dental',
    title: 'Madison Heights Dental — New patient bookings up 85%',
    client: 'Madison Heights Dental',
    industry: 'Healthcare',
    industrySlug: 'healthcare',
    summary:
      'A family dental practice needed to modernize an outdated site and make booking easy for new patients.',
    challenge:
      '2014-era template, no mobile version, patient forms required printing and faxing, Google Business profile wasn\'t linked to the site.',
    solution:
      'Warm, trustworthy redesign with online patient forms, insurance info page, virtual tour, and embedded Google Reviews.',
    results: [
      { metric: 'New patient bookings', value: '+85%' },
      { metric: 'Google review count', value: '12 → 67' },
      { metric: 'Form submissions', value: '+340%' },
      { metric: 'Mobile traffic', value: '+156%' },
    ],
    tech: ['WordPress', 'Gravity Forms', 'Google Reviews API'],
    thumbnail: 'healthcare',
  },
  {
    slug: 'summit-contracting',
    title: 'Summit Contracting — Contractor wins $340k in new projects',
    client: 'Summit Contracting',
    industry: 'Trades',
    industrySlug: 'trades',
    summary:
      'A general contractor wanted a portfolio site that would convince bigger commercial clients to take them seriously.',
    challenge:
      'Facebook page was the only online presence. Bigger clients wouldn\'t even respond to proposals — they needed a credibility boost.',
    solution:
      'Premium portfolio build with project case studies, team bios, certifications page, and a polished project inquiry flow.',
    results: [
      { metric: 'Project inquiries', value: '+145%' },
      { metric: 'Commercial projects won', value: '$340k in 6 months' },
      { metric: 'Avg project value', value: '+80%' },
    ],
    tech: ['Astro', 'Cloudinary', 'Vercel'],
    thumbnail: 'trades',
  },
  {
    slug: 'rivermont-boutique',
    title: 'Rivermont Boutique — E-commerce launch drives $12k first month',
    client: 'Rivermont Boutique',
    industry: 'E-commerce',
    industrySlug: 'ecommerce',
    summary:
      'A local clothing boutique wanted to sell online without the fees of marketplaces like Etsy.',
    challenge:
      'All sales were in-store. Owner wanted to reach customers outside Lynchburg but was intimidated by Shopify setup and product management.',
    solution:
      'Custom Shopify build with Instagram feed integration, local pickup option, Klaviyo email flows, and a simple CMS for non-technical staff.',
    results: [
      { metric: 'First-month online revenue', value: '$12,400' },
      { metric: 'Email subscribers', value: '0 → 840' },
      { metric: 'Orders per week', value: '32 avg' },
      { metric: 'Customer acquisition cost', value: '$4.20' },
    ],
    tech: ['Shopify', 'Klaviyo', 'Instagram API'],
    thumbnail: 'ecommerce',
  },
];

export const industries = [
  { slug: 'all', label: 'All Work' },
  { slug: 'restaurant', label: 'Restaurants' },
  { slug: 'legal', label: 'Legal' },
  { slug: 'healthcare', label: 'Healthcare' },
  { slug: 'fitness', label: 'Fitness' },
  { slug: 'trades', label: 'Trades' },
  { slug: 'ecommerce', label: 'E-commerce' },
];
