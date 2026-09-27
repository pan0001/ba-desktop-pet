// Exercise a resource-only fix in the already shipped application, with an
// isolated profile. No installed program files or real user saves are changed.
const {_electron:electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),asar=require('@electron/asar');
const {prepareResourceProfile}=require('./resource-profile.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-results/furniture-resource-update'),executable=process.env.BA_REVIEW_EXE;
(async()=>{assert.ok(executable,'BA_REVIEW_EXE is required');fs.mkdirSync(output,{recursive:true});const profile=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'ba-sofa-'));prepareResourceProfile(profile);
 const old=JSON.parse(asar.extractFile(path.join(path.dirname(executable),'resources/app.asar'),'assets/resource-catalog.json'));
 const next=require('../assets/resource-catalog.json'),id='furniture-seats',pack=next.packs[id];assert.notEqual(old.packs[id].revision,pack.revision);
 // Read the immutable previous archive to create a real old downloaded cache.
 const {extractPack}=require('../electron/resource-pack.cjs'),prior=old.packs[id],dir=path.join(profile,'resources/packs',id,prior.revision);await extractPack(path.join(root,'dist/resource-packs',prior.asset),prior.files,dir);
 const indexPath=path.join(profile,'resources/installed.json'),index=JSON.parse(fs.readFileSync(indexPath));index[id]={revision:prior.revision,files:prior.files};fs.writeFileSync(indexPath,JSON.stringify(index));
 fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({characterId:'212',languageConfigured:true,uiLocale:'zh',roaming:false,voiceEnabled:false,proactiveEvents:false}));
 const requests=[],server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1);requests.push(name);if(name!=='resource-catalog.json'&&name!==pack.asset){res.writeHead(404).end();return;}const file=path.join(root,'dist/resource-packs',name);res.setHeader('Content-Length',fs.statSync(file).size);fs.createReadStream(file).pipe(res);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const env={...process.env,BA_PET_TEST_PROFILE:profile,...(!process.env.BA_TEST_PUBLIC_RESOURCES?{BA_PET_TEST_RESOURCE_BASE:`http://127.0.0.1:${server.address().port}/`}:{})};delete env.ELECTRON_RUN_AS_NODE;
 let app;try{app=await electron.launch({executablePath:executable,args:['--test-mode','--measure-pet'],env});app.on('window',p=>{p.on('console',m=>{if(m.type()==='error')console.error(m.text())});p.on('pageerror',e=>console.error(e.message));});const pet=await app.firstWindow();await pet.waitForSelector('#stage[data-state="ready"]');
 const settingsWait=app.waitForEvent('window');await pet.evaluate(()=>window.pet.command('settings'));const settings=await settingsWait;await settings.waitForSelector('#resource-check');
 const propWait=app.waitForEvent('window');await settings.evaluate(()=>window.pet.scene('placeFurniture',{kind:'sofa'}));const prop=await propWait;await prop.waitForSelector('#stage[data-state="ready"]');
 const checked=await settings.evaluate(()=>window.pet.resources('check'));assert.equal(checked.furniture.sofa.update,true);
 const reload=prop.waitForEvent('domcontentloaded');const result=await settings.evaluate(()=>window.pet.resources('download',{section:'furniture',id:'sofa'}));assert.equal(result.ok,true,JSON.stringify(result));await reload;await prop.waitForSelector('#stage[data-state="ready"]');
 const sample=await prop.evaluate(async()=>{const {createDesktopFurniture}=await import('../scripts/desktop-furniture.js');const p=await createDesktopFurniture('sofa');p.setAnimation('Aris_Original_Cafe_my_gamedevdept_01_sofa_01_01');p.update(0,0);const q=p.root.children[0].quaternion.clone();let angle=0;for(let t=0;t<=34;t+=.2){p.update(0,t);angle=Math.max(angle,q.angleTo(p.root.children[0].quaternion));}p.dispose();return angle;});assert.ok(sample<1e-5);
 const saved=JSON.parse(fs.readFileSync(indexPath));assert.equal(saved[id].revision,pack.revision);assert.equal((await settings.evaluate(()=>window.pet.getState())).resources.furniture.sofa.update,false);
 if(!process.env.BA_TEST_PUBLIC_RESOURCES)assert.deepEqual(requests,['resource-catalog.json',pack.asset],'only the changed furniture pack is downloaded');
 fs.writeFileSync(path.join(output,process.env.BA_TEST_PUBLIC_RESOURCES?'public.json':'local.json'),JSON.stringify({passed:true,applicationVersion:await app.evaluate(({app})=>app.getVersion()),publicGitHub:!!process.env.BA_TEST_PUBLIC_RESOURCES,rootRotation:sample,hotReload:true,requests,oldRevision:prior.revision,newRevision:pack.revision,downloadBytes:pack.size},null,2));console.log('Shipped app resource update passed: download, hot reload, fixed sofa, no program replacement.');
 }finally{await app?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
