/** Kivo model 201, explicitly labelled mika_unofficial_halo by its source.
 * Keep the downloaded OBJ/MTL/JPG intact. Adapt only the in-memory instance.
 */
import * as THREE from '../assets/vendor/three/three.module.min.js';
import {OBJLoader} from '../assets/vendor/three/OBJLoader.js';
import {MTLLoader} from '../assets/vendor/three/MTLLoader.js';

export const MIKA_HALO_FILES = Object.freeze({
  obj:new URL('../assets/media/models/201/ミカ.obj',import.meta.url),
  mtl:new URL('../assets/media/models/201/ミカ.mtl',import.meta.url),
  texture:new URL('../assets/media/models/201/fuwafuwa.jpg',import.meta.url)
});

export function createMikaHalo(objText,mtlText,texture) {
  const creator=new MTLLoader().setMaterialOptions({side:THREE.DoubleSide}).parse(mtlText,'');
  // No hidden TextureLoader requests: the viewer owns the abortable texture load.
  creator.loadTexture=url=>{
    if(url!=='fuwafuwa.jpg')throw new Error('Unexpected Mika halo texture: '+url);
    return texture.clone();
  };
  let result;
  try {
    result=new OBJLoader().setMaterials(creator).parse(objText);
    result.name='PA_Mika_Halo';
    const replacements=new Map();
    result.traverse(mesh=>{
      if(!mesh.isMesh)return;
      mesh.frustumCulled=false;
      const replace=original=>{
        if(!replacements.has(original)) {
          // Halo is self-lit; do not add the body's cel shadows or dark outlines.
          const material=new THREE.MeshBasicMaterial({name:'PA_Mika_Halo_'+original.name,
            color:original.color,map:original.map,side:THREE.DoubleSide,toneMapped:false});
          material.userData.paHalo=true;
          replacements.set(original,material);
        }
        return replacements.get(original);
      };
      mesh.material=Array.isArray(mesh.material)?mesh.material.map(replace):replace(mesh.material);
    });
    return result;
  } catch(error) {
    result?.traverse(mesh=>mesh.geometry?.dispose());
    for(const material of Object.values(creator.materials))material.map?.dispose();
    throw error;
  } finally {
    for(const material of Object.values(creator.materials))material.dispose();
  }
}

export function attachMikaHalo(root,replacement) {
  const original=root.getObjectByName('CH0069_Halo');
  const anchor=root.getObjectByName('HaloRoot');
  if(!root.getObjectByName('CH0069') || original?.parent!==anchor || !replacement || root.getObjectByName('PA_Mika_Halo'))return false;
  original.updateMatrix();
  original.geometry.computeBoundingBox();
  const target=original.geometry.boundingBox.clone().applyMatrix4(original.matrix);
  const source=new THREE.Box3().setFromObject(replacement,true);
  const sourceSize=source.getSize(new THREE.Vector3());
  if(source.isEmpty() || !Number.isFinite(sourceSize.length()) || sourceSize.x<=0)throw new Error('Invalid replacement halo geometry.');
  // Fit the central ring, not the outer sparkle particles. Fitting every particle
  // into the old ring footprint would shrink the actual halo until nearly invisible.
  const ring=replacement.getObjectByName('円');
  ring?.geometry.computeBoundingBox();
  const ringBox=ring?.geometry.boundingBox;
  const ringWidth=ringBox?.getSize(new THREE.Vector3()).x || sourceSize.x;
  const scale=target.getSize(new THREE.Vector3()).x/ringWidth;
  // Source is Y-up already. HaloRoot remains bound to the head, including Pickup.
  replacement.scale.setScalar(scale);
  replacement.position.copy(target.getCenter(new THREE.Vector3()))
    .addScaledVector((ringBox || source).getCenter(new THREE.Vector3()),-scale);
  replacement.position.y=target.min.y-source.min.y*scale;
  replacement.userData.paSourceModel=201;
  anchor.add(replacement);
  original.visible=false;
  original.userData.paReplacedHalo=true;
  return true;
}
