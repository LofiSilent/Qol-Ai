import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ---------- 3D-персонаж ----------
// Один WebGL-рендерер; холст переносится между первым экраном и студией.
const scene3d = new THREE.Scene();
const camera3d = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
const renderer3d = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer3d.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer3d.outputColorSpace = THREE.SRGBColorSpace;
scene3d.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.2));
const keyLight = new THREE.DirectionalLight(0xffffff, 2);
keyLight.position.set(1.5, 2.5, 3);
scene3d.add(keyLight);

const bones = {};
let avatar = null, slot = null;
const camTarget = new THREE.Vector3(0, 1.45, 0);
let camDist = 1.75, yaw = 0, pitch = 0.05;

function mount(el) {
  if (!el || slot === el) return;
  slot = el;
  el.appendChild(renderer3d.domElement);
  resize3d();
}
function resize3d() {
  if (!slot) return;
  const w = slot.clientWidth, h = slot.clientHeight;
  if (!w || !h) return;
  renderer3d.setSize(w, h, false);
  camera3d.aspect = w / h;
  camera3d.updateProjectionMatrix();
}
new ResizeObserver(resize3d).observe(document.documentElement);

new GLTFLoader().load('assets/model/avatar.glb', gltf => {
  avatar = gltf.scene;
  scene3d.add(avatar);
  avatar.traverse(o => { if (o.isBone) { bones[o.name] = o; o.userData.rest = o.quaternion.clone(); } });
  const box = new THREE.Box3().setFromObject(avatar);
  const h = box.max.y - box.min.y;
  camTarget.set(0, box.min.y + h * 0.74, 0);
  camDist = h * 0.85;
  document.getElementById('loading')?.remove();
  window.__ready = true;
}, xhr => {
  const l = document.getElementById('loading');
  if (l && xhr.total) l.textContent = `Загрузка 3D… ${Math.round(xhr.loaded / xhr.total * 100)}%`;
}, () => {
  const l = document.getElementById('loading');
  if (l) l.textContent = 'Не удалось загрузить 3D-модель';
});

const q = new THREE.Quaternion(), eul = new THREE.Euler();
function rot(name, x = 0, y = 0, z = 0) {
  const b = bones[name];
  if (b) b.quaternion.copy(b.userData.rest).multiply(q.setFromEuler(eul.set(x, y, z)));
}

// сгиб пальцев правой руки: большой, указательный, средний, безымянный, мизинец (0 — прямой, 1 — сжат)
const FINGERS = ['Thumb', 'Index', 'Mid', 'Ring', 'Pinky'];
const OPEN = [0, 0, 0, 0, 0];
const POSES = [OPEN, [1,1,1,1,1], [1,0,1,1,1], [1,0,0,1,1], [1,0,0,0,1], [1,0,0,0,0], [0,1,1,1,1], [0,1,1,1,0], [1,1,1,1,0], [0,0,1,1,1]];
// позы пока условные: каждой букве — своя форма руки (прототип, не словарь жестов)
const poseFor = ch => /[\p{L}\p{N}]/u.test(ch) ? POSES[ch.toLowerCase().codePointAt(0) % POSES.length] : OPEN;
let curl = OPEN.slice(), curlTarget = OPEN.slice(), wave = 0;

let signing = false, signTimer = null;
function stopSigning() {
  clearInterval(signTimer);
  signing = false; wave = 0; curlTarget = OPEN.slice();
  updateHeroButton();
}
function playSigning(text) {
  stopSigning();
  const chars = [...(text || '').trim()];
  if (!chars.length) return;
  signing = true; wave = 0.12;
  updateHeroButton();
  let i = 0;
  const track = document.querySelector('.track i');
  signTimer = setInterval(() => {
    if (i >= chars.length) { stopSigning(); if (track) track.style.width = '0'; return; }
    curlTarget = poseFor(chars[i]).slice();
    i++;
    if (track) track.style.width = (i / chars.length * 100) + '%';
  }, 450);
}
function updateHeroButton() {
  const b = document.querySelector('.mini-play');
  if (!b) return;
  b.textContent = signing ? 'Ⅱ' : '▶';
  b.setAttribute('aria-label', signing ? 'Pause' : 'Play');
}

