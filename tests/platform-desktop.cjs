const { _electron: electron } = require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..'),out=path.join(root,'test-results');
const {helperPath}=require('../electron/platform.cjs');
let translated=false;
if(process.platform==='darwin' && process.arch==='x64') {
  try { translated=execFileSync('sysctl',['-in','sysctl.proc_translated'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()==='1'; } catch {}
}
// Rosetta's first translation of Electron and shader compilation can exceed a
// minute on hosted runners. Keep native-machine timeouts unchanged.
const slowHost=Boolean(process.env.CI && translated);
const readinessTimeout=slowHost?240000:60000;
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
  const env={...process.env,BA_PET_TEST_PROFILE:profile,ELECTRON_ENABLE_LOGGING:'1'};delete env.ELECTRON_RUN_AS_NODE;
  // Release checks use the same default graphics backend as the shipped app.
  // Overrides are available only to the manual graphics diagnostic workflow.
  const graphicsMode=process.env.BA_PET_TEST_GRAPHICS || 'default';
  const graphicsModes={default:[],swiftshader:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],gl:['--use-gl=angle','--use-angle=gl','--ignore-gpu-blocklist'],'swiftshader-webgl':['--use-gl=angle','--use-angle=swiftshader-webgl','--enable-unsafe-swiftshader']};
  assert.ok(Object.hasOwn(graphicsModes,graphicsMode),'Known test graphics mode');
  const graphicsArgs=graphicsModes[graphicsMode];
  const started=Date.now();
  const app=await electron.launch({executablePath,args:[...(executablePath?[]:[root]),'--test-mode','--measure-pet',...graphicsArgs],env,timeout:slowHost?120000:30000});
  app.process().stderr.on('data',data=>process.stderr.write(data));
  const errors=[];
  try {
    await app.firstWindow();
    let page;
    for(let i=0;i<100;i++){page=app.windows().find(p=>p.url().endsWith('/pet.html'));if(page)break;await new Promise(r=>setTimeout(r,100));}
    assert.ok(page,'The pet window exists independently of settings window creation order');
    page.setDefaultTimeout(slowHost?120000:30000);
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')console.error('Renderer:',m.text());});
    try { await page.waitForSelector('#stage[data-state="ready"]',{timeout:readinessTimeout}); }
    catch(error){
      const diagnostic={url:page.url(),windows:app.windows().map(p=>p.url()),errors,
        renderer:await page.evaluate(()=>({stage:document.querySelector('#stage')?.dataset.state,text:document.body.innerText})),
        gpu:await app.evaluate(({app})=>app.getGPUFeatureStatus())};
      fs.writeFileSync(path.join(out,`platform-failure-${process.platform}-${process.arch}.json`),JSON.stringify(diagnostic,null,2));console.error(diagnostic);throw error;
    }
    const startupMs=Date.now()-started;
    console.log({stage:'initial-model-ready',startupMs,translated});
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
    await page.waitForSelector('#stage[data-state="ready"]',{timeout:readinessTimeout});
    await page.waitForTimeout(500);
    await page.screenshot({path:path.join(out,`platform-${process.platform}-${process.arch}.png`),omitBackground:true});
    const runtime=await app.evaluate(({app,BrowserWindow})=>{
      const window=BrowserWindow.getAllWindows()[0];window.setOpacity(0);window.setFocusable(false);
      return {packaged:app.isPackaged,resources:process.resourcesPath,version:app.getVersion(),runtimeArch:process.arch,workspaces:process.platform==='darwin'?window.isVisibleOnAllWorkspaces():null};
    });
    assert.equal(runtime.version,require('../package.json').version);
    assert.equal(runtime.runtimeArch,process.arch);
    assert.equal(runtime.packaged,Boolean(executablePath));
    if(process.platform==='darwin')assert.equal(runtime.workspaces,true);
    const binary=helperPath(root,runtime.resources,runtime.packaged);
    let fixture;
    if(process.platform==='darwin') {
      assert.equal(execFileSync('lipo',['-archs',binary],{encoding:'utf8'}).trim(),process.arch==='x64'?'x86_64':'arm64');
      fixture=await app.evaluate(async({BrowserWindow})=>{
        const window=new BrowserWindow({x:120,y:130,width:640,height:480,show:false,webPreferences:{sandbox:true}});
        await window.loadURL('about:blank');window.showInactive();
        return {id:window.id,bounds:window.getBounds()};
      });
      await page.waitForTimeout(300);
    }
    const scan=execFileSync(binary,[String(process.pid)],{input:'scan\nquit\n',encoding:'utf8',timeout:10000,windowsHide:true});
    const windows=JSON.parse(scan.trim());assert.ok(Array.isArray(windows));
    if(fixture) {
      assert.ok(windows.some(window=>window.standable && ['x','y','width','height'].every(key=>Math.abs(window[key]-fixture.bounds[key])<=1)), 'Native helper finds a real window in logical desktop points');
      await app.evaluate(({BrowserWindow},id)=>BrowserWindow.fromId(id).destroy(),fixture.id);
    }
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
    const report={passed:true,platform:process.platform,arch:process.arch,graphicsMode,translated,startupMs,...runtime,helperRows:windows.length,errors};
    fs.writeFileSync(path.join(out,`platform-${process.platform}-${process.arch}.json`),JSON.stringify(report,null,2));console.log(report);
  }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
