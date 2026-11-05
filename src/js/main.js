// Интерфейс страницы: язык, тема, анимации, примеры, студия.
import { translations, LANGUAGES, DEFAULT_LANGUAGE } from './i18n.js?v=__BUILD__';
import { loadAvatar, mount, followVisible, enableOrbit, play, stop, isPlaying } from './avatar.js?v=__BUILD__';
import { loadDictionary, textToFrames } from './signing.js?v=__BUILD__';
import { initCamera } from './camera.js?v=__BUILD__';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const html = document.documentElement;

const storage = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

// ---------- Telegram Mini App ----------
const telegram = window.Telegram?.WebApp?.initData ? window.Telegram.WebApp : null;
if (telegram) {
  telegram.ready();
  telegram.expand();
  html.classList.add('telegram-mini-app');
  if (telegram.colorScheme) html.dataset.theme = telegram.colorScheme;
  telegram.onEvent('themeChanged', () => { html.dataset.theme = telegram.colorScheme; });
}

let camera = null;
// ---------- язык ----------
const requested = new URLSearchParams(location.search).get('lang');
let lang = [requested, storage.get('qolai-lang')].find(l => LANGUAGES.includes(l)) || DEFAULT_LANGUAGE;
const t = key => translations[lang][key] ?? translations[DEFAULT_LANGUAGE][key] ?? '';

function setLang(next) {
  lang = next;
  storage.set('qolai-lang', lang);
  html.lang = lang;
  $$('[data-i18n]').forEach(el => { const v = t(el.dataset.i18n); if (v) el.textContent = v; });
  $$('[data-i18n-html]').forEach(el => { const v = t(el.dataset.i18nHtml); if (v) el.innerHTML = v; });
  $$('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  $$('[data-lang]').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
  document.title = t('pageTitle');
  camera?.refresh();
}
$$('[data-lang]').forEach(btn => btn.addEventListener('click', () => setLang(btn.dataset.lang)));
setLang(lang);

// ---------- тема ----------
if (!telegram) html.dataset.theme = storage.get('qolai-theme') || 'light';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const applyTheme = () => {
  html.dataset.theme = html.dataset.theme === 'dark' ? 'light' : 'dark';
  storage.set('qolai-theme', html.dataset.theme);
};
// Круговая волна от кнопки (View Transitions), как на qol-ai.app; без поддержки — мягкое затухание.
let themeBusy = false;
function themeTransition(button, update) {
  if (themeBusy) return;
  if (reducedMotion.matches) { update(); return; }
  if (!document.startViewTransition) {
    html.classList.add('theme-soft-change'); update();
    setTimeout(() => html.classList.remove('theme-soft-change'), 650);
    return;
  }
  themeBusy = true;
  const r = button.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  html.classList.add('theme-circle-change');
  const tr = document.startViewTransition(update);
  tr.ready.then(() => {
    html.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 620, easing: 'cubic-bezier(.4,0,.2,1)', pseudoElement: '::view-transition-new(root)' });
    button.animate([{ transform: 'scale(.8) rotate(-40deg)' }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' });
  }).catch(() => {});
  tr.finished.catch(() => {}).finally(() => { themeBusy = false; html.classList.remove('theme-circle-change'); });
}
const themeBtn = $('#themeToggle');
themeBtn.addEventListener('click', () => themeTransition(themeBtn, applyTheme));
// Солнце крутится, луна покачивается при наведении.
let glyphBusy = false;
themeBtn.addEventListener('pointerenter', e => {
  if (e.pointerType === 'touch' || reducedMotion.matches || glyphBusy) return;
  const glyph = themeBtn.querySelector(html.dataset.theme === 'light' ? '.sun' : '.moon');
  if (!glyph) return;
  glyphBusy = true;
  const moon = html.dataset.theme === 'dark';
  const frames = moon
    ? [{ transform: 'rotate(0)' }, { transform: 'rotate(-28deg)', offset: .3 }, { transform: 'rotate(17deg)', offset: .58 }, { transform: 'rotate(-7deg)', offset: .8 }, { transform: 'rotate(0)' }]
    : [{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }];
  glyph.animate(frames, { duration: 1100, easing: 'cubic-bezier(.22,.61,.36,1)' }).finished.catch(() => {}).finally(() => { glyphBusy = false; });
});

// ---------- построчное появление заголовков (как на qol-ai.app) ----------
const headingObserver = new IntersectionObserver(entries => entries.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('is-visible'); headingObserver.unobserve(e.target); }
}), { threshold: .15 });
$$('.hero h1,.section-heading h2,.impact-copy h2').forEach(h => {
  const nodes = [...h.childNodes];
  let inner = document.createElement('span'), index = 0;
  const flush = () => {
    if (!inner.childNodes.length) return;
    const line = document.createElement('span');
    line.className = 'motion-line'; inner.className = 'motion-line-inner';
    inner.style.setProperty('--line-delay', `${index++ * 100}ms`);
    line.append(inner); h.append(line); inner = document.createElement('span');
  };
  // перевод заголовка должен менять текст внутри строки, а не стирать разметку
  if (h.dataset.i18n) { inner.dataset.i18n = h.dataset.i18n; h.removeAttribute('data-i18n'); }
  nodes.forEach(n => { if (n.nodeName === 'BR') { n.remove(); flush(); } else inner.append(n); });
  flush();
  h.classList.add('motion-reveal');
  headingObserver.observe(h);
});
html.classList.add('motion-enabled');

