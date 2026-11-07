export function formatTrailerTime(seconds){
 const value=Number.isFinite(seconds)?Math.max(0,Math.floor(seconds)):0;
 return Math.floor(value/60)+':'+String(value%60).padStart(2,'0');
}
export function createTrailerControls({video,player,dialog,doc,copy,toggleFullscreen,ui}){
 const listeners=[];let hideTimer=null;
 const on=(target,type,handler)=>{target.addEventListener(type,handler);listeners.push(()=>target.removeEventListener(type,handler));};
 const label=(element,text)=>{element.setAttribute('aria-label',text);element.setAttribute('title',text);};
 const duration=()=>Number.isFinite(video.duration)&&video.duration>0?video.duration:0;
 function reveal(){player.dataset.controlsVisible='true';clearTimeout(hideTimer);if(dialog.open&&!video.paused&&!video.ended)hideTimer=setTimeout(()=>{if(!(doc.activeElement!==video&&player.contains?.(doc.activeElement))&&!video.paused)player.dataset.controlsVisible='false';},2800);}
 function update(){
  const total=duration(),time=Number.isFinite(video.currentTime)?video.currentTime:0,paused=video.paused||video.ended;
  player.dataset.playback=paused?'paused':'playing';ui.centerPlay.hidden=!paused;player.dataset.muted=String(video.muted||video.volume===0);
  ui.seek.disabled=!total;ui.seek.value=String(total?Math.round(time/total*1000):0);
  ui.seek.style.setProperty('--played',(total?Math.min(100,time/total*100):0)+'%');
  let buffered=0;try{if(total&&video.buffered?.length)buffered=Math.min(100,video.buffered.end(video.buffered.length-1)/total*100);}catch{}
  ui.seek.style.setProperty('--buffered',buffered+'%');
  const clock=formatTrailerTime(time)+' / '+formatTrailerTime(total);ui.time.textContent=clock;ui.seek.setAttribute('aria-valuetext',clock);
  label(ui.play,copy(paused?'trailerResume':'trailerPause'));label(ui.centerPlay,copy('trailerResume'));
  label(ui.mute,copy(video.muted||video.volume===0?'trailerUnmute':'trailerMute'));
  const full=doc.fullscreenElement===player||video.webkitDisplayingFullscreen;label(ui.fullscreen,copy(full?'trailerExitFullscreen':'trailerFullscreen'));player.dataset.fullscreen=String(!!full);
  ui.volume.value=String(video.muted?0:video.volume);ui.speed.value=String(video.playbackRate||1);
 }
 function play(){if(video.ended)video.currentTime=0;try{Promise.resolve(video.play()).catch(()=>{update();reveal();});}catch{update();reveal();}}
 function togglePlay(){if(video.paused||video.ended)play();else video.pause();update();reveal();}
 function seekBy(delta){if(duration())video.currentTime=Math.max(0,Math.min(duration(),video.currentTime+delta));update();reveal();}
 on(ui.play,'click',togglePlay);on(ui.centerPlay,'click',togglePlay);on(video,'click',togglePlay);
 on(ui.back,'click',()=>seekBy(-10));on(ui.forward,'click',()=>seekBy(10));
 on(ui.seek,'input',()=>{if(duration())video.currentTime=duration()*Math.max(0,Math.min(1000,Number(ui.seek.value)))/1000;update();reveal();});
 on(ui.mute,'click',()=>{video.muted=!(video.muted||video.volume===0);if(!video.muted&&video.volume===0)video.volume=.6;update();reveal();});
 on(ui.volume,'input',()=>{video.volume=Math.max(0,Math.min(1,Number(ui.volume.value)));video.muted=video.volume===0;update();reveal();});
 on(ui.speed,'change',()=>{const rate=Number(ui.speed.value);if([.75,1,1.25,1.5,2].includes(rate))video.playbackRate=rate;update();reveal();});
 on(ui.fullscreen,'click',()=>{toggleFullscreen();reveal();});
 for(const name of ['loadedmetadata','durationchange','timeupdate','progress','volumechange','ratechange','ended','emptied'])on(video,name,update);
 for(const name of ['play','pause'])on(video,name,()=>{update();reveal();});
 for(const name of ['waiting','seeking'])on(video,name,()=>{player.dataset.loading='true';});
 for(const name of ['playing','seeked','canplay','pause','error'])on(video,name,()=>{player.dataset.loading='false';});
 on(doc,'fullscreenchange',update);on(player,'pointermove',reveal);on(player,'focusin',reveal);
 on(dialog,'close',()=>{clearTimeout(hideTimer);player.dataset.controlsVisible='true';});
 on(player,'keydown',event=>{
  if(['INPUT','SELECT','BUTTON','TEXTAREA','A'].includes(event.target?.tagName)||event.altKey||event.metaKey||event.ctrlKey)return;
  if(event.key===' '||event.key==='k'){event.preventDefault();togglePlay();}
  else if(event.key==='ArrowLeft'){event.preventDefault();seekBy(-5);}
  else if(event.key==='ArrowRight'){event.preventDefault();seekBy(5);}
  else if(event.key?.toLowerCase()==='m'){event.preventDefault();ui.mute.click();}
  else if(event.key?.toLowerCase()==='f'){event.preventDefault();toggleFullscreen();reveal();}
 });
 function refresh(){label(ui.back,copy('trailerBack10'));label(ui.forward,copy('trailerForward10'));label(ui.seek,copy('trailerSeek'));label(ui.volume,copy('trailerVolume'));label(ui.speed,copy('trailerSpeed'));update();}
 video.controls=false;video.dataset.qolCustomControls='true';ui.bar.hidden=false;ui.centerPlay.hidden=false;refresh();
 return {refresh,destroy(){clearTimeout(hideTimer);listeners.forEach(off=>off());video.controls=true;delete video.dataset.qolCustomControls;ui.bar.hidden=true;ui.centerPlay.hidden=true;}};
}
