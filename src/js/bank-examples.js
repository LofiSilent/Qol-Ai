// Recorded bank demo: Russian content is independent of the interface language.
export const BANK_3D_EXAMPLES = [
  { id: 'card-ready', text: 'Ваша карта будет готова через три минуты. Пожалуйста, подождите здесь.', words: ['Ваша','карта','будет','готова','через','три','минуты','Пожалуйста','подождите','Здесь'] },
  { id: 'sign-document', text: 'Подпишите документ внизу страницы. Возьмите ручку.', words: ['Подпишите','Документ','Внизу','Страницы','Возьмите','Ручку'] },
  { id: 'no-fee', text: 'Комиссии нет. Эта услуга для вас бесплатная.', words: ['Комиссии','Нет','Эта','Услуга','Для','Вас','Бесплатная'] },
];
export const BANK_CAMERA_EXAMPLES = ['Карта готова?', 'Где подписать?', 'Есть комиссия?'];
export const normalizeExample = value => String(value).normalize('NFC').toLocaleLowerCase('ru').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const wordMotionId = word => 'bank-' + normalizeExample(word);
export function missingWords(example, catalog) {
  return example.words.filter(word => !catalog.entries.some(entry => normalizeExample(entry.label) === normalizeExample(word) && entry.playable));
}
