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

    const box = new THREE.Box3().setFromObject(model);
    const h = box.max.y - box.min.y;
    target.set(0, box.min.y + h * 0.7, 0);
    dist = h * 1.2;
    onReady?.();
  }, xhr => { if (xhr.total) onProgress?.(xhr.loaded / xhr.total); }, err => onError?.(err));
}

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
