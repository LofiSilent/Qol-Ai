import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const viewer = document.getElementById('viewer');
const textEl = document.getElementById('text');
const nowEl = document.getElementById('now');
const loadEl = document.getElementById('loading');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewer.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.2));
const key = new THREE.DirectionalLight(0xffffff, 2);
key.position.set(1.5, 2.5, 3);
scene.add(key);

const bones = {};
let avatar = null;
let target = new THREE.Vector3(0, 1.4, 0);
let dist = 2.2;

new GLTFLoader().load('assets/model/avatar.glb', gltf => {
  avatar = gltf.scene;
  scene.add(avatar);
  avatar.traverse(o => { if (o.isBone) bones[o.name] = o; });
  Object.values(bones).forEach(b => { b.userData.rest = b.quaternion.clone(); });
  const box = new THREE.Box3().setFromObject(avatar);
  const h = box.max.y - box.min.y;
  target.set(0, box.min.y + h * 0.76, 0);
  dist = h * 0.92;
  loadEl.remove();
  window.__ready = true;
}, xhr => { if (xhr.total) loadEl.textContent = `Загрузка модели… ${Math.round(xhr.loaded / xhr.total * 100)}%`; }, () => { loadEl.textContent = 'Не удалось загрузить модель'; });

// поворот кости относительно позы покоя (локальные оси кости)
const tmp = new THREE.Quaternion(), e = new THREE.Euler();
function rot(name, x = 0, y = 0, z = 0) {
  const b = bones[name];
  if (!b) return;
  b.quaternion.copy(b.userData.rest).multiply(tmp.setFromEuler(e.set(x, y, z)));
}


// ---- позы ----
const FINGERS = ['Thumb', 'Index', 'Mid', 'Ring', 'Pinky'];
// степень сгиба пальцев (0 — прямой, 1 — сжат): большой, указательный, средний, безымянный, мизинец
const OPEN = [0, 0, 0, 0, 0];
const POSES = [
  OPEN,
  [1, 1, 1, 1, 1],
  [1, 0, 1, 1, 1],
  [1, 0, 0, 1, 1],
  [1, 0, 0, 0, 1],
  [1, 0, 0, 0, 0],
  [0, 1, 1, 1, 1],
  [0, 1, 1, 1, 0],
  [1, 1, 1, 1, 0],
  [0, 0, 1, 1, 1],
];
let curl = OPEN.slice(), curlTarget = OPEN.slice(), wave = 0;

function applyPose(t) {
  rot('CC_Base_R_Upperarm', 0.5, 0, 1.0);
  rot('CC_Base_L_Upperarm', 0.5, 0, -1.0);
  rot('CC_Base_R_Forearm', 2.0 + Math.sin(t / 400) * wave, 0, 0);
  rot('CC_Base_L_Forearm', 2.0, 0, 0);
  FINGERS.forEach((f, i) => {
    for (let j = 1; j <= 3; j++) {
      rot(`CC_Base_R_${f}${j}`, 0, 0, curl[i] * (f === 'Thumb' ? 0.5 : 1.1));
      rot(`CC_Base_L_${f}${j}`, 0, 0, -0.15 * (f === 'Thumb' ? 0 : 1));
    }
  });
}

// букве/цифре соответствует поза; пробел и знаки — открытая ладонь
const poseFor = ch => /[\p{L}\p{N}]/u.test(ch) ? POSES[ch.toLowerCase().codePointAt(0) % POSES.length] : OPEN;
let queue = [], timer = null;
function stop() { clearInterval(timer); queue = []; curlTarget = OPEN.slice(); wave = 0; nowEl.innerHTML = '&nbsp;'; }
function play() {
  const text = textEl.value.trim();
  if (!text) { textEl.focus(); return; }
  stop();
  queue = [...text];
  wave = 0.12;
  timer = setInterval(() => {
    const ch = queue.shift();
    if (ch === undefined) { stop(); return; }
    nowEl.textContent = ch === ' ' ? '·' : ch;
    curlTarget = poseFor(ch).slice();
  }, 650);
}
document.getElementById('play').addEventListener('click', play);
document.getElementById('stop').addEventListener('click', stop);

// ---- орбита ----
let yaw = 0, pitch = 0.05, dragging = false, lx = 0, ly = 0;
viewer.addEventListener('pointerdown', e => { dragging = true; lx = e.clientX; ly = e.clientY; viewer.setPointerCapture(e.pointerId); });
viewer.addEventListener('pointermove', e => {
  if (!dragging) return;
  yaw -= (e.clientX - lx) * 0.008;
  pitch = Math.max(-0.5, Math.min(0.8, pitch + (e.clientY - ly) * 0.005));
  lx = e.clientX; ly = e.clientY;
});
viewer.addEventListener('pointerup', () => { dragging = false; });
viewer.addEventListener('pointercancel', () => { dragging = false; });

function resize() {
  const w = viewer.clientWidth, h = viewer.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

(function loop() {
  requestAnimationFrame(loop);
  if (avatar) { curl = curl.map((v, i) => v + (curlTarget[i] - v) * 0.15); applyPose(performance.now()); }
  camera.position.set(
    target.x + Math.sin(yaw) * Math.cos(pitch) * dist,
    target.y + Math.sin(pitch) * dist,
    target.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  camera.lookAt(target);
  renderer.render(scene, camera);
})();
