const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),source=path.resolve(process.argv[2]||'');
if(!process.argv[2])throw Error('Pass the furniture export directory');
const coverage=JSON.parse(fs.readFileSync(path.join(source,'coverage.json'))),characters=require('../../assets/characters.json');
const aliases={my_gamedevdept_01_sofa_01:'sofa',my_event12_gamemachine:'arcade'};
const categories=[['sofa|chair|bench|stool','座椅','Seats','椅子'],['table|desk|counter','桌台','Tables','テーブル'],['game|arcade|dart|pinball','娱乐','Games','ゲーム'],['bed|hammock','床铺','Beds','ベッド'],['carpet|rug|floor','地面','Floor','床'],['wall|partition|curtain|door|window','墙面','Walls','壁'],['light|lamp','照明','Lights','照明'],['plant|flower|tree|garden','绿植','Plants','植物']];
const overrides=require('./furniture-overrides.json');
const items={},excluded=[];let total=0;
for(const row of coverage){if(row.status!=='converted'){excluded.push({id:row.id,reason:'export-failed'});continue;}
const bytes=fs.readFileSync(path.join(source,row.id,'model.glb')),doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
if(!doc.images?.length){excluded.push({id:row.id,reason:'missing-textures'});continue;}
const id=aliases[row.id]||row.id,category=categories.find(c=>new RegExp(c[0],'i').test(row.id))||['','摆件','Decor','装飾'];
const file=`assets/furniture/models/${row.id}.glb`;fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.copyFileSync(path.join(source,row.id,'model.glb'),path.join(root,file));
const expression=new RegExp('(?:^|_)'+row.id+'(?:_|$)','i');const candidates={};
for(const c of characters){const clips=c.animations.filter(n=>/cafe|coffee/i.test(n)&&expression.test(n));if(clips.length)candidates[c.id]=clips;}
const number=String(Object.keys(items).length+1).padStart(4,'0');
const names=id==='sofa'?{zh:'游戏开发部沙发',ja:'ゲーム開発部のソファ',en:'Game Development Club Sofa'}:id==='arcade'?{zh:'双人游戏机',ja:'対戦ゲーム機',en:'Two-player Arcade'}:{zh:`${category[1]} ${number}`,ja:`${category[3]} ${number}`,en:`${category[2]} ${number}`};
items[id]={id,prefab:row.id,names,category:category[2],file,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,animations:row.report.animations,missingAnimations:row.missingAnimations,candidates,sourceBundle:row.source,thumbnail:`assets/furniture/previews/${id}.png`,...overrides[id]};total+=bytes.length;
}
fs.writeFileSync(path.join(root,'assets/furniture/models.json'),JSON.stringify({schemaVersion:1,source:'local-game-prefabs',items,excluded},null,2)+'\n');console.log({installed:Object.keys(items).length,excluded:excluded.length,bytes:total,candidatePairs:Object.values(items).reduce((n,x)=>n+Object.keys(x.candidates).length,0)});
