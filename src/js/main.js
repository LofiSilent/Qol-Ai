import { connectTelegram } from './telegram.js?v=__BUILD__';
import { BANK_3D_EXAMPLES, normalizeExample, wordMotionId, missingWords } from './bank-examples.js?v=__BUILD__';
// Интерфейс страницы: язык, тема, анимации, примеры, студия.
import { translations, LANGUAGES, DEFAULT_LANGUAGE } from './i18n.js?v=__BUILD__';
import { loadAvatar, mount, followVisible, enableOrbit, playSourceMotions, stop, isPlaying } from './avatar-lazy.js?v=__BUILD__';
import { initCamera } from './camera.js?v=__BUILD__';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const html = document.documentElement;

const storage = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

// ---------- Telegram Mini App ----------
let telegram = null;
connectTelegram(app => {
  telegram = app;
  telegram.ready();
  telegram.expand();
  html.classList.add('telegram-mini-app');
  if (telegram.colorScheme) html.dataset.theme = telegram.colorScheme;
  telegram.onEvent('themeChanged', () => { html.dataset.theme = telegram.colorScheme; });
});

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
$$('[data-lang]').forEach(btn => btn.addEventListener('click', () => {
  if (btn.dataset.lang === lang) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setLang(btn.dataset.lang); return; }
  html.classList.add('lang-switching');
  setTimeout(() => { setLang(btn.dataset.lang); requestAnimationFrame(() => html.classList.remove('lang-switching')); }, 200);
}));
setLang(lang);

// ---------- тема ----------
// в приложении по умолчанию — тема телефона, на сайте — светлая
const systemTheme = html.classList.contains('native-app') && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
if (!telegram) html.dataset.theme = storage.get('qolai-theme') || systemTheme;
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
  $$('.stat-card').forEach(card => {
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

// Шапка и полоса прокрутки должны быть верны и после обновления, когда браузер восстановил позицию без события scroll.
function syncScroll() {
  $('.nav-wrap').classList.toggle('scrolled', scrollY > 25);
  const max = html.scrollHeight - innerHeight;
  $('#scrollProgress i').style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
}
addEventListener('scroll', syncScroll, { passive: true });
addEventListener('resize', syncScroll);
addEventListener('pageshow', syncScroll);
addEventListener('load', () => { syncScroll(); setTimeout(syncScroll, 400); });
syncScroll();

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

const avatarReady = new Promise((resolve, reject) => loadAvatar('assets/model/avatar.glb?v=__BUILD__', {
  onProgress: p => { const l = $('#loading'); if (l) l.textContent = p === null ? t('loading') : `${t('loading')} ${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`; },
  onPreparing: () => { const l = $('#loading'); if (l) l.textContent = t('preparing3D'); },
  onReady: () => { $('#loading')?.remove(); window.__ready = true; resolve(); },
  onError: err => { const l = $('#loading'); if (l) l.textContent = t('loadError'); reject(err); },
}));
// The visible loading error is handled above; avoid an unhandled promise on slow/failed devices.
avatarReady.catch(() => {});

const heroPlay = $('.mini-play'), heroTrack = $('.track i');
function setHeroButton() {
  heroPlay.textContent = isPlaying() ? 'Ⅱ' : '▶';
  heroPlay.setAttribute('aria-label', isPlaying() ? 'Пауза' : 'Воспроизвести пример');
}
const progress = { onFrame: (_, p) => { heroTrack.style.width = (p * 100) + '%'; setHeroButton(); },
                   onEnd: () => { heroTrack.style.width = '0'; setHeroButton(); } };

const SOURCE_EXAMPLES = BANK_3D_EXAMPLES.map(e => ({...e, ids:e.words.map(wordMotionId), texts:[e.text]}));
const bankCatalog = fetch('data/bank-catalog.json?v=__BUILD__').then(r => { if(!r.ok) throw Error('catalog_unavailable'); return r.json(); });
async function sign(text, stage) {
  const example = SOURCE_EXAMPLES.find(e => e.texts.some(value => normalizeExample(value) === normalizeExample(text)));
  if (!example) throw new Error('example_only');
  const catalog = await bankCatalog;
  const missing = missingWords(example, catalog);
  if (missing.length) throw new Error('missing_recordings:' + missing.join(', '));
  if (stage === studioStage) { pauseWelcome(); renderMotionSources(example,catalog); }
  await avatarReady; mount(stage); await playSourceMotions(example.ids, progress); setHeroButton();
  return [{text, found:true}];
}
let heroVisible = false, heroEnabled = true, heroRunning = false, heroVersion = 0;
if (reducedMotion.matches) heroEnabled = false;
async function startWelcome() {
  if (!heroVisible || !heroEnabled || document.hidden || heroRunning || $('#trailerDialog')?.open) return;
  const version = ++heroVersion; heroRunning = true;
  const current = () => version === heroVersion && heroVisible && heroEnabled && !document.hidden;
  try {
    await avatarReady; if (!current()) return;
    const started = await playSourceMotions(['welcome'], {
      shouldStart: current,
      onFrame: (_, p) => { heroTrack.style.width = (p * 100) + '%'; setHeroButton(); },
      onEnd: () => { heroRunning = false; heroTrack.style.width = '0'; setHeroButton(); if (current()) startWelcome(); },
    });
    if (started && current()) { mount(heroStage); setHeroButton(); }
  } catch { if (current()) { heroEnabled = false; progress.onEnd(); } }
  finally { if (version === heroVersion && !isPlaying()) heroRunning = false; }
}
function pauseWelcome() { heroVersion++; if (heroRunning) stop(); heroRunning = false; progress.onEnd(); }
document.addEventListener('qol:trailer-open', pauseWelcome);
document.addEventListener('qol:trailer-close', startWelcome);
heroPlay.addEventListener('click', () => { heroEnabled = !heroEnabled; if (heroEnabled) startWelcome(); else pauseWelcome(); });
new IntersectionObserver(entries => { heroVisible = entries[0].isIntersecting; if (heroVisible) startWelcome(); else pauseWelcome(); }, { threshold: .2 }).observe(heroStage);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseWelcome(); else startWelcome(); });

