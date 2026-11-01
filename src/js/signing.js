// Перевод текста в последовательность кадров для 3D-персонажа.
// Сейчас: слова из словаря → готовые жесты, остальные → дактиль (по буквам, условно).
// Дальше: заменить кадры на анимации из словаря (клипы .glb) без изменения интерфейса.

const FALLBACK_MS = 450;
let dictionary = null;

export async function loadDictionary(url = 'data/gestures.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Не удалось загрузить словарь: ${res.status}`);
  dictionary = await res.json();
  return dictionary;
}

export const normalizeWord = w => w.toLocaleLowerCase().replace(/[^\p{L}\p{N}-]/gu, '');

function handshape(name) {
  return dictionary?.handshapes?.[name] || [0, 0, 0, 0, 0];
}

function spell(word) {
  const order = dictionary?.fingerspelling || ['open'];
  return [...word].map(ch => ({ hand: order[ch.codePointAt(0) % order.length], ms: FALLBACK_MS, letter: ch }));
}

// Возвращает { frames, words }, где words — [{ text, found }] для подсказок в интерфейсе.
export function textToFrames(text) {
  const frames = [];
  const words = [];
  for (const raw of text.split(/\s+/).filter(Boolean)) {
    const word = normalizeWord(raw);
    if (!word) continue;
    const entry = dictionary?.words?.[word];
    words.push({ text: raw, found: Boolean(entry) });
    const wordFrames = entry ? entry.map(f => ({ ...f })) : spell(word);
    wordFrames.forEach(f => frames.push({ ...f, curl: handshape(f.hand), word: raw }));
    frames.push({ hand: 'open', curl: handshape('open'), ms: 250, pause: true });
  }
  return { frames, words };
}
