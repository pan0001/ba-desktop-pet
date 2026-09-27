const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../..');
(async () => {
  const env = {...process.env, BA_PET_TEST_PROFILE:path.join(root,'test-results/seat-inspection-profile')}; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({args:[root,'--test-mode','--measure-pet'],env});
  try {
    const page = await app.firstWindow(); await page.waitForSelector('#stage[data-state="ready"]',{timeout:60000});
    await page.evaluate(()=>window.pet.update({paused:true,voiceEnabled:false,roaming:false}));
    const result = await page.evaluate(async (all) => {
      const {loadSceneCharacter} = await import('./scripts/scene-character.js');
      const {FURNITURE,furnitureInteraction} = await import('./scripts/furniture-catalog.js');
      const THREE = await import('./assets/vendor/three/three.module.min.js');
      const chars = (await window.pet.getState()).characters, out = {};
      for (const item of Object.values(FURNITURE)) {
        const ids = Object.keys(item.candidates).filter(id=>furnitureInteraction(item,id));
        if (ids.length<(all?1:2)) continue;
        out[item.id] = {};
        for (const id of ids) {
          const actor = await loadSceneCharacter(chars.find(c=>c.id===id));
          const clip = actor.clips.find(c=>c.name===furnitureInteraction(item,id));
          actor.mixer.clipAction(clip).play(); actor.mixer.setTime(.5);
          actor.root.updateMatrixWorld(true);
          let bone=actor.root.getObjectByName('Bip001');
          actor.root.traverse(n=>{if(n.isBone&&/bip.*[ _]pelvis$/i.test(n.name))bone=n;});
          out[item.id][id] = {clip:clip.name,height:actor.height,position:bone?.getWorldPosition(new THREE.Vector3()).toArray()||null};
          actor.dispose();
        }
      }
      return out;
    },process.argv.includes('--all'));
    fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
    fs.writeFileSync(path.join(root,'test-results/furniture-seat-inspection.json'),JSON.stringify(result,null,2));
    if(process.argv.includes('--write')){
      const file=path.join(root,'assets/furniture/seats.json'),data=JSON.parse(fs.readFileSync(file));
      for(const [kind,layout] of Object.entries(data.items)){
        const reference=result[kind]?.[Object.keys(layout.roles)[0]];
        if(reference?.height>0)layout.scale=2.8/reference.height;
      }
      fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
    }
    console.log(JSON.stringify(result,null,2));
  } finally { await app.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
