const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results/student-selection');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ba-select-'));
const env={...process.env,BA_PET_TEST_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
const launch=()=>electron.launch({args:[root,'--test-mode','--measure-pet'],env});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 fs.mkdirSync(out,{recursive:true});let app=await launch();const errors=[];
 const observe=()=>app.on('window',p=>p.on('pageerror',e=>errors.push(e.message)));
 async function settings(){const pet=await app.firstWindow();await pet.waitForFunction(()=>!!window.pet);const opened=app.waitForEvent('window');await pet.evaluate(()=>window.pet.command('settings'));const page=await opened;await page.waitForSelector('.character');if(await page.locator('#language-welcome').isVisible())await page.locator('#language-start').click();return page;}
 async function check(page,ids){for(let i=0;i<150;i++){const state=await page.evaluate(()=>window.pet.getState());if(JSON.stringify(state.desktopScene.students.map(a=>a.characterId).sort())===JSON.stringify([...ids].sort()))break;if(i===149)assert.fail(JSON.stringify(state.desktopScene));await wait(100);}assert.equal(await page.locator('.character[aria-pressed=true]').count(),ids.length);}
 async function click(page,id){await page.locator(`[data-id="${id}"]`).click();await page.locator(`[data-id="${id}"][aria-busy=false]`).waitFor();}
 try{
 observe();const primary=await app.firstWindow();await primary.waitForSelector('#stage[data-state="ready"]');await primary.evaluate(()=>window.pet.update({roaming:false,voiceEnabled:false,proactiveEvents:false}));
 let page=await settings();await check(page,['212']);
 await click(page,'426');await click(page,'218');await check(page,['212','426','218']);
 for(const p of app.windows().filter(p=>p.url().includes('pet.html')))await p.waitForSelector('#stage[data-state="ready"]');
 await page.locator('#characters').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'three-selected.png')});
 await click(page,'212');await check(page,['426','218']);assert.equal(await app.evaluate(({app})=>process.mainModule.require(app.getAppPath()+'/electron/main.cjs').testScene().host.primary().win.isVisible()),false);
 await page.evaluate(()=>window.pet.command('hide'));await page.evaluate(()=>window.pet.command('show'));await wait(250);
 assert.equal(await app.evaluate(({app})=>process.mainModule.require(app.getAppPath()+'/electron/main.cjs').testScene().host.primary().win.isVisible()),false,'global show must not restore a grey card');
 await app.close();app=await launch();observe();page=await settings();await check(page,['426','218']);
 await click(page,'426');await check(page,['218']);await click(page,'218');await check(page,[]);
 assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().filter(w=>w.getTitle().startsWith('BA桌宠')&&w.getTitle()!=='BA桌宠 · 设置'&&w.isVisible()).length),0);
 await app.close();app=await launch();observe();page=await settings();await check(page,[]);
 await click(page,'212');await check(page,['212']);await primaryReady();
 const propReady=app.waitForEvent('window');await page.evaluate(()=>window.pet.scene('placeFurniture',{kind:'sofa'}));const prop=await propReady;await prop.waitForSelector('#stage[data-state="ready"]');
 await app.evaluate(({app})=>{const s=process.mainModule.require(app.getAppPath()+'/electron/main.cjs').testScene(),f=[...s.windows.values()].find(v=>v.type==='furniture');s.seats.reserve(s.host.primary(),f,s.clock);s.host.publish();});
 await prop.waitForFunction(()=>window.furnitureSceneTest.diagnostics().actors.length===1);
 await click(page,'212');await check(page,[]);await prop.waitForFunction(()=>window.furnitureSceneTest.diagnostics().actors.length===0);
 for(const lang of ['en','ja']){await page.evaluate(uiLocale=>{void window.pet.update({uiLocale});},lang);await page.waitForSelector(`html[lang="${lang}"]`);assert.ok(!(await page.locator('.selection-hint').textContent()).includes('点击'));}
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,threeStudents:true,removePrimary:true,emptySelection:true,restart:true,seatedRemoval:true,languages:true,errors},null,2));console.log('Student selection passed: card toggles, three actors, empty roster, persistence, seated removal, languages.');
 async function primaryReady(){const p=app.windows().find(p=>p.url().includes('pet.html'));await p.waitForSelector('#stage[data-state="ready"]');}
 }finally{await app?.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
