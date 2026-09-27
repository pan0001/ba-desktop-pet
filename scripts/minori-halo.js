// Kivo publishes Minori's halo as model 75, separately from body model 308.
// Preserve the original OBJ orientation and texture; fit only its world position
// and size once, then let the head skeleton carry it through every animation.
import * as THREE from '../assets/vendor/three/three.module.min.js';
import { OBJLoader } from '../assets/vendor/three/OBJLoader.js';
import { createPoseGeometry } from './pose-geometry.js';

export const MINORI_HALO_FILES = Object.freeze({
  obj: new URL('../assets/media/models/75/CH0214_Halo.obj', import.meta.url),
  texture: new URL('../assets/media/models/75/CH0214_Halo.png', import.meta.url)
});

export function createMinoriHalo(text, texture) {
  const result = new OBJLoader().parse(text);
  result.name = 'PA_Minori_Halo';
  const material = new THREE.MeshBasicMaterial({ name: 'CH0214_Halo', map: texture,
    side: THREE.DoubleSide, toneMapped: false });
  material.userData.paHalo = true;
  result.traverse(mesh => {
    if (!mesh.isMesh) return;
    [mesh.material].flat().forEach(original => original.dispose());
    mesh.material = material; mesh.frustumCulled = false;
  });
  result.userData.paSourceModel = 75;
  return result;
}

export function attachMinoriHalo(root, halo) {
  if (!root.getObjectByName('CH0214') || root.getObjectByName('HaloRoot')) return false;
  let head;
  root.traverse(object => { if (!head && object.isBone && /bip.*[ _]head$/i.test(object.name)) head = object; });
  if (!head) throw Error('Minori head bone is missing');
  const pose = createPoseGeometry(), meshes = pose.refresh(root);
  const headBounds = pose.bounds(meshes, null, material => /_(?:hair|face)$/i.test(material.name));
  const bodyBounds = pose.bounds(meshes, null, material => /_body$/i.test(material.name));
  const source = new THREE.Box3().setFromObject(halo, true), width = headBounds.getSize(new THREE.Vector3()).x;
  if (headBounds.isEmpty() || source.isEmpty() || width <= 0) throw Error('Invalid Minori halo fitting bounds');
  const scale = width * .85 / source.getSize(new THREE.Vector3()).x;
  halo.scale.setScalar(scale);
  halo.position.copy(head.getWorldPosition(new THREE.Vector3())).addScaledVector(source.getCenter(new THREE.Vector3()), -scale);
  halo.position.y = Math.max(headBounds.max.y, bodyBounds.max.y) + width * .08 - source.min.y * scale;
  const anchor = new THREE.Group(); anchor.name = 'HaloRoot';
  root.updateWorldMatrix(true, true);
  root.add(anchor); anchor.matrix.copy(root.matrixWorld).invert(); anchor.matrix.decompose(anchor.position, anchor.quaternion, anchor.scale);
  anchor.add(halo); anchor.updateWorldMatrix(true, true); head.attach(anchor);
  return true;
}
