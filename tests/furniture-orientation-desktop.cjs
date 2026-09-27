const {_electron:electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-results/furniture-orientation');
(async()=>{fs.mkdirSync(output,{recursive:true});const env={...process.env,BA_PET_TEST_PROFILE:path.join(output,'profile-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({args:[root,'--test-mode','--measure-pet'],env});try{
 const pet=await app.firstWindow();await pet.waitForSelector('#stage[data-state="ready"]');await pet.evaluate(()=>window.pet.update({paused:false,roaming:false,voiceEnabled:false,proactiveEvents:false}));
 const next=app.waitForEvent('window');await pet.evaluate(()=>window.pet.scene('placeFurniture',{kind:'sofa'}));const page=await next;await page.waitForSelector('#stage[data-state="ready"]');
 await page.evaluate(()=>window.furnitureSceneTest.reviewOccupants([{actorId:'review',characterId:'212'}]));
 const sample=await page.evaluate(async()=>{const {createDesktopFurniture}=await import('../scripts/desktop-furniture.js');const prop=await createDesktopFurniture('sofa');prop.setAnimation('Aris_Original_Cafe_my_gamedevdept_01_sofa_01_01');prop.update(0,0);const outer=prop.root.children[0],initial=outer.quaternion.clone(),bone=prop.root.getObjectByName('bone_sofa_01'),pose=bone.quaternion.clone();let maximum=0,moving=0;const frames=[];
 for(let t=0;t<=34;t+=.2){prop.update(0,t);maximum=Math.max(maximum,initial.angleTo(outer.quaternion));moving=Math.max(moving,pose.angleTo(bone.quaternion));frames.push({time:t,root:outer.quaternion.toArray(),bounds:prop.bounds().getSize(new (await import('../assets/vendor/three/three.module.min.js')).Vector3()).toArray()});}prop.dispose();return{maximum,moving,frames};});
 await page.waitForTimeout(6500);await page.screenshot({path:path.join(output,process.env.BA_CAPTURE_BEFORE?'before.png':'after.png')});
 fs.writeFileSync(path.join(output,process.env.BA_CAPTURE_BEFORE?'before.json':'after.json'),JSON.stringify(sample,null,2));
 if(!process.env.BA_CAPTURE_BEFORE){assert.ok(sample.maximum<1e-5,'Sofa outer root must stay fixed for more than two complete interaction cycles');assert.ok(sample.moving>.1,'Internal authored cushion/prop motion must remain');}
 console.log(JSON.stringify({rootRotationDegrees:sample.maximum*180/Math.PI,internalMotionDegrees:sample.moving*180/Math.PI,samples:sample.frames.length}));
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
