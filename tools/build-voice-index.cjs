const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
function buildVoiceIndex(file) {
 const bytes=fs.readFileSync(file),catalog=JSON.parse(bytes),students={};
 // The source catalogue is pretty-printed. Locate a bank, then scan balanced
 // JSON strings/objects using byte offsets (Chinese text must not use UTF-16 offsets).
 for(const [id,bank]of Object.entries(catalog.students)){
  const marker=Buffer.from('\n    '+JSON.stringify(id)+': {');
  const found=bytes.indexOf(marker);if(found<0)throw Error('Unsupported catalogue layout: '+id);
  const start=found+marker.length-1;let depth=0,string=false,escape=false,end=start;
  for(;end<bytes.length;end++){
   const byte=bytes[end];
   if(string){if(escape)escape=false;else if(byte===92)escape=true;else if(byte===34)string=false;}
   else if(byte===34)string=true;
   else if(byte===123)depth++;
   else if(byte===125&&--depth===0){end++;break;}
  }
  assert.deepEqual(JSON.parse(bytes.subarray(start,end)),bank,'Index must select the exact original student');
  students[id]={offset:start,length:end-start};
 }
 return {schemaVersion:1,catalogSchemaVersion:catalog.schemaVersion,size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),students};
}
if(require.main===module){const file=path.resolve(__dirname,'../assets/voices/catalog.json');fs.writeFileSync(path.join(path.dirname(file),'catalog-index.json'),JSON.stringify(buildVoiceIndex(file),null,2)+'\n');console.log('Voice byte index generated');}
module.exports={buildVoiceIndex};