// вращение персонажа мышью или пальцем (по горизонтали — чтобы страницу можно было листать)
let dragging = false, lastX = 0, lastY = 0;
for (const id of ['heroStage', 'studioStage']) {
  const el = document.getElementById(id);
  if (!el) continue;
  el.addEventListener('pointerdown', e => { if (slot !== el) return; dragging = true; lastX = e.clientX; lastY = e.clientY; });
  el.addEventListener('pointermove', e => {
    if (!dragging) return;
    yaw -= (e.clientX - lastX) * 0.008;
    pitch = Math.max(-0.4, Math.min(0.6, pitch + (e.clientY - lastY) * 0.004));
    lastX = e.clientX; lastY = e.clientY;
  });
}
addEventListener('pointerup', () => { dragging = false; });
addEventListener('pointercancel', () => { dragging = false; });

// персонаж показывается там, где пользователь сейчас смотрит: на первом экране или в студии
let studioActive = false;
const visibility = new Map();
const slotObserver = new IntersectionObserver(entries => {
  entries.forEach(e => visibility.set(e.target.id, e.intersectionRatio));
  const hero = visibility.get('heroStage') || 0, studio = studioActive ? (visibility.get('studioStage') || 0) : 0;
  mount(document.getElementById(studio > hero ? 'studioStage' : 'heroStage'));
}, { threshold: [0, 0.25, 0.5, 0.75, 1] });

(function loop3d() {
  requestAnimationFrame(loop3d);
  if (!slot) return;
  if (avatar) {
    curl = curl.map((v, i) => v + (curlTarget[i] - v) * 0.15);
    const t = performance.now();
    rot('CC_Base_R_Upperarm', 0.5, 0, 1.0);
    rot('CC_Base_L_Upperarm', 0.5, 0, -1.0);
    rot('CC_Base_R_Forearm', 2.0 + Math.sin(t / 400) * wave, 0, 0);
    rot('CC_Base_L_Forearm', 2.0, 0, 0);
    FINGERS.forEach((f, i) => {
      for (let j = 1; j <= 3; j++) {
        rot(`CC_Base_R_${f}${j}`, 0, 0, curl[i] * (f === 'Thumb' ? 0.5 : 1.1));
        rot(`CC_Base_L_${f}${j}`, 0, 0, f === 'Thumb' ? 0 : -0.15);
      }
    });
  }
  camera3d.position.set(
    camTarget.x + Math.sin(yaw) * Math.cos(pitch) * camDist,
    camTarget.y + Math.sin(pitch) * camDist,
    camTarget.z + Math.cos(yaw) * Math.cos(pitch) * camDist);
  camera3d.lookAt(camTarget);
  renderer3d.render(scene3d, camera3d);
})();
// ---------- конец 3D ----------

const DEMO_PHRASE = 'Сабақ кестесін қайдан көре аламын?';
const PHRASES = [
  { phrase: DEMO_PHRASE },
  { phrase: 'Менің шәкіртақым неге түспеді?' },
  { phrase: 'Жеке куәлігімді жоғалтып алдым, не істеуім керек?' },
  { phrase: 'Подскажите, когда начинаются экзамены?' },
  { phrase: 'Мне нужно получить справку с места учёбы.' },
  { phrase: 'Я хочу узнать статус своего заявления.' },
  { phrase: 'How can I register for university courses?' },
  { phrase: 'I want to join a student organization.' }
];


const telegram = window.Telegram?.WebApp?.initData ? window.Telegram.WebApp : null;
if (telegram) {
  telegram.ready();
  telegram.expand();
  document.documentElement.classList.add('telegram-mini-app');
  if (telegram.colorScheme) document.documentElement.dataset.theme = telegram.colorScheme;
}

