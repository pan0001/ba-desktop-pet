const fs=require('node:fs'),path=require('node:path');
const {hashFile,digest,writePack,validateCatalog}=require('../electron/resource-pack.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'dist/resource-packs');
const chars=require('../assets/characters.json'),voices=require('../assets/voices/catalog.json'),furniture=require('../assets/furniture/models.json').items;
async function buildResources(){
 fs.mkdirSync(out,{recursive:true});const groups=new Map(),characters={},furnitureMap={};
 const add=(id,kind,file)=>{if(!groups.has(id))groups.set(id,{kind,paths:new Set()});groups.get(id).paths.add(file);};
 for(const c of chars){const id='student-'+c.id;add(id,'student',c.file);const refs=new Set([id]);
  for(const lines of Object.values(voices.students[c.studentId]?.languages||{}))for(const line of lines){const voice='voice-'+line.file.split('/')[2].toLowerCase();add(voice,'voice',line.file);refs.add(voice);}characters[c.id]=[...refs].sort();
 }
 for(const item of Object.values(furniture)){const id='furniture-'+item.category.toLowerCase();add(id,'furniture',item.file);furnitureMap[item.id]=[id];}
 const packs={};let count=0;
 for(const [id,group]of groups){const files=[];for(const file of [...group.paths].sort()){const full=path.join(root,file);files.push({path:file,size:fs.statSync(full).size,sha256:await hashFile(full)});}
  const revision=digest(Buffer.from(JSON.stringify(files))),asset=`${id}.${revision.slice(0,16)}.bap.gz`,target=path.join(out,asset);
  if(!fs.existsSync(target)){const temp=target+'.tmp';if(fs.existsSync(temp))fs.unlinkSync(temp);await writePack(root,files,temp);fs.renameSync(temp,target);}
  packs[id]={kind:group.kind,revision,asset,size:fs.statSync(target).size,sha256:await hashFile(target),files};
  if(++count%25===0)console.log(`Prepared ${count}/${groups.size} resource packs`);
 }
 const output={schemaVersion:1,generatedAt:new Date().toISOString(),packs,characters,furniture:furnitureMap};
 const catalogFile=path.join(root,'assets/resource-catalog.json');let previous;try{previous=JSON.parse(fs.readFileSync(catalogFile));}catch{}
 if(previous&&JSON.stringify({...previous,generatedAt:null})===JSON.stringify({...output,generatedAt:null}))output.generatedAt=previous.generatedAt;
 validateCatalog(output);const json=JSON.stringify(output);fs.writeFileSync(catalogFile,json+'\n');fs.writeFileSync(path.join(out,'resource-catalog.json'),json+'\n');
 console.log(JSON.stringify({packs:count,compressedBytes:Object.values(packs).reduce((n,p)=>n+p.size,0),catalogBytes:json.length}));return output;
}
module.exports={buildResources};if(require.main===module)buildResources().catch(e=>{console.error(e);process.exitCode=1});
