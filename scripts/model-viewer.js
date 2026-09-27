/**
 * Lazy 3D preview for Kivo's self-contained body GLBs.
 * This module and every runtime dependency are local; no CDN is contacted.
 */
import * as THREE from '../assets/vendor/three/three.module.min.js';
import { GLTFLoader } from '../assets/vendor/three/GLTFLoader.js';
import { OrbitControls } from '../assets/vendor/three/OrbitControls.js';
import { prepareMaterials, prepareAnimations, attachMouth, bindHalo, setMouthFrame, MOUTH_ATLAS } from './ba-model-materials.js';
import { createToonRenderer } from './toon-renderer.js';
import { createSecondaryMotion } from './secondary-motion.js';
import { collisionMaterial, referencedVertices, isCollisionHit } from './model-collision.js';
import { FURNITURE, createDesktopFurniture } from './desktop-furniture.js';
import { createPoseGeometry } from './pose-geometry.js';
import { createMouthMotion } from './mouth-motion.js';

// Bounds must not depend on a prior WebGL render. Offscreen/paused first loads
// still need current skin matrices before Box3 applies vertex bone transforms.
const poseGeometry = new WeakMap();
export function getModelBounds(object, relativeTo = null, materialFilter = null) {
  let geometry = poseGeometry.get(object);
  if (!geometry) { geometry = createPoseGeometry(); poseGeometry.set(object, geometry); }
  return geometry.bounds(geometry.refresh(object), relativeTo, materialFilter);
}

// Yuuka's toy lands in front of her after Victory_Start. A standing-only fit
// clips Peroro at the bottom. Cache the union once, without following the pose
// or moving the user's camera during an interaction.
export function includeModelPropBounds(root, clips, bounds) {
  const toy=root.getObjectByName('CH0284_SkillProp_Outline');
  const end=clips.find(clip=>clip.name==='CH0284_Victory_End');
  if (!toy?.isSkinnedMesh || toy.parent?.name!=='CH0284_1' || !end) return bounds;
  const mixer=new THREE.AnimationMixer(root);
  try {
    mixer.clipAction(end).play();mixer.update(0);
    return bounds.clone().union(getModelBounds(root));
  } finally {
    mixer.stopAllAction();mixer.uncacheRoot(root);root.updateMatrixWorld(true);
  }
}

// Exact suffixes deliberately exclude paired/Random/Camera variants. Some exports
// also contain another costume's Pickup; prefer the current victory clip's prefix.
export function selectModelAnimations(clips) {
  const usable = clips.filter(clip => clip.duration > 0 && Number.isFinite(clip.duration));
  const end = usable.find(clip => /_Victory_End$/i.test(clip.name));
  const prefix = end?.name.replace(/Victory_End$/i, '');
  const find = pattern => usable.find(clip => pattern.test(clip.name) && (!prefix || clip.name.startsWith(prefix)))
    || usable.find(clip => pattern.test(clip.name));
  return {
    start: find(/_Victory_Start$/i), end,
    pickup: find(/_(?:Formation_)?Pick_?up$/i),
    idle: find(/_(?:Cafe|Coffee)_Idle$/i) || find(/_Formation_Idle$/i) || find(/_Normal_Idle$/i) || end || usable[0],
    reaction: find(/_(?:Cafe|Coffee)_Reaction$/i),
    walk: find(/_(?:Cafe|Coffee)_Walk$/i) || find(/_Move_Ing$/i),
    down: find(/_Vital_Death$/i)
  };
}

// These exports have a fall but no stand-up clip. Sample it backwards into a
// separate clip, leaving the source animation and GLB untouched.
export function makeRecoveryClip(clip, quick = false) {
  if (!clip) return null;
  const from = clip.duration * (quick ? .38 : 1), duration = quick ? .65 : Math.min(1.6, clip.duration);
  const count = Math.ceil(duration * 60), times = Array.from({ length: count + 1 }, (_, i) => duration * i / count);
  const tracks = clip.tracks.map(track => {
    const interpolant = track.createInterpolant(), values = [];
    const size = track.ValueTypeName === 'quaternion' ? 4 : track.ValueTypeName === 'vector' ? 3 : track.getValueSize();
    for (let i = 0; i <= count; i++) {
      // A reversed impact starts/ends too abruptly at constant speed. Ease its
      // sampling time so rising settles before the blend back to standing.
      const progress = i / count, eased = progress * progress * (3 - 2 * progress);
      values.push(...Array.from(interpolant.evaluate(from * (1 - eased))).slice(0, size));
    }
    return new track.constructor(track.name, times, values);
  });
  return new THREE.AnimationClip(`${clip.name}_${quick ? 'QuickRise' : 'Rise'}`, duration, tracks);
}

