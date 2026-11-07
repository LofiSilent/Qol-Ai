import{MeshoptEncoder,MeshoptDecoder}from'meshoptimizer';
// Skeleton/skin/animation bytes stay exact. Geometry precision is bounded below 0.0005 model units; no mesh simplification.
export async function compressAvatar(source){
 await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
 const size=source.readUInt32LE(12),g=JSON.parse(source.subarray(20,20+size)),bin=source.subarray(28+size),imageViews=new Set(g.images.map(i=>i.bufferView)),byView=new Map();
 for(const a of g.accessors)if(a.bufferView!==undefined){const list=byView.get(a.bufferView)||[];list.push(a);byView.set(a.bufferView,list);}
 const geometry=new Map();
 for(const mesh of g.meshes)for(const primitive of mesh.primitives)for(const attrs of [primitive.attributes,...(primitive.targets||[])])for(const key of ['POSITION','NORMAL'])if(attrs[key]!==undefined){const a=g.accessors[attrs[key]];if(a.componentType===5126&&a.type==='VEC3'){if(a.bufferView!==undefined&&!a.byteOffset)geometry.set(a.bufferView,{count:a.count,accessor:a});if(a.sparse&&!a.sparse.values.byteOffset)geometry.set(a.sparse.values.bufferView,{count:a.sparse.count,accessor:a});}}
 const parts=[];let offset=0,compressedViews=0,maxGeometryError=0,quantizedViews=0;const logicalBytes=g.buffers[0].byteLength;
 const append=bytes=>{const pad=(4-offset%4)%4;if(pad){parts.push(Buffer.alloc(pad));offset+=pad;}const start=offset;parts.push(bytes);offset+=bytes.length;return start;};
 for(let i=0;i<g.bufferViews.length;i++){
  const view=g.bufferViews[i],raw=bin.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength),accessors=byView.get(i)||[];
  let stride=view.byteStride||(geometry.has(i)?12:undefined);
  if(!stride&&accessors.length===1){const a=accessors[0];stride=({SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type]||0)*({5126:4,5125:4,5123:2,5122:2,5121:1,5120:1}[a.componentType]||0);}
  if(!(stride>0&&stride%4===0&&stride<=256&&raw.length%stride===0))stride=raw.length%4===0?4:0;
  let encoded,encodedInput=raw,filter='NONE';const geometric=geometry.get(i);
  if(geometric&&stride===12&&raw.length===geometric.count*12){const floats=new Float32Array(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength)),filtered=MeshoptEncoder.encodeFilterExp(floats,geometric.count,12,20,'Separate'),trial=MeshoptEncoder.encodeGltfBuffer(filtered,geometric.count,12,'ATTRIBUTES',0),decoded=new Uint8Array(raw.length);MeshoptDecoder.decodeGltfBuffer(decoded,geometric.count,12,trial,'ATTRIBUTES','EXPONENTIAL');const values=new Float32Array(decoded.buffer);let error=0;for(let j=0;j<values.length;j++)error=Math.max(error,Math.abs(values[j]-floats[j]));if(error>.0005)throw Error('Geometry precision bound exceeded');maxGeometryError=Math.max(maxGeometryError,error);encodedInput=filtered;filter='EXPONENTIAL';quantizedViews++;}
  if(!imageViews.has(i)&&stride&&raw.length>=128){encoded=Buffer.from(MeshoptEncoder.encodeGltfBuffer(encodedInput,raw.length/stride,stride,'ATTRIBUTES',0));if(encoded.length+128>=raw.length)encoded=null;}
  if(encoded){const decoded=new Uint8Array(raw.length);MeshoptDecoder.decodeGltfBuffer(decoded,raw.length/stride,stride,encoded,'ATTRIBUTES',filter);if(filter==='NONE'&&!Buffer.from(decoded).equals(raw))throw Error('Lossless verification failed');
   const encodedOffset=append(encoded);view.buffer=1;view.extensions={...(view.extensions||{}),EXT_meshopt_compression:{buffer:0,byteOffset:encodedOffset,byteLength:encoded.length,byteStride:stride,count:raw.length/stride,mode:'ATTRIBUTES',filter}};compressedViews++;
  }else{view.buffer=0;view.byteOffset=append(raw);}
 }
 const pad=(4-offset%4)%4;if(pad){parts.push(Buffer.alloc(pad));offset+=pad;}
 g.buffers=[{byteLength:offset},{byteLength:logicalBytes,extensions:{EXT_meshopt_compression:{fallback:true}}}];g.extensionsUsed=[...new Set([...(g.extensionsUsed||[]),'EXT_meshopt_compression'])];g.extensionsRequired=[...new Set([...(g.extensionsRequired||[]),'EXT_meshopt_compression'])];
 const json=Buffer.from(JSON.stringify(g)),padded=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]),payload=Buffer.concat(parts),head=Buffer.alloc(20),tail=Buffer.alloc(8);head.writeUInt32LE(0x46546c67);head.writeUInt32LE(2,4);head.writeUInt32LE(28+padded.length+payload.length,8);head.writeUInt32LE(padded.length,12);head.writeUInt32LE(0x4e4f534a,16);tail.writeUInt32LE(payload.length);tail.writeUInt32LE(0x004e4942,4);
 return{buffer:Buffer.concat([head,padded,tail,payload]),report:{inputBytes:source.length,outputBytes:28+padded.length+payload.length,compressedViews,quantizedViews,maxGeometryError,compressionRoundtripVerified:true}};
}
