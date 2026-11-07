import test from'node:test';import assert from'node:assert/strict';
import{createTrailerControls,formatTrailerTime}from'../src/js/trailer-controls.js';
class Element extends EventTarget{
 constructor(){super();this.attributes={};this.dataset={};this.style={setProperty:(name,value)=>{this.style[name]=value;}};this.value='';this.hidden=true;}
 setAttribute(name,value){this.attributes[name]=value;}
 click(){this.dispatchEvent(new Event('click'));}
 contains(){return false;}
}
function setup(){
 const doc=new EventTarget();doc.activeElement=null;doc.fullscreenElement=null;
 const player=new Element(),dialog=new Element(),video=new Element();dialog.open=false;
 Object.assign(video,{duration:110,currentTime:25,paused:true,ended:false,muted:false,volume:.8,playbackRate:1,controls:true,buffered:{length:1,end:()=>70},play(){this.paused=false;this.dispatchEvent(new Event('play'));return Promise.resolve();},pause(){this.paused=true;this.dispatchEvent(new Event('pause'));}});
 const ui=Object.fromEntries(['bar','play','centerPlay','back','forward','seek','time','mute','volume','speed','fullscreen'].map(k=>[k,new Element()]));
 let fullscreenCalls=0;const controls=createTrailerControls({video,player,dialog,doc,copy:key=>key,toggleFullscreen:()=>{fullscreenCalls++;},ui});
 return{controls,video,ui,player,doc,get fullscreenCalls(){return fullscreenCalls;}};
}
test('custom media controls mirror playback, keep native fallback on teardown and show the correct time',()=>{const x=setup();assert.equal(x.video.controls,false);assert.equal(x.ui.time.textContent,'0:25 / 1:50');assert.equal(x.ui.bar.hidden,false);x.ui.play.click();assert.equal(x.video.paused,false);assert.equal(x.ui.centerPlay.hidden,true);assert.equal(x.ui.play.attributes['aria-label'],'trailerPause');x.ui.play.click();assert.equal(x.video.paused,true);assert.equal(x.ui.centerPlay.hidden,false);x.controls.destroy();assert(x.video.controls);assert(x.ui.bar.hidden);});
test('timeline and skip buttons seek within media bounds',()=>{const x=setup();x.ui.seek.value='500';x.ui.seek.dispatchEvent(new Event('input'));assert.equal(x.video.currentTime,55);x.video.currentTime=3;x.ui.back.click();assert.equal(x.video.currentTime,0);x.video.currentTime=108;x.ui.forward.click();assert.equal(x.video.currentTime,110);x.controls.destroy();});
test('mute, volume and speed controls update actual media properties',()=>{const x=setup();x.ui.mute.click();assert(x.video.muted);x.ui.volume.value='.3';x.ui.volume.dispatchEvent(new Event('input'));assert.equal(x.video.volume,.3);assert.equal(x.video.muted,false);x.ui.speed.value='1.5';x.ui.speed.dispatchEvent(new Event('change'));assert.equal(x.video.playbackRate,1.5);x.ui.fullscreen.click();assert.equal(x.fullscreenCalls,1);x.controls.destroy();});
test('timeline stays disabled until metadata is available and never renders NaN time',()=>{const x=setup();x.video.duration=NaN;x.video.currentTime=NaN;x.controls.refresh();assert(x.ui.seek.disabled);assert.equal(x.ui.time.textContent,'0:00 / 0:00');assert.equal(formatTrailerTime(Infinity),'0:00');assert.equal(formatTrailerTime(110.1),'1:50');x.controls.destroy();});
