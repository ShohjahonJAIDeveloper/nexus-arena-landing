/**
 * 3D-наклон карточек за курсором — объёмный эффект без WebGL.
 * Работает только с мышью: на тач-устройствах наклон только мешает.
 */
const MAX_TILT = 9; // градусов

export function initTilt() {
  if (window.matchMedia('(pointer: coarse)').matches) return;

  const cards = document.querySelectorAll('.tilt');
  cards.forEach((card) => {
    let frame = null;

    const onMove = (event) => {
      const rect = card.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;

      card.style.setProperty('--mx', `${px * 100}%`);
      card.style.setProperty('--my', `${py * 100}%`);

      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        const rotateY = (px - 0.5) * 2 * MAX_TILT;
        const rotateX = (0.5 - py) * 2 * MAX_TILT;
        card.style.transform =
          `perspective(900px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateZ(6px)`;
      });
    };

    card.addEventListener('mouseenter', () => card.classList.add('is-tilting'));
    card.addEventListener('mousemove', onMove);
    card.addEventListener('mouseleave', () => {
      card.classList.remove('is-tilting');
      card.style.transform = '';
    });
  });
}
