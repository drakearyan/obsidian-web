/**
 * Scroll-reveal utility.
 *
 * Any element with [data-reveal] fades + translates in when it enters the
 * viewport. Runs once per element then stops observing to save resources.
 *
 * Respects prefers-reduced-motion — reveals everything immediately without
 * animation so screen-readers and vestibular-sensitive users aren't forced
 * through a motion-heavy UI.
 *
 * CSS lives in styles/animations.css so we don't duplicate .is-revealed
 * transition rules across components. A single style rule there handles
 * the visual transition; this script just toggles the class.
 */
(function initScrollReveal() {
  if (typeof window === 'undefined') return;

  const targets = document.querySelectorAll<HTMLElement>('[data-reveal]');
  if (!targets.length) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    targets.forEach((el) => el.classList.add('is-revealed'));
    return;
  }

  if (!('IntersectionObserver' in window)) {
    // Old browser — reveal everything immediately, no animation
    targets.forEach((el) => el.classList.add('is-revealed'));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          io.unobserve(entry.target);
        }
      }
    },
    {
      // Reveal when element is 15% into viewport — feels natural without
      // popping in too late when user scrolls slowly.
      rootMargin: '0px 0px -15% 0px',
      threshold: 0,
    }
  );

  targets.forEach((el) => io.observe(el));
})();
