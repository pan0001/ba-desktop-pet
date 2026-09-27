// Data-only, streamed resource archives. No ZIP paths, symlinks or executable
// entries are accepted; the catalogue declares every byte before extraction.
const fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {Readable}=require('node:stream'),{pipeline}=require('node:stream/promises');
const ROOT_URL='https://github.com/pan0001/ba-desktop-pet/releases/download/resources-v1/';
const CATALOG_URL=ROOT_URL+'resource-catalog.json';
const digest=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const safeAsset=p=>typeof p==='string'&&/^assets\/(?:media\/(?:models|imported-models)\/|voices\/|furniture\/)/.test(p)&&!p.split('/').some(s=>!s||s==='.'||s==='..'||s.includes(':'))&&!/[\\\x00-\x1f]/.test(p)&&/\.(?:glb|ogg|wav|mp3|png|jpe?g|webp|obj|mtl)$/i.test(p);
function inside(root,relative){const p=path.resolve(root,relative),r=path.relative(path.resolve(root),p);if(!r||r.startsWith('..')||path.isAbsolute(r))throw Error('资源路径无效');return p;}
async function hashFile(file){const h=crypto.createHash('sha256');for await(const c of fs.createReadStream(file))h.update(c);return h.digest('hex');}
function validateCatalog(raw){
  if(!raw||raw.schemaVersion!==1||!raw.packs||typeof raw.packs!=='object'||Array.isArray(raw.packs)||!Number.isFinite(Date.parse(raw.generatedAt)))throw Error('资源目录格式不兼容');
  const owned=new Set(),ids=Object.keys(raw.packs);if(ids.length>1500)throw Error('资源目录过大');
  for(const id of ids){const p=raw.packs[id];
    if(!/^(?:student|voice|furniture)-[a-z0-9-]{1,60}$/.test(id)||!p||!['student','voice','furniture'].includes(p.kind)||!Array.isArray(p.files)||!p.files.length||p.files.length>4000||!/^[a-f0-9]{64}$/.test(p.revision)||!/^[a-f0-9]{64}$/.test(p.sha256)||!Number.isSafeInteger(p.size)||p.size<1||p.size>1024**3)throw Error('资源包信息无效');
    if(p.asset!==`${id}.${p.revision.slice(0,16)}.bap.gz`)throw Error('资源下载地址无效');
    let bytes=0;
    for(const f of p.files){if(!safeAsset(f.path)||owned.has(f.path)||!Number.isSafeInteger(f.size)||f.size<1||f.size>512*1024**2||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error('资源文件清单无效');owned.add(f.path);bytes+=f.size;}
    if(bytes>2*1024**3||digest(Buffer.from(JSON.stringify(p.files)))!==p.revision)throw Error('资源包清单校验失败');
  }
  for(const section of ['characters','furniture']){
    if(!raw[section]||typeof raw[section]!=='object'||Array.isArray(raw[section]))throw Error('缺少资源映射');
    for(const [key,refs]of Object.entries(raw[section]))if(!/^[a-zA-Z0-9_-]{1,100}$/.test(key)||!Array.isArray(refs)||!refs.length||refs.length>8||refs.some(id=>!Object.hasOwn(raw.packs,id)))throw Error('资源映射无效');
  }
  return raw;
}
async function writePack(root,files,target){
  async function* data(){yield Buffer.from('BAP1');for(const f of files){const header=Buffer.from(JSON.stringify(f)),len=Buffer.alloc(4);len.writeUInt32LE(header.length);yield len;yield header;for await(const c of fs.createReadStream(inside(root,f.path)))yield c;}}
  await pipeline(Readable.from(data()),zlib.createGzip({level:6}),fs.createWriteStream(target,{flags:'wx'}));
}
async function extractPack(archive,files,destination,signal){
  const input=fs.createReadStream(archive),stream=zlib.createGunzip();input.on('error',e=>stream.destroy(e));input.pipe(stream);const iterator=stream[Symbol.asyncIterator]();let chunk=Buffer.alloc(0),offset=0;
  const abort=()=>stream.destroy(new Error('下载已取消'));signal?.addEventListener('abort',abort,{once:true});
  async function read(n){if(signal?.aborted)throw Error('下载已取消');const parts=[];let count=0;while(count<n){if(offset>=chunk.length){const item=await iterator.next();if(item.done)throw Error('资源包不完整');chunk=item.value;offset=0;}const length=Math.min(n-count,chunk.length-offset);parts.push(chunk.subarray(offset,offset+length));offset+=length;count+=length;}return parts.length===1?parts[0]:Buffer.concat(parts,n);}
  try{
    if((await read(4)).toString()!=='BAP1')throw Error('资源包格式无效');
    for(const expected of files){const n=(await read(4)).readUInt32LE();if(n>8192||n<1)throw Error('资源包头无效');const actual=JSON.parse((await read(n)).toString());if(JSON.stringify(actual)!==JSON.stringify(expected)||!safeAsset(actual.path))throw Error('资源包文件不匹配');
      const file=inside(destination,actual.path);await fsp.mkdir(path.dirname(file),{recursive:true});const handle=await fsp.open(file,'wx'),hash=crypto.createHash('sha256');
      try{for(let remaining=actual.size;remaining>0;){const c=await read(Math.min(remaining,65536));hash.update(c);await writeAll(handle,c);remaining-=c.length;}}finally{await handle.close();}
      if(hash.digest('hex')!==actual.sha256)throw Error('资源文件校验失败');
    }
    if(offset!==chunk.length||!(await iterator.next()).done)throw Error('资源包含多余内容');
  }finally{signal?.removeEventListener('abort',abort);input.destroy();stream.destroy();}
}
async function writeAll(handle,buffer){let offset=0;while(offset<buffer.length){const {bytesWritten}=await handle.write(buffer,offset,buffer.length-offset);if(!bytesWritten)throw Error('资源写入失败');offset+=bytesWritten;}}
module.exports={ROOT_URL,CATALOG_URL,safeAsset,inside,hashFile,digest,validateCatalog,writePack,extractPack,writeAll};
