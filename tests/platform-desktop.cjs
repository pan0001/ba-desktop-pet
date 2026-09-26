const { _electron: electron } = require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..'),out=path.join(root,'test-results');
const {helperPath}=require('../electron/platform.cjs');
function packagedExecutable() {
  const metadata=require('../package.json'),base=path.join(root,'dist','releases',`v${metadata.version}`);
  if(process.platform==='win32') return path.join(base,'win-unpacked','BA-Desktop-Pet.exe');
  const bundle=path.join(base,process.arch==='arm64'?'mac-arm64':'mac',`${metadata.build.executableName || metadata.build.productName}.app`);
  const name=execFileSync('plutil',['-extract','CFBundleExecutable','raw','-o','-',path.join(bundle,'Contents/Info.plist')],{encoding:'utf8'}).trim();
  return path.join(bundle,'Contents/MacOS',name);
}
const executablePath=process.argv[2]==='--packaged' ? packagedExecutable() : process.argv[2] ? path.resolve(process.argv[2]) : undefined;
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  const profile=fs.mkdtempSync(path.join(out,'platform-profile-'));
  fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({voiceEnabled:false,roaming:false,proactiveEvents:false}));
  const env={...process.env,BA_PET_TEST_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({executablePath,args:[...(executablePath?[]:[root]),'--test-mode','--measure-pet'],env});
  const errors=[];
  try {
    await app.firstWindow();
    let page;
    for(let i=0;i<100;i++){page=app.windows().find(p=>p.url().endsWith('/pet.html'));if(page)break;await new Promise(r=>setTimeout(r,100));}
    assert.ok(page,'The pet window exists independently of settings window creation order');
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')console.error('Renderer:',m.text());});
    try { await page.waitForSelector('#stage[data-state="ready"]',{timeout:60000}); }
    catch(error){
      const diagnostic={url:page.url(),windows:app.windows().map(p=>p.url()),errors,
        renderer:await page.evaluate(()=>({stage:document.querySelector('#stage')?.dataset.state,text:document.body.innerText})),
        gpu:await app.evaluate(({app})=>app.getGPUFeatureStatus())};
      fs.writeFileSync(path.join(out,`platform-failure-${process.platform}-${process.arch}.json`),JSON.stringify(diagnostic,null,2));console.error(diagnostic);throw error;
    }
    // A native cursor packet can arrive while the voice catalog still loads,
    // before the renderer receives its initial settings. Exercise that order.
    await page.addInitScript(() => {
      const original = window.fetch;
      window.fetch = async (...args) => {
        if (String(args[0]).endsWith('assets/voices/catalog.json')) {
          await new Promise(resolve => { window.resumeCatalog = resolve; });
        }
        return original(...args);
      };
    });
    await page.reload({waitUntil:'commit'});
    await page.waitForFunction(()=>typeof window.resumeCatalog==='function');
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('pet:cursor',{x:100,y:100}));
    await page.waitForTimeout(80);
    await page.evaluate(()=>window.resumeCatalog());
    await page.waitForSelector('#stage[data-state="ready"]',{timeout:60000});
    const runtime=await app.evaluate(({app,BrowserWindow})=>{
      const window=BrowserWindow.getAllWindows()[0];window.setOpacity(0);window.setFocusable(false);
      return {packaged:app.isPackaged,resources:process.resourcesPath,version:app.getVersion(),workspaces:process.platform==='darwin'?window.isVisibleOnAllWorkspaces():null};
    });
    assert.equal(runtime.version,require('../package.json').version);
    assert.equal(runtime.packaged,Boolean(executablePath));
    if(process.platform==='darwin')assert.equal(runtime.workspaces,true);
    const binary=helperPath(root,runtime.resources,runtime.packaged);
    const scan=execFileSync(binary,[String(process.pid)],{input:'scan\nquit\n',encoding:'utf8',timeout:10000,windowsHide:true});
    const windows=JSON.parse(scan.trim());assert.ok(Array.isArray(windows));
    const state=await page.evaluate(()=>window.pet.getState());assert.equal(state.platform,process.platform);
    await page.evaluate(()=>window.pet.command('settings'));
    let settings;
    for(let i=0;i<60;i++){settings=app.windows().find(p=>p.url().includes('settings.html'));if(settings)break;await page.waitForTimeout(100);}
    assert.ok(settings);await settings.waitForSelector('.shortcut kbd');
    await settings.waitForFunction(()=>document.querySelector('.shortcut kbd').textContent===(window.navigator.platform.includes('Mac')?'⌘':'Ctrl'));
    await page.evaluate(()=>window.pet.command('hide'));
    await page.waitForFunction(async()=> (await window.pet.getState()).hidden);
    await settings.evaluate(()=>window.pet.command('show'));
    await page.waitForFunction(async()=> !(await window.pet.getState()).hidden);
    assert.deepEqual(errors,[]);
    const report={passed:true,platform:process.platform,arch:process.arch,...runtime,helperRows:windows.length,errors};
    fs.writeFileSync(path.join(out,`platform-${process.platform}-${process.arch}.json`),JSON.stringify(report,null,2));console.log(report);
  }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
