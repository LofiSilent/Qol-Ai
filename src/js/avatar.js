// 3D-персонаж: загрузка модели, камера, вращение и проигрывание жестов.
// Движения тела и мимика — из анимации, встроенной в модель (.glb).
// Поверх неё можно задать форму правой руки (сгиб пальцев) для слов из словаря.
// Один WebGL-рендерер на страницу; холст переносится между «слотами» (первый экран, студия).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Кости пальцев правой руки (скелет Character Creator, CC_Base_*). При смене модели правьте этот блок.
const FINGERS = ['Thumb', 'Index', 'Mid', 'Ring', 'Pinky'];
const fingerBone = (f, j) => `CC_Base_R_${f}${j}`;
const CURL_SCALE = { Thumb: 0.45, other: 1.0 };

// В модели несколько комплектов одежды, надетых друг на друга. Показываем только один,
// иначе ткань одного комплекта проступает сквозь другой.
// Каждый комплект — список мешей, которые нужно показать (по началу имени).
const OUTFITS = {
  // классика: чёрный пиджак, белая рубашка с манжетами, рукава пиджака — из повседневного комплекта
  classic: ['Qol_Business_', 'Qol_casual_Sleeve_'],
  casual: ['Qol_Casual_Knit', 'Qol_casual_'],
  academic: ['Qol_Academic_', 'Qol_academic_'],
  base: ['Fitted_formal_jacket_and_top'],
};
const ALL_CLOTHES = [...new Set(Object.values(OUTFITS).flat())];
const OUTFIT = 'classic';
// Цвета ткани (sRGB) для выбранного комплекта.
const CLOTH_COLORS = {
  'Qol tailored collar': '#151517',   // пиджак
  'Qol casual knit': '#151517',       // рукава пиджака
  'Qol ivory blouse': '#f4f3f0',      // рубашка и манжеты
  'Qol academic vest': '#151517',
};

function applyOutfit(root, outfit = OUTFIT) {
  const shown = OUTFITS[outfit];
  root.traverse(o => {
    if (!o.isMesh) return;
    const names = [o.name, o.parent?.name || ''];
    const is = list => list.some(p => names.some(n => n.startsWith(p)));
    if (is(ALL_CLOTHES) && !is(shown)) o.visible = false;
    for (const m of [o.material].flat()) {
      if (m && CLOTH_COLORS[m.name]) m.color.set(CLOTH_COLORS[m.name]);
    }
  });
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 50);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
scene.add(new THREE.HemisphereLight(0xfff8ee, 0x6d8696, 1.6));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(1.2, 2.4, 3);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0xc69f7a, 1.2);
rimLight.position.set(-2, 2, -2);
scene.add(rimLight);

const clock = new THREE.Clock();
const bones = {};
let model = null, mixer = null, actions = [], clipDuration = 0;
let slot = null;
const target = new THREE.Vector3(0, 1.3, 0);
let dist = 2.4, yaw = 0, pitch = 0.04;

// сгиб пальцев: null — пальцы ведёт анимация, массив из 5 чисел — форма руки поверх неё
let curl = [0, 0, 0, 0, 0], curlTarget = null, overlay = 0;
let playing = false, playTimer = null, endTimer = null;

export function loadAvatar(url, { onProgress, onReady, onError } = {}) {
  new GLTFLoader().load(url, gltf => {
    model = gltf.scene;
    scene.add(model);
    model.traverse(o => {
      if (o.isBone) { bones[o.name] = o; o.userData.rest = o.quaternion.clone(); }
      if (o.isMesh) o.frustumCulled = false;
    });
    applyOutfit(model);
    mixer = new THREE.AnimationMixer(model);
    actions = gltf.animations.map(clip => {
      const a = mixer.clipAction(clip);
      a.setLoop(THREE.LoopRepeat, Infinity);
      a.play();
      a.paused = true;
      return a;
    });
    clipDuration = Math.max(0, ...gltf.animations.map(c => c.duration));
    mixer.setTime(0);
    if (OUTFIT === 'classic') addJacketDetails(model);

    const box = new THREE.Box3().setFromObject(model);
    const h = box.max.y - box.min.y;
    target.set(0, box.min.y + h * 0.7, 0);
    dist = h * 1.2;
    onReady?.();
  }, xhr => { if (xhr.total) onProgress?.(xhr.loaded / xhr.total); }, err => onError?.(err));
}

// ---------- детали пиджака ----------
// В модели нет настоящего пиджака, поэтому поверх чёрного переда дорисовываем
// лацканы вдоль V-выреза, линию борта и пуговицы. Край выреза находим лучами при загрузке,
// детали крепим к костям груди, чтобы они двигались вместе с телом.
const JACKET = {
  body: 'Qol_Business_Jacket_Body',
  shirt: 'Qol_Business_Ivory_Blouse',
  lapelWidth: 0.06,
  lapelColor: '#303036',
  lapelEdge: '#6a6a72',
  seamColor: '#060607',
  buttonColor: '#0b0b0c',
};