// ---------- студия ----------
const DEMO_PHRASES = { 'Русский': SOURCE_EXAMPLES.map(e => e.text) };

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
function renderMotionSources(example,catalog) {
  const line=$('#motionAttribution');if(!line)return;
  const words=new Set(example.words.map(normalizeExample));
  const imported=catalog.entries.filter(e=>e.motionSource==='signbridge'&&words.has(normalizeExample(e.label)));
  line.replaceChildren();line.hidden=!imported.length;if(!imported.length)return;
  const link=document.createElement('a');link.href='https://signbridge.kz/';link.target='_blank';link.rel='noopener noreferrer';link.textContent='SignBridge';
  line.append(link,' · '+imported.map(e=>e.label+(e.performedLabel&&e.performedLabel!==e.label?' → '+e.performedLabel:'')).join(', '));
}
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

async function generate() {
  const text = input.value.trim(); if (!text) { input.focus(); return; }
  if (!SOURCE_EXAMPLES.some(e => e.texts.some(value => normalizeExample(value) === normalizeExample(text)))) {
    sampleBtn.setAttribute('aria-expanded', 'true'); examplesPanel.hidden = false;
    $('#prototypeStatus').textContent = t('choosePrepared'); return;
  }
  const example = SOURCE_EXAMPLES.find(e => normalizeExample(e.text) === normalizeExample(text));
  try {
    const missing = missingWords(example, await bankCatalog);
    if (missing.length) { $('#prototypeStatus').textContent = 'Ещё не готовы жесты: ' + missing.join(', ') + '.'; return; }
  } catch { $('#prototypeStatus').textContent = t('motionError'); return; }
  $('#prototypeStatus').textContent = ''; showStudio('generating');
  try { await avatarReady; studioActive = true; showStudio('result'); renderCaption(await sign(text, studioStage)); }
  catch { showStudio('empty'); $('#prototypeStatus').textContent = t('motionError'); }
}
$('#generateBtn').addEventListener('click', generate);
$('#replayBtn').addEventListener('click', () => sign(input.value, studioStage).catch(()=>{ $('#prototypeStatus').textContent=t('motionError'); }));

// ---------- камера ----------
camera = initCamera({ t });

// ---------- вкладки: создать видео / распознать жесты ----------
const tabs = $$('.mode-tab'), panels = { video: $('#panelVideo'), camera: $('#panelCamera') };
const modeTabs = $('.mode-tabs'), modeWrap = $('#modePanels');
let tabBusy = false;
async function openTab(name, { scroll = false } = {}) {
  if (tabBusy) return;
  const current = Object.keys(panels).find(k => !panels[k].hidden);
  tabs.forEach(b => { const on = b.dataset.tab === name; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
  modeTabs.dataset.active = name;
  storage.set('qolai-tab', name);
  if (name !== 'camera') $('#camStop').click();
  if (scroll) $('#studio').scrollIntoView({ behavior: 'smooth' });
  if (current === name) return;
  const from = panels[current], to = panels[name];
  if (!from || !to || from === to) return;
  if (reducedMotion.matches || !from.animate) { from.hidden = true; to.hidden = false; return; }
  tabBusy = true;
  const h0 = modeWrap.offsetHeight;
  modeWrap.classList.add('is-switching');
  // 1) старая панель уходит вниз и гаснет
  await from.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(10px) scale(.995)' }], { duration: 170, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }).finished.catch(() => {});
  from.hidden = true; to.hidden = false;
  const h1 = modeWrap.offsetHeight;
  // 2) высота окна плавно подгоняется, новая панель выезжает снизу
  modeWrap.animate([{ height: h0 + 'px' }, { height: h1 + 'px' }], { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)' });
  await to.animate([{ opacity: 0, transform: 'translateY(16px) scale(.995)' }, { opacity: 1, transform: 'none' }], { duration: 400, easing: 'cubic-bezier(.22,1,.36,1)' }).finished.catch(() => {});
  from.getAnimations().forEach(a => a.cancel());
  modeWrap.classList.remove('is-switching');
  tabBusy = false;
}
tabs.forEach(b => b.addEventListener('click', () => openTab(b.dataset.tab)));
$$('[data-open-tab]').forEach(a => a.addEventListener('click', () => openTab(a.dataset.openTab)));
$$('a[href="#studio"]:not([data-open-tab])').forEach(a => a.addEventListener('click', () => openTab('video')));

// страница показывается только после применения языка и темы — без вспышки старых значений
requestAnimationFrame(() => requestAnimationFrame(() => html.classList.remove('i18n-pending')));
