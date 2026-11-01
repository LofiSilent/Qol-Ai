// Простая 3D-рука (заглушка). Позже её можно заменить на настоящую модель .glb.
const viewer = document.getElementById('viewer');
const textEl = document.getElementById('text');
const nowEl = document.getElementById('now');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
camera.position.set(0, 0.3, 7);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
viewer.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const sun = new THREE.DirectionalLight(0xffffff, 0.9);
sun.position.set(3, 4, 5);
scene.add(sun);

const skin = new THREE.MeshStandardMaterial({ color: 0xe8b894, roughness: 0.7 });
const hand = new THREE.Group();
scene.add(hand);

const palm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 0.45), skin);
hand.add(palm);

// палец = два сустава; curl[0] — нижний, curl[1] — верхний
function makeFinger(x, y, len, rotZ = 0) {
  const base = new THREE.Group();
  base.position.set(x, y, 0);
  base.rotation.z = rotZ;
  const seg = (l, r) => {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 4, 10), skin);
    m.position.y = l / 2 + r;
    return m;
  };
  const a = seg(len * 0.5, 0.15);
  const joint = new THREE.Group();
  joint.position.y = len * 0.5 + 0.3;
  joint.add(seg(len * 0.45, 0.13));
  base.add(a, joint);
  return { base, joint };
}

const fingers = [
  makeFinger(-0.85, -0.25, 0.7, 0.9),   // большой
  makeFinger(-0.5, 0.75, 0.8),          // указательный
  makeFinger(-0.17, 0.75, 0.9),         // средний
  makeFinger(0.17, 0.75, 0.8),          // безымянный
  makeFinger(0.5, 0.75, 0.6),           // мизинец
];
fingers.forEach(f => hand.add(f.base));

// позы: степень сгиба каждого пальца (0 — прямой, 1 — сжат)
const OPEN = [0, 0, 0, 0, 0];
const POSES = [
  OPEN,
  [1, 1, 1, 1, 1],       // кулак
  [1, 0, 1, 1, 1],       // указательный
  [1, 0, 0, 1, 1],       // «два»
  [1, 0, 0, 0, 1],       // «три»
  [1, 0, 0, 0, 0],       // «четыре»
  [0, 1, 1, 1, 1],       // большой вверх
  [0, 1, 1, 1, 0],       // «рок»
  [1, 1, 1, 1, 0],       // мизинец
  [0, 0, 1, 1, 1],       // пистолет
];

let current = OPEN.slice();
let target = OPEN.slice();

function applyPose(c) {
  fingers.forEach((f, i) => {
    f.base.rotation.x = c[i] * 1.3;
    f.joint.rotation.x = c[i] * 1.4;
  });
}

// каждой букве/цифре соответствует поза; пробел и знаки — открытая ладонь
function poseFor(ch) {
  if (!/[\p{L}\p{N}]/u.test(ch)) return OPEN;
  return POSES[ch.toLowerCase().codePointAt(0) % POSES.length];
}

let queue = [];
let timer = null;
function stop() {
  clearInterval(timer);
  queue = [];
  target = OPEN.slice();
  nowEl.innerHTML = '&nbsp;';
}
function play() {
  const text = textEl.value.trim();
  if (!text) { textEl.focus(); return; }
  stop();
  queue = [...text];
  timer = setInterval(() => {
    const ch = queue.shift();
    if (ch === undefined) { stop(); return; }
    nowEl.textContent = ch === ' ' ? '·' : ch;
    target = poseFor(ch).slice();
  }, 650);
}
document.getElementById('play').addEventListener('click', play);
document.getElementById('stop').addEventListener('click', stop);

// вращение рукой/мышью
let dragging = false, lx = 0, ly = 0, velY = 0.004, auto = true;
viewer.addEventListener('pointerdown', e => { dragging = true; auto = false; lx = e.clientX; ly = e.clientY; viewer.setPointerCapture(e.pointerId); });
viewer.addEventListener('pointermove', e => {
  if (!dragging) return;
  hand.rotation.y += (e.clientX - lx) * 0.01;
  hand.rotation.x += (e.clientY - ly) * 0.01;
  lx = e.clientX; ly = e.clientY;
});
viewer.addEventListener('pointerup', () => { dragging = false; });

function resize() {
  const w = viewer.clientWidth, h = viewer.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

hand.rotation.set(-0.15, -0.4, 0);
(function loop() {
  requestAnimationFrame(loop);
  current = current.map((v, i) => v + (target[i] - v) * 0.15);
  applyPose(current);
  if (auto && !dragging) hand.rotation.y = -0.4 + Math.sin(Date.now() / 1500) * 0.35;
  renderer.render(scene, camera);
})();