// Animation time, not wall-clock timers, drives transitions, so pause, hidden tabs
// and reduced motion cannot skip an intro or complete an interaction offscreen.
export const MODEL_TRANSITION_SECONDS = 0.24;
export function createModelAnimationPlayer(mixer, clips, onChange = () => {}, onReaction = () => {}) {
  const choices = selectModelAnimations(clips);
  const rest = choices.idle || choices.end;
  let action = null, next = null, finished = false, disposed = false;
  let mode = 'idle', elapsed = 0, onceDuration = 0;
  let reactionId = null, lastReactionId = null;
  const recovery = makeRecoveryClip(choices.down), quickRecovery = makeRecoveryClip(choices.down, true);
  const outgoing = [];
  const release = old => {
    old.stop();
    mixer.uncacheAction(old.getClip());
  };
  function blend(time) {
    let outgoingWeight = 0;
    for (let i = outgoing.length - 1; i >= 0; i--) {
      const entry = outgoing[i];
      const progress = THREE.MathUtils.clamp((time - entry.start) / entry.duration, 0, 1);
      if (progress >= 1) {
        release(entry.action); outgoing.splice(i, 1);
      } else {
        // Smoothstep eases both ends of the fade, with no change to clip speed.
        const weight = entry.weight * (1 - progress * progress * (3 - 2 * progress));
        entry.action.setEffectiveWeight(weight);
        outgoingWeight += weight;
      }
    }
    action?.setEffectiveWeight(Math.max(0, 1 - outgoingWeight));
  }
  function play(clip, once = false, after = null) {
    if (disposed || !clip) return false;
    const duration = Math.min(MODEL_TRANSITION_SECONDS, Math.max(0, clip.duration) / 4);
    if (action) {
      const weight = action.getEffectiveWeight();
      if (weight > 0 && duration > 0) outgoing.push({action, weight, start:mixer.time, duration});
      else release(action);
    }
    // A separate action can restart Pickup while its previous instance fades out.
    // Share immutable tracks, but never reset the outgoing action or source clip.
    const instance = new THREE.AnimationClip(clip.name, clip.duration, clip.tracks, clip.blendMode);
    action = mixer.clipAction(instance);
    next = after; finished = false;
    elapsed = 0; onceDuration = once ? clip.duration : 0;
    action.reset().setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    action.clampWhenFinished = once;
    action.play();
    blend(mixer.time);
    mixer.update(0);
    onChange(clip.name);
    return true;
  }
  const onFinished = event => { if (event.action === action && next) finished = true; };
  mixer.addEventListener('finished', onFinished);
  function resting() { reactionId = null; mode = 'idle'; return play(rest); }
  function rise(quick = false) {
    mode = 'recovering';
    const id = reactionId;
    const done = () => { resting(); onReaction({ id, phase: 'done' }); };
    if (!play(quick ? quickRecovery : recovery, true, done)) done();
  }
  return {
    start: resting,
    react: () => { if (reactionId !== null) return false; if (!choices.reaction) return resting(); mode = 'interaction'; return play(choices.reaction, true, rest); },
    pickUp: () => { if (!choices.pickup) return false; mode = 'interaction'; return play(choices.pickup, true, rest); },
    hold: () => { reactionId = null; mode = 'held'; return play(choices.pickup || rest, true); },
    rest: resting,
    landing(value) {
      if (!value) { if (reactionId !== null) resting(); return; }
      if (value.id === lastReactionId && reactionId === null) return;
      if (value.id === reactionId) { if (value.phase === 'rise' && mode === 'help') rise(); return; }
      lastReactionId = value.id;
      reactionId = value.id;
      if (value.outcome === 'quick' || !choices.down) { rise(true); return; }
      mode = 'landing';
      play(choices.down, true, () => {
        if (value.outcome === 'help') { next = null; mode = 'help'; onReaction({ id: value.id, phase: 'help' }); }
        else rise();
      });
    },
    walk: () => { if (!choices.walk || !['idle', 'walk'].includes(mode)) return false; if (mode === 'walk') return true; mode = 'walk'; return play(choices.walk); },
    stopWalking: () => { if (mode === 'walk') { mode = 'idle'; play(rest); } },
    furniture(name) {
      if (reactionId !== null || !['idle', 'walk', 'furniture'].includes(mode)) return false;
      const clip = clips.find(clip => clip.name === name); if (!clip) return false;
      if (mode === 'furniture' && action?.getClip().name === name) return true;
      mode = 'furniture'; return play(clip);
    },
    canWalk: () => Boolean(choices.walk),
    canFall: () => Boolean(choices.down),
    getMode: () => mode,
    getTime: () => action?.time || 0,
    getDuration: () => action?.getClip().duration || 0,
    setAnimation: name => play(clips.find(clip => clip.name === name)),
    getAnimation: () => action?.getClip().name || '',
    canPickUp: () => !!choices.pickup,
    update(delta) {
      if (disposed) return;
      blend(mixer.time + delta * mixer.timeScale);
      mixer.update(delta);
      elapsed += delta;
      // Do not re-enter AnimationMixer.update from its finished event listener.
      if (next && (finished || (onceDuration > 0 && elapsed >= onceDuration + .05))) {
        const destination = next; next = null; finished = false;
        if (typeof destination === 'function') destination();
        else { mode = 'idle'; play(destination); }
      }
    },
    dispose() {
      disposed = true; finished = false; next = null;
      mixer.removeEventListener('finished', onFinished);
      outgoing.forEach(entry => release(entry.action)); outgoing.length = 0;
      if (action) release(action);
      action = null;
    }
  };
}

// A tap must begin and end on the character. Dragging, pinching, wheel zoom and
// cancelled touch scrolling must never be interpreted as a Pickup interaction.
export function bindModelInteraction(element, hitTest, activate) {
  const pointers = new Set();
  let tap = null;
  function down(event) {
    pointers.add(event.pointerId);
    if (pointers.size !== 1 || event.button !== 0 || event.isPrimary === false) { tap = null; return; }
    tap = hitTest(event) ? {id:event.pointerId, x:event.clientX, y:event.clientY} : null;
  }
  function move(event) {
    if (tap?.id === event.pointerId && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 7) tap = null;
  }
  function up(event) {
    move(event);
    const clicked = tap?.id === event.pointerId && pointers.size === 1;
    pointers.delete(event.pointerId); tap = null;
    if (clicked && hitTest(event)) activate();
  }
  function cancel(event) { pointers.delete(event.pointerId); tap = null; }
  function wheel() { tap = null; }
  function key(event) {
    if (event.target !== element || !['Enter',' '].includes(event.key)) return;
    event.preventDefault();
    if (!event.repeat) activate();
  }
  const listeners = {pointerdown:down, pointermove:move, pointerup:up, pointercancel:cancel, lostpointercapture:cancel, wheel, keydown:key};
  // Capture precedes OrbitControls' releasePointerCapture on pointerup.
  const capture = {capture:true};
  for (const [type, handler] of Object.entries(listeners)) element.addEventListener(type, handler, capture);
  return () => {
    for (const [type, handler] of Object.entries(listeners)) element.removeEventListener(type, handler, capture);
    tap = null; pointers.clear();
  };
}

