import test from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';
import{Quaternion}from'three';
test('every published bank sign retains source-rate sampling and has no large frame-to-frame rotation jumps',async()=>{
 const catalog=JSON.parse(await readFile(new URL('../src/data/bank-catalog.json',import.meta.url)));assert.equal(catalog.entries.length,23);
 for(const e of catalog.entries){assert(e.playable,e.label);const clip=JSON.parse(await readFile(new URL('../src/data/motions/'+e.id+'.json',import.meta.url)));for(const track of clip.tracks){for(let i=1;i<track.times.length;i++){const dt=track.times[i]-track.times[i-1];assert(dt>0&&dt<=.06,e.label+' must retain source-rate motion');const previous=new Quaternion().fromArray(track.values,(i-1)*4).normalize(),current=new Quaternion().fromArray(track.values,i*4).normalize();assert(previous.angleTo(current)<Math.PI/3,e.label+': discontinuity in '+track.name);}}}
});
