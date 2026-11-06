import * as THREE from 'three';
const interpolants=new WeakMap();
const sample=(track,time)=>{
 let interpolant=interpolants.get(track);if(!interpolant){interpolant=track.createInterpolant();interpolants.set(track,interpolant);}
 return Array.from(interpolant.evaluate(Math.max(0,Math.min(time,track.times.at(-1)))));
};
const ease=t=>t*t*t*(10+t*(-15+6*t));
const angularDistance=(a,b)=>new THREE.Quaternion().fromArray(a).normalize().angleTo(new THREE.Quaternion().fromArray(b).normalize());
export function transitionDuration(from,to){
 let angle=0;for(const[name,a]of from){const b=to.get(name);if(b&&name.endsWith('.quaternion')&&/_(Upperarm|Forearm|Hand)\./.test(name))angle=Math.max(angle,angularDistance(a,b));}
 return angle<.035?.12:Math.max(.26,Math.min(.68,.22+angle*.16));
}
// Each original sign is copied intact. Only new preparation/connecting/return frames
// are inserted, and the renderer plays the resulting clip on one animation clock.
export function buildMotionSequence(clips,{idle,initialPose=new Map()}={}){
 if(!idle?.tracks?.length||clips.length>40||clips.some(c=>!c.tracks.length||!Number.isFinite(c.duration)||c.duration<=0))throw Error('invalid_motion_sequence');
 const templates=new Map(idle.tracks.map(t=>[t.name,t])),rest=new Map(idle.tracks.map(t=>[t.name,sample(t,0)]));
 for(const clip of clips)for(const track of clip.tracks){const old=templates.get(track.name);if(old&&old.ValueTypeName!==track.ValueTypeName)throw Error('incompatible_motion_track');templates.set(track.name,track);}
 const restPose=new Map();for(const[name,track]of templates)restPose.set(name,rest.get(name)||initialPose.get(name)||sample(track,0));
 const poseAt=(clip,time)=>{const tracks=new Map(clip.tracks.map(t=>[t.name,t]));return new Map([...templates].map(([name])=>[name,tracks.has(name)?sample(tracks.get(name),time):restPose.get(name)]));};
 const output=new Map([...templates].map(([name,track])=>[name,{track,times:[],values:[]}]));
 const write=(name,time,value)=>{const out=output.get(name);if(out.times.length&&Math.abs(out.times.at(-1)-time)<1e-7){out.values.splice(out.values.length-value.length,value.length,...value);return;}out.times.push(time);out.values.push(...value);};
 const bridges=[],words=[];let cursor=0,previous=new Map([...restPose].map(([name,value])=>[name,initialPose.get(name)||value]));
 const bridge=(to,kind)=>{
  const start=cursor,duration=transitionDuration(previous,to),steps=Math.max(6,Math.ceil(duration*30));
  for(const[name,template]of templates){const a=previous.get(name),b=to.get(name);for(let i=0;i<=steps;i++){const t=i/steps,u=ease(t),value=template.ValueTypeName==='quaternion'?new THREE.Quaternion().fromArray(a).normalize().slerp(new THREE.Quaternion().fromArray(b).normalize(),u).toArray():a.map((x,k)=>x+(b[k]-x)*u);write(name,start+t*duration,value);}}
  cursor+=duration;bridges.push({kind,start,end:cursor});previous=to;
 };
 for(let index=0;index<clips.length;index++){
  const clip=clips[index],first=poseAt(clip,0);bridge(first,index===0?'entry':'between');
  const start=cursor,tracks=new Map(clip.tracks.map(t=>[t.name,t]));
  for(const[name]of templates){const track=tracks.get(name);write(name,start,first.get(name));if(track)for(const t of track.times)if(t>0&&t<clip.duration)write(name,start+t,sample(track,t));write(name,start+clip.duration,track?sample(track,clip.duration):restPose.get(name));}
  cursor+=clip.duration;words.push({index,label:clip.name,start,end:cursor,sourceDuration:clip.duration});previous=poseAt(clip,clip.duration);
 }
 bridge(restPose,'return');
 const tracks=[...output.values()].map(({track,times,values})=>new track.constructor(track.name,times,values,track.getInterpolation()));
 return {clip:new THREE.AnimationClip('smooth-sign-sequence',cursor,tracks),duration:cursor,words,bridges};
}
