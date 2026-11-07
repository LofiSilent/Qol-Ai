import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTrailerPlayer} from '../src/js/trailer-player.js';
class Element extends EventTarget{
 constructor(){super();this.attributes={};this.focused=false;}
 setAttribute(k,v){this.attributes[k]=v;}
 focus(){this.focused=true;}
}
function setup({fullscreen='standard',playFails=false}={}){
 const doc=new EventTarget();doc.body={style:{overflow:'auto'}};const previous=new Element();doc.activeElement=previous;doc.fullscreenElement=null;
 const trigger=new Element(),dialog=new Element(),player=new Element(),closeButton=new Element(),status={textContent:'',hidden:true};dialog.open=false;dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;dialog.dispatchEvent(new Event('close'));};
 const video=new Element();Object.assign(video,{readyState:1,paused:true,ended:false,currentTime:0,play(){this.paused=false;return playFails?Promise.reject(Error('blocked')):Promise.resolve();},pause(){this.paused=true;}});
 if(fullscreen==='standard')player.requestFullscreen=()=>{doc.fullscreenElement=player;doc.dispatchEvent(new Event('fullscreenchange'));return Promise.resolve();};
 if(fullscreen==='rejected')player.requestFullscreen=()=>Promise.reject(Error('not supported'));
 if(fullscreen==='safari'){video.webkitEnterFullscreen=()=>{video.webkitDisplayingFullscreen=true;};video.webkitExitFullscreen=()=>{video.webkitDisplayingFullscreen=false;};}
 doc.exitFullscreen=()=>{doc.fullscreenElement=null;doc.dispatchEvent(new Event('fullscreenchange'));return Promise.resolve();};
 const controller=createTrailerPlayer({trigger,dialog,player,video,closeButton,status,doc,copy:k=>k});return{controller,doc,trigger,dialog,player,video,closeButton,status,previous};
}
test('clicking the preview opens fullscreen and starts video in the same interaction',()=>{const x=setup();x.trigger.dispatchEvent(new Event('click'));assert(x.dialog.open);assert.equal(x.doc.fullscreenElement,x.player);assert.equal(x.video.paused,false);assert.equal(x.doc.body.style.overflow,'hidden');assert.equal(x.trigger.attributes['aria-expanded'],'true');});
test('the close control stops audio and restores scrolling and keyboard focus',()=>{const x=setup();x.controller.open();x.closeButton.dispatchEvent(new Event('click'));assert.equal(x.dialog.open,false);assert(x.video.paused);assert.equal(x.doc.fullscreenElement,null);assert.equal(x.doc.body.style.overflow,'auto');assert(x.previous.focused);});
test('Escape closes the modal and stops playback without native fullscreen',()=>{const x=setup({fullscreen:'none'});x.controller.open();const cancel=new Event('cancel',{cancelable:true});x.dialog.dispatchEvent(cancel);assert(cancel.defaultPrevented);assert(!x.dialog.open);assert(x.video.paused);assert.equal(x.doc.body.style.overflow,'auto');});
test('fullscreen rejection keeps a usable viewport-sized player',async()=>{const x=setup({fullscreen:'rejected'});x.controller.open();await Promise.resolve();assert(x.dialog.open);assert.equal(x.video.paused,false);x.controller.close();assert(x.video.paused);});
test('leaving native fullscreen also closes the trailer',()=>{const x=setup();x.controller.open();x.doc.exitFullscreen();assert(!x.dialog.open);assert(x.video.paused);});
test('Safari native video fullscreen uses the supplied video and stops on dismissal',()=>{const x=setup({fullscreen:'safari'});x.controller.open();assert(x.video.webkitDisplayingFullscreen);x.video.dispatchEvent(new Event('webkitendfullscreen'));assert(!x.dialog.open);assert(x.video.paused);});
test('a blocked play attempt offers native controls rather than hiding the video',async()=>{const x=setup({playFails:true});x.controller.open();await Promise.resolve();assert(x.dialog.open);assert.equal(x.status.textContent,'trailerPlayFallback');assert.equal(x.status.hidden,false);x.controller.close();});
test('trailer markup uses the uploaded video, supplied cover and native controls',async()=>{const html=await readFile(new URL('../src/index.html',import.meta.url),'utf8');assert(html.includes('assets/video/qol-trailer-v7.mp4'));assert(html.includes('assets/video/qol-trailer-v7-poster.png'));assert.match(html,/<video id="trailerVideo"[^>]*controls[^>]*playsinline/);assert(!html.includes('id="trailerVideo" autoplay'));assert.match(html,/<a class="text-link" href="#trailer">.*data-i18n="watchDemo"/);assert(!html.includes('data-trailer-open'));const cover=await readFile(new URL('../src/assets/video/qol-trailer-v7-poster.png',import.meta.url));assert.equal(cover.subarray(1,4).toString(),'PNG');assert(cover.length>1000);});

test('the custom fullscreen toggle can return to the browser player without stopping the film',()=>{const x=setup();x.controller.open();x.controller.toggleFullscreen();assert.equal(x.doc.fullscreenElement,null);assert(x.dialog.open);assert.equal(x.video.paused,false);x.controller.close();});
