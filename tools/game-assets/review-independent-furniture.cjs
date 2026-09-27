// Samples the actual independent-furniture window, including the production
// camera, shared unit scale, skin repairs, materials, lights and animation clock.
const {_electron:electron}=require('playwright'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),layouts=require('../../assets/furniture/seats.json').items;
(async()=>{
 const output=path.join(root,'test-results/independent-furniture-review');fs.mkdirSync(output,{recursive:true});
 const env={...process.env,BA_PET_TEST_PROFILE:path.join(output,'profile-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({args:[root,'--test-mode','--measure-pet'],env}),records=[];
 try{
  const page=await app.firstWindow();await page.waitForSelector('#stage[data-state="ready"]');await page.evaluate(()=>window.pet.update({paused:true,roaming:false,voiceEnabled:false}));
  for(const [kind,layout] of Object.entries(layouts)){
   const wait=app.waitForEvent('window');await page.evaluate(kind=>window.pet.scene('placeFurniture',{kind}),kind);const p=await wait;await p.waitForSelector('#stage[data-state="ready"]');
   for(const characterId of Object.keys(layout.roles)){
    await p.evaluate(id=>window.furnitureSceneTest.reviewOccupants([{actorId:'review',characterId:id}]),characterId);
    const d=await p.evaluate(()=>window.furnitureSceneTest.diagnostics()),a=d.actors[0],bad=!a||Object.values(a.bounds).some(v=>!Number.isFinite(v))||a.bounds.left<0||a.bounds.right>936||a.bounds.top<0||a.bounds.bottom>936;
    if(bad)await p.screenshot({path:path.join(output,kind+'-'+characterId+'.png')});
    records.push({kind,characterId,bad,diagnostics:d});
   }
   await page.evaluate(()=>window.pet.scene('clearFurniture'));
   if(records.length%10<2)console.log('Reviewed '+records.length+' original student / furniture pairs');
  }
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(records,null,2));const bad=records.filter(r=>r.bad);console.log(JSON.stringify({count:records.length,failures:bad.map(r=>[r.kind,r.characterId,r.diagnostics.actors[0]?.bounds])}));if(bad.length)process.exitCode=1;
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
