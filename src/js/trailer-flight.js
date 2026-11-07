// Rapid descent to the film; motion preference and user interruption take priority.
export const flightEase=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
export function createTrailerFlight({link,target,overlay,win,doc}){
 let frame=0,active=false,oldBehavior='',oldPriority='',started=0,from=0,to=0,duration=0,keyboard=false;
 const root=doc.documentElement;
 const destination=()=>{const margin=Number.parseFloat(win.getComputedStyle(target).scrollMarginTop)||100;return Math.max(0,Math.min(Math.max(0,root.scrollHeight-win.innerHeight),target.getBoundingClientRect().top+win.scrollY-margin));};
 const restore=()=>{if(oldBehavior)root.style.setProperty('scroll-behavior',oldBehavior,oldPriority);else root.style.removeProperty('scroll-behavior');};
 function finish(arrived){
  if(!active)return;active=false;win.cancelAnimationFrame(frame);overlay.style.opacity='0';overlay.classList.remove('is-flying');restore();
  if(arrived){try{if(win.location.hash!=='#'+target.id)win.history.pushState(null,'','#'+target.id);}catch{}if(keyboard){target.setAttribute('tabindex','-1');target.focus({preventScroll:true});}}
 }
 function step(now){
  if(!active)return;const t=Math.max(0,Math.min(1,(now-started)/duration));win.scrollTo(0,from+(to-from)*flightEase(t));
  overlay.style.opacity=String(Math.min(1,t*8,(1-t)*6));
  if(t<1)frame=win.requestAnimationFrame(step);else finish(true);
 }
 function start(event){
  if(event?.button>0||event?.metaKey||event?.ctrlKey||event?.shiftKey||event?.altKey)return;
  event?.preventDefault();finish(false);keyboard=event?.detail===0;
  oldBehavior=root.style.getPropertyValue('scroll-behavior');oldPriority=root.style.getPropertyPriority('scroll-behavior');root.style.setProperty('scroll-behavior','auto','important');
  from=win.scrollY;to=destination();active=true;
  if(win.matchMedia('(prefers-reduced-motion: reduce)').matches||Math.abs(to-from)<100){win.scrollTo(0,to);finish(true);return;}
  duration=Math.min(1050,Math.max(650,650+Math.abs(to-from)*.075));started=win.performance.now();overlay.classList.add('is-flying');frame=win.requestAnimationFrame(step);
 }
 const interrupt=()=>finish(false),key=event=>{if(['Escape','Tab',' ','ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(event.key))interrupt();};
 const visibility=()=>{if(doc.hidden)interrupt();};
 link.addEventListener('click',start);win.addEventListener('wheel',interrupt,{passive:true});win.addEventListener('touchstart',interrupt,{passive:true});win.addEventListener('pointerdown',interrupt,{passive:true});win.addEventListener('keydown',key);doc.addEventListener('visibilitychange',visibility);
 return {cancel:interrupt,destroy(){interrupt();link.removeEventListener('click',start);win.removeEventListener('wheel',interrupt);win.removeEventListener('touchstart',interrupt);win.removeEventListener('pointerdown',interrupt);win.removeEventListener('keydown',key);doc.removeEventListener('visibilitychange',visibility);}};
}
