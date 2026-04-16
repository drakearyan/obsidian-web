/**
 * Scroll-driven gradient + orb parallax.
 * Ported verbatim from StreamTech. Gated behind body.scroll-fx.
 */
(() => {
  if (!document.body.classList.contains('scroll-fx')) return;

  const root = document.documentElement;
  let ticking = false;
  let last_prog = -1;

  const update = () => {
    const scroll_y = window.scrollY || window.pageYOffset;
    const doc_h = document.documentElement.scrollHeight - window.innerHeight;
    let prog = doc_h > 0 ? Math.min(Math.max(scroll_y / doc_h, 0), 1) : 0;
    prog = Math.round(prog * 100) / 100;
    if (prog === last_prog) {
      ticking = false;
      return;
    }
    last_prog = prog;
    const hue = (prog * 25).toFixed(1) + 'deg';
    root.style.setProperty('--scroll-prog', String(prog));
    root.style.setProperty('--scroll-hue', hue);
    ticking = false;
  };

  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    },
    { passive: true }
  );
  update();
})();
