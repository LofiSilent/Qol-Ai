// Keep WebGL initialization out of the interface's initial module graph.
let avatar, pending, setup=[];
function ready(){
 if(!pending)pending=import('./avatar.js?v=__BUILD__').then(module=>{
  avatar=module;for(const [name,args]of setup)module[name](...args);setup=[];return module;
 });
 return pending;
}
const queue=(name,args)=>avatar?avatar[name](...args):setup.push([name,args]);
export const mount=(...args)=>queue('mount',args);
export const enableOrbit=(...args)=>queue('enableOrbit',args);
export const followVisible=(...args)=>queue('followVisible',args);
export function loadAvatar(url,callbacks={}){
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
  const start=()=>ready().then(module=>module.loadAvatar(url,callbacks)).catch(error=>callbacks.onError?.(error));
  if(globalThis.requestIdleCallback)requestIdleCallback(start,{timeout:500});else setTimeout(start,0);
 }));
}
export const playSourceMotions=async(...args)=>(await ready()).playSourceMotions(...args);
export const stop=(...args)=>avatar?.stop(...args);
export const isPlaying=()=>avatar?.isPlaying()||false;
export const setPlaybackRate=(...args)=>avatar?.setPlaybackRate(...args);
