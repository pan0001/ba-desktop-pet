// Real public GitHub downloads through the production Electron protocol and UI.
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-results/resources'),profile=path.join(output,'profile-'+Date.now());
const env={...process.env,BA_PET_TEST_PROFILE:profile,BA_PET_TEST_THIN:'1'};delete env.ELECTRON_RUN_AS_NODE;
const launch=()=>electron.launch({...(process.env.BA_REVIEW_EXE?{executablePath:process.env.BA_REVIEW_EXE,args:['--test-mode','--measure-pet']}:{args:[root,'--test-mode','--measure-pet']}),env});
(async()=>{fs.mkdirSync(output,{recursive:true});let app=await launch();const errors=[];
 try{
  app.on('window',p=>{p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')console.error(m.text());});});
  let settings;for(let i=0;i<100;i++){settings=app.windows().find(p=>p.url().includes('settings.html'));if(settings)break;await new Promise(r=>setTimeout(r,100));}assert.ok(settings);
  await settings.waitForSelector('#characters .character');if(await settings.locator('#language-welcome').isVisible())await settings.locator('#language-start').click();
  assert.equal((await settings.evaluate(()=>window.pet.getState())).resources.characters['212'].available,false);
  await settings.screenshot({path:path.join(output,'before-download.png')});
  await settings.locator('[data-id="212"]').click();await settings.waitForFunction(async()=>(await window.pet.getState()).resources.characters['212'].available,{timeout:180000});
  const primary=app.windows().find(p=>p.url().includes('pet.html'));await primary.waitForSelector('#stage[data-character="212"][data-state="ready"]',{timeout:60000});
  const added=app.waitForEvent('window');await settings.locator('[data-id="426"]').click();const neru=await added;await neru.waitForSelector('#stage[data-character="426"][data-state="ready"]',{timeout:180000});
  await settings.locator('#resource-only-installed').check();assert.equal(await settings.locator('#characters .character').count(),2);
  assert.equal(await settings.locator('.character[aria-pressed=true]').count(),2);
  const before=await settings.evaluate(()=>window.pet.getState());assert.equal(Object.values(before.resources.characters).filter(v=>v.available).length,2);
  await settings.locator('#tab-voice').click();
  await settings.locator('#furniture-search').fill('arcade');const placed=app.waitForEvent('window',{timeout:180000});await settings.locator('[data-furniture="arcade"]').click();const prop=await placed;await prop.waitForSelector('#stage[data-state="ready"]',{timeout:180000});
  assert.equal((await settings.evaluate(()=>window.pet.resources('remove',{section:'furniture',id:'arcade'}))).ok,false,'active furniture cannot be removed');
  await app.evaluate(({app})=>{const m=process.mainModule.require(app.getAppPath()+'/electron/main.cjs'),s=m.testScene();m.testCursor({x:-9999,y:-9999});const f=[...s.windows.values()].find(v=>v.type==='furniture'),g=f.geometry,b=f.win.getBounds();for(const a of s.actors()){const p={x:Math.round(b.x+(g.left+g.right)/2-a.world.foot.x),y:Math.round(b.y+g.floor-a.world.foot.y)};a.world.place({...p,...a.extent});s.move(a,p);a.world.wait=10;}});
  await prop.waitForFunction(()=>window.furnitureSceneTest.diagnostics().actors.length===2,{timeout:30000});await prop.screenshot({path:path.join(output,'downloaded-arcade-two-students.png')});
  await settings.locator('#tab-buddy').click();await settings.locator('#characters').scrollIntoViewIfNeeded();await settings.screenshot({path:path.join(output,'two-downloaded.png')});
  await settings.evaluate(()=>{void window.pet.update({uiLocale:'en',roaming:false,voiceEnabled:false});});await settings.waitForSelector('html[lang="en"]');assert.equal(await settings.locator('#resource-check').textContent(),'Check resource updates');
  await settings.evaluate(()=>{void window.pet.update({uiLocale:'ja'});});await settings.waitForSelector('html[lang="ja"]');assert.equal(await settings.locator('#resource-check').textContent(),'リソース更新を確認');
  assert.deepEqual(errors,[]);await app.close();app=null;
  env.BA_PET_TEST_RESOURCE_BASE='http://127.0.0.1:1/';app=await launch();await app.firstWindow().then(p=>p.waitForSelector('#stage[data-state="ready"]',{timeout:60000}));
  for(let i=0;i<100&&app.windows().length<3;i++)await new Promise(r=>setTimeout(r,100));assert.equal(app.windows().length,3);for(const p of app.windows())await p.waitForSelector('#stage[data-state="ready"]');
  const index=JSON.parse(fs.readFileSync(path.join(profile,'resources/installed.json')));assert.equal(Object.keys(index).length,5);
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:true,publicGitHubDownloads:true,twoStudents:true,onlyFivePacks:true,furnitureCategory:true,downloadedMultiplayer:true,offlineRestart:true,threeLanguages:true,profile,errors},null,2));console.log('Resource desktop checks passed: public GitHub, two students, offline restart, languages.');
 }catch(e){for(const p of app?.windows()||[])console.error(await p.evaluate(()=>({url:location.href,stage:document.querySelector('#stage')?.dataset,text:document.body.innerText.slice(0,500)})));throw e;}finally{await app?.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
