// HTTP Content-Length can describe compressed transfer bytes. GLB declares its
// decoded length in its own header, matching the bytes returned by fetch streams.
export async function downloadAvatar(url,{onProgress=()=>{},fetcher=fetch}={}){
 const response=await fetcher(url);
 if(!response.ok)throw Error('avatar_download_'+response.status);
 const chunks=[];let loaded=0,expected=null,header=new Uint8Array(0);
 const append=chunk=>{
  chunks.push(chunk);loaded+=chunk.byteLength;
  if(header.length<12){const next=new Uint8Array(Math.min(12,header.length+chunk.length));next.set(header);next.set(chunk.subarray(0,next.length-header.length),header.length);header=next;
   if(header.length===12){const view=new DataView(header.buffer);if(view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2)throw Error('invalid_avatar_glb');expected=view.getUint32(8,true);if(expected<20||expected>100*1024*1024)throw Error('invalid_avatar_size');}}
  if(expected&&loaded>expected)throw Error('avatar_size_mismatch');
  onProgress(expected?Math.min(1,loaded/expected):null);
 };
 if(response.body?.getReader){const reader=response.body.getReader();try{for(;;){const {value,done}=await reader.read();if(done)break;append(value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}}
 else append(new Uint8Array(await response.arrayBuffer()));
 if(!expected||loaded!==expected)throw Error('avatar_download_incomplete');
 const bytes=new Uint8Array(loaded);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return bytes.buffer;
}
