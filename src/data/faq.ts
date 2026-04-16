export interface FAQItem {
  question: string;
  answer: string;
}

export const faqs: FAQItem[] = [
  {
    question: 'How long does it take to build a website?',
    answer:
      'It depends on the tier. A Starter site ships in 5–7 business days. A Professional site takes 10–14 business days. Premium builds run 3–5 weeks. Timeline starts once we have all your content and brand assets in hand.',
  },
  {
    question: 'What does a custom website actually cost?',
    answer:
      'Starter sites run $500–$800, Professional $1,200–$2,500, and Premium / E-commerce $3,000–$6,000+. Use our pricing calculator for an instant estimate based on exactly what you need.',
  },
  {
    question: 'Do I own the website when it’s done?',
    answer:
      'Yes. Upon final payment you own the full source code, design files, and content. No subscription lock-in. You can move hosting anywhere you want.',
  },
  {
    question: 'What happens if I want changes after launch?',
    answer:
      'Every tier includes revision rounds during the build. After launch, we offer optional maintenance plans starting at $50/month, or one-off updates at hourly rates. Many clients also learn to make small updates themselves — we’ll show you how.',
  },
  {
    question: 'Will my site show up on Google?',
    answer:
      'Every site we build includes on-page SEO — proper meta tags, structured data, sitemap, semantic HTML. Professional and Premium tiers include Google Analytics and Search Console setup. For ongoing ranking, we offer a monthly SEO retainer.',
  },
  {
    question: 'Do you work with clients outside Lynchburg?',
    answer:
      'We’re based in Lynchburg, Virginia but work with clients across the country. Everything is done remotely via Zoom, email, and shared Notion workspaces — no office visits required.',
  },
  {
    question: 'What if I already have a website?',
    answer:
      'We offer redesigns and migrations. We’ll audit your current site, identify what’s working, and rebuild with modern performance and design. Your content and SEO rankings transfer over.',
  },
  {
    question: 'How do payments work?',
    answer:
      '50% deposit to start the project, 50% due at launch. We accept Stripe (credit card or ACH), making it easy and secure. No surprise fees — your quote is your final price.',
  },
];
