// Keep playback/fullscreen tied to the user's click, including Safari fallbacks.
export function createTrailerPlayer({trigger,dialog,player,video,closeButton,status,doc,copy}){
 let previousFocus=null,previousOverflow='',openState=false,ownedFullscreen=false;
 const message=key=>{status.textContent=copy(key);status.hidden=!status.textContent;};
 const emit=name=>doc.dispatchEvent(new Event(name));
 function cleanup(){
  if(!openState)return;
  openState=false;ownedFullscreen=false;video.pause();doc.body.style.overflow=previousOverflow;trigger.setAttribute('aria-expanded','false');
  emit('qol:trailer-close');previousFocus?.focus?.({preventScroll:true});previousFocus=null;
 }
 function close(){
  video.pause();
  if(doc.fullscreenElement===player){try{Promise.resolve(doc.exitFullscreen()).catch(()=>{});}catch{}}
  if(video.webkitDisplayingFullscreen){try{video.webkitExitFullscreen?.();}catch{}}
  if(dialog.open)dialog.close();cleanup();
 }
 function open(event){
  event?.preventDefault();if(dialog.open)return;
  previousFocus=doc.activeElement;previousOverflow=doc.body.style.overflow;
  dialog.showModal();openState=true;doc.body.style.overflow='hidden';trigger.setAttribute('aria-expanded','true');message('');
  emit('qol:trailer-open');closeButton.focus({preventScroll:true});
  if(video.ended)video.currentTime=0;
  // Start both operations synchronously while transient user activation is present.
  try{Promise.resolve(video.play()).catch(()=>{if(dialog.open)message('trailerPlayFallback');});}catch{message('trailerPlayFallback');}
  if(!doc.fullscreenElement&&player.requestFullscreen){try{Promise.resolve(player.requestFullscreen()).catch(()=>{});}catch{}}
  else if(!player.requestFullscreen&&video.readyState>=1&&video.webkitEnterFullscreen){try{video.webkitEnterFullscreen();}catch{}}
 }
 const cancel=event=>{event.preventDefault();close();};
 const fullscreenChanged=()=>{
  if(doc.fullscreenElement===player){ownedFullscreen=true;if(!dialog.open){try{Promise.resolve(doc.exitFullscreen()).catch(()=>{});}catch{}}}
  else if(ownedFullscreen){ownedFullscreen=false;if(dialog.open)close();}
 };
 const failed=()=>{if(dialog.open)message('trailerError');};
 const nativeEnded=()=>{if(dialog.open)close();};
 trigger.addEventListener('click',open);closeButton.addEventListener('click',close);dialog.addEventListener('cancel',cancel);dialog.addEventListener('close',cleanup);doc.addEventListener('fullscreenchange',fullscreenChanged);video.addEventListener('error',failed);video.addEventListener('webkitendfullscreen',nativeEnded);
 return {open,close,destroy(){close();trigger.removeEventListener('click',open);closeButton.removeEventListener('click',close);dialog.removeEventListener('cancel',cancel);dialog.removeEventListener('close',cleanup);doc.removeEventListener('fullscreenchange',fullscreenChanged);video.removeEventListener('error',failed);video.removeEventListener('webkitendfullscreen',nativeEnded);}};
}