function addJacketDetails(root) {
  const find = name => { let m = null; root.traverse(o => { if (o.isMesh && o.name === name) m = o; }); return m; };
  const body = find(JACKET.body), shirt = find(JACKET.shirt);
  const chest = bones.CC_Base_Spine02, waist = bones.CC_Base_Spine01 || chest;
  if (!body || !shirt || !chest) return;
  shirt.material = shirt.material.clone();
  shirt.material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed -= objectNormal * 0.012;');
  };
  root.updateMatrixWorld(true);

  // неподвижные копии пиджака и рубашки в текущей позе — лучи по ним в десятки раз быстрее
  const bake = mesh => {
    const src = mesh.geometry, n = src.attributes.position.count, v = new THREE.Vector3();
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { mesh.getVertexPosition(i, v); v.applyMatrix4(mesh.matrixWorld); v.toArray(pos, i * 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (src.index) g.setIndex(src.index);
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  };
  const bodyStatic = bake(body), shirtStatic = bake(shirt);
  const ray = new THREE.Raycaster();
  const dir = new THREE.Vector3(0, 0, -1);
  const hit = (x, y) => {
    ray.set(new THREE.Vector3(x, y, 1), dir);
    const h = ray.intersectObjects([bodyStatic, shirtStatic], false)[0];
    return h ? { onShirt: h.object === shirtStatic, point: h.point } : null;
  };

  // нижняя точка выреза: идём по центру вниз, пока рубашка не сменится пиджаком
  const box = new THREE.Box3().setFromObject(shirtStatic);
  const cx = (box.min.x + box.max.x) / 2;
  let yTop = null, yV = null;
  for (let y = box.max.y; y > box.min.y; y -= 0.004) {
    const h = hit(cx, y);
    if (!h) continue;
    if (h.onShirt && yTop === null) yTop = y;
    if (yTop !== null && !h.onShirt) { yV = y; break; }
  }
  if (yTop === null || yV === null) return;

  // край выреза на каждой высоте: двоичный поиск от центра (рубашка) наружу (пиджак)
  const edge = (y, side) => {
    let inner = cx, outer = null;
    for (let x = cx; Math.abs(x - cx) < 0.3; x += side * 0.006) {
      const h = hit(x, y);
      if (h && !h.onShirt) { outer = x; break; }
      if (h && h.onShirt) inner = x;
    }
    if (outer === null) return null;
    for (let k = 0; k < 10; k++) {
      const mid = (inner + outer) / 2, h = hit(mid, y);
      if (h && h.onShirt) inner = mid; else outer = mid;
    }
    return hit(outer + side * 0.001, y)?.point || null;
  };

  const lapelMat = new THREE.MeshStandardMaterial({ color: JACKET.lapelColor, roughness: 0.35, metalness: 0.05, side: THREE.DoubleSide });
  const edgeMat = new THREE.MeshStandardMaterial({ color: JACKET.lapelEdge, roughness: 0.4 });
  const lift = 0.004;
  for (const side of [-1, 1]) {
    const inner = [], outer = [];
    const yStart = yTop - 0.01;
    for (let y = yStart; y >= yV - 0.004; y -= 0.008) {
      const p = edge(y, side);
      if (!p) continue;
      // ширина лацкана сужается к низу выреза
      const t = (yStart - y) / Math.max(0.001, yStart - yV);
      const w = JACKET.lapelWidth * (1 - 0.75 * t);
      const q = hit(p.x + side * w, y)?.point;
      if (!q) continue;
      inner.push(p.clone().setZ(p.z + lift));
      outer.push(q.clone().setZ(q.z + lift));
    }
    if (inner.length < 2) continue;
    const pos = [];
    for (let i = 0; i < inner.length - 1; i++) {
      pos.push(...inner[i].toArray(), ...outer[i].toArray(), ...inner[i + 1].toArray());
      pos.push(...outer[i].toArray(), ...outer[i + 1].toArray(), ...inner[i + 1].toArray());
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const lapel = new THREE.Mesh(geo, lapelMat);
    lapel.frustumCulled = false;
    scene.add(lapel);
    chest.attach(lapel);
    // тонкая кромка по внешнему краю лацкана
    const rim = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(outer.map(v => v.clone().setZ(v.z + 0.001))), outer.length * 2, 0.0012, 4, false), edgeMat);
    rim.frustumCulled = false;
    scene.add(rim);
    chest.attach(rim);
  }

  // линия борта и пуговицы ниже выреза
  const bodyBox = new THREE.Box3().setFromObject(bodyStatic);
  const seamPts = [];
  for (let y = yV - 0.004; y > bodyBox.min.y + 0.01; y -= 0.01) {
    const h = hit(cx, y);
    if (h && !h.onShirt) seamPts.push(h.point.clone().setZ(h.point.z + lift));
  }
  if (seamPts.length > 1) {
    const curve = new THREE.CatmullRomCurve3(seamPts);
    const seam = new THREE.Mesh(new THREE.TubeGeometry(curve, seamPts.length * 2, 0.0016, 4, false),
      new THREE.MeshStandardMaterial({ color: JACKET.seamColor, roughness: 0.6 }));
    seam.frustumCulled = false;
    scene.add(seam);
    waist.attach(seam);
  }
  const btnGeo = new THREE.CylinderGeometry(0.0085, 0.0085, 0.004, 20).rotateX(Math.PI / 2);
  const btnMat = new THREE.MeshStandardMaterial({ color: JACKET.buttonColor, roughness: 0.25, metalness: 0.2 });
  for (const dy of [0.05, 0.13]) {
    const h = hit(cx, yV - dy);
    if (!h || h.onShirt) continue;
    const b = new THREE.Mesh(btnGeo, btnMat);
    b.position.copy(h.point).setZ(h.point.z + 0.004);
    scene.add(b);
    waist.attach(b);
  }
}

