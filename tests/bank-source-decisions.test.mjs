import test from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';
const catalog=JSON.parse(await readFile(new URL('../src/data/bank-catalog.json',import.meta.url)));
test('only the user-approved source replacements are enabled',()=>{assert.deepEqual(catalog.entries.filter(e=>e.motionSource==='signbridge').map(e=>e.label).sort(),['Будет','Вас','Для','Пожалуйста']);assert.equal(catalog.entries.find(e=>e.label==='Вас').performedLabel,'Ты');});
test('different provider meanings remain excluded from bank phrases',()=>{for(const word of ['Карта','Готова','Внизу','Страницы','Возьмите','Ручку','Комиссии','Эта','Услуга','Подождите','Здесь'])assert.equal(catalog.entries.find(e=>e.label===word).motionSource,'recorded',word);});
