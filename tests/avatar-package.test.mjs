import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {MeshoptDecoder} from 'meshoptimizer';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {compactAvatar} from '../scripts/compact-avatar.mjs';
import {compressAvatar} from '../scripts/compress-avatar.mjs';
const parse=b=>{const n=b.readUInt32LE(12);return {json:JSON.parse(b.subarray(20,20+n)),bin:b.subarray(28+n)};};
const original=await readFile(new URL('../src/assets/model/avatar.glb',import.meta.url));
const compact=compactAvatar(original),packed=await compressAvatar(compact.buffer);
const source=parse(original),small=parse(compact.buffer),fast=parse(packed.buffer);
const bytes=(model,i)=>{const v=model.json.bufferViews[i];return model.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);};
test('avatar package retains bind pose, skin joints, animation and every live source buffer',()=>{
 assert.equal(small.json.nodes.length,source.json.nodes.length);
 for(let i=0;i<source.json.nodes.length;i++)for(const field of ['name','translation','rotation','scale','matrix','children'])assert.deepEqual(small.json.nodes[i][field],source.json.nodes[i][field]);
 for(let i=0;i<small.json.skins.length;i++)assert.deepEqual(small.json.skins[i].joints,source.json.skins[i].joints);
 assert.equal(small.json.animations.length,source.json.animations.length);
 for(let i=0;i<small.json.accessors.length;i++){
  const a=small.json.accessors[i],old=source.json.accessors[compact.report.sourceAccessorByOutput[i]];
  for(const field of ['count','componentType','type','min','max','normalized'])assert.deepEqual(a[field],old[field]);
  if(a.bufferView!==undefined)assert(bytes(small,a.bufferView).equals(bytes(source,old.bufferView)));
  if(a.sparse)for(const key of ['indices','values'])assert(bytes(small,a.sparse[key].bufferView).equals(bytes(source,old.sparse[key].bufferView)));
 }
 for(let i=0;i<small.json.images.length;i++)assert(bytes(small,small.json.images[i].bufferView).equals(bytes(source,source.json.images[compact.report.sourceImageByOutput[i]].bufferView)));
 for(let i=0;i<small.json.animations.length;i++){
  assert.deepEqual(small.json.animations[i].channels,source.json.animations[i].channels);
  for(let j=0;j<small.json.animations[i].samplers.length;j++)for(const key of ['input','output'])assert.equal(compact.report.sourceAccessorByOutput[small.json.animations[i].samplers[j][key]],source.json.animations[i].samplers[j][key]);
 }
});
test('compressed avatar decodes every buffer with exact animation/skin data and bounded geometry error',async()=>{
 await MeshoptDecoder.ready;
 for(let i=0;i<fast.json.bufferViews.length;i++){
  const v=fast.json.bufferViews[i],ext=v.extensions?.EXT_meshopt_compression,raw=bytes(small,i);
  if(!ext){assert(bytes(fast,i).equals(raw));continue;}
  const decoded=new Uint8Array(v.byteLength);
  MeshoptDecoder.decodeGltfBuffer(decoded,ext.count,ext.byteStride,fast.bin.subarray(ext.byteOffset,ext.byteOffset+ext.byteLength),ext.mode,ext.filter);
  if(ext.filter==='NONE')assert(Buffer.from(decoded).equals(raw));
  else{const a=new Float32Array(decoded.buffer),b=new Float32Array(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.length));for(let j=0;j<a.length;j++)assert(Math.abs(a[j]-b[j])<=.000002);}
 }
 assert(packed.buffer.length<original.length*.6);
});
test('production Three GLTFLoader parses the compressed skeleton, morphs and animations',async()=>{
 // Strip only materials for this Node-only check: no browser image decoder is present.
 const g=structuredClone(fast.json);delete g.images;delete g.textures;delete g.materials;
 for(const mesh of g.meshes)for(const primitive of mesh.primitives)delete primitive.material;
 const json=Buffer.from(JSON.stringify(g)),padded=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]),head=Buffer.alloc(20),tail=Buffer.alloc(8);
 head.writeUInt32LE(0x46546c67);head.writeUInt32LE(2,4);head.writeUInt32LE(28+padded.length+fast.bin.length,8);head.writeUInt32LE(padded.length,12);head.writeUInt32LE(0x4e4f534a,16);tail.writeUInt32LE(fast.bin.length);tail.writeUInt32LE(0x004e4942,4);
 const glb=Buffer.concat([head,padded,tail,fast.bin]),gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(glb.buffer.slice(glb.byteOffset,glb.byteOffset+glb.length),'');
 let skins=0;gltf.scene.traverse(o=>{if(o.isSkinnedMesh){skins++;assert(o.skeleton.bones.length>0);assert(o.geometry.attributes.position.count>0);}});
 assert(skins>0);assert.equal(gltf.animations.length,source.json.animations.length);assert(gltf.animations[0].tracks.length>0);
});