export function releaseObject(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const skeletons = new Set();
  root?.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.skeleton) skeletons.add(object.skeleton);
    const list = Array.isArray(object.material) ? object.material : [object.material];
    list.filter(Boolean).forEach(material => {
      materials.add(material);
      Object.values(material).forEach(value => {
        if (value?.isTexture) textures.add(value);
      });
    });
  });
  geometries.forEach(geometry => geometry.dispose());
  skeletons.forEach(skeleton => skeleton.dispose());
  materials.forEach(material => material.dispose());
  textures.forEach(texture => {
    texture.dispose();
    // GLTFLoader uses ImageBitmap where available; GPU disposal alone does not close it.
    texture.source?.data?.close?.();
  });
}

async function loadLocalTexture(url,signal) {
  const response = await fetch(url, {signal});
  if (!response.ok) throw new Error(`Texture request failed (${response.status}).`);
  const blob = await response.blob();
  let texture;
  if (typeof createImageBitmap === 'function') {
    texture = new THREE.Texture(await createImageBitmap(blob, {premultiplyAlpha:'none',colorSpaceConversion:'none'}));
  } else {
    const url=URL.createObjectURL(blob);
    try { texture=await new THREE.TextureLoader().loadAsync(url); }
    finally { URL.revokeObjectURL(url); }
  }
  if (signal.aborted) {
    texture.dispose();texture.source?.data?.close?.();
    throw new DOMException('Texture loading cancelled.', 'AbortError');
  }
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.needsUpdate=true;
  return texture;
}

export async function loadMouthTexture(signal) {
  const texture=await loadLocalTexture(MOUTH_ATLAS,signal);
  setMouthFrame(texture);
  return texture;
}

export async function loadReplacementHalo(root,signal) {
  if (root.getObjectByName('CH0214') && !root.getObjectByName('HaloRoot')) {
    const { MINORI_HALO_FILES, createMinoriHalo, attachMinoriHalo } = await import('./minori-halo.js');
    let texture, replacement;
    try {
      const results = await Promise.allSettled([
        fetch(MINORI_HALO_FILES.obj, { signal }).then(response => {
          if (!response.ok) throw Error(`Halo request failed (${response.status}).`);
          return response.text();
        }), loadLocalTexture(MINORI_HALO_FILES.texture, signal)
      ]);
      if (results[1].status === 'fulfilled') texture = results[1].value;
      const failure = results.find(result => result.status === 'rejected');
      if (failure) throw failure.reason;
      if (signal.aborted) throw new DOMException('Halo loading cancelled.', 'AbortError');
      replacement = createMinoriHalo(results[0].value, texture);
      if (attachMinoriHalo(root, replacement)) { replacement = null; texture = null; }
    } finally { releaseObject(replacement); texture?.dispose(); texture?.source?.data?.close?.(); }
    return;
  }
  if(!(root.getObjectByName('CH0069') || root.getObjectByName('Cafe_CH0069')) || !root.getObjectByName('CH0069_Halo'))return;
  const {MIKA_HALO_FILES,createMikaHalo,attachMikaHalo}=await import('./mika-halo.js');
  const readText=async url=>{
    const response=await fetch(url,{signal});
    if(!response.ok)throw new Error(`Halo request failed (${response.status}).`);
    return response.text();
  };
  let texture,replacement;
  try {
    // allSettled ensures resources that finish after a sibling failure are owned.
    const results=await Promise.allSettled([
      readText(MIKA_HALO_FILES.obj),readText(MIKA_HALO_FILES.mtl),loadLocalTexture(MIKA_HALO_FILES.texture,signal)
    ]);
    if(results[2].status==='fulfilled')texture=results[2].value;
    const failed=results.find(item=>item.status==='rejected');
    if(failed)throw failed.reason;
    if(signal.aborted)throw new DOMException('Halo loading cancelled.','AbortError');
    replacement=createMikaHalo(results[0].value,results[1].value,texture);
    if(attachMikaHalo(root,replacement)) {
      replacement=null; // Root owns geometry, materials and texture-source clones.
      texture.dispose();texture=null;
    }
  } finally {
    releaseObject(replacement);
    texture?.dispose();texture?.source?.data?.close?.();
  }
}

