(() => {
  const style = document.createElement('style');
  style.textContent = `
    .scroll-reveal {
      opacity: 0;
      transform: translateY(24px);
      transition:
        opacity 0.65s ease,
        transform 0.65s cubic-bezier(.22,1,.36,1);
      will-change: opacity, transform;
    }

    .scroll-reveal.is-visible {
      opacity: 1;
      transform: translateY(0);
    }

    .scroll-reveal-delay-1 { transition-delay: 80ms; }
    .scroll-reveal-delay-2 { transition-delay: 160ms; }
    .scroll-reveal-delay-3 { transition-delay: 240ms; }
    .scroll-reveal-delay-4 { transition-delay: 320ms; }

    @media (prefers-reduced-motion: reduce) {
      .scroll-reveal {
        opacity: 1;
        transform: none;
        transition: none;
      }
    }
  `;
  document.head.appendChild(style);

  const selectors = [
    'main > section',
    '.section',
    '.panel',
    '.card',
    '.post-card',
    '.event-card',
    '.gallery-item',
    '.update-card',
    '.announcement-card',
    '.resource-card',
    '.tool-card'
  ];

  const elements = [...new Set(
    selectors.flatMap(selector => [...document.querySelectorAll(selector)])
  )];

  elements.forEach((el, index) => {
    if (el.closest('footer') || el.closest('header')) return;

    el.classList.add('scroll-reveal');

    const delay = index % 5;
    if (delay) el.classList.add(`scroll-reveal-delay-${delay}`);
  });

  if (!('IntersectionObserver' in window)) {
    elements.forEach(el => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      obs.unobserve(entry.target);
    });
  }, {
    threshold: 0.12,
    rootMargin: '0px 0px -40px 0px'
  });

  elements.forEach(el => observer.observe(el));
})();
