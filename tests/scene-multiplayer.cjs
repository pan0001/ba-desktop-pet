const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-results/desktop-scene'),layouts=require('../assets/furniture/seats.json').items;
(async()=>{
 const profile=path.join(output,'multiplayer-'+Date.now()),env={...process.env,BA_PET_TEST_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
 const launch=()=>electron.launch({args:[root,'--test-mode','--measure-pet'],env});
 let app=await launch();const errors=[],results=[];app.on('window',p=>p.on('pageerror',e=>errors.push(e.message)));
 try{
  const page=await app.firstWindow();await page.waitForSelector('#stage[data-state="ready"]',{timeout:60000});
  const main=fn=>app.evaluate(({app},fn)=>eval('('+fn+')')(process.mainModule.require(app.getAppPath()+'/electron/main.cjs')),fn.toString());
  await page.evaluate(()=>window.pet.update({roaming:false,voiceEnabled:false,windowWalking:false,proactiveEvents:false}));
  for(const [kind,layout]of Object.entries(layouts).filter(([,l])=>l.capacity>1)){
    await page.evaluate(async()=>{await window.pet.scene('clearFurniture');for(const a of (await window.pet.getState()).desktopScene.students)if(a.id!=='primary')await window.pet.scene('remove',{id:a.id});});
    const ids=Object.keys(layout.roles);await page.evaluate(id=>window.pet.update({characterId:id}),ids[0]);await page.waitForSelector(`#stage[data-character="${ids[0]}"][data-state="ready"]`);
    for(const id of ids.slice(1)){const wait=app.waitForEvent('window');await page.evaluate(characterId=>window.pet.scene('addStudent',{characterId}),id);const p=await wait;await p.waitForSelector('#stage[data-state="ready"]');}
    const wait=app.waitForEvent('window');await page.evaluate(kind=>window.pet.scene('placeFurniture',{kind}),kind);const prop=await wait;await prop.waitForSelector('#stage[data-state="ready"]');
    await main(m=>{const s=m.testScene();s.seats.cooldowns.clear();const f=[...s.windows.values()].find(v=>v.type==='furniture'),b=f.win.getBounds(),g=f.geometry;for(const a of s.actors()){const p={x:Math.round(b.x+(g.left+g.right)/2-a.world.foot.x),y:Math.round(b.y+g.floor-a.world.foot.y)};a.world.place({...p,...a.extent});a.world.wait=20;s.move(a,p);}m.testCursor({x:-10000,y:-10000});});
    await prop.waitForFunction(count=>window.furnitureSceneTest?.diagnostics().actors.length===count,ids.length,{timeout:30000});
    await page.waitForFunction(async()=>(await window.pet.getState()).desktopScene.furniture[0].occupants.every(v=>v.phase==='seated'));
    await prop.waitForTimeout(600);await prop.screenshot({path:path.join(output,kind+'-multi.png')});
    const samples=[];for(let i=0;i<3;i++){samples.push(await prop.evaluate(()=>window.furnitureSceneTest.diagnostics()));await prop.waitForTimeout(350);}
    for(const sample of samples){assert.equal(sample.actors.length,ids.length);for(const a of sample.actors){assert.ok(a.bounds.left>=0&&a.bounds.right<=936&&a.bounds.top>=0&&a.bounds.bottom<=936,kind+' fits');assert.ok(Math.abs(a.time-sample.time)<.001,'common animation clock');}}
    results.push({kind,students:ids,samples});
    // Dragging the independent furniture carries its occupants without resizing.
    const before=await main(m=>{const f=[...m.testScene().windows.values()].find(v=>v.type==='furniture');return f.win.getBounds();});
    const grab=await prop.evaluate(()=>{const d=window.furnitureSceneTest.diagnostics();for(let y=250;y<700;y+=15)for(let x=200;x<800;x+=15)if(window.furnitureSceneTest.hit(x,y))return{x,y};});assert.ok(grab);
    await prop.evaluate(p=>window.pet.dragStart(p),grab);await prop.waitForTimeout(50);
    await app.evaluate(({app},p)=>process.mainModule.require(app.getAppPath()+'/electron/main.cjs').testCursor(p),{x:before.x+grab.x-45,y:before.y+grab.y-25});
    await prop.evaluate(()=>window.pet.dragEnd(false));const after=await main(m=>[...m.testScene().windows.values()].find(v=>v.type==='furniture').win.getBounds());
    assert.equal(after.width,before.width);assert.equal(after.height,before.height);assert.ok(Math.abs(after.x-before.x+45)<=2);assert.ok(Math.abs(after.y-before.y+25)<=2);
  }
  // Reload while a scene is occupied: save placements, not stale seat leases.
  const expected=await page.evaluate(()=>window.pet.getState()),position=await main(m=>[...m.testScene().windows.values()].find(v=>v.type==='furniture').win.getBounds());await app.close();app=await launch();
  const restored=await app.firstWindow();await restored.waitForSelector('#stage[data-state="ready"]',{timeout:60000});
  const state=await restored.evaluate(()=>window.pet.getState());assert.equal(state.desktopScene.students.length,expected.desktopScene.students.length);assert.equal(state.desktopScene.furniture.length,1);
  assert.equal(state.desktopScene.furniture[0].kind,expected.desktopScene.furniture[0].kind);
  const restoredFurniture=app.windows().find(p=>p.url().includes('furniture.html'));await restoredFurniture.waitForSelector('#stage[data-state="ready"]');
  const restoredPosition=await main(m=>[...m.testScene().windows.values()].find(v=>v.type==='furniture').win.getBounds());assert.deepEqual(restoredPosition,position,'furniture placement survives restart exactly');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'multiplayer.json'),JSON.stringify({results,restore:true,errors},null,2));console.log('All '+results.length+' multiplayer furniture scenes, shared timing, dragging and restart passed');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