async function readModel(url, signal, status) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Model request failed (${response.status}).`);
  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body) return response.arrayBuffer();
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      status({ state: 'loading', loaded, total, progress: total ? loaded / total : 0 });
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  chunks.forEach(chunk => { bytes.set(chunk, offset); offset += chunk.byteLength; });
  return bytes.buffer;
}

/**
 * @param {HTMLElement} container Empty stage owned by this viewer.
 * @param {{file: string, name?: string}} model Catalog model, with a local GLB path.
 * @param {{onStatus?: Function, onAnimationChange?: Function, reducedMotion?: boolean, signal?: AbortSignal}} options
 * @returns {Promise<{dispose: Function, setAnimation: Function, getAnimations: Function,
 * getAnimation: Function, resetCamera: Function, setPaused: Function, isPaused: Function}>}
 */
export async function mount(container, model, options = {}) {
  if (!(container instanceof HTMLElement)) throw new TypeError('A viewer container is required.');
  if (!model?.file) throw new TypeError('A local model file is required.');
  if (location.protocol === 'file:') throw new Error('3D previews require a local HTTP server.');
  const status = value => options.onStatus?.(value);
  const request = new AbortController();
  const signal = options.signal;
  const abortRequest = () => request.abort(signal?.reason);
  if (signal?.aborted) abortRequest();
  else signal?.addEventListener('abort', abortRequest, { once: true });

  let renderer;
  let toonRenderer;
  let controls;
  let root;
  let mixer;
  let animationPlayer;
  let secondary;
  let motion = { vx: 0, mode: 'idle', direction: 1 };
  let rootBone, rootAnchor, headBone, pelvisBone;
  let furnitureChoice = 'none', furnitureProp = null, furnitureBlend = 0, furnitureRequest = null, furnitureSerial = 0;
  let footBones = [];
  let grabCandidate = null, pin = null;
  let releaseAnchor = null;
  const releaseOffset = new THREE.Vector3();
  let grabbedSurface = null;
  const pinPoint = new THREE.Vector3();
  const trianglePoints = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const rootPoint = new THREE.Vector3();
  let removeInteraction;
  let framingBounds;
  let resizeObserver;
  let intersectionObserver;
  let frame = 0;
  let disposed = false;
  let visible = true;
  let lastTime = 0;
  let paused = options.reducedMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
  let clips = [];
  let mouthMotion = null;
  let fitted = false;
  let lastWidth = 0, lastHeight = 0;
  let geometryRevision = 0, hitRevision = -1, hitEntries = [];
  const hitGeometry = createPoseGeometry();
  const scene = new THREE.Scene();
  const camera = options.desktop ? new THREE.OrthographicCamera(-2, 2, 2, -2, .01, 1000) : new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
  camera.aspect = 1;
  const wrapper = new THREE.Group();
  const support = new THREE.Group(), sway = new THREE.Group(), turn = new THREE.Group(), stride = new THREE.Group();
  scene.add(support); support.add(sway); sway.add(turn); turn.add(stride); stride.add(wrapper);
  // A soft studio rig: open up face/dress shadows without bleaching the textures.
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  scene.add(new THREE.HemisphereLight(0xf1f7ff, 0xdad5e8, .7));
  const keyLight = new THREE.DirectionalLight(0xfff5ec, 1.4);
  keyLight.position.set(3, 4, 6);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xe8f1ff, .6);
  fillLight.position.set(-4, 2, 4);
  scene.add(fillLight);

  function render() {
    geometryRevision++;
    if (!disposed && renderer && (options.desktop || !document.hidden) && visible) {
      if(toonRenderer)toonRenderer.render();else renderer.render(scene,camera);
    }
  }

  function tick(time, forcedDelta = null) {
    frame = 0;
    if (disposed || (!options.desktop && document.hidden) || !visible) return;
    if (forcedDelta === null && options.fps && lastTime && time - lastTime < 1000 / options.fps - 1) {
      frame = requestAnimationFrame(tick); return;
    }
    const delta = forcedDelta ?? (lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0);
    lastTime = time;
    if (!paused || forcedDelta !== null) {
      mouthMotion?.update(delta);
      secondary?.restore();
      if (furnitureProp?.animation && !pin && !motion.dragging && !motion.reaction && motion.mode !== 'fall') animationPlayer?.furniture(furnitureProp.animation);
      if (motion.mode === 'walk') animationPlayer?.walk(); else animationPlayer?.stopWalking();
      animationPlayer?.update(delta);
      support.position.set(0, 0, 0);
      stride.position.set(0, 0, 0);
      if (rootBone && rootAnchor && !pin && animationPlayer?.getMode() !== 'furniture') {
        // The desktop window owns travel. Use the same root anchor through
        // walking, falling, recovery and the blend back to Cafe_Idle.
        rootBone.getWorldPosition(rootPoint); turn.worldToLocal(rootPoint);
        stride.position.x = rootAnchor.x - rootPoint.x; stride.position.z = rootAnchor.z - rootPoint.z;
      }
      let reactionTop = null, captionTop = null;
      const usingFurniture = animationPlayer?.getMode() === 'furniture' && furnitureProp;
      furnitureBlend += ((usingFurniture ? 1 : 0) - furnitureBlend) * (1 - Math.exp(-delta * 12));
      if (furnitureProp) { furnitureProp.group.visible = !pin && !motion.dragging && motion.mode !== 'fall'; furnitureProp.update(delta, usingFurniture ? animationPlayer.getTime() : undefined); }
      const physics = secondary?.step(delta, usingFurniture ? 1.12 : null);
      let grabError = null;
      if (pin) {
        releaseAnchor = null; releaseOffset.set(0, 0, 0);
        // SkinnedMesh.updateMatrixWorld refreshes bindMatrixInverse. Merely
        // updating bone worlds leaves CPU skin queries in the previous frame.
        sway.updateMatrixWorld(true);
        // Reconstruct the clicked point from the posed triangle, including all
        // skin weights. A nearby bone is not an exact mouse attachment.
        surfacePoint(pin, pinPoint); sway.worldToLocal(pinPoint);
        pinPoint.applyQuaternion(sway.quaternion);
        sway.position.copy(pin.anchor).sub(pinPoint);
        sway.updateMatrixWorld(true);
        surfacePoint(pin, pinPoint); pinPoint.project(camera);
        grabError = Math.hypot((pinPoint.x + 1) * container.clientWidth / 2 - pin.x, (1 - pinPoint.y) * container.clientHeight / 2 - pin.y);
      } else {
        sway.position.set(0, 0, 0);
        // Contact uses the final blended pose, including body tilt, in world
        // space. Switching clips must not switch between foot joints and a
        // differently centered mesh box. Hair remains visual only.
        const posed = getModelBounds(wrapper, null, collisionMaterial);
        if (!posed.isEmpty()) {
          support.position.y = usingFurniture ? furnitureProp.groundOffset : -posed.min.y;
          // Hand off the suspended body's actual position to the ground frame
          // continuously. Resetting its grab translation or root anchor alone
          // would teleport it on the first released frame.
          if (releaseAnchor) {
            (rootBone || root).getWorldPosition(rootPoint);
            releaseOffset.copy(releaseAnchor).sub(rootPoint); releaseAnchor = null;
          } else releaseOffset.multiplyScalar(Math.exp(-delta * 10));
          if (motion.platform) releaseOffset.y = Math.max(0, releaseOffset.y);
          support.position.add(releaseOffset);
          captionTop = posed.max.y + support.position.y + .18;
          rootPoint.set(0, posed.max.y + support.position.y, 0).project(camera);
          if (['landing', 'recovering', 'help'].includes(animationPlayer?.getMode())) reactionTop = (1 - rootPoint.y) * container.clientHeight / 2;
        }
      }
      let speechAnchor, headPoint;
      if (headBone) {
        headBone.getWorldPosition(rootPoint); const head = rootPoint.clone().project(camera);
        headPoint = { x: (head.x + 1) * container.clientWidth / 2, y: (1 - head.y) * container.clientHeight / 2 };
        rootPoint.y = captionTop ?? rootPoint.y + 1.1; rootPoint.project(camera); speechAnchor = { x: (rootPoint.x + 1) * container.clientWidth / 2, y: (1 - rootPoint.y) * container.clientHeight / 2 };
      }
      let visibleBounds, furnitureBounds, pose;
      if (options.onFrame && options.measureBounds) {
        const bounds = getModelBounds(wrapper);
        if (furnitureProp?.group.visible) {
          const propBounds = furnitureProp.bounds(); bounds.union(propBounds);
          const p = propBounds.min.clone().project(camera), q = propBounds.max.clone().project(camera);
          furnitureBounds = { left: (p.x + 1) * container.clientWidth / 2, right: (q.x + 1) * container.clientWidth / 2,
            top: (1 - q.y) * container.clientHeight / 2, bottom: (1 - p.y) * container.clientHeight / 2 };
        }
        const a = bounds.min.clone().project(camera), b = bounds.max.clone().project(camera);
        visibleBounds = { left: (a.x + 1) * container.clientWidth / 2, right: (b.x + 1) * container.clientWidth / 2,
          top: (1 - b.y) * container.clientHeight / 2, bottom: (1 - a.y) * container.clientHeight / 2 };
        const solid = getModelBounds(wrapper, null, collisionMaterial);
        const pixel = point => { point.project(camera); return { x: (point.x + 1) * container.clientWidth / 2, y: (1 - point.y) * container.clientHeight / 2 }; };
        pose = { stride: stride.position.toArray(), support: support.position.y, releaseOffset: releaseOffset.toArray(), sway: sway.position.toArray(), bottom: pixel(solid.min.clone()).y,
          root: rootBone ? pixel(rootBone.getWorldPosition(new THREE.Vector3())) : null,
          feet: footBones.map(foot => pixel(foot.getWorldPosition(new THREE.Vector3()))), motion };
      }
      options.onFrame?.({ time: animationPlayer?.getTime(), mode: animationPlayer?.getMode(), grabError, grabbedSurface, visibleBounds, furnitureBounds, reactionTop, speechAnchor, headPoint, furniture: furnitureProp?.group.visible ? furnitureChoice : 'none', pose, ...physics });
    }
    render();
    if (!paused && clips.length) frame = requestAnimationFrame(tick);
  }

  function updateLoop() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
    if (disposed || (!options.desktop && document.hidden) || !visible) return;
    render();
    if (!paused && clips.length) frame = requestAnimationFrame(tick);
  }

  function resetCamera() {
    if (disposed || !root || !controls) return;
    if (container.clientWidth < 2 || container.clientHeight < 2) { fitted=false; return; }
    const box = framingBounds || getModelBounds(wrapper);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    if (box.isEmpty() || !Number.isFinite(size.length())) return;
    const tangent = Math.tan(THREE.MathUtils.degToRad((camera.fov || 35) / 2));
    const pageStage = container.closest('.page-model-stage') && !document.fullscreenElement;
    const occupancy = options.desktop ? .77 : pageStage ? .86 : .85;
    const distance = Math.max(size.y / (2 * tangent * occupancy), (options.desktop ? Math.max(size.x, size.z) : size.x) / (2 * tangent * camera.aspect * .82)) + size.z / 2;
    camera.clearViewOffset();
    if (camera.isOrthographicCamera) {
      const canvasScale = options.canvasScale || 2.6;
      const viewHeight = Math.max(size.y / occupancy, Math.max(size.x, size.z) / (.84 * .78)) * canvasScale;
      camera.left = -viewHeight * camera.aspect / 2; camera.right = viewHeight * camera.aspect / 2;
      camera.top = viewHeight / 2; camera.bottom = -viewHeight / 2;
    }
    controls.target.copy(center);
    camera.position.copy(center).add(new THREE.Vector3(options.desktop ? 0 : distance * .12, options.desktop ? 0 : distance * .035, distance));
    camera.near = Math.max(distance / 500, 0.001);
    camera.far = distance * 100;
    camera.updateProjectionMatrix();
    controls.minDistance = distance * 0.25;
    controls.maxDistance = distance * 3;
    controls.update();
    controls.saveState();
    if (options.desktop) {
      const foot = new THREE.Vector3(0, 0, 0).project(camera);
      const side = new THREE.Vector3(.25, 0, 0).project(camera);
      options.onGeometry?.({ x: (foot.x + 1) * container.clientWidth / 2, y: (1 - foot.y) * container.clientHeight / 2,
        radius: Math.max(8, (side.x - foot.x) * container.clientWidth / 2),
        bodyHeight: 2.8 / (camera.top - camera.bottom) * container.clientHeight,
        canWalk: animationPlayer?.canWalk() || false, canFall: animationPlayer?.canFall() || false });
    }
    fitted = true;
    render();
  }

  function resize() {
    if (!renderer || disposed) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width < 2 || height < 2) { fitted=false; return; }
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    // Portrait stages need a fresh fit; preserve user orbit for ordinary resize noise.
    if (root && (!fitted || width!==lastWidth || height!==lastHeight)) resetCamera();
    lastWidth=width;lastHeight=height;
    render();
  }

  function fullscreenResize() { fitted=false; resize(); }

  // A page-wide canvas must not trap normal page scrolling. Ctrl+wheel still zooms.
  function pageWheel(event) {
    if (container.closest('.page-model-stage') && !document.fullscreenElement && !event.ctrlKey) event.stopImmediatePropagation();
  }

  function setAnimation(name) {
    secondary?.restore();
    if (disposed || !animationPlayer?.setAnimation(name)) return false;
    render();
    return true;
  }

  function pickUp() {
    secondary?.restore();
    if (disposed || !animationPlayer?.pickUp()) return false;
    render();
    return true;
  }

  const raycaster = new THREE.Raycaster();
  function hitModel(event, details = false) {
    if (!root || !renderer || disposed) return false;
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const point = new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1, 1-(event.clientY-rect.top)/rect.height*2);
    if (Math.abs(point.x)>1 || Math.abs(point.y)>1) return false;
    if (hitRevision !== geometryRevision) {
      hitEntries = hitGeometry.refresh(wrapper).filter(({ mesh }) => mesh.isMesh && [mesh.material].flat().some(collisionMaterial));
      const vertex = new THREE.Vector3();
      for (const { mesh, read } of hitEntries) {
        if (!mesh.isSkinnedMesh) continue;
        // One posed box supplies a conservative sphere too. Include hair here
        // so these mesh bounds remain safe for rendering; hit filtering below
        // still excludes hair from all interaction and support geometry.
        mesh.boundingBox ||= new THREE.Box3(); mesh.boundingBox.makeEmpty();
        for (const index of referencedVertices(mesh)) mesh.boundingBox.expandByPoint(read(index, vertex));
        mesh.boundingSphere ||= new THREE.Sphere(); mesh.boundingBox.getBoundingSphere(mesh.boundingSphere);
      }
      hitRevision = geometryRevision;
    }
    raycaster.setFromCamera(point, camera);
    // Raycast keeps Three's exact triangle/material implementation. Its vertex
    // reads reuse the posed vertices already calculated for the bounds.
    const originals = hitEntries.map(({ mesh }) => mesh.getVertexPosition);
    let intersection;
    try {
      for (const { mesh, read } of hitEntries) if (mesh.isSkinnedMesh) mesh.getVertexPosition = read;
      intersection = raycaster.intersectObjects(hitEntries.map(({ mesh }) => mesh), false).find(isCollisionHit);
    } finally {
      hitEntries.forEach(({ mesh }, i) => { mesh.getVertexPosition = originals[i]; });
    }
    return details ? intersection : Boolean(intersection);
  }

  function prepareGrab(x, y) {
    grabCandidate = null;
    const hit = hitModel({ clientX: x, clientY: y }, true);
    if (!hit) return;
    if (!hit.face) return false;
    const vertices = [hit.face.a, hit.face.b, hit.face.c];
    vertices.forEach((index, i) => hit.object.getVertexPosition(index, trianglePoints[i]));
    const barycentric = new THREE.Vector3();
    THREE.Triangle.getBarycoord(hit.object.worldToLocal(hit.point.clone()), ...trianglePoints, barycentric);
    const materials = [hit.object.material].flat();
    grabCandidate = { mesh: hit.object, vertices, barycentric, anchor: hit.point.clone(), x, y,
      material: materials[hit.face.materialIndex || 0]?.name };
    return true;
  }
  function surfacePoint(attachment, target) {
    target.set(0, 0, 0);
    attachment.vertices.forEach((index, i) => {
      attachment.mesh.getVertexPosition(index, trianglePoints[i]);
      target.addScaledVector(trianglePoints[i], attachment.barycentric.getComponent(i));
    });
    attachment.mesh.localToWorld(target); return target;
  }
  function releaseGrab() {
    if (pin && root) releaseAnchor = (rootBone || root).getWorldPosition(new THREE.Vector3());
    pin = null; grabCandidate = null; grabbedSurface = null; secondary?.setGrabbed(false);
  }
  async function setFurniture(kind) {
    if (!FURNITURE[kind]) kind = 'none';
    if (kind === furnitureChoice) return kind !== 'none';
    furnitureChoice = kind; const serial = ++furnitureSerial;
    furnitureRequest?.abort(); furnitureRequest = new AbortController();
    geometryRevision++;
    if (animationPlayer?.getMode() === 'furniture') {
      releaseAnchor = (rootBone || root).getWorldPosition(new THREE.Vector3()); animationPlayer.rest();
    }
    furnitureProp?.dispose(); furnitureProp = null; furnitureBlend = 0;
    toonRenderer?.dispose(); toonRenderer = root && createToonRenderer(renderer, scene, camera, scene);
    const refresh = () => {
      // Selecting furniture while paused still settles the new pose once.
      // This does not resume the desktop clock or change its saved pause state.
      if (paused) for (let i = 0; i < 16; i++) tick(performance.now(), .05);
      else render();
    };
    if (kind === 'none') { refresh(); return false; }
    try {
      const prop = await createDesktopFurniture(kind, { signal: furnitureRequest.signal, characterId: model.id });
      if (disposed || serial !== furnitureSerial) { prop.dispose(); return false; }
      if (prop.animation && clips.some(clip => clip.name === prop.animation)) {
        // Use the authored shared scene coordinates: no foot snapping or root
        // cancellation while seated. Both rigs rotate together and share time.
        prop.group.rotation.y = 0; prop.group.scale.copy(wrapper.scale); prop.group.position.copy(wrapper.position); turn.add(prop.group);
        prop.groundOffset = -(prop.nativeBounds.min.y * wrapper.scale.y + wrapper.position.y);
      } else {
        prop.animation = null;
        // A shallow presentation angle keeps rugs and thin wall panels visible
        // in the pet's fixed front camera without changing the student's size.
        prop.group.rotation.x = .2;
        prop.group.updateMatrixWorld(true);
        const box = prop.bounds(), size = box.getSize(new THREE.Vector3());
        const scale = Math.min(2.6 / Math.max(size.x, .000001), 2.8 / Math.max(size.y, .000001), 2.8 / Math.max(size.z, .000001));
        prop.group.scale.setScalar(scale);
        prop.group.position.set(1.15 - box.min.x * scale, -box.min.y * scale, -box.getCenter(new THREE.Vector3()).z * scale);
        scene.add(prop.group);
      }
      furnitureProp = prop;
      toonRenderer?.dispose(); toonRenderer = createToonRenderer(renderer, scene, camera, scene);
      refresh(); return true;
    } catch(error) {
      if(error.name !== 'AbortError' && !disposed && serial === furnitureSerial) { furnitureChoice = 'none'; console.warn('Furniture unavailable', error); options.onFurnitureError?.(kind); }
      return false;
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    request.abort(); furnitureRequest?.abort();
    signal?.removeEventListener('abort', abortRequest);
    signal?.removeEventListener('abort', dispose);
    cancelAnimationFrame(frame);
    document.removeEventListener('visibilitychange', updateLoop);
    window.removeEventListener('resize', resize);
    document.removeEventListener('fullscreenchange', fullscreenResize);
    resizeObserver?.disconnect();
    intersectionObserver?.disconnect();
    removeInteraction?.();
    controls?.dispose();
    renderer?.domElement.removeEventListener('wheel', pageWheel, true);
    animationPlayer?.dispose();
    secondary?.dispose();
    furnitureProp?.dispose();
    mixer?.stopAllAction();
    if (root) mixer?.uncacheRoot(root);
    toonRenderer?.dispose();
    releaseObject(root);
    wrapper.clear();
    renderer?.dispose();
    renderer?.forceContextLoss();
    renderer?.domElement.remove();
  }

  try {
    status({ state: 'loading', loaded: 0, total: 0, progress: 0 });
    if (request.signal.aborted) throw new DOMException('Model loading cancelled.', 'AbortError');
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.domElement.className = 'model-viewer-canvas';
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', model.name || '3D');
    container.append(renderer.domElement);
    renderer.domElement.addEventListener('wheel',pageWheel,{capture:true,passive:true});
    controls = new OrbitControls(camera, renderer.domElement);
    if (options.desktop) controls.enabled = false;
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.rotateSpeed = 0.7;
    controls.zoomSpeed = 0.75;
    controls.minPolarAngle = Math.PI * 0.12;
    controls.maxPolarAngle = Math.PI * 0.8;
    controls.addEventListener('change', render);
    resize();

    const url = new URL(model.file, document.baseURI);
    const bytes = await readModel(url, request.signal, status);
    const gltf = await new GLTFLoader().parseAsync(bytes, new URL('.', url).href);
    root = gltf.scene;
    if (request.signal.aborted) throw new DOMException('Model loading cancelled.', 'AbortError');
    prepareMaterials(root);
    // Repair exported coordinate spaces before halo reparenting or the first fit.
    const animations=prepareAnimations(root,gltf.animations);
    bindHalo(root);
    try {
      await loadReplacementHalo(root,request.signal);
    } catch(error) {
      if(error.name==='AbortError')throw error;
      console.warn('Independent halo unavailable; keeping the embedded halo.',error);
      status({state:'warning',error});
    }
    let mouthTexture;
    try {
      mouthTexture=await loadMouthTexture(request.signal);
      if (attachMouth(root,mouthTexture)) {
        mouthMotion = createMouthMotion(mouthTexture, options.sampleSpeech);
        mouthTexture=null; // The root now owns it.
      }
    } catch (error) {
      if (error.name==='AbortError') throw error;
      // A failed expression atlas should not hide an otherwise intact body/eyes.
      console.warn('Mouth expression unavailable; keeping the embedded face texture.',error);
      status({state:'warning',error});
    } finally {
      mouthTexture?.dispose();mouthTexture?.source?.data?.close?.();
    }
    if (request.signal.aborted) throw new DOMException('Model loading cancelled.', 'AbortError');
    wrapper.add(root);
    clips = animations.filter(clip => !/(?:_Cam|_Camera)$/i.test(clip.name));
    mixer = new THREE.AnimationMixer(root);
    // Normalize in a stable standing pose before starting the entrance animation.
    // Interactions/fullscreen changes should not make the camera jump with a pose.
    const initial = selectModelAnimations(clips).idle;
    const referenceAction = initial && mixer.clipAction(initial).play();
    mixer.update(0);
    const box = getModelBounds(root);
    const size = box.getSize(new THREE.Vector3());
    if (box.isEmpty() || !Number.isFinite(size.length()) || size.length() === 0) throw new Error('Model has no renderable geometry.');
    const scale = 2.8 / (size.y || size.length());
    const solidBox = getModelBounds(root, null, collisionMaterial);
    wrapper.scale.setScalar(scale);
    wrapper.position.set(-box.getCenter(new THREE.Vector3()).x * scale, -(solidBox.isEmpty() ? box : solidBox).min.y * scale, 0);
    framingBounds = getModelBounds(wrapper);
    if (!options.desktop) framingBounds = includeModelPropBounds(wrapper, clips, framingBounds);
    rootBone = root.getObjectByName('Bip001');
    root.traverse(node => {
      if (node.isBone && /bip.*[ _]head$/i.test(node.name)) headBone = node;
      if (node.isBone && /bip.*[ _]pelvis$/i.test(node.name)) pelvisBone = node;
    });
    pelvisBone ||= rootBone;
    if (rootBone) { rootBone.getWorldPosition(rootPoint); rootAnchor = turn.worldToLocal(rootPoint.clone()); }
    root.traverse(node => { if (node.isBone && /bip.*[ _][lr][ _]foot$/i.test(node.name)) footBones.push(node); });
    referenceAction?.stop();
    animationPlayer = createModelAnimationPlayer(mixer, clips, name => options.onAnimationChange?.(name), value => options.onReaction?.(value));
    if (options.desktop) secondary = createSecondaryMotion(root, sway, turn);
    if (animationPlayer.canPickUp() && !options.desktop) {
      renderer.domElement.setAttribute('role', 'button');
      renderer.domElement.tabIndex = 0;
      renderer.domElement.setAttribute('aria-keyshortcuts', 'Enter Space');
      removeInteraction = bindModelInteraction(renderer.domElement, hitModel, pickUp);
    }
    animationPlayer.start();
    toonRenderer=createToonRenderer(renderer,scene,camera,root);
    resize();
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    intersectionObserver = new IntersectionObserver(entries => {
      visible = options.desktop || entries[0].isIntersecting;
      if (visible) resize();
      updateLoop();
    });
    intersectionObserver.observe(container);
    document.addEventListener('visibilitychange', updateLoop);
    window.addEventListener('resize', resize);
    document.addEventListener('fullscreenchange', fullscreenResize);
    signal?.addEventListener('abort', dispose, { once: true });
    updateLoop();
    status({ state: 'ready', progress: 1, animations: clips.map(clip => clip.name) });
    return {
      dispose,
      setAnimation,
      pickUp,
      hitTest: (x, y) => hitModel({ clientX: x, clientY: y }),
      hitRegion(x, y) {
        const hit = hitModel({ clientX: x, clientY: y }, true);
        if (!hit) return null;
        if (headBone && headBone.getWorldPosition(rootPoint).distanceTo(hit.point) < .62) return 'head';
        return 'body';
      },
      setFurniture,
      prepareGrab,
      hold: () => { geometryRevision++; secondary?.restore(); pin = grabCandidate; grabbedSurface = pin?.material || null; secondary?.setGrabbed(Boolean(pin)); return animationPlayer.hold(); },
      releaseGrab,
      rest: () => { geometryRevision++; releaseGrab(); secondary?.restore(); return animationPlayer.rest(); },
      greet: () => { geometryRevision++; mouthMotion?.smile(); secondary?.restore(); return animationPlayer.react(); },
      closeMouth: () => { mouthMotion?.close(); render(); },
      // Only a local pointer release cancels the pin. Motion IPC can describe a
      // frame sampled before pointerdown and must not detach a newer grab.
      setMotion(value) { motion = value; secondary?.input(value); if (!pin) { geometryRevision++; animationPlayer?.landing(value.reaction); } },
      setPhysics(value) { geometryRevision++; secondary?.setEnabled(value); },
      diagnostics: () => ({ time: animationPlayer.getTime(), duration: animationPlayer.getDuration(), mode: animationPlayer.getMode(), furniture: furnitureProp?.diagnostics() || null, mouth: mouthMotion?.diagnostics(), ...secondary?.diagnostics() }),
      advanceForReview(seconds) {
        if (!options.measureBounds || !paused || !Number.isFinite(seconds)) return;
        for (let remaining = Math.max(0, Math.min(120, seconds)); remaining > 0; remaining -= .05) tick(performance.now(), Math.min(.05, remaining));
      },
      canPickUp: () => animationPlayer.canPickUp(),
      getAnimations: () => clips.map(clip => clip.name),
      getAnimation: () => animationPlayer.getAnimation(),
      resetCamera,
      setPaused(value) { if (paused === Boolean(value)) return; paused = Boolean(value); if (paused) mouthMotion?.close(); updateLoop(); },
      isPaused: () => paused
    };
  } catch (error) {
    dispose();
    if (error.name !== 'AbortError') status({ state: 'error', error });
    throw error;
  }
}
