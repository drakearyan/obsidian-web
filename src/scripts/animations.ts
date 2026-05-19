/**
 * Obsidian Web Co. — Animation system
 * Ported from StreamTech v8.2, all body-class-gated.
 * Remove a body class to instantly disable that animation.
 */

(() => {
  const body = document.body;

  // ─── 1. Stagger entrance (IntersectionObserver) ────────────────
  // The legacy stagger system (.reveal / .is-visible) coexists with
  // the newer [data-reveal] / .is-revealed system in scroll-reveal.ts.
  // In reduced-motion the newer system shows everything immediately,
  // but the legacy system's `body.anim-stagger .reveal { opacity: 0 }`
  // rule has higher specificity than the reduced-motion override in
  // animations.css, so elements with both attributes would stay
  // hidden until intersection. Skip the legacy auto-tagging + observer
  // entirely when the user prefers reduced motion.
  const prefers_reduced_motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (body.classList.contains('anim-stagger') && !prefers_reduced_motion) {
    // Auto-add .reveal + .delay-N to children of common containers
    const stagger_containers = [
      '.services-accordion',
      '.stats-grid',
      '.process-steps',
      '.testimonials-grid',
      '.features-grid',
      '.portfolio-grid',
      '.faq-list',
    ];

    stagger_containers.forEach((sel) => {
      document.querySelectorAll(sel).forEach((container) => {
        Array.from(container.children).forEach((child, i) => {
          child.classList.add('reveal');
          if (i < 6) child.classList.add(`delay-${i + 1}`);
        });
      });
    });

    // Also add .reveal to any element marked with [data-reveal]
    document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
      el.classList.add('reveal');
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -50px 0px' }
    );

    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
  }

  // ─── 2. Scroll progress bar ─────────────────────────────────────
  if (body.classList.contains('anim-progress')) {
    const bar = document.createElement('div');
    bar.className = 'scroll-progress';
    document.body.appendChild(bar);

    let ticking = false;
    const update_bar = () => {
      const scrolled = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const pct = max > 0 ? (scrolled / max) * 100 : 0;
      bar.style.width = `${pct}%`;
      ticking = false;
    };

    window.addEventListener(
      'scroll',
      () => {
        if (!ticking) {
          window.requestAnimationFrame(update_bar);
          ticking = true;
        }
      },
      { passive: true }
    );
    update_bar();
  }

  // ─── 3. Button ripple ──────────────────────────────────────────
  if (body.classList.contains('anim-ripple')) {
    document.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('.btn-primary');
      if (!target) return;

      const rect = target.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const ripple = document.createElement('span');
      ripple.className = 'ripple-effect';
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
      target.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    });
  }

  // ─── 4. Nav scroll state ───────────────────────────────────────
  const nav = document.getElementById('site-nav');
  if (nav) {
    const update_nav = () => {
      nav.classList.toggle('scrolled', window.scrollY > 50);
    };
    window.addEventListener('scroll', update_nav, { passive: true });
    update_nav();
  }

  // ─── 5. Mobile nav toggle ──────────────────────────────────────
  const nav_toggle = document.querySelector<HTMLButtonElement>('.nav-toggle');
  const nav_links = document.querySelector<HTMLUListElement>('.nav-links');
  if (nav_toggle && nav_links) {
    nav_toggle.addEventListener('click', () => {
      const is_open = nav_links.classList.toggle('open');
      nav_toggle.setAttribute('aria-expanded', is_open ? 'true' : 'false');
    });
  }

  // ─── 6. Accordion (services, FAQ) ──────────────────────────────
  document.querySelectorAll<HTMLButtonElement>('.accordion-trigger').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const item = trigger.closest<HTMLElement>('.accordion-item');
      if (!item) return;

      const panel = item.querySelector<HTMLElement>('.accordion-panel');
      if (!panel) return;

      const is_open = item.classList.contains('is-open');

      // Close siblings (one open at a time)
      const parent_list = item.parentElement;
      if (parent_list) {
        parent_list.querySelectorAll<HTMLElement>('.accordion-item.is-open').forEach((open_item) => {
          if (open_item !== item) {
            open_item.classList.remove('is-open');
            open_item.querySelector<HTMLButtonElement>('.accordion-trigger')?.setAttribute('aria-expanded', 'false');
            const open_panel = open_item.querySelector<HTMLElement>('.accordion-panel');
            if (open_panel) open_panel.style.maxHeight = '0px';
          }
        });
      }

      if (is_open) {
        item.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        panel.style.maxHeight = '0px';
      } else {
        item.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
        panel.style.maxHeight = `${panel.scrollHeight}px`;
      }
    });
  });
})();
