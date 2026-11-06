// Averaged trajectories only. Camera frames stay on this device.
export function descriptor(result) {
 const frame=[null,null];
 for(let n=0;n<(result.landmarks||[]).length;n++){
  const points=result.landmarks[n],o=points[0];
  const scale=Math.max(...points.map(p=>Math.hypot(p.x-o.x,p.y-o.y,p.z-o.z)));
  if(scale<.01)continue;
  frame[result.handedness[n][0].categoryName==='Left'?0:1]=points.flatMap(p=>[(p.x-o.x)/scale,(p.y-o.y)/scale,(p.z-o.z)/scale]).concat([o.x,o.y]);
 }
 return frame.some(Boolean)?frame:null;
}
export function distance(a,b){let sum=0,n=0;for(let h=0;h<2;h++){if(!a[h]&&!b[h])continue;n++;if(!a[h]||!b[h]){sum++;continue;}let d=0;for(let j=0;j<65;j++)d+=(a[h][j]-b[h][j])**2;sum+=Math.sqrt(d/65);}return n?sum/n:1;}
export function sequenceDistance(a,b){
 const prev=new Float64Array(b.length+1).fill(Infinity);prev[0]=0;
 for(let i=1;i<=a.length;i++){const next=new Float64Array(b.length+1).fill(Infinity);for(let j=1;j<=b.length;j++)if(Math.abs(i/a.length-j/b.length)<=.3)next[j]=distance(a[i-1],b[j-1])+Math.min(prev[j],next[j-1],prev[j-1]);prev.set(next);}return prev[b.length]/Math.max(a.length,b.length);
}
export function matchWord(frames,model){
 if(frames.length<10||!model?.prototypes?.length)return null;
 const seq=Array.from({length:20},(_,i)=>frames[Math.round(i*(frames.length-1)/19)]),byLabel=new Map();
 for(const p of model.prototypes){const d=sequenceDistance(seq,p.frames);byLabel.set(p.label,Math.min(d,byLabel.get(p.label)??Infinity));}
 const ranked=[...byLabel].map(([label,distance])=>({label,distance})).sort((a,b)=>a.distance-b.distance);
 if(ranked.length<2||ranked[0].distance>model.threshold||ranked[1].distance-ranked[0].distance<model.margin)return null;
 return ranked[0];
}
export class RecordedSignCamera {
 constructor({video,canvas,modelUrl,onStatus,onWord}){Object.assign(this,{video,canvas,modelUrl,onStatus,onWord});this.generation=0;this.stream=null;this.running=false;this.raf=0;}
 async start(){
  this.stop();const version=++this.generation;this.onStatus('loading');let detector;
  try{
   const [model,vision]=await Promise.all([fetch(this.modelUrl).then(r=>{if(!r.ok)throw Error('model');return r.json();}),import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs')]);
   if(version!==this.generation)return;
   const fs=await vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm');
   detector=await vision.HandLandmarker.createFromOptions(fs,{baseOptions:{delegate:'CPU',modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.5,minHandPresenceConfidence:.5});
   if(version!==this.generation){detector.close();return;}
   const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720},facingMode:'user'},audio:false});
   if(version!==this.generation){stream.getTracks().forEach(t=>t.stop());detector.close();return;}
   this.stream=stream;this.detector=detector;this.model=model;this.video.srcObject=stream;await this.video.play();
   if(version!==this.generation)return;
   this.running=true;this.samples=[];this.lastVideo=-1;this.lastSample=0;this.lastMotion=0;this.lastHand=0;this.previous=null;this.lastEmit=0;this.onStatus('live');this.tick();
  }catch(e){detector?.close();if(version===this.generation){this.stop();this.onStatus(e.name==='NotAllowedError'?'denied':'error');}}
 }
 tick(){
  if(!this.running)return;this.raf=requestAnimationFrame(()=>this.tick());const now=performance.now()/1000;
  if(this.video.readyState<2||this.video.currentTime===this.lastVideo||now-this.lastSample<1/12)return;
  this.lastSample=now;this.lastVideo=this.video.currentTime;
  let result;try{result=this.detector.detectForVideo(this.video,now*1000);}catch{this.stop();this.onStatus('error');return;}
  const frame=descriptor(result);const ctx=this.canvas?.getContext('2d');
  if(ctx){this.canvas.width=this.video.videoWidth;this.canvas.height=this.video.videoHeight;ctx.clearRect(0,0,this.canvas.width,this.canvas.height);ctx.fillStyle='#c69f7a';for(const hand of result.landmarks)for(const p of hand){ctx.beginPath();ctx.arc(p.x*this.canvas.width,p.y*this.canvas.height,3,0,7);ctx.fill();}}
  if(frame){this.lastHand=now;if(!this.samples.length||!this.previous||distance(frame,this.previous)>.035)this.lastMotion=now;this.previous=frame;this.samples.push({time:now,frame});}
  if(this.samples.length&&((!frame&&now-this.lastHand>.3)||(now-this.lastMotion>.65)||(now-this.samples[0].time>5))){
   const frames=this.samples.map(s=>s.frame);this.samples=[];this.previous=null;
   if(frames.length>=10&&now-this.lastEmit>1){const result=matchWord(frames,this.model);this.onStatus(result?'live':'uncertain');if(result){this.lastEmit=now;this.onWord(result.label);}}
  }
 }
 stop(){this.generation++;this.running=false;cancelAnimationFrame(this.raf);this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.detector?.close();this.detector=null;this.video.srcObject=null;this.onStatus?.('stopped');}
}