const translations = {
  ru:{navStudio:'Студия',navHow:'Как это работает',navImpact:'Возможности',eyebrow:'ИИ, который говорит руками',heroLine1:'Текст становится',heroLine2:'понятным.',heroText:'Превращайте любые слова в естественное видео на языке жестов — за несколько секунд.',tryNow:'Попробовать сейчас',watchDemo:'Как это работает',trustTitle:'2 000+ людей',trustText:'уже общаются без барьеров',natural:'Естественные жесты',caption:'«Добро пожаловать в мир без барьеров»',studioTitle:'Создайте своё видео',studioText:'Введите текст — остальное сделает искусственный интеллект.',yourText:'Ваш текст',example:'Вставить пример',placeholder:'Напишите фразу, которую нужно перевести на язык жестов…',generate:'Создать видео',previewTitle:'Ваше видео появится здесь',previewText:'Введите текст и нажмите «Создать видео»',processing:'ИИ переводит текст в жесты…',replay:'Повторить',download:'Скачать MP4',howTitle:'От мысли до жеста',step1Title:'Введите текст',step1Text:'Любая фраза, объявление или целая история.',step2Title:'ИИ поймёт смысл',step2Text:'Не дословный перевод, а естественная речь.',step3Title:'Получите видео',step3Text:'Готово к публикации, уроку или сообщению.',impactLine1:'Один текст.',impactLine2:'Тысячи понятых.',impactText:'Делайте образование и повседневное общение доступнее для каждого.',startFree:'Начать',stat1:'быстрее обычной записи',stat2:'доступно без переводчика',stat3:'языка интерфейса',footerText:'Технология, которая делает мир понятнее.',footerReady:'Готовы говорить без барьеров?',createVideo:'Создать видео ↗',madeWith:'Сделано с заботой о доступности',toastText:'Видео готово!',sample:DEMO_PHRASE},
  kk:{navStudio:'Студия',navHow:'Қалай жұмыс істейді',navImpact:'Мүмкіндіктер',eyebrow:'Қолмен сөйлейтін ЖИ',heroLine1:'Мәтін түсінікті',heroLine2:'болады.',heroText:'Кез келген сөзді бірнеше секундта ым тіліндегі табиғи бейнеге айналдырыңыз.',tryNow:'Қазір байқап көру',watchDemo:'Қалай жұмыс істейді',trustTitle:'2 000+ адам',trustText:'кедергісіз тілдесіп жүр',natural:'Табиғи қимылдар',caption:'«Кедергісіз әлемге қош келдіңіз»',studioTitle:'Бейнеңізді жасаңыз',studioText:'Мәтінді енгізіңіз — қалғанын жасанды интеллект орындайды.',yourText:'Сіздің мәтініңіз',example:'Мысал қою',placeholder:'Ым тіліне аударылатын сөйлемді жазыңыз…',signLanguage:'Ым тілі',format:'Пішім',generate:'Бейне жасау',previewTitle:'Бейнеңіз осында пайда болады',previewText:'Мәтін енгізіп, «Бейне жасау» түймесін басыңыз',processing:'ЖИ мәтінді ым тіліне аударуда…',replay:'Қайталау',download:'MP4 жүктеу',howTitle:'Ойдан қимылға дейін',step1Title:'Мәтін енгізіңіз',step1Text:'Кез келген сөйлем, хабарландыру немесе тұтас оқиға.',step2Title:'ЖИ мағынаны түсінеді',step2Text:'Сөзбе-сөз емес, табиғи аударма.',step3Title:'Бейнені алыңыз',step3Text:'Жариялауға, сабаққа немесе хабарламаға дайын.',impactLine1:'Бір мәтін.',impactLine2:'Мыңдаған түсіністік.',impactText:'Білім, бизнес және күнделікті қарым-қатынасты баршаға қолжетімді етіңіз.',startFree:'Тегін бастау',stat1:'әдеттегі түсірілімнен жылдам',stat2:'аудармашысыз қолжетімді',stat3:'интерфейс тілі',footerText:'Әлемді түсініктірек ететін технология.',footerReady:'Кедергісіз сөйлесуге дайынсыз ба?',createVideo:'Бейне жасау ↗',madeWith:'Қолжетімділікке қамқорлықпен жасалған',toastText:'Бейне дайын!',sample:DEMO_PHRASE},
  en:{navStudio:'Studio',navHow:'How it works',navImpact:'Features',eyebrow:'AI that speaks with hands',heroLine1:'Text becomes',heroLine2:'understood.',heroText:'Turn any words into natural sign language video in just a few seconds.',tryNow:'Try it now',watchDemo:'See how it works',trustTitle:'2,000+ people',trustText:'already communicate without barriers',natural:'Natural gestures',caption:'“Welcome to a world without barriers”',studioTitle:'Create your video',studioText:'Enter your text — artificial intelligence will do the rest.',yourText:'Your text',example:'Insert example',placeholder:'Write a phrase to translate into sign language…',signLanguage:'Sign language',format:'Format',generate:'Create video',previewTitle:'Your video will appear here',previewText:'Enter text and click “Create video”',processing:'AI is translating text into signs…',replay:'Replay',download:'Download MP4',howTitle:'From thought to gesture',step1Title:'Enter text',step1Text:'Any phrase, announcement or a whole story.',step2Title:'AI understands meaning',step2Text:'A natural translation, not word-for-word.',step3Title:'Get your video',step3Text:'Ready for publishing, lessons or messages.',impactLine1:'One text.',impactLine2:'Thousands understood.',impactText:'Make education, business and everyday communication more accessible to everyone.',startFree:'Start for free',stat1:'faster than conventional recording',stat2:'available without an interpreter',stat3:'interface languages',footerText:'Technology that makes the world easier to understand.',footerReady:'Ready to speak without barriers?',createVideo:'Create video ↗',madeWith:'Made with accessibility in mind',toastText:'Video is ready!',sample:DEMO_PHRASE}
};

