const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {repairFurnitureRootMotion}=require('../tools/game-assets/repair-furniture-root-motion.cjs');
test('sofa repair removes only outer placement rotation and preserves binary assets and internal animation',()=>{
 const item=require('../assets/furniture/models.json').items.sofa,bytes=fs.readFileSync(path.join(__dirname,'..',item.file)),doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12))),clip=doc.animations.find(a=>a.name.endsWith('_Aris_Original_01')),root=doc.scenes[0].nodes[0];
 assert.ok(!clip.channels.some(c=>c.target.node===root&&c.target.path==='rotation'),'shipped sofa placement stays fixed');
 // Reintroduce the removed exported channel to exercise the actual repair.
 const originalChannels=structuredClone(clip.channels);clip.channels.push({sampler:0,target:{node:root,path:'rotation'}});
 const data=Buffer.from(JSON.stringify(doc)),json=Buffer.alloc(Math.ceil(data.length/4)*4,0x20);data.copy(json);const header=Buffer.from(bytes.subarray(0,20)),binary=bytes.subarray(20+bytes.readUInt32LE(12));header.writeUInt32LE(json.length,12);header.writeUInt32LE(20+json.length+binary.length,8);const input=Buffer.concat([header,json,binary]);
 const result=repairFurnitureRootMotion(input,item.prefab),repaired=JSON.parse(result.bytes.subarray(20,20+result.bytes.readUInt32LE(12)));
 assert.deepEqual(repaired.animations.find(a=>a.name===clip.name).channels,originalChannels);
 assert.ok(result.bytes.subarray(20+result.bytes.readUInt32LE(12)).equals(binary),'mesh, skin, texture and animation buffers stay byte-identical');
 assert.equal(repairFurnitureRootMotion(result.bytes,item.prefab).bytes,result.bytes,'repeat imports are idempotent');
 assert.equal(repairFurnitureRootMotion(input,'arcade').bytes,input,'other furniture is untouched');
});
