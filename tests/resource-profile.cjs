// Seed explicitly selected resources for deterministic packaged rendering tests.
// Public downloads and fresh-install behavior are covered by resources-desktop.
const fs=require('node:fs'),path=require('node:path');
function prepareResourceProfile(profile,ids=['212']){
 const root=path.resolve(__dirname,'..'),catalog=require('../assets/resource-catalog.json'),index={};
 for(const id of new Set(ids.flatMap(id=>catalog.characters[id]))){const p=catalog.packs[id];for(const f of p.files){const target=path.join(profile,'resources/packs',id,p.revision,f.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,f.path),target);}index[id]={revision:p.revision,files:p.files};}
 fs.writeFileSync(path.join(profile,'resources/installed.json'),JSON.stringify(index));
}
module.exports={prepareResourceProfile};
