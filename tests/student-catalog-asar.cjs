const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
(async()=>{
 const root=path.resolve(__dirname,'..'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'ba-voice-asar-'));
 const source=path.join(directory,'source'),archive=path.join(directory,'app.asar'),report=path.join(directory,'result.json');
 for(const name of ['electron/student-catalog.cjs','assets/voices/catalog.json','assets/voices/catalog-index.json']){
  const target=path.join(source,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,name),target);
 }
 fs.writeFileSync(path.join(source,'package.json'),JSON.stringify({name:'ba-bank-asar-check',version:'1.0.0',main:'main.cjs'}));
 fs.writeFileSync(path.join(source,'main.cjs'),`
 const {app}=require('electron'),fs=require('node:fs'),path=require('node:path');
 app.whenReady().then(async()=>{
  const file=path.join(__dirname,'assets/voices/catalog.json');let fullReads=0;
  const serve=require('./electron/student-catalog.cjs').createStudentCatalog(file,async(name,...args)=>{if(name===file)fullReads++;return fs.promises.readFile(name,...args);},path.join(__dirname,'assets/voices/catalog-index.json'));
  const data=await (await serve('1')).json();
  fs.writeFileSync(process.env.BA_BANK_REPORT,JSON.stringify({inASAR:__dirname.endsWith('.asar'),fullReads,ids:Object.keys(data.students),lines:data.students['1'].languages.jp.length}));app.quit();
 }).catch(error=>{console.error(error);app.exit(1);});
 `);
 await require('@electron/asar').createPackageWithOptions(source,archive,{unpackDir:'assets'});
 const env={...process.env,BA_BANK_REPORT:report};delete env.ELECTRON_RUN_AS_NODE;
 execFileSync(require('electron'),[archive],{env,windowsHide:true,timeout:30000,stdio:'pipe'});
 const data=JSON.parse(fs.readFileSync(report));assert.equal(data.inASAR,true);assert.equal(data.fullReads,0);assert.deepEqual(data.ids,['1']);assert.ok(data.lines>0);
 fs.mkdirSync(path.join(root,'test-results'),{recursive:true});fs.writeFileSync(path.join(root,'test-results/student-catalog-asar.json'),JSON.stringify({passed:true,...data},null,2));console.log(JSON.stringify({passed:true,...data}));
})().catch(error=>{console.error(error);process.exitCode=1;});