Object.assign(translations.kk,{impactText:'Білім мен күнделікті қарым-қатынасты баршаға қолжетімді етіңіз.',startFree:'Бастау'});
Object.assign(translations.en,{impactText:'Make education and everyday communication more accessible to everyone.',startFree:'Start'});
Object.assign(translations.ru,{showcaseText:'Посмотрите трейлер Qol AI и пример того, как проект помогает сделать общение доступнее.',showcaseStatus:'Трейлер готов к просмотру'});
Object.assign(translations.kk,{showcaseText:'Qol AI трейлерін және жобаның қарым-қатынасты қолжетімді етуге қалай көмектесетінін көріңіз.',showcaseStatus:'Трейлер көруге дайын'});
Object.assign(translations.en,{showcaseText:'Watch the Qol AI trailer and see how the project helps make communication more accessible.',showcaseStatus:'Trailer ready to watch'});

Object.assign(translations.ru,{navShowcase:'Видео',showcaseTitle:'Увидеть Qol AI в действии',showcaseText:'Здесь появятся трейлер проекта и настоящий пример перевода текста в язык жестов.',showcaseStatus:'Готовим первый AI-ролик',trailerLabel:'СКОРО',trailerTitle:'Первый трейлер Qol AI'});
Object.assign(translations.kk,{navShowcase:'Бейне',showcaseTitle:'Qol AI жұмысын көріңіз',showcaseText:'Мұнда жоба трейлері және мәтінді ым тіліне аударудың нақты үлгісі пайда болады.',showcaseStatus:'Алғашқы AI-бейнені дайындап жатырмыз',trailerLabel:'ЖАҚЫНДА',trailerTitle:'Qol AI алғашқы трейлері'});
Object.assign(translations.en,{navShowcase:'Video',showcaseTitle:'See Qol AI in action',showcaseText:'The project trailer and a real example of text-to-sign translation will appear here.',showcaseStatus:'Preparing the first AI video',trailerLabel:'COMING SOON',trailerTitle:'The first Qol AI trailer'});
Object.assign(translations.ru,{showcaseText:'Посмотрите трейлер Qol AI и пример того, как проект помогает сделать общение доступнее.',showcaseStatus:'Трейлер готов к просмотру'});
Object.assign(translations.kk,{showcaseText:'Qol AI трейлерін және жобаның қарым-қатынасты қолжетімді етуге қалай көмектесетінін көріңіз.',showcaseStatus:'Трейлер көруге дайын'});
Object.assign(translations.en,{showcaseText:'Watch the Qol AI trailer and see how the project helps make communication more accessible.',showcaseStatus:'Trailer ready to watch'});

