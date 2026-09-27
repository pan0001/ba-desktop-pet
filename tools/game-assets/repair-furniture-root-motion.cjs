const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const PREFAB='my_gamedevdept_01_sofa_01',CLIP=PREFAB+'_Aris_Original_01';
// The exported sofa interaction includes a 0 -> 300 degree turn on its outer
// placement node. In desktop coordinates this topples the entire sofa. Keep
// the authored internal rig animation, meshes, textures and buffer data intact.
function repairFurnitureRootMotion(bytes,prefab){
 if(prefab!==PREFAB)return {bytes,repairs:[]};
 if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(16)!==0x4e4f534a)throw Error('Expected GLB 2 JSON chunk');
 const length=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+length)),roots=new Set(doc.scenes.flatMap(s=>s.nodes));
 const clip=doc.animations.find(a=>a.name===CLIP);if(!clip)throw Error('Expected sofa interaction clip');
 const channels=clip.channels.filter(c=>roots.has(c.target.node)&&doc.nodes[c.target.node].name===PREFAB&&c.target.path==='rotation');
 if(!channels.length)return {bytes,repairs:[]};
 if(channels.length!==1)throw Error('Ambiguous sofa placement track');
 clip.channels=clip.channels.filter(c=>c!==channels[0]);
 const json=Buffer.from(JSON.stringify(doc)),chunk=Buffer.alloc(Math.ceil(json.length/4)*4,0x20);json.copy(chunk);
 const header=Buffer.from(bytes.subarray(0,20)),rest=bytes.subarray(20+length);header.writeUInt32LE(20+chunk.length+rest.length,8);header.writeUInt32LE(chunk.length,12);
 return {bytes:Buffer.concat([header,chunk,rest]),repairs:['sofa-outer-placement-rotation'],sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex')};
}
module.exports={repairFurnitureRootMotion};
if(require.main===module){const root=path.resolve(__dirname,'../..'),file=path.join(root,'assets/furniture/models.json'),catalog=JSON.parse(fs.readFileSync(file)),item=catalog.items.sofa,model=path.join(root,item.file),fixed=repairFurnitureRootMotion(fs.readFileSync(model),item.prefab);if(fixed.repairs.length){fs.writeFileSync(model,fixed.bytes);Object.assign(item,{bytes:fixed.bytes.length,sha256:crypto.createHash('sha256').update(fixed.bytes).digest('hex'),sourceSha256:fixed.sourceSha256,repairs:fixed.repairs});fs.writeFileSync(file,JSON.stringify(catalog,null,2)+'\n');}console.log(JSON.stringify({id:item.id,repairs:fixed.repairs}));}
