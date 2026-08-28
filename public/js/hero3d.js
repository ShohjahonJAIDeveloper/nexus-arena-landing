/**
 * 3D-сцена первого экрана: неоновый «коридор» игрового клуба.
 * Сетка-пол уходит в туман, вдоль неё стоят станции со светящимися мониторами,
 * в воздухе висит пыль-частицы. Камера мягко следует за курсором.
 *
 * Сцена намеренно собрана из простых примитивов: никакой загрузки моделей,
 * работает офлайн и не роняет FPS на слабых машинах.
 */
import * as THREE from 'three';

const NEON = { cyan: 0x22d3ee, violet: 0x7c3aed, magenta: 0xe935c1 };
const ROWS = 9;      // станций в одном ряду
const SPACING = 2.6; // шаг между станциями по глубине

export function initHero3d() {
  const canvas = document.getElementById('hero-canvas');
  const hero = document.querySelector('.hero');
  if (!canvas || !hero) return null;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(hero.clientWidth, hero.clientHeight, false);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x07070c, 0.042);

  const camera = new THREE.PerspectiveCamera(58, hero.clientWidth / hero.clientHeight, 0.1, 120);
  camera.position.set(0, 1.35, 8.2);

  /* ------------------------------ Свет -------------------------------- */
  scene.add(new THREE.AmbientLight(0x5a5f8a, 1.1));
  const keyLight = new THREE.PointLight(NEON.cyan, 55, 40, 2);
  keyLight.position.set(-4, 4, 2);
  scene.add(keyLight);
  const rimLight = new THREE.PointLight(NEON.magenta, 45, 40, 2);
  rimLight.position.set(5, 3, -6);
  scene.add(rimLight);

  /* --------------------------- Сетка пола ------------------------------ */
  const floorGrid = new THREE.GridHelper(120, 120, NEON.cyan, 0x2a2a52);
  floorGrid.material.transparent = true;
  floorGrid.material.opacity = 0.5;
  floorGrid.position.y = -1.2;
  scene.add(floorGrid);

  const ceilGrid = new THREE.GridHelper(120, 60, NEON.magenta, 0x2a2a52);
  ceilGrid.material.transparent = true;
  ceilGrid.material.opacity = 0.14;
  ceilGrid.position.y = 6.5;
  scene.add(ceilGrid);

  /* ------------------------- Игровые станции --------------------------- */
  const group = new THREE.Group();
  scene.add(group);

  const deskGeo = new THREE.BoxGeometry(1.7, 0.12, 0.9);
  const towerGeo = new THREE.BoxGeometry(0.34, 0.8, 0.34);
  const screenGeo = new THREE.BoxGeometry(1.25, 0.72, 0.06);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x14141f, roughness: 0.55, metalness: 0.35 });

  const total = ROWS * 2;
  const desks = new THREE.InstancedMesh(deskGeo, bodyMat, total);
  const towers = new THREE.InstancedMesh(towerGeo, bodyMat, total);

  const dummy = new THREE.Object3D();
  const palette = [NEON.cyan, NEON.violet, NEON.magenta];
  // Мониторы разбиты по цветам: отдельный InstancedMesh на каждый неон —
  // так свечение гарантированно видно и без вертексных цветов.
  const screenBuckets = palette.map(() => []);

  let i = 0;
  for (let row = 0; row < ROWS; row += 1) {
    for (const side of [-1, 1]) {
      const x = side * 3.1;
      const z = -row * SPACING;

      dummy.position.set(x, -0.55, z);
      dummy.rotation.set(0, side * 0.28, 0);
      dummy.updateMatrix();
      desks.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x + side * 0.62, -0.75, z);
      dummy.updateMatrix();
      towers.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x, 0.06, z - 0.18);
      dummy.updateMatrix();
      screenBuckets[i % palette.length].push(dummy.matrix.clone());

      i += 1;
    }
  }
  desks.instanceMatrix.needsUpdate = true;
  towers.instanceMatrix.needsUpdate = true;
  group.add(desks, towers);

  const screenMeshes = screenBuckets.map((matrices, index) => {
    const mesh = new THREE.InstancedMesh(
      screenGeo,
      new THREE.MeshBasicMaterial({ color: palette[index], transparent: true, opacity: 0.9 }),
      matrices.length,
    );
    matrices.forEach((matrix, n) => mesh.setMatrixAt(n, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
    return mesh;
  });

  /* ---------------------------- Частицы -------------------------------- */
  const dustCount = 900;
  const positions = new Float32Array(dustCount * 3);
  for (let n = 0; n < dustCount; n += 1) {
    positions[n * 3] = (Math.random() - 0.5) * 26;
    positions[n * 3 + 1] = Math.random() * 9 - 1.2;
    positions[n * 3 + 2] = -Math.random() * 40 + 6;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0x9fe8ff,
    size: 0.05,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  scene.add(dust);

  /* ------------------------ Управление и цикл --------------------------- */
  const pointer = { x: 0, y: 0 };
  const target = { x: 0, y: 0 };
  let scrollProgress = 0;
  let running = true;
  let frameId = null;

  const onPointerMove = (event) => {
    const point = event.touches ? event.touches[0] : event;
    target.x = (point.clientX / window.innerWidth - 0.5) * 2;
    target.y = (point.clientY / window.innerHeight - 0.5) * 2;
  };
  window.addEventListener('mousemove', onPointerMove, { passive: true });
  window.addEventListener('touchmove', onPointerMove, { passive: true });

  // Небольшой наклон по гироскопу на телефонах.
  window.addEventListener('deviceorientation', (event) => {
    if (event.gamma == null) return;
    target.x = Math.max(-1, Math.min(1, event.gamma / 35));
    target.y = Math.max(-1, Math.min(1, (event.beta - 45) / 45));
  });

  const onScroll = () => {
    scrollProgress = Math.min(window.scrollY / Math.max(hero.clientHeight, 1), 1);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const onResize = () => {
    camera.aspect = hero.clientWidth / hero.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(hero.clientWidth, hero.clientHeight, false);
  };
  window.addEventListener('resize', onResize);

  const clock = new THREE.Clock();
  // Своё время сцены: после паузы дельта обрезается, поэтому анимация
  // продолжается с того же места, а не прыгает вперёд.
  let elapsed = 0;

  const render = () => {
    frameId = requestAnimationFrame(render);
    const delta = Math.min(clock.getDelta(), 0.05);
    elapsed += delta;

    // Плавно догоняем курсор — резких рывков камеры быть не должно.
    pointer.x += (target.x - pointer.x) * 0.05;
    pointer.y += (target.y - pointer.y) * 0.05;

    camera.position.x = pointer.x * 1.6;
    camera.position.y = 1.35 - pointer.y * 0.6;
    camera.position.z = 8.2 - scrollProgress * 5.5;
    camera.lookAt(0, 0.95 + Math.sin(elapsed * 0.4) * 0.07, -11);

    // Сетка бесконечно уезжает вперёд.
    floorGrid.position.z = (floorGrid.position.z + delta * 2.4) % 1;
    ceilGrid.position.z = (ceilGrid.position.z + delta * 1.6) % 2;

    // Мониторы едва заметно «дышат».
    const pulse = 0.78 + Math.sin(elapsed * 1.6) * 0.12;
    screenMeshes.forEach((mesh, index) => {
      mesh.material.opacity = pulse - index * 0.05;
    });

    dust.rotation.y = elapsed * 0.02;
    dust.position.z = (elapsed * 0.6) % 8;

    group.position.y = Math.sin(elapsed * 0.5) * 0.05;

    renderer.render(scene, camera);
  };

  const start = () => {
    if (running || frameId) return;
    running = true;
    clock.getDelta(); // сбрасываем накопленную паузу
    render();
  };
  const stop = () => {
    running = false;
    if (frameId) cancelAnimationFrame(frameId);
    frameId = null;
  };

  // Не жжём батарею, пока первый экран не виден или вкладка неактивна.
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) start();
    else stop();
  }, { threshold: 0.02 });
  observer.observe(hero);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });

  render();

  return {
    stop,
    dispose() {
      stop();
      observer.disconnect();
      renderer.dispose();
      [deskGeo, towerGeo, screenGeo, dustGeo].forEach((geo) => geo.dispose());
    },
  };
}
