const {EventEmitter}=require('node:events'),fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),crypto=require('node:crypto');
const {ROOT_URL,CATALOG_URL,validateCatalog,inside,safeAsset,hashFile,extractPack,writeAll}=require('./resource-pack.cjs');
class ResourceService extends EventEmitter{
 constructor({root,directory,fetch,thin=false,catalog,baseURL=ROOT_URL,catalogURL=CATALOG_URL}){
  super();Object.assign(this,{root,directory,fetch,thin,baseURL,catalogURL});this.catalog=validateCatalog(catalog);this.bundled=this.catalog;
  this.owned=new Set(Object.values(catalog.packs).flatMap(p=>p.files.map(f=>f.path)));
  this.installed={};this.fileMap=new Map();this.queue=Promise.resolve();this.generation=0;this.revision=0;this.active=null;
  this.data={status:'idle',message:'',progress:0,transferred:0,total:0,pack:null,queued:0};fs.mkdirSync(directory,{recursive:true});
  try{const cached=validateCatalog(JSON.parse(fs.readFileSync(path.join(directory,'catalog.json'))));if(Date.parse(cached.generatedAt)>Date.parse(catalog.generatedAt))this.catalog=cached;}catch{}
  try{const index=JSON.parse(fs.readFileSync(path.join(directory,'installed.json')));for(const [id,p]of Object.entries(index)){if(!/^(student|voice|furniture)-[a-z0-9-]{1,60}$/.test(id)||!/^[a-f0-9]{64}$/.test(p.revision)||!Array.isArray(p.files)||p.files.some(f=>!safeAsset(f.path)))continue;const dir=inside(directory,`packs/${id}/${p.revision}`);if(p.files.every(f=>fs.existsSync(inside(dir,f.path))))this.installed[id]=p;}}catch{}
  this.rebuild();
 }
 rebuild(){
  this.fileMap.clear();for(const [id,p]of Object.entries(this.installed))for(const f of p.files)this.fileMap.set(f.path,inside(this.directory,`packs/${id}/${p.revision}/${f.path}`));
  const packs={};for(const [id,p]of Object.entries(this.catalog.packs)){
   const local=this.installed[id],bundled=this.bundled.packs[id];
   const inApp=!this.thin&&bundled&&bundled.files.every(f=>fs.existsSync(inside(this.root,f.path)));
   const available=Boolean(local||inApp),revision=local?.revision||(inApp?bundled.revision:null);
   packs[id]={available,update:available&&revision!==p.revision,revision,bundled:!!inApp,size:p.size};
  }
  const summarize=mapping=>Object.fromEntries(Object.entries(mapping).map(([id,refs])=>[id,{available:refs.every(p=>packs[p].available),update:refs.some(p=>packs[p].update),size:refs.filter(p=>!packs[p].available||packs[p].update).reduce((n,p)=>n+packs[p].size,0),revision:refs.map(p=>packs[p].revision||'missing').join(':'),bundled:refs.every(p=>packs[p].bundled&&!this.installed[p])}]));
  this.summary={characters:summarize(this.catalog.characters),furniture:summarize(this.catalog.furniture),packs};this.revision++;
 }
 snapshot(){return {...this.data,revision:this.revision,characters:this.summary.characters,furniture:this.summary.furniture};}
 emitState(patch={}){Object.assign(this.data,patch);this.emit('state',this.snapshot());}
 available(section,id){return this.summary[section]?.[id]?.available===true;}
 resolve(relative){if(!safeAsset(relative))return null;const local=this.fileMap.get(relative);if(local&&fs.existsSync(local))return local;
  if(this.thin&&this.owned.has(relative))return false;
  return null;
 }
 async check(){
  if(this.active||this.data.status==='checking')return this.snapshot();this.emitState({status:'checking',message:''});
  try{const response=await this.fetch(this.catalogURL,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('GitHub 上的资源目录暂不可用');
   const text=await boundedText(response,12*1024**2),catalog=validateCatalog(JSON.parse(text));
   if(Date.parse(catalog.generatedAt)>=Date.parse(this.catalog.generatedAt)){await this.writeJSON('catalog.json',catalog);this.catalog=catalog;this.rebuild();}
   this.emitState({status:'idle',message:'资源目录已更新'});
  }catch(e){this.emitState({status:'error',message:e.message.includes('目录')?e.message:'暂时无法检查资源更新，请检查网络。'});}return this.snapshot();
 }
 async writeJSON(name,value){const file=inside(this.directory,name),temp=file+'.tmp';await fsp.writeFile(temp,JSON.stringify(value));await renameRetry(temp,file);}
 download(section,id){
  if(!Object.hasOwn(this.catalog[section]||{},id))return Promise.resolve({ok:false,message:'未知资源'});
  const generation=this.generation;this.emitState({queued:this.data.queued+1});
  const result=this.queue.catch(()=>{}).then(async()=>{
   this.emitState({queued:Math.max(0,this.data.queued-1)});if(generation!==this.generation)return {ok:false,message:'下载已取消'};
   try{for(const packId of this.catalog[section][id]){if(generation!==this.generation)throw Error('下载已取消');await this.installPack(packId);}this.emitState({status:'idle',pack:null,progress:100,message:'资源已安装，可离线使用'});return {ok:true};}
   catch(e){this.emitState({status:'error',pack:null,message:e.message});return {ok:false,message:e.message};}
  });this.queue=result;return result;
 }
 async installPack(id){
  const p=this.catalog.packs[id],s=this.summary.packs[id];if(s.available&&!s.update)return;
  const controller=new AbortController();this.active=controller;
  const token=crypto.randomUUID(),work=inside(this.directory,`staging/${token}`),archive=inside(work,'download.bap.gz'),extract=inside(work,'content');
  await fsp.mkdir(work,{recursive:true});let handle,last=0;
  this.emitState({status:'downloading',pack:id,progress:0,transferred:0,total:p.size,message:''});
  try{
   const response=await this.fetch(this.baseURL+p.asset,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(180000)])});if(!response.ok)throw Error(`资源下载失败（HTTP ${response.status}），可稍后重试`);
   const length=response.headers.get('content-length');if(length&&Number(length)!==p.size)throw Error('资源下载大小不匹配');
   handle=await fsp.open(archive,'wx');let received=0;const hash=crypto.createHash('sha256');
   for await(const chunk of response.body){if(controller.signal.aborted)throw Error('下载已取消');received+=chunk.length;if(received>p.size)throw Error('资源下载超出声明大小');hash.update(chunk);await writeAll(handle,chunk);if(Date.now()-last>200){last=Date.now();this.emitState({transferred:received,progress:received/p.size*100});}}
   await handle.close();handle=null;if(received!==p.size||hash.digest('hex')!==p.sha256)throw Error('资源包校验失败，旧资源保持不变');
   this.emitState({status:'installing',transferred:received,progress:100});await extractPack(archive,p.files,extract,controller.signal);
   if(controller.signal.aborted)throw Error('下载已取消');
   const target=inside(this.directory,`packs/${id}/${p.revision}`);await fsp.mkdir(path.dirname(target),{recursive:true});
   if(fs.existsSync(target)){// A previous crash may have left a complete but unindexed pack.
    for(const f of p.files)if(!fs.existsSync(inside(target,f.path))||await hashFile(inside(target,f.path))!==f.sha256)throw Error('已有资源缓存校验失败');
   }else await renameRetry(extract,target);
   const next={...this.installed,[id]:{revision:p.revision,files:p.files}};await this.writeJSON('installed.json',next);this.installed=next;this.rebuild();this.emit('installed',id);this.emitState();
  }catch(e){throw Error(controller.signal.aborted?'下载已取消':e.code?'无法写入资源缓存，请稍后重试':e.message||'下载失败，请重试');}
  finally{await handle?.close();if(this.active===controller)this.active=null;await fsp.rm(inside(this.directory,`staging/${token}`),{recursive:true,force:true,maxRetries:5,retryDelay:200});}
 }
 cancel(){this.generation++;this.active?.abort();this.emitState({message:'下载已取消'});return this.snapshot();}
 async remove(section,id){
  if(this.active||this.data.queued)return {ok:false,message:'请先完成或取消下载'};
  const refs=this.catalog[section]?.[id];if(!refs)return {ok:false};
  if(this.summary[section][id]?.bundled)return {ok:false,message:'此资源随完整版内置，轻量版支持移除下载资源'};
  const keep=new Set();for(const [other,needs]of Object.entries(this.catalog.characters))if(!(section==='characters'&&id===other)&&this.available('characters',other))needs.forEach(p=>keep.add(p));
  // Furniture categories share one pack: removing one category removes its
  // downloaded models together, but never affects student progress or voices.
  const remove=refs.filter(p=>!keep.has(p)),next={...this.installed};remove.forEach(p=>delete next[p]);await this.writeJSON('installed.json',next);this.installed=next;this.rebuild();this.emit('installed',null);
  for(const p of remove)await fsp.rm(inside(this.directory,`packs/${p}`),{recursive:true,force:true});
  this.rebuild();this.emit('installed',null);this.emitState({status:'idle',message:'下载资源已移除，好感度和设置已保留'});return {ok:true};
 }
 close(){this.cancel();this.removeAllListeners();}
}
async function boundedText(response,max){let size=0;const chunks=[];for await(const c of response.body){size+=c.length;if(size>max)throw Error('资源目录过大');chunks.push(Buffer.from(c));}return Buffer.concat(chunks).toString('utf8');}
// Windows virus scanners may briefly hold a newly extracted model. Keep the
// old index active while retrying the final atomic rename.
async function renameRetry(source,target){for(let attempt=0;;attempt++){try{return await fsp.rename(source,target);}catch(e){if(!['EPERM','EBUSY','EACCES'].includes(e.code)||attempt>=6)throw e;await new Promise(resolve=>setTimeout(resolve,50*2**attempt));}}}
module.exports={ResourceService,boundedText};
