const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),os=require('node:os');
const {digest,writePack,extractPack,validateCatalog,safeAsset}=require('../electron/resource-pack.cjs');
const {ResourceService}=require('../electron/resources.cjs');
async function fixture(t){
 const root=await fsp.mkdtemp(path.join(os.tmpdir(),'ba-resource-test-'));t.after(()=>fsp.rm(root,{recursive:true,force:true}));
 const catalog={schemaVersion:1,generatedAt:'2026-09-27T00:00:00Z',packs:{},characters:{a:['student-a','voice-common'],b:['student-b','voice-common']},furniture:{}};
 const payloads=new Map(),requests=[];
 async function pack(id,asset,body){const bytes=Buffer.from(body),file={path:asset,size:bytes.length,sha256:digest(bytes)},files=[file],revision=digest(Buffer.from(JSON.stringify(files))),name=`${id}.${revision.slice(0,16)}.bap.gz`;
  await fsp.mkdir(path.dirname(path.join(root,asset)),{recursive:true});await fsp.writeFile(path.join(root,asset),bytes);await writePack(root,files,path.join(root,name));const compressed=await fsp.readFile(path.join(root,name));payloads.set(name,compressed);catalog.packs[id]={kind:id.split('-')[0],files,revision,asset:name,size:compressed.length,sha256:digest(compressed)};
 }
 await pack('student-a','assets/media/models/a/body.glb','a body');await pack('student-b','assets/media/models/b/body.glb','b body');await pack('voice-common','assets/voices/common/hello.ogg','hello');
 const fetch=async url=>{const name=url.split('/').at(-1);requests.push(name);return name==='resource-catalog.json'?new Response(JSON.stringify(catalog)):new Response(payloads.get(name),{status:payloads.has(name)?200:404});};
 const options={root,directory:path.join(root,'cache'),catalog:structuredClone(catalog),thin:true,fetch};return {root,catalog,payloads,requests,pack,options};
}
test('only selected student packs download; shared audio is reused and survives removal and offline restart',async t=>{
 const f=await fixture(t),s=new ResourceService(f.options);assert.equal(s.available('characters','a'),false);assert.equal((await s.download('characters','a')).ok,true);assert.equal(f.requests.length,2);assert.equal(s.available('characters','b'),false);
 assert.equal((await s.download('characters','b')).ok,true);assert.equal(f.requests.length,3);assert.equal((await s.remove('characters','a')).ok,true);assert.equal(s.available('characters','a'),false);assert.equal(s.available('characters','b'),true);
 const offline=new ResourceService({...f.options,fetch:()=>{throw Error('offline');}});assert.equal(offline.available('characters','b'),true);assert.equal(await fsp.readFile(offline.resolve('assets/media/models/b/body.glb'),'utf8'),'b body');assert.equal((await offline.download('characters','b')).ok,true);
});
test('update fetches only changed model; a damaged download never replaces the working copy',async t=>{
 const f=await fixture(t),s=new ResourceService(f.options);await s.download('characters','a');const old=s.resolve('assets/media/models/a/body.glb');
 await f.pack('student-a','assets/media/models/a/body.glb','new a body');f.catalog.generatedAt='2026-09-28T00:00:00Z';await s.check();assert.equal(s.snapshot().characters.a.update,true);
 const p=f.catalog.packs['student-a'],valid=f.payloads.get(p.asset);f.payloads.set(p.asset,Buffer.alloc(valid.length));assert.equal((await s.download('characters','a')).ok,false);assert.equal(s.resolve('assets/media/models/a/body.glb'),old);assert.deepEqual(await fsp.readdir(path.join(f.root,'cache/staging')),[]);
 f.payloads.set(p.asset,valid);f.requests.length=0;assert.equal((await s.download('characters','a')).ok,true);assert.deepEqual(f.requests,[p.asset]);assert.equal(await fsp.readFile(s.resolve('assets/media/models/a/body.glb'),'utf8'),'new a body');assert.equal(s.snapshot().characters.a.update,false);
});
test('cancellation aborts active and queued work; a later retry succeeds',async t=>{
 const f=await fixture(t);let started;const ready=new Promise(r=>started=r);const s=new ResourceService({...f.options,fetch:(_url,{signal})=>new Promise((_resolve,reject)=>{started();signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true});})});
 const a=s.download('characters','a'),b=s.download('characters','b');await ready;s.cancel();assert.equal((await a).ok,false);assert.equal((await b).ok,false);assert.equal(s.available('characters','a'),false);assert.deepEqual(await fsp.readdir(path.join(f.root,'cache/staging')),[]);s.fetch=f.options.fetch;assert.equal((await s.download('characters','a')).ok,true);
});
test('archives reject traversal, altered manifests, truncation and trailing bytes',async t=>{
 const f=await fixture(t),p=f.catalog.packs['student-a'];validateCatalog(f.catalog);
 for(const name of ['assets/voices/../../electron/main.cjs','assets/voices/x.exe','assets/voices/C:/x.ogg','assets/voices/a\\x.ogg'])assert.equal(safeAsset(name),false);
 const bad=structuredClone(f.catalog);bad.packs['student-a'].files[0].path='assets/voices/../bad.ogg';assert.throws(()=>validateCatalog(bad));
 const input=path.join(f.root,p.asset);await assert.rejects(extractPack(input,[{...p.files[0],size:999}],path.join(f.root,'bad')));
 const truncated=path.join(f.root,'truncated.gz');await fsp.writeFile(truncated,f.payloads.get(p.asset).subarray(0,20));await assert.rejects(extractPack(truncated,p.files,path.join(f.root,'truncated')));
 const zlib=require('node:zlib'),extra=path.join(f.root,'extra.gz');await fsp.writeFile(extra,zlib.gzipSync(Buffer.concat([zlib.gunzipSync(f.payloads.get(p.asset)),Buffer.from('extra')])));await assert.rejects(extractPack(extra,p.files,path.join(f.root,'extra')),/多余/);
});
