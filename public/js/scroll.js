/**
 * Эффекты при скролле. Базовые (появление, счётчики, параллакс, прогресс)
 * работают на голом IntersectionObserver, поэтому не зависят от библиотек.
 * Lenis и GSAP подключаются отдельно и только как «вишенка».
 */

/** Плавное появление блоков со стаггером внутри одной секции. */
export function initReveal() {
  const items = document.querySelectorAll('[data-reveal]');
  if (!items.length) return;

  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const siblings = [...entry.target.parentElement.querySelectorAll(':scope > [data-reveal]')];
      const delay = Math.min(siblings.indexOf(entry.target), 5) * 90;
      entry.target.style.transitionDelay = `${delay}ms`;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -60px' });

  items.forEach((el, index) => {
    // То, что уже видно при загрузке (первый экран), показываем сразу:
    // ждать скролла ради собственного первого экрана незачем.
    if (el.getBoundingClientRect().top < window.innerHeight) {
      el.style.transitionDelay = `${Math.min(index, 5) * 90}ms`;
      requestAnimationFrame(() => el.classList.add('is-visible'));
      return;
    }
    observer.observe(el);
  });
}

/** Анимированные цифры в блоке статистики. */
export function initCounters() {
  const counters = document.querySelectorAll('[data-count]');
  if (!counters.length) return;

  const animate = (el) => {
    const target = parseFloat(el.dataset.count);
    const decimals = Number(el.dataset.decimals || 0);
    const suffix = el.dataset.suffix || '';
    const duration = 1400;
    const start = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      el.textContent = (target * eased).toFixed(decimals) + (progress === 1 ? suffix : '');
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      animate(entry.target);
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.5 });

  counters.forEach((el) => observer.observe(el));
}

/** Полоса прогресса чтения страницы. */
export function initProgressBar() {
  const bar = document.getElementById('progress-bar');
  if (!bar) return;
  const update = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
  };
  update();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
}

/** Многослойный параллакс фоновых пятен. */
export function initParallax() {
  const layers = [...document.querySelectorAll('[data-parallax]')];
  if (!layers.length) return;

  let ticking = false;
  const update = () => {
    ticking = false;
    const viewportCenter = window.scrollY + window.innerHeight / 2;
    for (const layer of layers) {
      const rect = layer.getBoundingClientRect();
      const center = window.scrollY + rect.top + rect.height / 2;
      const shift = (viewportCenter - center) * Number(layer.dataset.parallax);
      layer.style.setProperty('--shift', `${shift.toFixed(1)}px`);
    }
  };
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  update();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
}

/**
 * Инерционный скролл (Lenis) + закреплённая секция «Как это работает»
 * с горизонтальным продвижением (GSAP ScrollTrigger).
 * Если библиотеки недоступны — секция просто листается пальцем.
 */
export async function initScrollEffects() {
  const track = document.getElementById('steps-track');

  let lenis = null;
  try {
    const { default: Lenis } = await import('lenis');
    lenis = new Lenis({ duration: 1.05, smoothWheel: true, touchMultiplier: 1.6 });
    const raf = (time) => {
      lenis.raf(time);
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
    document.documentElement.classList.add('lenis');

    // Якорные ссылки должны работать через Lenis, иначе прыжок будет резким.
    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[href^="#"]');
      if (!link || link.getAttribute('href') === '#') return;
      const target = document.querySelector(link.getAttribute('href'));
      if (!target) return;
      event.preventDefault();
      lenis.scrollTo(target, { offset: -70 });
    });
  } catch (error) {
    console.warn('[lenis] недоступен:', error.message);
  }

  try {
    const { gsap } = await import('gsap');
    const { ScrollTrigger } = await import('gsap/ScrollTrigger');
    gsap.registerPlugin(ScrollTrigger);

    if (lenis) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.lagSmoothing(0);
    }

    // Горизонтальное продвижение карточек «Как это работает».
    if (track && window.innerWidth > 900) {
      const distance = () => Math.max(0, track.scrollWidth - track.parentElement.clientWidth);
      if (distance() > 0) {
        gsap.to(track, {
          x: () => -distance(),
          ease: 'none',
          scrollTrigger: {
            trigger: '#how',
            start: 'center center',
            end: () => `+=${distance() + 300}`,
            pin: true,
            scrub: 0.8,
            invalidateOnRefresh: true,
            anticipatePin: 1,
          },
        });
      }
    } else if (track) {
      track.style.overflowX = 'auto';
      track.style.paddingBottom = '12px';
    }

    // Первый экран уезжает вглубь при скролле.
    gsap.to('.hero__content', {
      y: -90,
      opacity: 0.15,
      ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
    });

    ScrollTrigger.refresh();
  } catch (error) {
    if (track) {
      track.style.overflowX = 'auto';
      track.style.paddingBottom = '12px';
    }
    throw error;
  }
}
