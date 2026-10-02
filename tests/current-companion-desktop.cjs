const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.resolve(__dirname,'..'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'ba-companion-'));
const env={...process.env,BA_PET_TEST_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({languageConfigured:true,roaming:false,windowWalking:false,voiceEnabled:false,proactiveEvents:false}));
const launch=()=>electron.launch({args:[root,'--test-mode','--measure-pet'],env});
(async()=>{
 let app=await launch(),page;const errors=[];
 const open=async()=>{const pet=await app.firstWindow();await pet.waitForSelector('#stage[data-state="ready"]');const opening=app.waitForEvent('window');await pet.evaluate(()=>window.pet.command('settings'));page=await opening;page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.character');return pet;};
 const toggle=async id=>{await page.locator(`.character[data-id="${id}"]`).click();await page.locator(`.character[data-id="${id}"][aria-busy="false"]`).waitFor();};
 const current=async(id,enabled=true)=>{const state=await page.evaluate(()=>window.pet.getState());assert.equal(state.characterId,id,'settings must follow the current companion');assert.equal(state.primaryEnabled,enabled);const c=state.characters.find(c=>c.id===id);assert.equal(await page.locator('#name').textContent(),c.name.replace(/\s*\([^)]*\)\s*$/,''));assert.equal(await page.locator('#portrait').getAttribute('src'),c.portrait);await page.waitForFunction(()=>{const p=document.querySelector('#portrait');return p.complete&&p.naturalWidth>0;});assert.equal(String(state.care.studentId),String(c.studentId));};
 const roster=async ids=>assert.deepEqual((await page.evaluate(()=>window.pet.getState())).desktopScene.students.map(s=>s.characterId).sort(),[...ids].sort());
 try{
  const primary=await open();await current('212');
  await toggle('426');await current('426');await roster(['212','426']);
  assert.equal((await primary.evaluate(()=>window.pet.getState())).characterId,'212','settings focus must not replace the primary desktop model');
  const target=app.windows().find(p=>p!==primary&&p!==page&&p.url().includes('pet.html'));await target.waitForSelector('#stage[data-character="426"][data-state="ready"]');
  for(const p of [primary,target])await p.evaluate(()=>{window.observedActions=[];window.pet.onAction(action=>window.observedActions.push(action));});
  await page.locator('#interact').click();await target.waitForFunction(()=>window.observedActions.includes('interact'));assert.ok(!(await primary.evaluate(()=>window.observedActions)).includes('interact'));
  await page.locator('#tab-voice').click();await page.check('#voiceEnabled');
  await page.waitForFunction(()=>!document.querySelector('#voice-preview').disabled);await page.locator('#voice-preview').click();await target.waitForFunction(()=>window.observedActions.includes('voice-preview'));assert.ok(!(await primary.evaluate(()=>window.observedActions)).includes('voice-preview'));
  await page.locator('#tab-care').click();await page.waitForSelector('#care-panel[data-state="ready"]');await page.locator('#care-snack').click();await page.waitForSelector('#care-message[data-ok="true"]');await current('426');
  await page.locator('#tab-buddy').click();await toggle('218');await current('218');await roster(['212','426','218']);
  await toggle('426');await current('218');await toggle('218');await current('212');
  await toggle('212');await current('212',false);await roster([]);assert.equal(await page.locator('#interact').isDisabled(),true);
  await toggle('426');await current('426');await roster(['426']);
  await page.evaluate(()=>window.pet.command('hide'));await page.evaluate(()=>window.pet.command('show'));await current('426');
  await page.evaluate(()=>window.pet.update({size:380}));await current('426');
  await app.close();app=await launch();await open();await current('426');await roster(['426']);
  const p=app.windows().find(p=>p.url().includes('pet.html')&&p!==app.windows()[0]);await p.waitForSelector('#stage[data-state="ready"]');
  await page.evaluate(()=>window.pet.scene('setStudent',{characterId:'218',enabled:true}));await current('218');
  await p.evaluate(()=>window.pet.command('settings'));await page.waitForFunction(async()=>(await window.pet.getState()).characterId==='426');await current('426');
  fs.mkdirSync(path.join(root,'test-results/current-companion'),{recursive:true});await page.screenshot({path:path.join(root,'test-results/current-companion/fixed.png')});
  assert.deepEqual(errors,[]);console.log('Current companion passed: portrait/name, correct actor interaction/voice/care, fallback, empty roster, settings changes, restart and actor context.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
