// 3D-персонаж: загрузка модели, камера, вращение и проигрывание кадров жестов.
// Один WebGL-рендерер на страницу; холст переносится между «слотами» (первый экран, студия).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Поза «руки перед грудью» подобрана под скелет Character Creator (CC_Base_*).
// При смене модели правьте только этот блок.
const RIG = {
  arms: [
    ['CC_Base_R_Upperarm', 0.5, 0, 1.0],
    ['CC_Base_L_Upperarm', 0.5, 0, -1.0],
    ['CC_Base_L_Forearm', 2.0, 0, 0],
  ],
  rightForearm: ['CC_Base_R_Forearm', 2.0],
  fingers: ['Thumb', 'Index', 'Mid', 'Ring', 'Pinky'],
  curlAxisRight: 1,   // знак сгиба правой руки (ось Z кости)
  thumbScale: 0.5,
  fingerScale: 1.1,
  leftRelax: -0.15,
};

const OPEN = [0, 0, 0, 0, 0];

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.2));
const keyLight = new THREE.DirectionalLight(0xffffff, 2);
keyLight.position.set(1.5, 2.5, 3);
scene.add(keyLight);

const bones = {};
let model = null;
let slot = null;
const target = new THREE.Vector3(0, 1.45, 0);
let dist = 1.75, yaw = 0, pitch = 0.05;

let curl = OPEN.slice(), curlTarget = OPEN.slice(), wave = 0;
let playing = false, playTimer = null;

export function loadAvatar(url, { onProgress, onReady, onError } = {}) {
  new GLTFLoader().load(url, gltf => {
    model = gltf.scene;
    scene.add(model);
    model.traverse(o => { if (o.isBone) { bones[o.name] = o; o.userData.rest = o.quaternion.clone(); } });
    const box = new THREE.Box3().setFromObject(model);
    const h = box.max.y - box.min.y;
    target.set(0, box.min.y + h * 0.74, 0);
    dist = h * 0.85;
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
      pitch = Math.max(-0.4, Math.min(0.6, pitch + (e.clientY - ly) * 0.004));
      lx = e.clientX; ly = e.clientY;
    });
  }
  addEventListener('pointerup', () => { dragging = false; });
  addEventListener('pointercancel', () => { dragging = false; });
}

// frames: [{ curl: [5 чисел], wave?: number, ms: number }]
export function play(frames, { onFrame, onEnd } = {}) {
  stop();
  if (!frames.length) return;
  playing = true;
  let i = 0;
  const next = () => {
    if (i >= frames.length) { stop(); onEnd?.(); return; }
    const f = frames[i];
    curlTarget = f.curl.slice();
    wave = f.wave ?? 0.08;
    onFrame?.(f, i, frames.length);
    i++;
    playTimer = setTimeout(next, f.ms || 450);
  };
  next();
}

export function stop() {
  clearTimeout(playTimer);
  playing = false;
  wave = 0;
  curlTarget = OPEN.slice();
}

export const isPlaying = () => playing;

function rot(name, x = 0, y = 0, z = 0, q = new THREE.Quaternion(), e = new THREE.Euler()) {
  const b = bones[name];
  if (b) b.quaternion.copy(b.userData.rest).multiply(q.setFromEuler(e.set(x, y, z)));
}

function applyPose(t) {
  for (const [name, x, y, z] of RIG.arms) rot(name, x, y, z);
  rot(RIG.rightForearm[0], RIG.rightForearm[1] + Math.sin(t / 400) * wave, 0, 0);
  RIG.fingers.forEach((f, i) => {
    const scale = f === 'Thumb' ? RIG.thumbScale : RIG.fingerScale;
    for (let j = 1; j <= 3; j++) {
      rot(`CC_Base_R_${f}${j}`, 0, 0, RIG.curlAxisRight * curl[i] * scale);
      rot(`CC_Base_L_${f}${j}`, 0, 0, f === 'Thumb' ? 0 : RIG.leftRelax);
    }
  });
}

(function loop() {
  requestAnimationFrame(loop);
  if (!slot) return;
  if (model) {
    curl = curl.map((v, i) => v + (curlTarget[i] - v) * 0.15);
    applyPose(performance.now());
  }
  camera.position.set(
    target.x + Math.sin(yaw) * Math.cos(pitch) * dist,
    target.y + Math.sin(pitch) * dist,
    target.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  camera.lookAt(target);
  renderer.render(scene, camera);
})();
