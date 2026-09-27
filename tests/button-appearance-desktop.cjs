const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results/button-appearance');
(async()=>{fs.mkdirSync(out,{recursive:true});const env={...process.env,BA_PET_TEST_PROFILE:fs.mkdtempSync(path.join(os.tmpdir(),'ba-ui-'))};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({args:[root,'--test-mode'],env}),errors=[];app.on('window',p=>p.on('pageerror',e=>errors.push(e.message)));
 try{const pet=await app.firstWindow();await pet.waitForSelector('#stage[data-state="ready"]');const opened=app.waitForEvent('window');await pet.evaluate(()=>window.pet.command('settings'));const page=await opened;await page.waitForSelector('#interact[data-skin-ready=true]');await page.evaluate(()=>document.querySelector('#language-welcome').showModal());await page.waitForSelector('#language-start[data-skin-ready=true]');
 if(await page.locator('#language-welcome').isVisible()){await page.screenshot({path:path.join(out,'welcome.png')});await page.locator('#language-start').click();}
 const findings=[];
 for(const lang of ['zh','en','ja']){
  if(lang!=='zh'){await page.evaluate(uiLocale=>{void window.pet.update({uiLocale});},lang);await page.waitForSelector(`html[lang="${lang}"]`);}
  for(const width of [1060,780]){
   await app.evaluate(({BrowserWindow},width)=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('settings.html'));w.setSize(width,780);},width);
   await page.locator('#tab-updates').click();await page.waitForTimeout(200);
   const result=await page.locator('button:is(.btn-skin-blue,.btn-skin-white,.btn-skin-gold):visible').evaluateAll(buttons=>buttons.map(b=>({id:b.id,text:b.textContent,border:getComputedStyle(b).borderWidth,background:getComputedStyle(b).backgroundImage,color:getComputedStyle(b).backgroundColor,ready:b.dataset.skinReady,canvas:!!b.querySelector('.button-art'),overflow:b.scrollWidth>b.clientWidth+1})));
   assert.ok(result.length);for(const b of result){assert.equal(b.border,'0px',b.id);assert.equal(b.background,'none',b.id);assert.equal(b.color,'rgba(0, 0, 0, 0)',b.id);assert.equal(b.ready,'true',b.id);assert.ok(b.canvas,b.id);assert.equal(b.overflow,false,b.id);}
   findings.push({lang,width,buttons:result});await page.screenshot({path:path.join(out,`${lang}-${width}.png`)});
  }
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,findings,errors},null,2));console.log('Buttons verified at two window widths in Chinese, Japanese, and English.');
 }catch(e){console.error(errors);for(const p of app.windows().filter(p=>p.url().includes('settings.html'))){await p.screenshot({path:path.join(out,'failure.png')});console.error(await p.locator('#language-start').evaluate(e=>({html:e.outerHTML,size:[e.clientWidth,e.clientHeight],text:document.body.innerText.slice(-700)})));}throw e;}finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
