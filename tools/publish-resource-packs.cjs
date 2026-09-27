// Explicit release command. Uses normal Git credentials without printing or
// storing the token. Payload names are immutable; publish the catalogue last.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {validateCatalog,hashFile}=require('../electron/resource-pack.cjs');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'dist/resource-packs'),repo='pan0001/ba-desktop-pet',tag='resources-v1';
async function publish(){
 const catalog=validateCatalog(JSON.parse(fs.readFileSync(path.join(directory,'resource-catalog.json'))));
 const credentials=execFileSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'},stdio:['pipe','pipe','pipe']});
 const values=Object.fromEntries(credentials.trim().split(/\r?\n/).map(line=>{const i=line.indexOf('=');return[line.slice(0,i),line.slice(i+1)];}));
 if(!values.password)throw Error('GitHub authorization unavailable');
 const headers={Authorization:'Bearer '+values.password,Accept:'application/vnd.github+json','User-Agent':'ba-desktop-pet-resource-publisher'};
 const api=async(route,options={})=>{const r=await fetch('https://api.github.com'+route,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error(`GitHub ${r.status}: ${route}`);return r.status===204?null:r.json();};
 const releases=await api(`/repos/${repo}/releases?per_page=100`);let release=releases.find(r=>r.tag_name===tag);
 if(!release)release=await api(`/repos/${repo}/releases`,{method:'POST',body:JSON.stringify({tag_name:tag,name:'BA Desktop Pet · On-demand resources',body:'Optional character, voice and furniture resource packs. Download through the desktop application. Character packs are shared by Windows and macOS. Existing pack filenames are immutable; resource-catalog.json lists SHA-256 checksums.',prerelease:true,make_latest:'false'}),headers:{'Content-Type':'application/json'}});
 if(release.draft||!release.prerelease)throw Error('Refusing to alter a non-resource release');
 async function assets(){const all=[];for(let page=1;;page++){const rows=await api(`/repos/${repo}/releases/${release.id}/assets?per_page=100&page=${page}`);all.push(...rows);if(rows.length<100)break;}return all;}
 let existing=new Map((await assets()).map(a=>[a.name,a]));let finished=0;
 async function upload(name,size,sha256){
  const old=existing.get(name);if(old){if(old.size!==size||old.digest!==`sha256:${sha256}`)throw Error('Existing resource asset differs: '+name);return;}
  const file=path.join(directory,name);if(fs.statSync(file).size!==size||await hashFile(file)!==sha256)throw Error('Local resource changed: '+name);
  for(let attempt=0;attempt<3;attempt++){
   const response=await fetch(`https://uploads.github.com/repos/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,{method:'POST',headers:{...headers,'Content-Type':'application/octet-stream','Content-Length':String(size)},body:fs.createReadStream(file),duplex:'half',signal:AbortSignal.timeout(300000)}).catch(()=>null);
   if(response?.ok){const asset=await response.json();if(asset.size!==size||asset.digest!==`sha256:${sha256}`)throw Error('Remote resource checksum mismatch: '+name);existing.set(name,asset);return;}
   // A disconnected successful upload can be discovered without duplicating it.
   const remote=(await assets()).find(a=>a.name===name);if(remote?.size===size&&remote.digest===`sha256:${sha256}`){existing.set(name,remote);return;}
   if(remote)throw Error('Incomplete remote upload: '+name);
   if(attempt===2)throw Error('Upload failed: '+name);
  }
 }
 const jobs=Object.values(catalog.packs);let cursor=0;
 await Promise.all(Array.from({length:3},async()=>{while(cursor<jobs.length){const p=jobs[cursor++];await upload(p.asset,p.size,p.sha256);if(++finished%20===0)console.log(`Verified ${finished}/${jobs.length} GitHub resource packs`);}}));
 const manifestFile=path.join(directory,'resource-catalog.json'),size=fs.statSync(manifestFile).size,sha256=await hashFile(manifestFile),old=existing.get('resource-catalog.json');
 if(old&&(old.size!==size||old.digest!==`sha256:${sha256}`)){await api(`/repos/${repo}/releases/assets/${old.id}`,{method:'DELETE'});existing.delete('resource-catalog.json');}
 await upload('resource-catalog.json',size,sha256);console.log(`Published ${jobs.length} verified resource packs: https://github.com/${repo}/releases/tag/${tag}`);
}
if(require.main===module)publish().catch(e=>{console.error(e.message);process.exitCode=1});
