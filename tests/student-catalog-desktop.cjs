const {_electron:electron}=require('playwright'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.resolve(__dirname,'..'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'ba-voice-slice-'));
(async()=>{
 fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({voiceEnabled:false,roaming:false,proactiveEvents:false,languageConfigured:true}));
 const env={...process.env,BA_PET_TEST_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({args:[root,'--test-mode','--measure-pet'],env});
 const errors=[],requests=[];app.on('window',p=>p.on('pageerror',e=>errors.push(e.message)));
 try {
  const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.url().includes('assets/voices/catalog.json'))requests.push(r.url());});
  await page.reload();await page.waitForSelector('#stage[data-state="ready"]');
  const bank=await page.evaluate(async()=>{const r=await fetch('assets/voices/catalog.json?student=1');const text=await r.text();return {bytes:new TextEncoder().encode(text).length,body:JSON.parse(text)};});
  assert.deepEqual(Object.keys(bank.body.students),['1']);
  assert.deepEqual(bank.body.students['1'],require('../assets/voices/catalog.json').students['1']);
  // A stale, delayed character request must never replace the current bank/model.
  await page.evaluate(()=>{const fetchOriginal=window.fetch;window.fetch=async(...args)=>{
   if(String(args[0]).includes('catalog.json?student=38'))await new Promise(r=>{window.finishOldBank=r;});
   return fetchOriginal(...args);
  };});
  await page.evaluate(()=>window.pet.update({characterId:'218'}));
  await page.waitForFunction(()=>!!window.finishOldBank);
  await page.evaluate(()=>window.pet.update({characterId:'212'}));
  await page.waitForSelector('#stage[data-character="212"][data-state="ready"]');
  await page.evaluate(()=>window.finishOldBank());await page.waitForTimeout(250);
  assert.equal(await page.locator('#stage').getAttribute('data-character'),'212');
  const opened=app.waitForEvent('window');await page.evaluate(()=>window.pet.command('settings'));const settings=await opened;
  await settings.waitForFunction(()=>document.querySelector('#voice-status')?.textContent.includes('句日常语音'));
  const response=await page.evaluate(()=>window.pet.scene('addStudent',{characterId:'426'}));assert.ok(response.ok);
  const pets=()=>app.windows().filter(p=>p.url().includes('pet.html'));
  await page.waitForTimeout(200);for(const p of pets())await p.waitForSelector('#stage[data-state="ready"]');
  assert.equal(pets().length,2);assert.ok(requests.length>=3&&requests.every(url=>new URL(url).searchParams.has('student')));
  assert.deepEqual(errors,[]);
  const result={passed:true,studentBytes:bank.bytes,fullBytes:fs.statSync(path.join(root,'assets/voices/catalog.json')).size,requests,errors};
  fs.mkdirSync(path.join(root,'test-results'),{recursive:true});fs.writeFileSync(path.join(root,'test-results/student-catalog-desktop.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
