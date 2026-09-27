// Exercise the real desktop window: use its camera, materials, physics and clips.
const fs=require('node:fs'),path=require('node:path'),{_electron:electron}=require('playwright');
const root=path.resolve(__dirname,'../..'), mode=process.argv[2]||'decor', shard=Number(process.argv[3]||0), shards=Number(process.argv[4]||1);
const hash=require('node:crypto').createHash('sha256');
for(const file of ['scripts/model-viewer.js','scripts/desktop-furniture.js','scripts/furniture-rules.js','assets/furniture/models.json'])hash.update(fs.readFileSync(path.join(root,file)));
const renderHash=hash.digest('hex');
const items=Object.values(require('../../assets/furniture/models.json').items), chars=require('../../assets/characters.json');
const {furnitureInteraction}=require('../../scripts/furniture-rules.js');
const output=path.join(root,'test-results/furniture-review',mode), previews=path.join(root,'assets/furniture/previews');
for(const dir of [output,previews])fs.mkdirSync(dir,{recursive:true});
const all=mode==='interactions'?items.flatMap(item=>Object.keys(item.candidates).filter(id=>furnitureInteraction(item,id)).map(characterId=>({item,characterId}))):items.map(item=>({item,characterId:chars.find(c=>!item.candidates[c.id])?.id}));
const only=process.env.BA_REVIEW_ONLY?.split(',');
const choices=all.filter(({item,characterId},i)=>i%shards===shard&&(!only||only.includes(item.id)||only.includes(item.id+'-'+characterId)));
(async()=>{
 const env={...process.env,BA_PET_TEST_PROFILE:path.join(output,`profile-${shard}-${Date.now()}`)};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({...(process.env.BA_REVIEW_EXE?{executablePath:process.env.BA_REVIEW_EXE,args:['--test-mode','--measure-pet']}:{args:[root,'--test-mode','--measure-pet']}),env});
 try{
  const page=await app.firstWindow();let errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||/Furniture unavailable/.test(m.text()))errors.push(m.text())});
  await page.waitForSelector('#stage[data-state="ready"]',{timeout:60000});
  await app.evaluate(({app,BrowserWindow})=>{for(const w of BrowserWindow.getAllWindows()){w.setOpacity(0);w.setFocusable(false)}process.mainModule.require(app.getAppPath()+'/electron/main.cjs').testCursor({x:-10000,y:-10000})});
  await page.evaluate(()=>window.pet.update({size:360,paused:false,roaming:false,windowWalking:false,physics:true,furniture:'none',voiceEnabled:false,effectsEnabled:false,proactiveEvents:false}));
  for(const [index,{item,characterId}] of choices.entries()){
   const key=item.id+(mode==='interactions'?'-'+characterId:''); const target=path.join(output,key+'.json');
   if(fs.existsSync(target)&&!process.env.BA_REVIEW_FORCE&&JSON.parse(fs.readFileSync(target)).renderHash===renderHash)continue;
   errors=[];const samples=[];
   try{
    await page.evaluate(async characterId=>{await window.pet.update({furniture:'none'});await window.pet.update({characterId,paused:false})},characterId);
    await page.waitForSelector(`#stage[data-character="${characterId}"][data-state="ready"]`,{timeout:60000});
    await page.evaluate(furniture=>window.pet.update({furniture}),item.id);
    await page.waitForFunction(id=>document.querySelector('#stage').dataset.furniture===id,item.id,{timeout:15000});
    await page.evaluate(()=>{document.querySelector('#notice').hidden=true});
    if(mode==='interactions')await page.waitForSelector('#stage[data-mode="furniture"]');
    await page.evaluate(()=>window.petCompanionTest.review('pause',true));
    const duration=await page.evaluate(()=>window.petCompanionTest.viewer().duration);
    for(const advance of (mode==='interactions'?[.8,Math.max(.1,duration*.5-.8),duration*.45,duration*.2]:[.2])){
     await page.evaluate(seconds=>window.petCompanionTest.review('advance',seconds),advance);
     const data=await page.evaluate(()=>({frame:window.petFrames.at(-1),diagnostics:window.petCompanionTest.viewer(),viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}}));
     const b=data.frame.visibleBounds;
     if(!b||!Object.values(b).every(Number.isFinite))errors.push('invalid bounds');
     else if(b.left<0||b.top<0||b.right>data.viewport.width||b.bottom>data.viewport.height)errors.push('clipped in desktop window');
     if(mode==='interactions'&&data.diagnostics.mode!=='furniture')errors.push('did not enter interaction');
     const png=await page.screenshot({omitBackground:true});
     fs.writeFileSync(path.join(output,key+'-'+samples.length+'.png'),png);
     if(mode==='decor'){
      const thumb=await page.evaluate(async({png,b,viewport})=>{const img=new Image();img.src='data:image/png;base64,'+png;await img.decode();const c=document.createElement('canvas');c.width=256;c.height=224;const ctx=c.getContext('2d');const w=b.right-b.left+12,h=b.bottom-b.top+12,s=Math.min(248/w,216/h),dpr=img.width/viewport.width;ctx.drawImage(img,(b.left-6)*dpr,(b.top-6)*dpr,w*dpr,h*dpr,(256-w*s)/2,(224-h*s)/2,w*s,h*s);return c.toDataURL('image/png')},{png:png.toString('base64'),b:data.frame.furnitureBounds,viewport:data.viewport});
      fs.writeFileSync(path.join(previews,item.id+'.png'),Buffer.from(thumb.split(',')[1],'base64'));
     }
     samples.push(data);
    }
    await page.evaluate(()=>window.petCompanionTest.review('pause',false));
   }catch(error){errors.push(error.message);await page.evaluate(()=>window.petCompanionTest.review('pause',false)).catch(()=>{});}
   fs.writeFileSync(target,JSON.stringify({id:item.id,characterId,name:item.names.zh,renderHash,source:process.env.BA_REVIEW_EXE?'packaged-desktop':'source-desktop',errors:[...new Set(errors)],samples},null,2));
   console.log(`${index+1}/${choices.length} ${key}: ${errors.length?errors.join('; '):'ok'}`);
  }
 }finally{await app.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
