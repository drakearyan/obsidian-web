import { site } from '../data/site';

export interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  canonical?: string;
  type?: 'website' | 'article';
}

export function buildTitle(page_title?: string): string {
  if (!page_title) return `${site.name} — ${site.tagline}`;
  return `${page_title} | ${site.name}`;
}

export function localBusinessSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    '@id': `${site.url}/#business`,
    name: site.name,
    description: site.description,
    url: site.url,
    telephone: site.phone || undefined,
    email: site.email,
    address: {
      '@type': 'PostalAddress',
      addressLocality: site.location.city,
      addressRegion: site.location.state,
      addressCountry: 'US',
    },
    areaServed: [
      { '@type': 'City', name: 'Lynchburg' },
      { '@type': 'City', name: 'Forest' },
      { '@type': 'City', name: 'Bedford' },
      { '@type': 'City', name: 'Madison Heights' },
      { '@type': 'State', name: 'Virginia' },
    ],
    priceRange: '$$',
    serviceType: ['Web Design', 'Web Development', 'SEO', 'E-commerce Development'],
  };
}

export function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${site.url}/#website`,
    url: site.url,
    name: site.name,
    description: site.description,
    publisher: { '@id': `${site.url}/#business` },
  };
}

export function breadcrumbSchema(path: string) {
  // Build a BreadcrumbList from a URL path like "/blog/category/lynchburg"
  // → Home > Blog > Category > Lynchburg
  const clean = path.replace(/^\/+|\/+$/g, '');
  if (!clean) return null; // homepage has no breadcrumb

  const segments = clean.split('/');
  const items: { '@type': string; position: number; name: string; item: string }[] = [
    { '@type': 'ListItem', position: 1, name: 'Home', item: site.url },
  ];

  let acc = '';
  segments.forEach((seg, i) => {
    acc += `/${seg}`;
    const pretty = seg
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    items.push({
      '@type': 'ListItem',
      position: i + 2,
      name: pretty,
      item: `${site.url}${acc}`,
    });
  });

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items,
  };
}

export function blogPostSchema(opts: {
  title: string;
  description: string;
  date: Date;
  url: string;
  author: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: opts.title,
    description: opts.description,
    datePublished: opts.date.toISOString(),
    dateModified: opts.date.toISOString(),
    url: opts.url,
    author: { '@type': 'Person', name: opts.author },
    publisher: { '@id': `${site.url}/#business` },
    mainEntityOfPage: { '@type': 'WebPage', '@id': opts.url },
  };
}
