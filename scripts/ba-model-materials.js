/** BA game-model adapter, independently implemented after inspecting Kivo's viewer.
 * Source notes: assets/media/expressions/README.md. Never modify the source GLBs.
 */
import * as THREE from '../assets/vendor/three/three.module.min.js';

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
  // Reisa exports the mouth alone under Body, while the eyes are separate face
  // primitives sharing the EyeMouth material. Do not treat any single eye island
  // as a mouth: require this exact mesh, hierarchy, material and 32-triangle patch.
  const reisaMouth=root.getObjectByName('CH0167_Body_2');
  if(reisaMouth?.isSkinnedMesh && reisaMouth.parent?.name==='CH0167_Body'
    && reisaMouth.material?.name==='CH0167_EyeMouth') {
    const islands=getFaceIslands(reisaMouth.geometry);
    if(islands.length===1 && islands[0].indices.length===96)reisaMouth.userData.paSeparateMouth=true;
  }
  const neutral=root.getObjectByName('Ibuki_Original_Face_Outline');
  const alternate=root.getObjectByName('Ibuki_Original_Face01_Outline');
  const body=root.getObjectByName('Ibuki_Original_Body');
  if (!neutral || !alternate || !body) return;
  alternate.visible=false;
  alternate.userData.paInactiveExpression=true;
  // Unlike most EyeMouth meshes, this primitive is ONLY the separate mouth.
  // Check the exported topology as well as names before permitting one island.
  body.traverse(mesh=>{
    if (!mesh.isSkinnedMesh || mesh.material?.name!=='Ibuki_Original_EyeMouth') return;
    const islands=getFaceIslands(mesh.geometry);
    if (islands.length===1 && islands[0].indices.length===96) mesh.userData.paSeparateMouth=true;
  });
}

export function prepareMaterials(root) {
  isolateInvalidSkinning(root);
  prepareExpressionVariants(root);
  const replacements = new Map();
  root.traverse(object => {
    if (!object.isMesh) return;
    object.frustumCulled = false;
    const replace = original => {
      if (!original) return original;
      if (replacements.has(original)) return replacements.get(original);
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
  let face;
  root.traverse(object => {
    if (!face && object.isSkinnedMesh && !Array.isArray(object.material)
      && /_(eyemouth|eyemoutn|mouth)$/i.test(object.material?.name || '')
      && !/star/i.test(object.name)) face=object;
  });
  if (!face) return null;
  const islands=getFaceIslands(face.geometry);
  if (!islands.length || (islands.length===1 && !/_mouth$/i.test(face.material.name) && !face.userData.paSeparateMouth)) return null;
  const mouth=islands.reduce((lowest,island)=>island.centerY<lowest.centerY?island:lowest);
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

export function bindHalo(root) {
  const halo=root.getObjectByName('HaloRoot');
  if (!halo) return false;
  let head;
  root.traverse(object=>{
    if (!head && object.isSkinnedMesh) head=object.skeleton.bones.find(bone=>/bip.*_head$/i.test(bone.name));
  });
  if (!head || halo.parent===head) return false;
  // Object3D.attach preserves the initial world transform while rebinding the halo.
  root.updateMatrixWorld(true);
  head.attach(halo);
  return true;
}
