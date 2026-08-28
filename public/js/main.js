/**
 * Точка входа фронтенда. Тяжёлые эффекты (3D, скролл-анимации) подключаются
 * динамически и только если устройство и настройки пользователя это позволяют.
 */
import { initAssistant } from './assistant.js';
import { initLeadForm } from './form.js';
import { initReveal, initCounters, initParallax, initProgressBar, initScrollEffects } from './scroll.js';

export const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
export const isLowPower = (navigator.hardwareConcurrency || 8) <= 4 || window.innerWidth < 900;

if (!prefersReducedMotion) document.documentElement.classList.add('anim');

// Лендинг всегда открывается с первого экрана: браузер иначе восстанавливает
// прошлую позицию скролла и гость попадает в середину страницы.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

/* ------------------------------ Шапка ---------------------------------- */
function initHeader() {
  const header = document.getElementById('header');
  const burger = document.getElementById('burger');
  const nav = document.getElementById('nav');

  const onScroll = () => header.classList.toggle('is-stuck', window.scrollY > 20);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  burger.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    burger.setAttribute('aria-expanded', String(open));
    burger.textContent = open ? '✕' : '☰';
  });

  nav.addEventListener('click', (event) => {
    if (event.target.tagName !== 'A') return;
    nav.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
    burger.textContent = '☰';
  });
}

/* ------------------------------- FAQ ----------------------------------- */
function initFaq() {
  const list = document.getElementById('faq-list');
  list.addEventListener('click', (event) => {
    const question = event.target.closest('.faq__q');
    if (!question) return;
    const item = question.parentElement;
    const wasOpen = item.classList.contains('is-open');
    list.querySelectorAll('.faq__item.is-open').forEach((el) => el.classList.remove('is-open'));
    item.classList.toggle('is-open', !wasOpen);
  });
}

/* ----------------------------- Отзывы ---------------------------------- */
function initReviews() {
  const viewport = document.getElementById('reviews-viewport');
  const track = document.getElementById('reviews-track');
  const prev = document.getElementById('reviews-prev');
  const next = document.getElementById('reviews-next');
  if (!track) return;

  let index = 0;
  let autoplay;

  const step = () => {
    const card = track.querySelector('.review');
    const gap = parseFloat(getComputedStyle(track).gap) || 18;
    return card.offsetWidth + gap;
  };
  const maxIndex = () => Math.max(0, track.children.length - Math.round(viewport.clientWidth / step()));

  const render = () => {
    index = Math.min(Math.max(index, 0), maxIndex());
    track.style.transition = 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)';
    track.style.transform = `translate3d(${-index * step()}px, 0, 0)`;
  };

  const go = (delta) => { index += delta; render(); };
  prev.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));

  const startAutoplay = () => {
    if (prefersReducedMotion) return;
    stopAutoplay();
    autoplay = setInterval(() => {
      index = index >= maxIndex() ? 0 : index + 1;
      render();
    }, 5000);
  };
  const stopAutoplay = () => clearInterval(autoplay);

  viewport.addEventListener('mouseenter', stopAutoplay);
  viewport.addEventListener('mouseleave', startAutoplay);

  // Перетаскивание мышью и пальцем
  let startX = 0;
  let dragging = false;
  const onDown = (event) => {
    dragging = true;
    startX = (event.touches ? event.touches[0].clientX : event.clientX);
    viewport.classList.add('is-dragging');
    stopAutoplay();
  };
  const onUp = (event) => {
    if (!dragging) return;
    dragging = false;
    viewport.classList.remove('is-dragging');
    const endX = (event.changedTouches ? event.changedTouches[0].clientX : event.clientX);
    const delta = startX - endX;
    if (Math.abs(delta) > 45) go(delta > 0 ? 1 : -1);
    startAutoplay();
  };

  viewport.addEventListener('mousedown', onDown);
  viewport.addEventListener('touchstart', onDown, { passive: true });
  window.addEventListener('mouseup', onUp);
  viewport.addEventListener('touchend', onUp);
  window.addEventListener('resize', render);

  render();
  startAutoplay();
}

/* --------------------- Курсор и подсветка кнопок ------------------------ */
function initCursor() {
  if (prefersReducedMotion || isCoarsePointer) return;
  const cursor = document.getElementById('cursor');
  let x = window.innerWidth / 2;
  let y = window.innerHeight / 2;
  let currentX = x;
  let currentY = y;

  window.addEventListener('mousemove', (event) => {
    x = event.clientX;
    y = event.clientY;
    cursor.classList.add('is-active');
  }, { passive: true });

  const loop = () => {
    currentX += (x - currentX) * 0.18;
    currentY += (y - currentY) * 0.18;
    cursor.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
    requestAnimationFrame(loop);
  };
  loop();

  document.addEventListener('mouseover', (event) => {
    const interactive = event.target.closest('a, button, input, textarea, .card');
    cursor.classList.toggle('is-hover', Boolean(interactive));
  });
}

/** Подсветка под курсором внутри кнопок (--mx/--my читает CSS). */
function initButtonGlow() {
  if (isCoarsePointer) return;
  document.addEventListener('mousemove', (event) => {
    const btn = event.target.closest('.btn');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    btn.style.setProperty('--mx', `${((event.clientX - rect.left) / rect.width) * 100}%`);
    btn.style.setProperty('--my', `${((event.clientY - rect.top) / rect.height) * 100}%`);
  }, { passive: true });
}

/* ------------------------------ Запуск --------------------------------- */
function boot() {
  document.getElementById('year').textContent = new Date().getFullYear();

  initHeader();
  initFaq();
  initReviews();
  initCursor();
  initButtonGlow();

  initReveal();
  initCounters();
  initProgressBar();
  initParallax();

  initAssistant();
  initLeadForm();

  // Тяжёлые эффекты — только когда они уместны и если модули загрузились.
  if (!prefersReducedMotion) {
    import('./tilt.js')
      .then((m) => m.initTilt())
      .catch((error) => console.warn('[tilt] отключён:', error.message));

    initScrollEffects().catch((error) => console.warn('[scroll] плавный скролл отключён:', error.message));
  }

  const canUseWebgl = !prefersReducedMotion && !isLowPower && hasWebgl();
  if (canUseWebgl) {
    import('./hero3d.js')
      .then((m) => m.initHero3d())
      .catch((error) => {
        console.warn('[hero3d] 3D-сцена отключена:', error.message);
        showHeroFallback();
      });
  } else {
    showHeroFallback();
  }
}

function hasWebgl() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function showHeroFallback() {
  document.getElementById('hero-canvas')?.remove();
  const fallback = document.getElementById('hero-fallback');
  if (fallback) fallback.style.opacity = '1';
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
