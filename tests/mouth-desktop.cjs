const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.join(__dirname, '..'), out = path.join(root,'test-results');
const executablePath = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
const suffix = executablePath ? '-packaged' : '-source';
(async () => {
  const profile = fs.mkdtempSync(path.join(out,'mouth-profile-'));
  fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({characterId:'212',roaming:false,voiceEnabled:true,idleVoice:false,proactiveEvents:false,size:560}));
  const env = {...process.env,BA_PET_TEST_PROFILE:profile}; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({executablePath,args:[...(executablePath?[]:[root]),'--test-mode','--measure-pet'],env});
  const errors=[], reports=[];
  try {
    const page = await app.firstWindow(); page.on('pageerror',e=>errors.push(e.message));
    await app.evaluate(({app,BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.setOpacity(0);win.setFocusable(false);process.mainModule.require(app.getAppPath()+'/electron/main.cjs').testCursor({x:-10000,y:-10000});});
    await page.waitForSelector('#stage[data-state="ready"]');
    await page.waitForTimeout(1800);
    await page.waitForFunction(()=>!window.petCompanionTest.voice().playing);
    const initial=await page.evaluate(()=>window.petCompanionTest.viewer().mouth);
    assert.equal(initial.frame,0);
    await page.screenshot({path:path.join(out,`mouth-closed${suffix}.png`),omitBackground:true});
    await page.evaluate(()=>window.petCompanionTest.speak('pet'));
    await page.waitForFunction(()=>window.petCompanionTest.voice().metered);
    const frames=[];
    for(let i=0;i<45;i++){frames.push(await page.evaluate(()=>({mouth:window.petCompanionTest.viewer().mouth,voice:window.petCompanionTest.voice().playing})));await page.waitForTimeout(60);}
    const speaking=frames.filter(f=>f.voice).map(f=>f.mouth.frame);
    assert.ok(new Set(speaking).size>=3,JSON.stringify(speaking));
    await page.waitForFunction(()=>window.petCompanionTest.viewer().mouth.frame!==0);
    await page.screenshot({path:path.join(out,`mouth-speaking${suffix}.png`),omitBackground:true});
    await page.evaluate(()=>window.pet.update({paused:true}));
    await page.waitForFunction(()=>window.petCompanionTest.viewer().mouth.frame===0);
    assert.equal(await page.evaluate(()=>window.petCompanionTest.voice().playing),false);
    reports.push({character:'212',frames:[...new Set(speaking)],pauseCloses:true});
    await page.evaluate(()=>window.pet.update({paused:false,voiceEnabled:false}));
    await page.evaluate(()=>window.petCompanionTest.speak('pet'));
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(()=>window.petCompanionTest.viewer().mouth.frame),0);
    for (const characterId of ['268','391','319']) {
      await page.evaluate(characterId=>window.pet.update({characterId,voiceEnabled:false}),characterId);
      await page.waitForSelector(`#stage[data-character="${characterId}"][data-state="ready"]`);
      await page.waitForTimeout(1800);
      assert.equal(await page.evaluate(()=>window.petCompanionTest.viewer().mouth.frame),0);
      await page.evaluate(()=>window.pet.update({voiceEnabled:true}));
      await page.evaluate(()=>window.petCompanionTest.speak('pet'));
      await page.waitForFunction(()=>window.petCompanionTest.voice().metered && window.petCompanionTest.viewer().mouth.frame!==0);
      await page.screenshot({path:path.join(out,`mouth-${characterId}${suffix}.png`),omitBackground:true});
      await page.waitForFunction(()=>!window.petCompanionTest.voice().playing);
      assert.equal(await page.evaluate(()=>window.petCompanionTest.viewer().mouth.frame),0);
      reports.push({character:characterId,realAudioChangesMouth:true,naturalEndCloses:true});
    }
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(out,`mouth${suffix}-report.json`),JSON.stringify({passed:true,reports,errors},null,2));
    console.log(reports);
  } finally {await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
