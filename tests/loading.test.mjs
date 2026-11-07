import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {connectTelegram} from '../src/js/telegram.js';

test('the initial interface module graph does not import the renderer or Three',async()=>{
 const visited=new Set();async function inspect(url){if(visited.has(url.href))return;visited.add(url.href);const text=await readFile(url,'utf8');for(const match of text.matchAll(/^import\s+(?:[^'";]+?from\s*)?['"]([^'"]+)['"]/gm)){
  const path=match[1].split('?')[0];assert(!/^(three|meshopt)/.test(path));assert(!path.endsWith('/avatar.js'));if(path.startsWith('.'))await inspect(new URL(path,url));
 }}
 await inspect(new URL('../src/js/main.js',import.meta.url));assert(visited.size>3);
});
test('an ordinary browser visit never requests the Telegram SDK',()=>{
 const saved={window:globalThis.window,location:globalThis.location,document:globalThis.document};
 try{globalThis.window={};globalThis.location={search:'?lang=ru',hash:'#trailer'};globalThis.document={createElement(){throw Error('unexpected external script');}};connectTelegram(()=>assert.fail('unexpected Telegram app'));}
 finally{Object.assign(globalThis,saved);}
});
test('Telegram launch loads its SDK asynchronously and initializes the existing app',()=>{
 const saved={window:globalThis.window,location:globalThis.location,document:globalThis.document};
 try{let script,callback,connected;globalThis.window={};globalThis.location={search:'',hash:'#tgWebAppData=encoded'};globalThis.document={createElement(){return{addEventListener(name,handler){assert.equal(name,'load');callback=handler;}};},head:{append(value){script=value;}}};connectTelegram(app=>connected=app);assert.equal(script.async,true);assert.match(script.src,/telegram-web-app/);window.Telegram={WebApp:{initData:'encoded'}};callback();assert.equal(connected,window.Telegram.WebApp);}
 finally{Object.assign(globalThis,saved);}
});
