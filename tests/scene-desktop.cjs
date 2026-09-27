const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-results/desktop-scene');
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const env={...process.env,BA_PET_TEST_PROFILE:path.join(output,'profile-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({...(process.env.BA_REVIEW_EXE?{executablePath:process.env.BA_REVIEW_EXE,args:['--test-mode','--measure-pet']}:{args:[root,'--test-mode','--measure-pet']}),env});
 const errors=[];app.on('window',page=>page.on('pageerror',e=>errors.push(e.message)));
 try{
  const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('#stage[data-state="ready"]',{timeout:60000});
  await page.evaluate(()=>window.pet.update({paused:false,roaming:false,voiceEnabled:false,proactiveEvents:false,windowWalking:false}));
  const main=fn=>app.evaluate(({app},fn)=>{const m=process.mainModule.require(app.getAppPath()+'/electron/main.cjs');return eval('('+fn+')')(m);},fn.toString());
  const add=app.waitForEvent('window');assert.equal((await page.evaluate(()=>window.pet.scene('addStudent',{characterId:'426'}))).ok,true);
  const neru=await add;await neru.waitForSelector('#stage[data-character="426"][data-state="ready"]');
  assert.equal((await page.evaluate(()=>window.pet.scene('addStudent',{characterId:'426'}))).ok,false);
  const create=app.waitForEvent('window');await page.evaluate(()=>window.pet.scene('placeFurniture',{kind:'arcade'}));const prop=await create;await prop.waitForSelector('#stage[data-state="ready"]');
  await main(m=>{m.testCursor({x:-9999,y:-9999});const scene=m.testScene();const f=[...scene.windows.values()].find(v=>v.type==='furniture'),g=f.geometry,b=f.win.getBounds();for(const a of scene.actors()){const p={x:Math.round(b.x+(g.left+g.right)/2-a.world.foot.x),y:Math.round(b.y+g.floor-a.world.foot.y)};a.world.place({...p,...a.extent});scene.move(a,p);a.world.wait=10;}});
  await prop.waitForFunction(()=>window.furnitureSceneTest.diagnostics().actors.length===2,{timeout:30000});
  await page.waitForFunction(async()=>(await window.pet.getState()).desktopScene.furniture[0].occupants.every(v=>v.phase==='seated'));
  const two=await prop.evaluate(()=>window.furnitureSceneTest.diagnostics());assert.equal(two.actors.length,2);assert.ok(Math.abs(two.actors[0].time-two.actors[1].time)<.001);assert.equal(two.furniture.animation,'my_event12_gamemachine_Neru_Original_Aris_Original_01');
  await prop.screenshot({path:path.join(output,'arcade-two-students.png')});
  for(const a of two.actors){assert.ok(a.bounds.left>=0&&a.bounds.right<=936&&a.bounds.top>=0&&a.bounds.bottom<=936,'seated body fits canvas');}
  assert.equal(await main(m=>m.testScene().actors().filter(a=>a.win.isVisible()).length),0,'free actor windows hide only after the shared render is ready');
  await page.evaluate(()=>window.pet.command('hide'));await prop.waitForTimeout(150);
  assert.equal(await main(m=>[...m.testScene().windows.values()].filter(v=>v.win.isVisible()).length),0);
  const hiddenTime=await prop.evaluate(()=>window.furnitureSceneTest.diagnostics().time);await prop.waitForTimeout(150);assert.equal(await prop.evaluate(()=>window.furnitureSceneTest.diagnostics().time),hiddenTime);
  await page.evaluate(()=>window.pet.command('show'));await prop.waitForTimeout(150);
  assert.equal(await main(m=>m.testScene().actors().filter(a=>a.win.isVisible()).length),0,'show does not resurrect duplicate seated bodies');
  await page.evaluate(()=>window.pet.update({paused:true}));const paused=await prop.evaluate(()=>window.furnitureSceneTest.diagnostics().time);await prop.waitForTimeout(250);assert.equal(await prop.evaluate(()=>window.furnitureSceneTest.diagnostics().time),paused);
  await page.evaluate(()=>window.pet.update({paused:false}));
  await prop.evaluate(()=>window.pet.scene('leave',{actorId:'primary'}));await prop.waitForFunction(()=>window.furnitureSceneTest.diagnostics().actors.length===1);
  assert.equal((await page.evaluate(()=>window.pet.getState())).desktopScene.furniture.length,1,'leaving retains independent furniture');
  await page.evaluate(()=>window.pet.scene('clearFurniture'));await page.waitForTimeout(250);
  assert.equal(await main(m=>m.testScene().actors().filter(a=>a.win.isVisible()).length),2,'removing furniture returns every student');
  assert.equal((await page.evaluate(()=>window.pet.getState())).desktopScene.students.length,2);
  // Student assets failing after a seat reservation must leave the free pet visible.
  const failWindow=app.waitForEvent('window');await page.evaluate(()=>window.pet.scene('placeFurniture',{kind:'arcade'}));const failed=await failWindow;await failed.waitForSelector('#stage[data-state="ready"]');
  await failed.evaluate(()=>{const original=fetch;window.fetch=(url,options)=>String(url).includes('/models/212/')?Promise.reject(Error('simulated student load failure')):original(url,options);});
  await main(m=>{const s=m.testScene();s.seats.cooldowns.clear();const f=[...s.windows.values()].find(v=>v.type==='furniture'),a=s.actor('primary'),b=f.win.getBounds(),g=f.geometry,p={x:Math.round(b.x+(g.left+g.right)/2-a.world.foot.x),y:Math.round(b.y+g.floor-a.world.foot.y)};a.world.place({...p,...a.extent});s.move(a,p);});
  await page.waitForFunction(async()=>(await window.pet.getState()).desktopScene.error.includes('加载失败'));
  assert.equal(await main(m=>m.testScene().actor('primary').win.isVisible()),true);
  await page.evaluate(()=>window.pet.scene('clearFurniture'));
  const settingsPromise=app.waitForEvent('window');await page.evaluate(()=>window.pet.command('settings'));const settings=await settingsPromise;await settings.locator('#tab-voice').click();
  assert.equal(await settings.locator('#scene-students>div').count(),2);await settings.locator('#furniture-search').fill('prayerchair');await settings.locator('[data-furniture="my_event20_prayerchair"]').click();
  await page.waitForFunction(async()=>(await window.pet.getState()).desktopScene.furniture.length===1);
  await settings.locator('#scene-students').scrollIntoViewIfNeeded();await settings.screenshot({path:path.join(output,'settings.png')});
  await settings.evaluate(()=>{void window.pet.update({uiLocale:'en'});});await settings.waitForSelector('html[lang="en"]');assert.equal(await settings.locator('#scene-add-student').textContent(),'Add student');
  await settings.evaluate(()=>{void window.pet.update({uiLocale:'ja'});});await settings.waitForSelector('html[lang="ja"]');assert.equal(await settings.locator('#scene-add-student').textContent(),'生徒を追加');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({twoStudents:true,sharedClock:true,separateSeats:true,independentFurniture:true,leave:true,pause:true,hideShow:true,loadFailureRecovery:true,removeRestoresStudents:true,threeLanguages:true,errors},null,2));console.log('Desktop scene checks passed');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
