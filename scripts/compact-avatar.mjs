// Lossless classic-outfit package. Visible geometry, skeleton and animation buffers
// are preserved exactly; hidden wardrobe meshes and their unused resources are removed.
export function compactAvatar(source){
 if(source.readUInt32LE(0)!==0x46546c67||source.readUInt32LE(4)!==2)throw Error('GLB 2 required');
 const jsonSize=source.readUInt32LE(12),g=JSON.parse(source.subarray(20,20+jsonSize)),binary=source.subarray(28+jsonSize);
 if(g.buffers.length!==1||(g.extensionsUsed||[]).some(e=>e!=='KHR_materials_specular'))throw Error('Unexpected model layout');
 const parent=new Map();g.nodes.forEach((node,i)=>(node.children||[]).forEach(c=>parent.set(c,i)));
 const clothes=['Qol_Business_','Qol_Casual_Knit','Qol_casual_','Qol_Academic_','Qol_academic_','Fitted_formal_jacket_and_top'],shown=['Qol_Business_','Qol_casual_Sleeve_'],hidden=[];
 g.nodes.forEach((node,i)=>{if(node.mesh===undefined)return;const names=[node.name||'',g.meshes[node.mesh].name||'',g.nodes[parent.get(i)]?.name||''];const match=prefixes=>names.some(n=>prefixes.some(p=>n.startsWith(p)));if(match(clothes)&&!match(shown)){hidden.push(i);delete node.mesh;delete node.skin;delete node.weights;}});
 const hiddenSet=new Set(hidden);for(const animation of g.animations||[])animation.channels=animation.channels.filter(c=>!(c.target.path==='weights'&&hiddenSet.has(c.target.node)));
 const select=(items,indices)=>{const sourceIndices=[...indices].sort((a,b)=>a-b),map=new Map(sourceIndices.map((old,i)=>[old,i]));return{items:sourceIndices.map(i=>items[i]),map,sourceIndices};};
 const meshes=select(g.meshes,new Set(g.nodes.filter(n=>n.mesh!==undefined).map(n=>n.mesh)));g.meshes=meshes.items;for(const n of g.nodes)if(n.mesh!==undefined)n.mesh=meshes.map.get(n.mesh);
 const materials=select(g.materials,new Set(g.meshes.flatMap(m=>m.primitives.map(p=>p.material)).filter(i=>i!==undefined)));g.materials=materials.items;for(const m of g.meshes)for(const p of m.primitives)if(p.material!==undefined)p.material=materials.map.get(p.material);
 const textureInfos=[];function visit(value){if(!value||typeof value!=='object')return;for(const[key,v]of Object.entries(value)){if(key.endsWith('Texture')&&v&&Number.isInteger(v.index))textureInfos.push(v);visit(v);}}for(const material of g.materials)visit(material);
 const textures=select(g.textures||[],new Set(textureInfos.map(t=>t.index)));g.textures=textures.items;for(const t of textureInfos)t.index=textures.map.get(t.index);
 const images=select(g.images||[],new Set(g.textures.map(t=>t.source).filter(i=>i!==undefined)));g.images=images.items;for(const t of g.textures)if(t.source!==undefined)t.source=images.map.get(t.source);
 const accessorIds=new Set();for(const mesh of g.meshes)for(const p of mesh.primitives){for(const id of Object.values(p.attributes))accessorIds.add(id);if(p.indices!==undefined)accessorIds.add(p.indices);for(const target of p.targets||[])for(const id of Object.values(target))accessorIds.add(id);}
 for(const skin of g.skins||[])if(skin.inverseBindMatrices!==undefined)accessorIds.add(skin.inverseBindMatrices);
 for(const animation of g.animations||[])for(const sampler of animation.samplers){accessorIds.add(sampler.input);accessorIds.add(sampler.output);}
 const accessors=select(g.accessors,accessorIds);g.accessors=accessors.items;
 for(const mesh of g.meshes)for(const p of mesh.primitives){for(const k of Object.keys(p.attributes))p.attributes[k]=accessors.map.get(p.attributes[k]);if(p.indices!==undefined)p.indices=accessors.map.get(p.indices);for(const target of p.targets||[])for(const k of Object.keys(target))target[k]=accessors.map.get(target[k]);}
 for(const skin of g.skins||[])if(skin.inverseBindMatrices!==undefined)skin.inverseBindMatrices=accessors.map.get(skin.inverseBindMatrices);
 for(const animation of g.animations||[])for(const sampler of animation.samplers){sampler.input=accessors.map.get(sampler.input);sampler.output=accessors.map.get(sampler.output);}
 const viewIds=new Set(g.images.filter(i=>i.bufferView!==undefined).map(i=>i.bufferView));for(const a of g.accessors){if(a.bufferView!==undefined)viewIds.add(a.bufferView);if(a.sparse){viewIds.add(a.sparse.indices.bufferView);viewIds.add(a.sparse.values.bufferView);}}
 const views=select(g.bufferViews,viewIds),parts=[];let offset=0;
 for(const view of views.items){const padding=(4-offset%4)%4;if(padding){parts.push(Buffer.alloc(padding));offset+=padding;}const bytes=binary.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength);if(bytes.length!==view.byteLength)throw Error('Buffer exceeds input');parts.push(bytes);view.byteOffset=offset;view.buffer=0;offset+=bytes.length;}
 if(offset%4){const padding=4-offset%4;parts.push(Buffer.alloc(padding));offset+=padding;}g.bufferViews=views.items;
 for(const a of g.accessors){if(a.bufferView!==undefined)a.bufferView=views.map.get(a.bufferView);if(a.sparse){a.sparse.indices.bufferView=views.map.get(a.sparse.indices.bufferView);a.sparse.values.bufferView=views.map.get(a.sparse.values.bufferView);}}
 for(const image of g.images)if(image.bufferView!==undefined)image.bufferView=views.map.get(image.bufferView);
 g.buffers[0].byteLength=offset;const json=Buffer.from(JSON.stringify(g)),jsonPadded=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,0x20)]),bin=Buffer.concat(parts),header=Buffer.alloc(20),binHeader=Buffer.alloc(8);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jsonPadded.length+bin.length,8);header.writeUInt32LE(jsonPadded.length,12);header.writeUInt32LE(0x4e4f534a,16);binHeader.writeUInt32LE(bin.length,0);binHeader.writeUInt32LE(0x004e4942,4);
 return{buffer:Buffer.concat([header,jsonPadded,binHeader,bin]),report:{sourceBytes:source.length,outputBytes:header.length+jsonPadded.length+binHeader.length+bin.length,hiddenNodes:hidden,meshesKept:g.meshes.length,sourceAccessorByOutput:accessors.sourceIndices,sourceImageByOutput:images.sourceIndices}};
}
