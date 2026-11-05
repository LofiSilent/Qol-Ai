// Камера: MediaPipe Hands в браузере, без сервера. Видео никуда не отправляется.
// Класс жеста = число выпрямленных пальцев (1–5). Это договорные демо-жесты, не словарь КЖЯ.
const VISION = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const HOLD_FRAMES = 14; // жест должен продержаться ~0,5 с, чтобы засчитаться

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z - b.z) * 0.5);

// Палец выпрямлен, если кончик дальше от запястья, чем средний сустав. Не зависит от поворота кисти.
function extended(lm, tip, pip) {
  return dist(lm[tip], lm[0]) > dist(lm[pip], lm[0]) * 1.12;
}
function thumbOut(lm) {
  return dist(lm[4], lm[17]) > dist(lm[3], lm[17]) * 1.08 && dist(lm[4], lm[5]) > dist(lm[2], lm[5]) * 0.9;
}

// Возвращает 1..5 или 0, если поза не похожа ни на один из пяти жестов.
export function classify(lm) {
  const f = [extended(lm, 8, 6), extended(lm, 12, 10), extended(lm, 16, 14), extended(lm, 20, 18)];
  const n = f.filter(Boolean).length;
  const thumb = thumbOut(lm);
  const fromIndex = f.every((on, i) => on === (i < n)); // пальцы идут подряд от указательного
  if (n === 4 && thumb) return 5;
  if (n === 4) return 4;
  if (n === 3 && fromIndex && !thumb) return 3;
  if (n === 2 && fromIndex && !thumb) return 2;
  if (n === 1 && fromIndex && !thumb) return 1;
  return 0;
}

export function initCamera({ t, onRecognized }) {
  const $ = id => document.getElementById(id);
  const video = $('camVideo'), canvas = $('camCanvas'), stage = $('camStage');
  const startBtn = $('camStart'), stopBtn = $('camStop'), status = $('camStatus');
  const sentence = $('camSentence'), ring = $('camRing'), chips = [...document.querySelectorAll('.cam-chip')];
  const ctx = canvas.getContext('2d');
  let landmarker = null, stream = null, raf = 0, running = false;
  let candidate = 0, streak = 0, locked = 0, lastTs = -1, statusKey = 'camIdle';

  const ERRORS = ['camDenied', 'camFail'];
  const setStatus = key => { statusKey = key; status.textContent = t(key); status.dataset.state = key; status.hidden = !ERRORS.includes(key); };
  const refreshStatus = () => { status.textContent = t(statusKey); };

  function show(cls, source) {
    sentence.textContent = t('camQ' + cls);
    sentence.dataset.cls = cls;
    sentence.classList.remove('pop'); void sentence.offsetWidth; sentence.classList.add('pop');
    chips.forEach(c => c.classList.toggle('active', Number(c.dataset.cls) === cls));
    onRecognized?.(cls, source);
  }

  async function ensureModel() {
    if (landmarker) return landmarker;
    const { FilesetResolver, HandLandmarker } = await import(`${VISION}/vision_bundle.mjs`);
    const fileset = await FilesetResolver.forVisionTasks(`${VISION}/wasm`);
    const make = delegate => HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numHands: 1,
      minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.6,
    });
    try { landmarker = await make('GPU'); } catch { landmarker = await make('CPU'); }
    return landmarker;
  }

  function draw(lm) {
    const w = canvas.width = video.videoWidth || 640, h = canvas.height = video.videoHeight || 480;
    ctx.clearRect(0, 0, w, h);
    if (!lm) return;
    ctx.fillStyle = '#C69F7A';
    for (const p of lm) { ctx.beginPath(); ctx.arc(p.x * w, p.y * h, 4, 0, 7); ctx.fill(); }
  }

  function tick() {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    if (video.readyState < 2 || video.currentTime === lastTs) return;
    lastTs = video.currentTime;
    const res = landmarker.detectForVideo(video, performance.now());
    const lm = res.landmarks?.[0];
    draw(lm);
    if (!lm) { candidate = 0; streak = 0; locked = 0; ring.style.setProperty('--p', 0); setStatus('camNoHand'); return; }
    setStatus('camLive');
    const cls = classify(lm);
    if (cls && cls === candidate) streak += 1; else { candidate = cls; streak = cls ? 1 : 0; }
    ring.style.setProperty('--p', cls ? Math.min(1, streak / HOLD_FRAMES) : 0);
    if (cls && streak >= HOLD_FRAMES && locked !== cls) { locked = cls; show(cls, 'camera'); }
    if (!cls) locked = 0;
  }

  async function start() {
    startBtn.disabled = true;
    setStatus('camLoading');
    stage.classList.add('loading');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 540 } }, audio: false });
    } catch { stage.classList.remove('loading'); startBtn.disabled = false; setStatus('camDenied'); return; }
    try { await ensureModel(); } catch (e) { console.warn(e); stream.getTracks().forEach(tr => tr.stop()); stream = null; stage.classList.remove('loading'); startBtn.disabled = false; setStatus('camFail'); return; }
    video.srcObject = stream;
    await video.play().catch(() => {});
    stage.classList.remove('loading'); stage.classList.add('on');
    stopBtn.disabled = false; running = true; candidate = streak = locked = 0; lastTs = -1;
    setStatus('camLive');
    tick();
  }

  function stop() {
    running = false; cancelAnimationFrame(raf);
    stream?.getTracks().forEach(tr => tr.stop()); stream = null;
    video.srcObject = null; draw(null);
    stage.classList.remove('on', 'loading');
    startBtn.disabled = false; stopBtn.disabled = true;
    ring.style.setProperty('--p', 0);
    setStatus('camIdle');
  }

  startBtn.addEventListener('click', start);
  stopBtn.addEventListener('click', stop);
  chips.forEach(c => c.addEventListener('click', () => show(Number(c.dataset.cls), 'button')));
  document.addEventListener('visibilitychange', () => { if (document.hidden && running) stop(); });
  setStatus('camIdle');
  return { refresh: () => { refreshStatus(); const c = Number(sentence.dataset.cls); if (c) sentence.textContent = t('camQ' + c); } };
}
