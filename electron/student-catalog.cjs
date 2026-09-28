const fs = require('node:fs/promises');
const {createReadStream}=require('node:fs');
const crypto=require('node:crypto');

// Seek into the verified source file, caching at most 16 small banks. Development
// or stale indices can still use the authoritative catalogue via a safe fallback.
function createStudentCatalog(file, readFile = fs.readFile, indexFile = null) {
  let pending;
  let indexPromise;
  const cached=new Map();
  async function index() {
    if(!indexFile)return null;
    return indexPromise ||= (async()=>{
      const value=JSON.parse(await readFile(indexFile,'utf8')),stat=await fs.stat(file);
      if(value.schemaVersion!==1||value.size!==stat.size||!value.students)return null;
      const hash=crypto.createHash('sha256');
      for await(const chunk of createReadStream(file))hash.update(chunk);
      if(hash.digest('hex')!==value.sha256)return null;
      for(const entry of Object.values(value.students))if(!Number.isSafeInteger(entry.offset)||!Number.isSafeInteger(entry.length)||entry.offset<0||entry.length<2||entry.offset+entry.length>stat.size)return null;
      return value;
    })().catch(()=>null);
  }
  async function indexedBank(value,id) {
    if(cached.has(id)){const bank=cached.get(id);cached.delete(id);cached.set(id,bank);return bank;}
    const entry=value.students[id];
    if(!entry)return JSON.stringify({schemaVersion:1,students:{[id]:{languages:{}}}});
    const handle=await fs.open(file,'r');
    let bank;
    try {
      const bytes=Buffer.alloc(entry.length);let offset=0;
      while(offset<bytes.length){const read=await handle.read(bytes,offset,bytes.length-offset,entry.offset+offset);if(!read.bytesRead)throw Error('Incomplete voice bank');offset+=read.bytesRead;}
      const student=JSON.parse(bytes);
      if(String(student.studentId)!==id)throw Error('Mismatched voice bank index');
      bank=JSON.stringify({schemaVersion:value.catalogSchemaVersion,students:{[id]:student}});
    }finally{await handle.close();}
    cached.set(id,bank);if(cached.size>16)cached.delete(cached.keys().next().value);
    return bank;
  }
  function banks() {
    return pending ||= readFile(file, 'utf8').then(text => {
      const catalog = JSON.parse(text), result = new Map();
      for (const [id, student] of Object.entries(catalog.students || {})) {
        result.set(id, JSON.stringify({schemaVersion:catalog.schemaVersion,students:{[id]:student}}));
      }
      return result;
    }).catch(error => { pending = null; throw error; });
  }
  return async id => {
    if (!/^[0-9]{1,8}$/.test(id || '')) return new Response('Invalid student', {status:400});
    const value=await index();let bank;
    if(value){try{bank=await indexedBank(value,id);}catch{ /* Stale/development index falls back to the authoritative JSON. */ }}
    bank ||= (await banks()).get(id) || JSON.stringify({schemaVersion:1,students:{[id]:{languages:{}}}});
    return new Response(bank, {headers:{'content-type':'application/json; charset=utf-8'}});
  };
}
module.exports = {createStudentCatalog};