// Наклон со световым бликом у карточек.
if (matchMedia('(hover:hover) and (pointer:fine)').matches) {
  $$('.stat-card,.cam-card').forEach(card => {
    card.classList.add('motion-tilt');
    card.addEventListener('pointermove', e => {
      if (reducedMotion.matches) return;
      const r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      card.style.setProperty('--tilt-x', `${(0.5 - y) * 5}deg`); card.style.setProperty('--tilt-y', `${(x - 0.5) * 5}deg`);
      card.style.setProperty('--shine-x', `${x * 100}%`); card.style.setProperty('--shine-y', `${y * 100}%`);
    });
    card.addEventListener('pointerleave', () => { card.style.setProperty('--tilt-x', '0deg'); card.style.setProperty('--tilt-y', '0deg'); });
  });
}

// ---------- анимации страницы ----------
const reveal = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }), { threshold: 0.14 });
$$('.reveal').forEach(el => reveal.observe(el));

addEventListener('scroll', () => {
  $('.nav-wrap').classList.toggle('scrolled', scrollY > 25);
  const max = html.scrollHeight - innerHeight;
  $('#scrollProgress i').style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
}, { passive: true });

const glow = $('.cursor-glow');
addEventListener('pointermove', e => { glow.style.left = e.clientX + 'px'; glow.style.top = e.clientY + 'px'; });

