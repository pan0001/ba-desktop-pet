// Shared production material, coordinate, halo and face repairs for seated students.
import * as THREE from '../assets/vendor/three/three.module.min.js';
import { GLTFLoader } from '../assets/vendor/three/GLTFLoader.js';
import { prepareMaterials, prepareAnimations, bindHalo, attachMouth } from './ba-model-materials.js';
import { releaseObject, loadReplacementHalo, loadMouthTexture, getModelBounds, selectModelAnimations } from './model-viewer.js';
import { createMouthMotion } from './mouth-motion.js';

export async function loadSceneCharacter(model, signal = new AbortController().signal) {
  const url = new URL('../' + model.file, import.meta.url);
  const response = await fetch(url, {signal});
  if (!response.ok) throw Error(`Student request failed (${response.status})`);
  const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), new URL('.', url).href);
  const root = gltf.scene;
  let mouthTexture, mouth;
  try {
    prepareMaterials(root);
    const clips = prepareAnimations(root, gltf.animations);
    bindHalo(root);
    await loadReplacementHalo(root, signal);
    mouthTexture = await loadMouthTexture(signal);
    if (attachMouth(root, mouthTexture)) { mouth = createMouthMotion(mouthTexture); mouthTexture = null; }
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const mixer = new THREE.AnimationMixer(root);
    const initial = selectModelAnimations(clips).idle;
    const reference = initial && mixer.clipAction(initial).play(); mixer.update(0);
    const height = getModelBounds(root).getSize(new THREE.Vector3()).y;
    reference?.stop();
    return {root, clips, mixer, height, mouth,
      dispose() { mixer.stopAllAction(); mixer.uncacheRoot(root); root.removeFromParent(); releaseObject(root); }
    };
  } catch (error) { releaseObject(root); throw error; }
  finally { mouthTexture?.dispose(); mouthTexture?.source?.data?.close?.(); }
}