Object.assign(translations.ru,{eyebrow:'3D-персонаж, который говорит руками',heroText:'Введите текст — 3D-персонаж покажет его на языке жестов.',studioTitle:'Попробуйте сами',studioText:'Введите текст — 3D-персонаж покажет его жестами.',generate:'Показать жестами',previewTitle:'Здесь появится 3D-персонаж',previewText:'Введите текст и нажмите «Показать жестами»',processing:'Подбираем жесты…',step2Title:'Подбираем жесты',step2Text:'Каждое слово превращается в движение рук.',step3Title:'Смотрите в 3D',step3Text:'Персонажа можно вращать и смотреть с любой стороны.',createVideo:'Попробовать ↗',toastText:'Жесты готовы!',stat1:'быстрее записи с переводчиком'});
Object.assign(translations.kk,{eyebrow:'Қолмен сөйлейтін 3D-кейіпкер',heroText:'Мәтінді енгізіңіз — 3D-кейіпкер оны ым тілінде көрсетеді.',studioTitle:'Өзіңіз байқап көріңіз',studioText:'Мәтінді енгізіңіз — 3D-кейіпкер оны қимылмен көрсетеді.',generate:'Ыммен көрсету',previewTitle:'3D-кейіпкер осында пайда болады',previewText:'Мәтін енгізіп, «Ыммен көрсету» түймесін басыңыз',processing:'Қимылдарды таңдап жатырмыз…',step2Title:'Қимылдарды таңдаймыз',step2Text:'Әр сөз қол қимылына айналады.',step3Title:'3D-де көріңіз',step3Text:'Кейіпкерді айналдырып, кез келген жағынан көруге болады.',createVideo:'Байқап көру ↗',toastText:'Қимылдар дайын!',stat1:'аудармашымен түсіруден жылдам'});
Object.assign(translations.en,{eyebrow:'A 3D character that speaks with hands',heroText:'Enter text — a 3D character will show it in sign language.',studioTitle:'Try it yourself',studioText:'Enter text — the 3D character will show it with gestures.',generate:'Show in signs',previewTitle:'The 3D character will appear here',previewText:'Enter text and click “Show in signs”',processing:'Picking gestures…',step2Title:'We pick gestures',step2Text:'Every word becomes a hand movement.',step3Title:'Watch in 3D',step3Text:'Rotate the character and view it from any side.',createVideo:'Try it ↗',toastText:'Gestures ready!',stat1:'faster than recording with an interpreter'});
Object.assign(translations.ru, { example: 'Примеры' });
Object.assign(translations.kk, { example: 'Мысалдар' });
Object.assign(translations.en, { example: 'Examples' });
const requestedLang = new URLSearchParams(location.search).get('lang');
const savedLang = localStorage.getItem('qolai-lang');
let lang = ['kk','ru','en'].includes(requestedLang) ? requestedLang : (['kk','ru','en'].includes(savedLang) ? savedLang : 'kk');
const html = document.documentElement;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function setLang(next){lang=next;localStorage.setItem('qolai-lang',lang);html.lang=lang;$$('[data-i18n]').forEach(el=>{const value=translations[lang][el.dataset.i18n];if(value)el.textContent=value});$$('[data-i18n-placeholder]').forEach(el=>el.placeholder=translations[lang][el.dataset.i18nPlaceholder]);$$('[data-lang]').forEach(b=>b.classList.toggle('active',b.dataset.lang===lang));document.title=lang==='kk'?'Qol AI — мәтін түсінікті болады':lang==='en'?'Qol AI — text becomes understood':'Qol AI — текст становится понятным'}
$$('[data-lang]').forEach(btn=>btn.addEventListener('click',()=>setLang(btn.dataset.lang)));setLang(lang);

const savedTheme=localStorage.getItem('qolai-theme')||'light';if(!telegram)html.dataset.theme=savedTheme;
if(telegram)telegram.onEvent('themeChanged',()=>{html.dataset.theme=telegram.colorScheme});
const heroPlay=$('.mini-play');
heroPlay.addEventListener('click',()=>{if(signing){stopSigning()}else{mount($('#heroStage'));playSigning($('.caption').textContent.replace(/[«»“”]/g,''))}});
$('#themeToggle').addEventListener('click',()=>{html.dataset.theme=html.dataset.theme==='dark'?'light':'dark';localStorage.setItem('qolai-theme',html.dataset.theme)});

