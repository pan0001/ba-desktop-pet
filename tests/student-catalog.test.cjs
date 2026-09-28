const {test}=require('node:test'),assert=require('node:assert/strict');
const {createStudentCatalog}=require('../electron/student-catalog.cjs');
test('voice banks preserve complete lines and languages but never include unrelated students',async()=>{
 const catalog=require('../assets/voices/catalog.json');let reads=0;
 const serve=createStudentCatalog('unused',async()=>{reads++;return JSON.stringify(catalog);});
 const ids=Object.keys(catalog.students).slice(0,4);
 const responses=await Promise.all(ids.map(id=>serve(id)));
 for(let i=0;i<ids.length;i++){
  const body=await responses[i].json();assert.deepEqual(Object.keys(body.students),[ids[i]]);
  assert.deepEqual(body.students[ids[i]],catalog.students[ids[i]]);
 }
 assert.equal(reads,1,'concurrent windows share one catalogue load');
 assert.equal((await serve('../catalog')).status,400);
 assert.equal((await serve('__proto__')).status,400);
 assert.deepEqual((await (await serve('99999999')).json()).students['99999999'].languages,{});
 assert.equal(reads,1);
});
test('a temporary catalogue read failure does not poison later requests',async()=>{
 let reads=0;const serve=createStudentCatalog('unused',async()=>{if(!reads++)throw Error('temporary');return '{"students":{}}';});
 await assert.rejects(serve('1'),/temporary/);assert.equal((await serve('1')).status,200);assert.equal(reads,2);
});
test('committed byte index reads every original bank without parsing the full catalogue',async()=>{
 const fs=require('node:fs/promises'),path=require('node:path');
 const file=path.resolve(__dirname,'../assets/voices/catalog.json'),indexFile=path.resolve(__dirname,'../assets/voices/catalog-index.json');
 const catalog=require(file);let fullReads=0;
 const serve=createStudentCatalog(file,async(name,...args)=>{if(name===file)fullReads++;return fs.readFile(name,...args);},indexFile);
 for(const [id,bank]of Object.entries(catalog.students))assert.deepEqual((await (await serve(id)).json()).students[id],bank);
 assert.equal(fullReads,0,'only stream checksum and small byte-range reads are needed');
});
test('index scanner handles multibyte subtitles, quoted braces, escaped quotes and nested objects',async()=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ba-bank-index-')),file=path.join(dir,'catalog.json');
 const catalog={schemaVersion:1,students:{'1':{studentId:1,text:'老师 { \\" } 日本語',languages:{jp:[{text:'你好'}]}},'2':{studentId:2,text:'学生二'}}};
 fs.writeFileSync(file,JSON.stringify(catalog,null,2));
 const index=require('../tools/build-voice-index.cjs').buildVoiceIndex(file);
 for(const [id,entry]of Object.entries(index.students))assert.deepEqual(JSON.parse(fs.readFileSync(file).subarray(entry.offset,entry.offset+entry.length)),catalog.students[id]);
 const indexFile=path.join(dir,'index.json');index.sha256='bad';fs.writeFileSync(indexFile,JSON.stringify(index));
 const serve=createStudentCatalog(file,undefined,indexFile);
 assert.deepEqual((await (await serve('1')).json()).students['1'],catalog.students['1'],'invalid hash falls back without losing lines');
});
