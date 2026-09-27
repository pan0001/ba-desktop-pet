import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const directory = path.resolve(process.argv[2] || 'test-results/content-import/kivo-repairs');
const groups = (process.argv[3] || 'ch0069,ch0163,ch0172,ch0173,ch0174,ch0175,ch0187,ch0229,ch0284').split(',');
const index = JSON.parse(await fs.readFile('test-results/content-import/kivo/index.json','utf8'));
const mapping = JSON.parse(await fs.readFile('test-results/content-import/group-mapping.json','utf8')).mapped;
const normalize = name => name.toLowerCase().replace(/_default$/, '_original');
const records = [], failures = [];
await fs.mkdir(directory,{recursive:true});
async function download(urlValue, modelId) {
  const url = new URL(urlValue.startsWith('//') ? 'https:' + urlValue : urlValue);
  if (url.protocol !== 'https:' || url.hostname !== 'static.kivo.wiki') throw Error('Unexpected asset host');
  const filename = decodeURIComponent(url.pathname.split('/').pop());
  if (!filename || /[<>:"/\\|?*\x00-\x1f]/.test(filename) || filename === '..') throw Error('Invalid asset filename');
  const relative = `models/${modelId}/${filename}`, destination = path.join(directory,relative);
  let bytes;
  for (const candidate of [destination,path.resolve(`assets/media/models/${modelId}/${filename}`)]) {
    try { bytes = await fs.readFile(candidate); break; } catch {}
  }
  if (!bytes) {
    for (let attempt=0;attempt<3;attempt++) {
      try {
        const response=await fetch(url,{signal:AbortSignal.timeout(45000)});
        if (!response.ok) throw Error(`HTTP ${response.status}`);
        bytes=Buffer.from(await response.arrayBuffer());break;
      } catch (error) { if (attempt===2) throw error; }
    }
  }
  const extension=path.extname(filename).toLowerCase(), details={};
  if (extension==='.glb') {
    if(bytes.toString('ascii',0,4)!=='glTF' || bytes.readUInt32LE(8)!==bytes.length) throw Error('Invalid GLB');
    const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
    details.animations=(gltf.animations||[]).map(clip=>clip.name);
    details.halos=(gltf.meshes||[]).filter(mesh=>/halo/i.test(mesh.name||'') || mesh.primitives.some(p=>/halo/i.test(gltf.materials?.[p.material]?.name||''))).map(mesh=>mesh.name);
  } else if (extension==='.obj') {
    const text=bytes.toString('utf8');
    if (!/^v\s+[-\d.]/m.test(text) || !/^f\s+\d/m.test(text)) throw Error('Invalid OBJ');
  } else if (extension==='.mtl') {
    if(!/^newmtl\s+/m.test(bytes.toString('utf8'))) throw Error('Invalid MTL');
  } else if (bytes.length<32 || !(bytes.toString('ascii',1,4)==='PNG' || bytes.readUInt16BE(0)===0xffd8 || bytes.toString('ascii',8,12)==='WEBP')) throw Error('Invalid texture');
  await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,bytes);
  return {file:relative,url:url.href,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),...details};
}
for(const group of groups) {
  try {
    const candidates=index.students.filter(student=>(mapping[group]||[]).includes(student.id));
    const exact=candidates.filter(student=>student.characters.some(character=>normalize(character.devName)===normalize(group)));
    const matches=exact.length ? exact : candidates;
    if(matches.length!==1) throw Error(`Ambiguous or missing costume match: ${matches.map(s=>s.id).join(',')}`);
    const student=matches[0], models=[];
    for(const model of student.models.filter(model=>['body','halo'].includes(model.type))) {
      const files=[];
      for(const url of [...new Set([model.model_file,model.mtl_file,...(model.texture||[])].filter(Boolean))]) files.push(await download(url,model.id));
      models.push({id:model.id,name:model.name,type:model.type,communityModel:/unofficial/i.test(model.name),files});
    }
    records.push({group,kivoId:student.id,name:student.names.zh,source:`https://kivo.wiki/student/${student.id}`,status:'downloaded-needs-render-validation',models});
    console.log(`${group}: downloaded ${models.length} body/halo models`);
  } catch(error) {failures.push({group,error:error.message});console.error(`${group}: ${error.message}`);}
  const target=path.join(directory,'manifest.json');
  await fs.writeFile(target+'.tmp',JSON.stringify({source:'https://kivo.wiki/',records,failures},null,2));await fs.rename(target+'.tmp',target);
}
if(failures.length)process.exitCode=1;
