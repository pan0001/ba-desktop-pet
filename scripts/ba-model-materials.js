/** BA game-model adapter, independently implemented after inspecting Kivo's viewer.
 * Source notes: assets/media/expressions/README.md. Never modify the source GLBs.
 */
import * as THREE from '../assets/vendor/three/three.module.min.js';
import { FACE_PROFILES } from './game-face-profiles.js';

export const MOUTH_ATLAS = new URL('../assets/media/expressions/Character_Mouth_High.png', import.meta.url);
export const DEFAULT_MOUTH_FRAME = 60;

/** Some public exports contain auxiliary primitives whose entire skin-weight
 * stream is NaN (not missing downloads). They cannot render on the GPU. Isolate
 * those primitives rather than inventing bone weights or rejecting the student.
 * Keep source geometry, skeletons and animation bindings untouched.
 */
export function isolateInvalidSkinning(root) {
  const excluded=[];
  root.traverse(mesh=>{
    if(!mesh.isSkinnedMesh || mesh.userData.paInvalidSkinning) return;
    const weights=mesh.geometry.getAttribute('skinWeight');
    const joints=mesh.geometry.getAttribute('skinIndex');
    if(!weights || !joints || !weights.count) return;
    let invalid=0;
    for(let vertex=0;vertex<weights.count;vertex++) {
      let sum=0,valid=true;
      for(let axis=0;axis<weights.itemSize;axis++) {
        const weight=weights.getComponent(vertex,axis),joint=joints.getComponent(vertex,axis);
        if(!Number.isFinite(weight) || weight<0 || (weight>0 && (!Number.isInteger(joint) || joint<0 || joint>=mesh.skeleton.bones.length))) valid=false;
        sum+=weight;
      }
      if(!valid || !Number.isFinite(sum) || sum<=0) invalid++;
    }
    // A partially usable mesh must not be discarded as if it were a broken prop.
    if(invalid!==weights.count) return;
    mesh.visible=false;
    mesh.userData.paInvalidSkinning={invalidVertices:invalid,totalVertices:weights.count};
    excluded.push(mesh);
  });
  return excluded;
}

/** Verified export-specific facial layouts; do not loosen all EyeMouth meshes.
 * Ibuki exports mutually exclusive neutral / squeezed-eye faces as siblings.
 * GLB animation tracks do not contain the game's renderer-enable events, so
 * rendering both overlays two skins and the alternate eye geometry. Keep the
 * neutral face; do not guess expression timing from animation names.
 */
function prepareExpressionVariants(root) {
  for (const profile of FACE_PROFILES) {
    // Public body exports omit the Cafe_ wrapper but retain the same student
    // root and renderer names. Apply the recorded source defaults to both.
    const prefab = root.getObjectByName(profile.root) || root.getObjectByName(profile.root.replace(/^Cafe_/, ''));
    if (!prefab) continue;
    for (const name of profile.hiddenNodes) {
      const alternate = prefab.getObjectByName(name) || prefab.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));
      if (!alternate) continue;
      alternate.visible = false;
      alternate.userData.paInactiveExpression = true;
    }
  }
  const cherino = root.getObjectByName('Cafe_Cherino_Original') || root.getObjectByName('Cherino_Original');
  const guards = cherino?.getObjectByName('CherinoRoyalGuard_Exs_Cutin');
  if (guards) { guards.visible = false; guards.userData.paInactiveExpression = true; }
  const mutsuki = root.getObjectByName('Cafe_CH0246') || root.getObjectByName('CH0246');
  mutsuki?.traverse(object => {
    if (object.isMesh && [object.material].flat().some(material => material?.name === 'FX_MAT_CH0246_EX01_Cutin_Leaf_Anim')) {
      object.visible = false; object.userData.paInactiveExpression = true;
    }
  });
  const neutral=root.getObjectByName('Ibuki_Original_Face_Outline');
  const alternate=root.getObjectByName('Ibuki_Original_Face01_Outline');
  const body=root.getObjectByName('Ibuki_Original_Body');
  if (!neutral || !alternate || !body) return;
  alternate.visible=false;
  alternate.userData.paInactiveExpression=true;
}

