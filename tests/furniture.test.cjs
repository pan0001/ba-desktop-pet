const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const catalogue=require('../assets/furniture/models.json'),characters=require('../assets/characters.json');
const {sanitizeSettings}=require('../electron/core.cjs');
test('original furniture assets are intact and candidate motions belong to the selected student',()=>{
 assert.ok(Object.keys(catalogue.items).length>1000);
 for(const item of Object.values(catalogue.items)){
  const bytes=fs.readFileSync(path.join(__dirname,'..',item.file));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),item.sha256,item.id);
  const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
  assert.ok(gltf.images.length,item.id);assert.ok(!gltf.images.some(i=>i.uri)||gltf.images.every(i=>!i.uri||i.uri.startsWith('data:')),item.id);
  for(const [id,names] of Object.entries(item.candidates))assert.ok(names.every(n=>characters.find(c=>c.id===id)?.animations.includes(n)),item.id);
 }
 assert.equal(catalogue.excluded.filter(x=>x.reason==='export-failed').length,36);
});
test('furniture settings retain legacy choices, allow imported IDs and reject arbitrary asset paths',()=>{
 for(const id of ['sofa','arcade','my_event065_chairmandesk'])assert.equal(sanitizeSettings({furniture:id},['212']).furniture,id);
 for(const id of ['../../secret','constructor','toString','missing',{},null])assert.equal(sanitizeSettings({furniture:id},['212']).furniture,'none');
});
test('interactions use the correct actor and phase; missing or rejected pairs stay decorative',async()=>{
 const {furnitureInteraction:interaction,furnitureClipName:clip}=await import('../scripts/furniture-rules.js');
 const desk=catalogue.items.my_event065_chairmandesk;
 assert.equal(clip(desk,interaction(desk,'326')),'my_event065_chairmandesk_CH0240_Idle');
 assert.equal(clip(catalogue.items.arcade,interaction(catalogue.items.arcade,'212')),'my_event12_gamemachine_Neru_Original_Aris_Original_01');
 assert.equal(interaction(desk,'212'),null);
 assert.equal(interaction({...desk,disabledInteractions:{326:'visual-fit'}},'326'),null);
 assert.equal(interaction({...desk,missingAnimations:['missing']},'326'),null);
 assert.equal(interaction({candidates:{a:['Furniture_Start','Furniture_End']}},'a'),null);
});
