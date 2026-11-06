import {RecordedSignCamera} from './bank-recognition.js?v=__BUILD__';
import {BANK_CAMERA_EXAMPLES} from './bank-examples.js?v=__BUILD__';
const QUESTIONS=[['карта','готова'],['где','подписать'],['есть','комиссия']];
const normalize=s=>s.toLocaleLowerCase('ru').replace(/[^\p{L}]+/gu,'');
export function initCamera({t,onRecognized}){
 const $=id=>document.getElementById(id),stage=$('camStage'),sentence=$('camSentence'),status=$('camStatus'),start=$('camStart'),stop=$('camStop'),chips=[...document.querySelectorAll('.cam-chip')];let words=[],statusKey='camIdle';
 const display=(i,source)=>{sentence.textContent=BANK_CAMERA_EXAMPLES[i];sentence.dataset.cls=i+1;sentence.dataset.source=source;chips.forEach(c=>c.classList.toggle('active',Number(c.dataset.cls)===i+1));onRecognized?.(i+1,source);};
 const camera=new RecordedSignCamera({video:$('camVideo'),canvas:$('camCanvas'),modelUrl:'data/bank-recognition.json?v=__BUILD__',onStatus:key=>{statusKey=({loading:'camLoading',live:'camLive',stopped:'camIdle',denied:'camDenied',error:'camFail',uncertain:'camUncertain'})[key];status.hidden=false;status.textContent=t(statusKey);stage.classList.toggle('on',camera?.running||false);stage.classList.toggle('loading',key==='loading');start.disabled=key==='loading'||key==='live';stop.disabled=key==='stopped';},onWord:word=>{words.push(normalize(word));words=words.slice(-3);const index=QUESTIONS.findIndex(q=>q.join(' ')===words.slice(-q.length).join(' '));if(index>=0){display(index,'camera');words=[];}else{sentence.textContent='Распознано слово: '+word;sentence.dataset.source='camera-word';delete sentence.dataset.cls;}}});
 start.addEventListener('click',async()=>{words=[];await camera.start();});stop.addEventListener('click',()=>camera.stop());chips.forEach(c=>c.addEventListener('click',()=>display(Number(c.dataset.cls)-1,'button')));document.addEventListener('visibilitychange',()=>{if(document.hidden)camera.stop();});
 status.hidden=false;status.textContent=t(statusKey);return{refresh:()=>{status.textContent=t(statusKey);const i=Number(sentence.dataset.cls)-1;if(i>=0)sentence.textContent=BANK_CAMERA_EXAMPLES[i];}};
}