export function prepareMaterials(root) {
  isolateInvalidSkinning(root);
  prepareExpressionVariants(root);
  const replacements = new Map();
  root.traverse(object => {
    if (!object.isMesh) return;
    object.frustumCulled = false;
    // These public exports hide the idle weapon by shrinking it to 0.1% and
    // moving it below the feet. Its nearly invisible point must not shrink the
    // whole student to fit the camera. Normal weapon poses remain measurable.
    if (['Hihumi_Original_Weapon', 'Kayoko_Original_Weapon', 'Juri_Original_Weapon'].includes(object.name)) object.userData.paCollapsedProp = true;
    const replace = original => {
      if (!original) return original;
      if (replacements.has(original)) return replacements.get(original);
      if (/halo/i.test(original.name) || original.userData.paHalo) {
        // Keep the authored ring and its texture self-lit, including during
        // pickup rotations. Body cel shadows must not darken a light source.
        const material = new THREE.MeshBasicMaterial({
          name: original.name, map: original.map, color: original.color,
          side: THREE.DoubleSide, toneMapped: false,
          transparent: original.transparent, opacity: original.opacity,
          alphaMap: original.alphaMap, alphaTest: original.alphaTest,
          depthWrite: original.depthWrite
        });
        material.userData = { ...original.userData, paGameMaterial: true, paHalo: true };
        replacements.set(original, material);
        return material;
      }
      // BA stores other game-shader data in vertex/texture alpha. GLTF's generic
      // BLEND conversion is not sufficient evidence that a body should be transparent.
      const eyebrow = /_eyebrow$/i.test(original.name);
      const alphaEffect = /_alpha$/i.test(original.name);
      const material = new THREE.MeshToonMaterial({
        name: original.name,
        map: original.map,
        color: original.color ?? 0xffffff,
        gradientMap: original.gradientMap || null,
        side: THREE.DoubleSide,
        transparent: (eyebrow || alphaEffect) && original.transparent,
        vertexColors: (eyebrow || alphaEffect) && original.vertexColors,
        opacity: alphaEffect ? original.opacity : 1,
        alphaMap: alphaEffect ? original.alphaMap : null,
        // In particular, eyebrow vertex alpha can be 0.0196: do not clip at 0.04.
        alphaTest: 0,
        depthWrite: alphaEffect ? original.depthWrite : true
      });
      material.userData = {...original.userData, paGameMaterial:true};
      replacements.set(original, material);
      return material;
    };
    object.material = Array.isArray(object.material) ? object.material.map(replace) : replace(object.material);
  });
  // Material disposal does not dispose shared texture maps retained by replacements.
  for (const original of replacements.keys()) original.dispose();
  return replacements.size;
}

/** Connected triangle islands, welding coincident positions across UV seams.
 * Preserve all original vertex IDs: skin weights, normals, UVs and morph targets
 * must stay attached to exactly the same vertices.
 */
