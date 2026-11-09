import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {BANK_3D_EXAMPLES,BANK_CAMERA_EXAMPLES,missingWords,cameraPhraseIndex} from '../src/js/bank-examples.js';
import {descriptor,matchWord} from '../src/js/bank-recognition.js';
const catalog=JSON.parse(await readFile(new URL('../src/data/bank-catalog.json',import.meta.url)));
test('incomplete phrases cannot silently play only the available words',()=>{assert.equal(BANK_3D_EXAMPLES.length,3);assert.deepEqual(missingWords(BANK_3D_EXAMPLES[1],catalog),[]);assert.deepEqual(missingWords(BANK_3D_EXAMPLES[2],catalog),[]);const missingCatalog={entries:catalog.entries.filter(e=>e.label!=='Документ')};assert.deepEqual(missingWords(BANK_3D_EXAMPLES[1],missingCatalog),['Документ']);assert.deepEqual(missingWords(BANK_3D_EXAMPLES[0],catalog),[]);});
test('Russian examples are separate from the three interface languages',async()=>{const {LANGUAGES,translations}=await import('../src/js/i18n.js');assert.deepEqual(LANGUAGES,['kk','ru','en']);for(const lang of LANGUAGES)for(let i=0;i<3;i++)assert.equal(translations[lang]['camQ'+(i+1)],BANK_CAMERA_EXAMPLES[i]);});
test('untracked hands and short captures cannot produce a recognized word',()=>{assert.equal(descriptor({landmarks:[],handedness:[]}),null);const model={prototypes:[{label:'test',frames:[]}],threshold:.16,margin:.035};assert.equal(matchWord([],model),null);assert.equal(matchWord(Array(9).fill([null,null]),model),null);});
test('two indistinguishable labels are rejected rather than arbitrarily chosen',()=>{const frame=[Array(65).fill(0),null],frames=Array.from({length:20},()=>frame);const model={prototypes:[{label:'a',frames},{label:'b',frames}],threshold:.16,margin:.035};assert.equal(matchWord(frames,model),null);});

test('camera matches complete recorded questions, preserving the three Russian outputs',()=>{assert.equal(cameraPhraseIndex('Карта готова?'),0);assert.equal(cameraPhraseIndex('Где подписать?'),1);assert.equal(cameraPhraseIndex('Есть комиссия?'),2);assert.equal(cameraPhraseIndex('Карта'),-1);assert.equal(cameraPhraseIndex('Комиссии'),-1);});
test('mirrored camera input is recognized while mirrored negative gestures remain rejected',async()=>{
 const {mirrorFrames}=await import('../src/js/bank-recognition.js');
 const hand=Array.from({length:65},(_,i)=>i===63?.25:i===64?.4:(i%3===0?.12:.03)),other=hand.map((v,i)=>i<63?v+.9:v),positive=Array.from({length:20},()=>[hand,null]),negative=Array.from({length:20},()=>[other,null]);
 const model={labels:['question'],threshold:.18,margin:.035,prototypes:[{label:'question',frames:positive}],negativePrototypes:[{label:'other',frames:negative}]};
 assert.equal(matchWord(mirrorFrames(positive),model)?.label,'question');assert.equal(matchWord(mirrorFrames(negative),model),null);
});