if (matchMedia('(pointer:fine)').matches) {
  const visual = $('.hero-visual'), card = $('.avatar-card');
  visual.addEventListener('pointermove', e => {
    const r = visual.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    card.style.transform = `rotate(${x * 3 + 0.6}deg) rotateX(${y * -3}deg) rotateY(${x * 4}deg) translate(${x * 5}px,${y * 5}px)`;
  });
  visual.addEventListener('pointerleave', () => { card.style.transform = 'rotate(.6deg)'; });
  $$('.impact-proof-number').forEach(el => {
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(900px) rotateX(${y * -4}deg) rotateY(${x * 5}deg) translateY(-4px)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  });
  $$('.magnetic').forEach(el => {
    el.addEventListener('mousemove', e => {
      const r = el.getBoundingClientRect();
      el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.08}px,${(e.clientY - r.top - r.height / 2) * 0.08}px)`;
    });
    el.addEventListener('mouseleave', () => { el.style.transform = ''; });
  });
}

// ---------- 3D-персонаж ----------
const heroStage = $('#heroStage'), studioStage = $('#studioStage');
let studioActive = false;
mount(heroStage);
enableOrbit([heroStage, studioStage]);
followVisible([heroStage, studioStage], el => el !== studioStage || studioActive);

loadAvatar('assets/model/avatar.glb?v=__BUILD__', {
  onProgress: p => { const l = $('#loading'); if (l) l.textContent = `${t('loading')} ${Math.round(p * 100)}%`; },
  onReady: () => { $('#loading')?.remove(); window.__ready = true; },
  onError: () => { const l = $('#loading'); if (l) l.textContent = t('loadError'); },
});
const dictionaryReady = loadDictionary('data/gestures.json?v=__BUILD__').catch(err => console.warn(err));

const heroPlay = $('.mini-play'), heroTrack = $('.track i');
function setHeroButton() {
  heroPlay.textContent = isPlaying() ? 'Ⅱ' : '▶';
  heroPlay.setAttribute('aria-label', isPlaying() ? 'Pause' : 'Play');
}
const progress = { onFrame: (_, p) => { heroTrack.style.width = (p * 100) + '%'; setHeroButton(); },
                   onEnd: () => { heroTrack.style.width = '0'; setHeroButton(); } };

// Студия: слова из словаря задают форму руки поверх анимации, остальные — по буквам.
async function sign(text, stage) {
  await dictionaryReady;
  mount(stage);
  const { frames, words } = textToFrames(text);
  play(frames, progress);
  setHeroButton();
  return words;
}
// Первый экран: анимация модели целиком.
heroPlay.addEventListener('click', () => {
  if (isPlaying()) { stop(); progress.onEnd(); return; }
  mount(heroStage);
  play([], progress);
  setHeroButton();
});

// ---------- студия ----------
const DEMO_PHRASES = {
  'Қазақша': ['Сәлем! Сабақ кестесін қайдан көре аламын?', 'Менің шәкіртақым неге түспеді?', 'Рахмет!'],
  'Русский': ['Привет! Подскажите, когда начинаются экзамены?', 'Мне нужно получить справку с места учёбы.', 'Спасибо!'],
  'English': ['Hello! How can I register for university courses?', 'I want to join a student organization.', 'Thanks!'],
};

const input = $('#textInput');
input.addEventListener('input', () => { $('#charCount').textContent = input.value.length; });

const examplesPanel = $('#examplesPanel'), sampleBtn = $('#sampleBtn');
const closeExamples = () => { examplesPanel.hidden = true; sampleBtn.setAttribute('aria-expanded', 'false'); };
for (const [title, phrases] of Object.entries(DEMO_PHRASES)) {
  const group = document.createElement('section');
  const heading = document.createElement('h3');
  heading.textContent = title;
  group.append(heading);
  for (const phrase of phrases) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = phrase;
    button.addEventListener('click', () => {
      input.value = phrase;
      input.dispatchEvent(new Event('input'));
      closeExamples();
      $('#generateBtn').focus({ preventScroll: true });
    });
    group.append(button);
  }
  examplesPanel.append(group);
}
sampleBtn.addEventListener('click', () => {
  examplesPanel.hidden = !examplesPanel.hidden;
  sampleBtn.setAttribute('aria-expanded', String(!examplesPanel.hidden));
});
examplesPanel.addEventListener('keydown', e => { if (e.key === 'Escape') { closeExamples(); sampleBtn.focus(); } });

// Подпись под персонажем: слова из словаря подчёркнуты, остальные показываются по буквам.
function renderCaption(words) {
  const caption = $('#resultCaption');
  caption.replaceChildren(...words.flatMap((w, i) => {
    const span = document.createElement('span');
    span.textContent = w.text;
    if (w.found) span.className = 'in-dict';
    return i ? [' ', span] : [span];
  }));
}

function showStudio(state) {
  $('#previewEmpty').style.display = state === 'empty' ? '' : 'none';
  $('#generating').style.display = state === 'generating' ? 'block' : 'none';
  $('#result').style.display = state === 'result' ? 'block' : 'none';
}

function generate() {
  const text = input.value.trim();
  if (!text) {
    input.focus();
    input.style.borderColor = 'var(--orange)';
    setTimeout(() => { input.style.borderColor = ''; }, 900);
    return;
  }
  showStudio('generating');
  const bar = $('.progress i'), label = $('#progressText');
  let p = 0;
  bar.style.width = '0';
  label.textContent = '0%';
  const ticker = setInterval(async () => {
    p = Math.min(100, p + Math.ceil(Math.random() * 12));
    bar.style.width = p + '%';
    label.textContent = p + '%';
    if (p < 100) return;
    clearInterval(ticker);
    showStudio('result');
    studioActive = true;
    renderCaption(await sign(text, studioStage));
    $('#toast').classList.add('show');
    setTimeout(() => $('#toast').classList.remove('show'), 2600);
  }, 90);
}
$('#generateBtn').addEventListener('click', generate);
$('#replayBtn').addEventListener('click', () => sign(input.value, studioStage));

// ---------- камера ----------
camera = initCamera({
  t,
  onRecognized: (cls) => { $('#camReply').dataset.q = cls; },
});
$('#camReply').addEventListener('click', () => { setTimeout(() => input.focus({ preventScroll: true }), 600); });
