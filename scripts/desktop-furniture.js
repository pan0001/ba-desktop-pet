import * as THREE from '../assets/vendor/three/three.module.min.js';
import { GLTFLoader } from '../assets/vendor/three/GLTFLoader.js';
import { prepareMaterials } from './ba-model-materials.js';
import { createPoseGeometry } from './pose-geometry.js';
import { FURNITURE, furnitureInteraction } from './furniture-catalog.js';
import { furnitureClipName } from './furniture-rules.js';
export { FURNITURE, furnitureInteraction } from './furniture-catalog.js';
export async function createDesktopFurniture(kind, { signal, characterId } = {}) {
  const item = FURNITURE[kind]; if (!item) throw Error('Unknown furniture');
  const response = await fetch(new URL('../' + item.file, import.meta.url), { signal });
  if (!response.ok) throw Error(`Furniture request failed (${response.status})`);
  const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), new URL('../', import.meta.url).href);
  const root = gltf.scene, group = new THREE.Group(), orientation = new THREE.Group();
  group.add(orientation); orientation.add(root);
  group.rotation.y = 1.12;
  const mixer = new THREE.AnimationMixer(root), pose = createPoseGeometry();
  prepareMaterials(root);
  const animation = furnitureInteraction(item, characterId);
  let clip = gltf.animations.find(c => c.name === furnitureClipName(item, animation));
  let action = clip && mixer.clipAction(clip).play(); mixer.update(0);
  // Static meshes already have the glTF Y-up conversion baked in. Animated
  // prefabs need the FBX root's +90° basis exactly once; some exported clips
  // overwrite that root rotation with identity. Compensate that basis only.
  if (gltf.parser.json.skins?.length) orientation.quaternion.setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2)
    .multiply(root.children[0].quaternion.clone().invert());
  if (item.orientationExtraX) orientation.rotateX(item.orientationExtraX);
  const bounds = () => pose.bounds(pose.refresh(group));
  let disposed = false;
  function dispose() {
    if (disposed) return; disposed = true; mixer.stopAllAction(); mixer.uncacheRoot(root);
    const textures = new Set(), materials = new Set(), geometries = new Set(), skeletons = new Set();
    root.traverse(node => { if(node.geometry)geometries.add(node.geometry);if(node.skeleton)skeletons.add(node.skeleton);for(const material of [node.material].flat().filter(Boolean))materials.add(material); });
    for(const material of materials){for(const value of Object.values(material))if(value?.isTexture)textures.add(value);material.dispose();}
    textures.forEach(t=>{t.dispose();t.source?.data?.close?.();});geometries.forEach(g=>g.dispose());skeletons.forEach(s=>s.dispose());group.removeFromParent();
  }
  if(signal?.aborted){dispose();throw new DOMException('Furniture load cancelled','AbortError');}
  const box=bounds();if(box.isEmpty()||!Number.isFinite(box.getSize(new THREE.Vector3()).length())){dispose();throw Error('Furniture has no finite geometry');}
  return { group, root, item, animation, nativeBounds: box.clone(), bounds, dispose,
    setAnimation(characterAnimation) {
      const next = gltf.animations.find(c => c.name === characterAnimation) || gltf.animations.find(c => c.name === furnitureClipName(item, characterAnimation));
      if (next === clip) return;
      action?.stop(); clip = next; action = clip && mixer.clipAction(clip).reset().play(); mixer.update(0);
    },
    update(delta, time) { if(disposed)return;if(action && Number.isFinite(time)){mixer.setTime(time);}else mixer.update(delta); },
    diagnostics: () => ({ id:kind, meshes:gltf.parser.json.meshes?.length||0, animation:clip?.name||null, characterAnimation:animation, time:action?.time||0 }) };
}
