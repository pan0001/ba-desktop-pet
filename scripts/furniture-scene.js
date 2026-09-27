import * as THREE from '../assets/vendor/three/three.module.min.js';
import { createDesktopFurniture, furnitureInteraction } from './desktop-furniture.js';
import { createToonRenderer } from './toon-renderer.js';
import { loadSceneCharacter } from './scene-character.js';
import { getModelBounds } from './model-viewer.js';
import { collisionMaterial } from './model-collision.js';
import layouts from '../assets/furniture/seats.json' with {type:'json'};

// One depth buffer and one clock for the furniture and all of its occupants.
// Every seated student uses the original shared prefab origin, not a hand-placed
// screen offset or an independently fitted camera.
export async function mountFurnitureScene(container, kind, {onGeometry,onLoaded,onError}={}) {
  const request=new AbortController(), actors=new Map(); let disposed=false, paused=false, raf=0,last=0,time=0,revision=0,toon,renderRevision=0,hitKey='',hitValue=null;
  const scene=new THREE.Scene(), turn=new THREE.Group(), content=new THREE.Group();
  scene.add(turn);turn.add(content);turn.rotation.y=1.12;
  scene.add(new THREE.AmbientLight(0xffffff,1.1),new THREE.HemisphereLight(0xf1f7ff,0xdad5e8,.7));
  const key=new THREE.DirectionalLight(0xfff5ec,1.4);key.position.set(3,4,6);scene.add(key);
  const fill=new THREE.DirectionalLight(0xe8f1ff,.6);fill.position.set(-4,2,4);scene.add(fill);
  const camera=new THREE.OrthographicCamera(-4.727,4.727,4.727,-4.727,.01,1000);
  camera.position.set(0,1.4,30);camera.lookAt(0,1.4,0);camera.updateMatrixWorld();
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping;
  container.append(renderer.domElement);
  let prop;
  try {prop=await createDesktopFurniture(kind,{signal:request.signal});}
  catch(error){renderer.dispose();renderer.domElement.remove();throw error;}
  prop.group.rotation.y=0;content.add(prop.group);
  let scale=layouts.items[kind]?.scale||256.75;
  const raw=getModelBounds(prop.group),size=raw.getSize(new THREE.Vector3());
  // Decorative architecture can be enormous. Its camera remains fixed after
  // placement, while supported interactions retain their authored unit scale.
  if(!layouts.items[kind])scale=Math.min(scale,5/Math.max(size.x,size.z),4.8/size.y);
  content.scale.setScalar(scale);content.position.y=-raw.min.y*scale;
  if(!layouts.items[kind]){turn.rotation.x=.2;const box=getModelBounds(turn),center=box.getCenter(new THREE.Vector3());turn.position.x=-center.x;turn.position.z=-center.z;turn.position.y=-box.min.y;}
  const rebuild=()=>{toon?.dispose();toon=createToonRenderer(renderer,scene,camera,scene);};rebuild();
  const pixel=p=>{p.project(camera);return {x:(p.x+1)*container.clientWidth/2,y:(1-p.y)*container.clientHeight/2};};
  function bounds(root){const b=getModelBounds(root),a=pixel(b.min.clone()),z=pixel(b.max.clone());return {left:a.x,right:z.x,top:z.y,bottom:a.y};}
  function geometry(){const b=bounds(prop.group);return {...b,floor:pixel(new THREE.Vector3(0,0,0)).y};}
  function resize(){renderer.setSize(container.clientWidth,container.clientHeight,false);onGeometry?.(geometry());render();}
  function render(){if(!disposed){scene.updateMatrixWorld(true);toon.render();renderRevision++;}}
  function tick(now){raf=0;if(disposed||paused||(!actors.size&&!prop.diagnostics().animation))return;if(!last||now-last>=1000/30-1){const dt=last?Math.min(.1,(now-last)/1000):0;last=now;time+=dt;prop.update(dt,time);for(const a of actors.values()){a.mixer.setTime(time);a.mouth?.update(dt);}render();}raf=requestAnimationFrame(tick);}
  const observer=new ResizeObserver(resize);observer.observe(container);resize();raf=requestAnimationFrame(tick);
  async function setOccupants(entries,characters){
    const ticket=++revision;
    const wanted=new Set(entries.map(e=>e.actorId));
    for(const [id,a]of actors)if(!wanted.has(id)||entries.find(e=>e.actorId===id)?.resourceRevision!==a.entry.resourceRevision){a.dispose();actors.delete(id);}
    rebuild();
    for(const entry of entries){
      if(actors.has(entry.actorId))continue;
      try{
        const actor=await loadSceneCharacter(characters.find(c=>c.id===entry.characterId),request.signal);
        if(disposed||ticket!==revision){actor.dispose();return;}
        actor.entry=entry;actors.set(entry.actorId,actor);content.add(actor.root);
      }catch(error){if(!disposed&&ticket===revision)onError?.(entry.actorId,error);}
    }
    if(disposed||ticket!==revision)return;
    const layout=layouts.items[kind],paired=actors.size>1;
    for(const a of actors.values()){
      const name=paired&&layout?.pairedClips?.[a.entry.characterId]||furnitureInteraction(prop.item,a.entry.characterId);
      const clip=a.clips.find(c=>c.name===name);
      if(!clip){onError?.(a.entry.actorId,Error('Missing authored seat animation'));continue;}
      a.mixer.stopAllAction();a.clip=clip.name;a.mixer.clipAction(clip).reset().play();a.mixer.setTime(time);
    }
    prop.setAnimation(paired&&layout?.pairedFurnitureClip||[...actors.values()][0]?.clip);
    prop.update(0,time);rebuild();render();
    if(!paused&&!raf){last=0;raf=requestAnimationFrame(tick);}
    for(const a of actors.values())onLoaded?.(a.entry.actorId);
  }
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
  function hit(x,y){
    const key=`${x}:${y}:${renderRevision}`;if(key===hitKey)return hitValue;hitKey=key;hitValue=null;
    pointer.set(x/container.clientWidth*2-1,1-y/container.clientHeight*2);ray.setFromCamera(pointer,camera);scene.updateMatrixWorld(true);
    const meshes=[];scene.traverse(n=>{if(n.isMesh&&n.visible&&!n.userData.paCollapsedProp){if(n.isSkinnedMesh){n.computeBoundingSphere();n.computeBoundingBox();}meshes.push(n);}});
    for(const h of ray.intersectObjects(meshes,false)){
      let owner=null;for(const [id,a]of actors){let node=h.object;while(node){if(node===a.root){owner=id;break;}node=node.parent;}if(owner)break;}
      const material=Array.isArray(h.object.material)?h.object.material[h.face.materialIndex]:h.object.material;
      if(owner&&!collisionMaterial(material))continue;
      return hitValue={actorId:owner};
    }return null;
  }
  return {setOccupants,hit,geometry,
    pause(value){paused=Boolean(value);last=0;cancelAnimationFrame(raf);if(!paused)raf=requestAnimationFrame(tick);},
    diagnostics(){return {kind,time,geometry:geometry(),furniture:prop.diagnostics(),actors:[...actors].map(([id,a])=>({id,characterId:a.entry.characterId,clip:a.clip,time:a.mixer.time,bounds:bounds(a.root)}))};},
    dispose(){disposed=true;revision++;request.abort();cancelAnimationFrame(raf);observer.disconnect();actors.forEach(a=>a.dispose());actors.clear();toon.dispose();prop.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}
  };
}
