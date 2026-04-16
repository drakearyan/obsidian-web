export interface Testimonial {
  quote: string;
  author: string;
  role: string;
  avatar: string; // initials
  industry: string;
}

export const testimonials: Testimonial[] = [
  {
    quote:
      "Drake built us a site that loads faster than anything our competitors have. We’ve tripled our qualified leads since launch — and I can actually update it myself when I need to.",
    author: 'Client',
    role: 'Owner, Lynchburg Law Firm',
    avatar: 'LF',
    industry: 'Legal Services',
  },
  {
    quote:
      "He asked sharper questions in our first call than the agency we worked with last year did in three months. The final site is exactly what we needed, on the timeline he promised.",
    author: 'Client',
    role: 'Owner, Local Restaurant',
    avatar: 'LR',
    industry: 'Restaurant',
  },
  {
    quote:
      "I’m not a tech person. Drake walked me through every step without making me feel dumb. Our new site is beautiful and I’m booking more new patients than ever.",
    author: 'Client',
    role: 'Practice Manager, Dental Office',
    avatar: 'DO',
    industry: 'Healthcare',
  },
];