const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add('visible')}),{threshold:.14});$$('.reveal').forEach(el=>observer.observe(el));
addEventListener('scroll',()=>{
  $('.nav-wrap').classList.toggle('scrolled',scrollY>25);
  const progress=$('#scrollProgress i');
  if(progress){const max=document.documentElement.scrollHeight-innerHeight;progress.style.transform=`scaleX(${max>0?scrollY/max:0})`}
},{passive:true});
addEventListener('pointermove',e=>{const glow=$('.cursor-glow');glow.style.left=e.clientX+'px';glow.style.top=e.clientY+'px'});

// A small amount of pointer depth gives the interface a cinematic, WebGL-like response
// while keeping all content editable and accessible on touch devices.
if(matchMedia('(pointer:fine)').matches){
  const visual=$('.hero-visual'); const card=$('.avatar-card');
  visual?.addEventListener('pointermove',e=>{const r=visual.getBoundingClientRect();const x=(e.clientX-r.left)/r.width-.5;const y=(e.clientY-r.top)/r.height-.5;card.style.transform=`rotate(${x*3+0.6}deg) rotateX(${y*-3}deg) rotateY(${x*4}deg) translate(${x*5}px,${y*5}px)`});
  visual?.addEventListener('pointerleave',()=>{card.style.transform='rotate(.6deg)'});
  $$('.impact-proof-number').forEach(el=>el.addEventListener('pointermove',e=>{const r=el.getBoundingClientRect();const x=(e.clientX-r.left)/r.width-.5;const y=(e.clientY-r.top)/r.height-.5;el.style.transform=`perspective(900px) rotateX(${y*-4}deg) rotateY(${x*5}deg) translateY(-4px)`}));
  $$('.impact-proof-number').forEach(el=>el.addEventListener('pointerleave',()=>{el.style.transform=''}));
}

const input=$('#textInput');
input.addEventListener('input',()=>$('#charCount').textContent=input.value.length);
const examplesPanel = $('#examplesPanel');
const sampleBtn = $('#sampleBtn');
function closeExamples() {
  examplesPanel.hidden = true;
  sampleBtn.setAttribute('aria-expanded', 'false');
}
for (const [title, items] of [['Қазақша', PHRASES.slice(0, 3)], ['Русский', PHRASES.slice(3, 6)], ['English', PHRASES.slice(6)]]) {
  const group = document.createElement('section');
  const heading = document.createElement('h3');
  heading.textContent = title;
  group.append(heading);
  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = item.phrase;
    button.addEventListener('click', () => {
      input.value = item.phrase;
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
examplesPanel.addEventListener('keydown', event => {
  if (event.key === 'Escape') { closeExamples(); sampleBtn.focus(); }
});
function generate(){
  if(!input.value.trim()){input.focus();input.style.borderColor='var(--orange)';setTimeout(()=>input.style.borderColor='',900);return}
  $('#previewEmpty').style.display='none';$('#result').style.display='none';$('#generating').style.display='block';
  let p=0;const bar=$('.progress i');bar.style.width='0';$('#progressText').textContent='0%';
  const ticker=setInterval(()=>{p=Math.min(100,p+Math.ceil(Math.random()*12));bar.style.width=p+'%';$('#progressText').textContent=p+'%';
    if(p===100){clearInterval(ticker);setTimeout(()=>{$('#generating').style.display='none';$('#result').style.display='block';$('#resultCaption').textContent=input.value;studioActive=true;mount($('#studioStage'));playSigning(input.value);$('#toast').classList.add('show');setTimeout(()=>$('#toast').classList.remove('show'),2600)},250)}},90)}
$('#generateBtn').addEventListener('click',generate);$('#replayBtn').addEventListener('click',()=>{mount($('#studioStage'));playSigning(input.value)});

$$('.magnetic').forEach(el=>{el.addEventListener('mousemove',e=>{const r=el.getBoundingClientRect();el.style.transform=`translate(${(e.clientX-r.left-r.width/2)*.08}px,${(e.clientY-r.top-r.height/2)*.08}px)`});el.addEventListener('mouseleave',()=>el.style.transform='')});

mount($('#heroStage'));
slotObserver.observe($('#heroStage'));
slotObserver.observe($('#studioStage'));