// для отладки кадра
export function debugView(d, y) { dist = d; target.y = y; }

export function mount(el) {
  if (!el || slot === el) return;
  slot = el;
  el.appendChild(renderer.domElement);
  resize();
}

function resize() {
  if (!slot) return;
  const w = slot.clientWidth, h = slot.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(document.documentElement);

// Холст сам переходит туда, где пользователь сейчас смотрит.
export function followVisible(slots, isEnabled = () => true) {
  const ratio = new Map();
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => ratio.set(e.target, e.intersectionRatio));
    let best = slots[0], bestRatio = -1;
    for (const el of slots) {
      const r = isEnabled(el) ? (ratio.get(el) || 0) : -1;
      if (r > bestRatio) { best = el; bestRatio = r; }
    }
    mount(best);
  }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
  slots.forEach(el => io.observe(el));
}

// Вращение мышью или пальцем; вертикальная прокрутка страницы остаётся.
export function enableOrbit(elements) {
  let dragging = false, lx = 0, ly = 0;
  for (const el of elements) {
    el.addEventListener('pointerdown', e => { if (slot !== el) return; dragging = true; lx = e.clientX; ly = e.clientY; });
    el.addEventListener('pointermove', e => {
      if (!dragging) return;
      yaw -= (e.clientX - lx) * 0.008;
      pitch = Math.max(-0.3, Math.min(0.5, pitch + (e.clientY - ly) * 0.004));
      lx = e.clientX; ly = e.clientY;
    });
  }
  addEventListener('pointerup', () => { dragging = false; });
  addEventListener('pointercancel', () => { dragging = false; });
}

function runClip(on) {
  if (!mixer) return;
  if (on) { mixer.setTime(0); actions.forEach(a => { a.paused = false; }); }
  else { actions.forEach(a => { a.paused = true; }); mixer.setTime(0); }
}

// Проиграть жест. frames: [{ curl?: [5 чисел], ms }] — форма руки поверх анимации.
// Без кадров проигрывается анимация модели целиком.
export function play(frames = [], { onFrame, onEnd } = {}) {
  stop();
  playing = true;
  runClip(true);
  const finish = () => { stop(); onEnd?.(); };
  if (!frames.length) {
    const ms = (clipDuration || 5) * 1000;
    const started = performance.now();
    playTimer = setInterval(() => onFrame?.(null, Math.min(1, (performance.now() - started) / ms)), 100);
    endTimer = setTimeout(finish, ms);
    return;
  }
  const total = frames.reduce((s, f) => s + (f.ms || 450), 0);
  let i = 0, elapsed = 0;
  const next = () => {
    if (i >= frames.length) { finish(); return; }
    const f = frames[i++];
    curlTarget = f.curl ? f.curl.slice() : null;
    elapsed += f.ms || 450;
    onFrame?.(f, elapsed / total);
    playTimer = setTimeout(next, f.ms || 450);
  };
  next();
}

export function stop() {
  clearTimeout(playTimer); clearInterval(playTimer); clearTimeout(endTimer);
  playing = false;
  curlTarget = null;
  runClip(false);
}

export const isPlaying = () => playing;

const q = new THREE.Quaternion(), e = new THREE.Euler();
function applyFingers(dt) {
  overlay += ((curlTarget ? 1 : 0) - overlay) * Math.min(1, dt * 10);
  if (curlTarget) curl = curl.map((v, i) => v + (curlTarget[i] - v) * Math.min(1, dt * 12));
  if (overlay < 0.01) return;
  FINGERS.forEach((f, i) => {
    const scale = f === 'Thumb' ? CURL_SCALE.Thumb : CURL_SCALE.other;
    for (let j = 1; j <= 3; j++) {
      const b = bones[fingerBone(f, j)];
      if (b) b.quaternion.multiply(q.setFromEuler(e.set(0, 0, curl[i] * scale * overlay)));
    }
  });
}

(function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.1);
  if (!slot) return;
  if (mixer) {
    mixer.update(playing ? dt : 0);
    applyFingers(dt);
  }
  camera.position.set(
    target.x + Math.sin(yaw) * Math.cos(pitch) * dist,
    target.y + Math.sin(pitch) * dist,
    target.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  camera.lookAt(target);
  renderer.render(scene, camera);
})();
