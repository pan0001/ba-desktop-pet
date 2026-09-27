// Explicitly publish locally verified Windows preview packages. Stable releases
// continue through the three-platform publish workflow.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {hashFile}=require('../electron/resource-pack.cjs');
async function main(){
 const root=path.resolve(__dirname,'..'),{version}=require('../package.json'),repo='pan0001/ba-desktop-pet',tag='v'+version;
 if(!/^\d+\.\d+\.\d+-beta\.\d+$/.test(version))throw Error('Only explicit beta releases are supported');
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 if(git('status','--porcelain'))throw Error('Commit the verified source before publishing');
 if(git('remote','get-url','origin')!==`https://github.com/${repo}.git`)throw Error('Unexpected repository');
 const commit=git('rev-parse','HEAD'),directory=path.join(root,'dist/releases',tag);
 const smoke=JSON.parse(fs.readFileSync(path.join(root,'test-results/release-smoke-report.json')));if(!smoke.passed||smoke.runtime.version!==version)throw Error('Run release smoke verification first');
 const names=[`BA-Desktop-Pet-${version}-Setup-x64.exe`,`BA-Desktop-Pet-${version}-Setup-x64.exe.blockmap`,`BA-Desktop-Pet-${version}-Portable-x64.exe`,'latest.yml','SHA256SUMS.txt'];
 const sums=new Map(fs.readFileSync(path.join(directory,'SHA256SUMS.txt'),'utf8').trim().split(/\r?\n/).map(line=>{const [hash,name]=line.split('  ');return[name,hash];}));
 const files=[];for(const name of names){const file=path.join(directory,name),sha=await hashFile(file);if(name!=='SHA256SUMS.txt'&&sha!==sums.get(name))throw Error('Checksum mismatch: '+name);files.push({name,file,size:fs.statSync(file).size,digest:'sha256:'+sha});}
 const credentials=execFileSync('git',['credential','fill'],{cwd:root,input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'},stdio:['pipe','pipe','pipe']});
 const token=credentials.split(/\r?\n/).find(line=>line.startsWith('password='))?.slice(9);if(!token)throw Error('GitHub authorization unavailable');
 const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','User-Agent':'ba-preview-publisher'};
 const api=async(route,options={})=>{const r=await fetch('https://api.github.com'+route,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('GitHub '+r.status);return r.json();};
 const base=`/repos/${repo}/releases`,list=await api(base+'?per_page=100');let release=list.find(r=>r.tag_name===tag);
 if(release&&(!release.draft||release.target_commitish!==commit))throw Error('Refusing to replace a published release or a different build');
 if(!release)release=await api(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tag_name:tag,target_commitish:commit,draft:true,prerelease:true,make_latest:'false',name:`BA 桌宠 ${tag} · 按需下载`,body:fs.readFileSync(path.join(root,'docs/releases',tag+'.md'),'utf8')})});
 for(const f of files){const previous=release.assets.find(a=>a.name===f.name);if(previous){if(previous.size!==f.size||previous.digest!==f.digest)throw Error('Existing draft asset differs');continue;}
  const r=await fetch(`https://uploads.github.com/repos/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(f.name)}`,{method:'POST',headers:{...headers,'Content-Type':'application/octet-stream','Content-Length':String(f.size)},body:fs.createReadStream(f.file),duplex:'half',signal:AbortSignal.timeout(600000)});if(!r.ok)throw Error('Upload failed: '+f.name);const a=await r.json();if(a.size!==f.size||a.digest!==f.digest)throw Error('Remote digest mismatch');console.log('Verified '+f.name);
 }
 release=await api(base+'/'+release.id);for(const f of files){const a=release.assets.find(a=>a.name===f.name);if(a?.size!==f.size||a?.digest!==f.digest)throw Error('Remote verification failed');}
 await api(base+'/'+release.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({draft:false,prerelease:true,make_latest:'false'})});console.log(`Published https://github.com/${repo}/releases/tag/${tag}`);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