export function getFaceIslands(geometry, epsilon = 1e-6) {
  const position = geometry.getAttribute('position');
  if (!position) return [];
  const index = geometry.getIndex();
  const count = index?.count ?? position.count;
  if (count % 3) return [];
  const vertexAt = i => index ? index.getX(i) : i;
  const parents = Array.from({length:position.count}, (_, i) => i);
  function find(i) {
    while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; }
    return i;
  }
  const join = (a,b) => { parents[find(a)] = find(b); };
  const cells = new Map();
  for (let i=0; i<position.count; i++) {
    const x=position.getX(i), y=position.getY(i), z=position.getZ(i);
    const cx=Math.floor(x/epsilon), cy=Math.floor(y/epsilon), cz=Math.floor(z/epsilon);
    for (let dx=-1; dx<=1; dx++) for (let dy=-1; dy<=1; dy++) for (let dz=-1; dz<=1; dz++) {
      for (const j of cells.get(`${cx+dx},${cy+dy},${cz+dz}`) || []) {
        if (Math.hypot(x-position.getX(j),y-position.getY(j),z-position.getZ(j)) <= epsilon) join(i,j);
      }
    }
    const key=`${cx},${cy},${cz}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(i);
  }
  for (let i=0; i<count; i+=3) { join(vertexAt(i),vertexAt(i+1)); join(vertexAt(i),vertexAt(i+2)); }
  const islands = new Map();
  for (let i=0; i<count; i+=3) {
    const key=find(vertexAt(i));
    if (!islands.has(key)) islands.set(key,{indices:[],minY:Infinity,maxY:-Infinity});
    const island=islands.get(key);
    for (let j=0; j<3; j++) {
      const v=vertexAt(i+j);island.indices.push(v);
      island.minY=Math.min(island.minY,position.getY(v));
      island.maxY=Math.max(island.maxY,position.getY(v));
    }
  }
  return [...islands.values()].map(island=>({...island,centerY:(island.minY+island.maxY)/2}));
}

export function setMouthFrame(texture, frame = DEFAULT_MOUTH_FRAME) {
  const index=Number.isInteger(frame) && frame>=0 && frame<64 ? frame : DEFAULT_MOUTH_FRAME;
  texture.flipY=false;
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  // BA's authored mouth UVs cover a quarter of the original eye/mouth texture.
  texture.repeat.set(4/8,4/8);
  texture.offset.set((index%8)/8,Math.floor(index/8)/8);
  texture.needsUpdate=true;
}

/** Two material groups instead of replacing the SkinnedMesh: animation tracks
 * continue to target the original object/name/UUID and its original skeleton.
 */
export function attachMouth(root, texture) {
  let face, islands, mouth;
  root.traverse(object => {
    if (!face && object.isSkinnedMesh && !Array.isArray(object.material)
      && /_(eyemouth|eyemoutn|mouth)$/i.test(object.material?.name || '')
      && !/star/i.test(object.name)) {
      for (let parent=object; parent; parent=parent.parent) if (!parent.visible) return;
      const parts=getFaceIslands(object.geometry);
      const candidate=findMouthIsland(object.geometry,parts);
      if (candidate) { face=object; islands=parts; mouth=candidate; }
    }
  });
  if (!face) return null;
  const eyes=islands.filter(island=>island!==mouth).flatMap(island=>island.indices);
  const originalGeometry=face.geometry;
  const geometry=originalGeometry.clone();
  geometry.setIndex([...eyes,...mouth.indices]);
  geometry.clearGroups();
  if (eyes.length) geometry.addGroup(0,eyes.length,0);
  geometry.addGroup(eyes.length,mouth.indices.length,1);
  const material=new THREE.MeshToonMaterial({name:'PA_Mouth',map:texture,transparent:true,
    vertexColors:false,alphaTest:0,depthWrite:false,side:THREE.DoubleSide});
  material.userData.paMouth=true;
  face.geometry=geometry;
  face.material=[face.material,material];
  face.userData.paMouth={islandCount:islands.length,triangles:mouth.indices.length/3};
  let shared=false;
  root.traverse(object=>{if(object.geometry===originalGeometry) shared=true;});
  if (!shared) originalGeometry.dispose();
  return face;
}

// BA's mouth occupies the upper-left quarter of the eye/mouth atlas. Confirm
// that authored UV patch instead of selecting the lowest piece of geometry:
// standalone eyes and differently oriented exports can otherwise become mouths.
export function findMouthIsland(geometry, islands=getFaceIslands(geometry)) {
  const uv=geometry.getAttribute('uv');
  if (!uv) return null;
  const candidates=islands.filter(island=>{
    let minU=Infinity,maxU=-Infinity,minV=Infinity,maxV=-Infinity;
    for (const index of island.indices) {
      const u=uv.getX(index),v=uv.getY(index);
      if (!Number.isFinite(u) || !Number.isFinite(v)) return false;
      minU=Math.min(minU,u);maxU=Math.max(maxU,u);minV=Math.min(minV,v);maxV=Math.max(maxV,v);
    }
    return minU>=-.001 && maxU<=.251 && minV>=.749 && maxV<=1.001
      // Some authored mouths mirror the right half of this patch across the
      // face (Karin, Tsukuyo, uniform Akane). Their width is about .116, while
      // standalone pupil/highlight UVs are much smaller and outside this patch.
      && maxU-minU>.1 && maxV-minV>.1;
  });
  return candidates.length===1 ? candidates[0] : null;
}

/** CH0284's prop rig is saved at its hidden (0.01) scale. Several toy-playing
 * clips omit the constant unit-scale channels, although they animate the barrel,
 * Peroro and swords. Add only those missing channels in verified clips; explicit
 * hide/pop scale curves, other props and the original GLB remain untouched.
 */
export function prepareYuukaPropAnimations(root, clips) {
  const mesh=root.getObjectByName('CH0284_SkillProp_Outline');
  if (!mesh?.isSkinnedMesh || mesh.parent?.name!=='CH0284_1'
    || mesh.material?.name!=='CH0284_SkillProp') return clips;
  const bones=mesh.skeleton.bones.filter(bone=>
    /^(?:bone_wood|bone_peroro_02|bone_knife_\d{2})$/.test(bone.name)
    && bone.parent?.name==='prop_root'
    && bone.scale.toArray().every(value=>Math.abs(value-.01)<1e-7));
  let changed=false;
  const result=clips.map(clip=>{
    if (!/^CH0284_(?:Victory_(?:Start|End)|Normal_Callsign|Exs_Cutin_0[1-5])$/.test(clip.name)
      || !Number.isFinite(clip.duration) || clip.duration<=0) return clip;
    const names=new Set(clip.tracks.map(track=>track.name));
    const missing=bones.filter(bone=>!names.has(bone.name+'.scale')
      && names.has(bone.name+'.position') && names.has(bone.name+'.quaternion'));
    if (!missing.length) return clip;
    changed=true;
    return new THREE.AnimationClip(clip.name,clip.duration,[...clip.tracks,
      ...missing.map(bone=>new THREE.VectorKeyframeTrack(bone.name+'.scale',
        [0,clip.duration],[1,1,1,1,1,1]))],clip.blendMode);
  });
  return changed ? result : clips;
}

/** Kayoko/Momoi have exported constant halo-position keys in character space,
 * not HaloRoot-local space. Applying both raises the halo twice. Match only the
 * verified hierarchy and constant positions; never rewrite moving halo tracks.
 * Call before bindHalo changes the hierarchy. Never mutate the source clips.
 */
export function prepareAnimations(root, clips) {
  clips=prepareYuukaPropAnimations(root,clips);
  clips=prepareImportedHaloAnimations(root,clips);
  const name=root.getObjectByName('Kayoko_Original') ? 'Kayoko_Original' : 'Momoi_Original';
  const body=root.getObjectByName(name);
  const halo=root.getObjectByName('HaloRoot');
  const mesh=root.getObjectByName(name+'_Halo');
  if (!body || halo?.parent!==body || mesh?.parent!==halo) return clips;
  halo.updateMatrix();
  // Momoi's two exported rest keys include a small authored offset. Convert the
  // exact key, preserving that offset instead of snapping to the static mesh.
  const authored=name==='Momoi_Original'
    ? new THREE.Vector3(0,.009990663267672062,-.0018911899533122778)
    : mesh.position.clone().applyMatrix4(halo.matrix);
  const inverse=halo.matrix.clone().invert();
  const point=new THREE.Vector3();
  return clips.map(clip=>{
    const indices=[];
    clip.tracks.forEach((track,index)=>{
      if (name==='Momoi_Original' && !/^Momoi_Original_(?:Formation_Idle|Victory_End)$/.test(clip.name)) return;
      if (track.name!==name+'_Halo.position' || track.getValueSize()!==3 || !track.values.length) return;
      for (let i=0;i<track.values.length;i+=3) {
        point.fromArray(track.values,i);
        if (!point.toArray().every(Number.isFinite) || point.distanceTo(authored)>1e-7) return;
      }
      indices.push(index);
    });
    if (!indices.length) return clip;
    const fixed=clip.clone();
    for (const index of indices) {
      const values=fixed.tracks[index].values;
      for (let i=0;i<values.length;i+=3) point.fromArray(values,i).applyMatrix4(inverse).toArray(values,i);
    }
    return fixed;
  });
}

// Verified public exports mix a static HaloRoot with constant mesh-position keys
// saved in another space. Restore only those exact baked constants; genuinely
// moving halo animation and the model's authored rest offset remain untouched.
export function prepareImportedHaloAnimations(root, clips) {
  const profiles = [
    ['Ako_Original_Halo', [0, .010550185106694698, -.002013659104704857]],
    ['Izumi_Original_Halo', [0, .010522371158003807, -.002003817819058895]],
    ['Fuuka_Original_Halo', [0, 0, 0]],
    ['Iori_Original_Halo', [0, .010939913801848888, -.0022845780476927757]],
    ['Eimi_Original_Halo', [0, .010529021732509136, -.0019913166761398315]],
    ['Karin_Original_Halo', [0, .010480092838406563, -.003331855172291398]]
  ];
  for (const [name, exported] of profiles) {
    const mesh = root.getObjectByName(name);
    if (!mesh || mesh.parent?.name !== 'HaloRoot') continue;
    clips = clips.map(clip => {
      const index = clip.tracks.findIndex(track => track.name === name + '.position' && track.getValueSize() === 3 && track.values.length &&
        Array.from(track.values).every((value, i) => Math.abs(value - exported[i % 3]) < 1e-7));
      if (index < 0) return clip;
      const fixed = clip.clone(), values = fixed.tracks[index].values;
      for (let i = 0; i < values.length; i += 3) mesh.position.toArray(values, i);
      return fixed;
    });
  }
  return clips;
}

export function bindHalo(root) {
  const halo=root.getObjectByName('HaloRoot');
  if (!halo) return false;
  let head;
  root.traverse(object=>{
    if (!head && object.isSkinnedMesh) head=object.skeleton.bones.find(bone=>/bip.*[ _]head$/i.test(bone.name));
  });
  if (!head || halo.parent===head) return false;
  // Object3D.attach preserves the initial world transform while rebinding the halo.
  root.updateMatrixWorld(true);
  head.attach(halo);
  return true;
}
