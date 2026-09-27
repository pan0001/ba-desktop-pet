import * as THREE from '../assets/vendor/three/three.module.min.js';
import { referencedVertices } from './model-collision.js';

// Three's general CPU skin query composes four bone matrices for every vertex.
// A pose shares those matrices: compose each bone once, then reuse exact double
// precision results for contact bounds and triangle picking. No mesh reduction,
// sampled contact points, or GPU/readback is involved.
export function createPoseGeometry() {
  const palettes = new WeakMap(), readers = new WeakMap();
  const matrix = new THREE.Matrix4(), base = new THREE.Vector4();
  let revision = 0;

  function paletteFor(skeleton) {
    let palette = palettes.get(skeleton);
    if (!palette || palette.values.length !== skeleton.bones.length * 16) {
      palette = { values: new Float64Array(skeleton.bones.length * 16), revision: -1 };
      palettes.set(skeleton, palette);
    }
    if (palette.revision !== revision) {
      for (let i = 0; i < skeleton.bones.length; i++) {
        matrix.multiplyMatrices(skeleton.bones[i].matrixWorld, skeleton.boneInverses[i]);
        palette.values.set(matrix.elements, i * 16);
      }
      palette.revision = revision;
    }
    return palette.values;
  }

  function readerFor(mesh) {
    const geometry = mesh.geometry, position = geometry.attributes.position;
    if (!mesh.isSkinnedMesh) return (index, target) => mesh.isMesh ? mesh.getVertexPosition(index, target) : target.fromBufferAttribute(position, index);
    const indices = geometry.attributes.skinIndex, weights = geometry.attributes.skinWeight;
    const transforms = paletteFor(mesh.skeleton);
    let reader = readers.get(mesh);
    // BufferAttribute versions cover edits; interleaved attributes share a data
    // version. Bind matrices may change independently of geometry or animation.
    const version = attribute => attribute.version ?? attribute.data?.version ?? 0;
    const signature = [position, indices, weights, version(position), version(indices), version(weights), ...mesh.bindMatrix.elements];
    if (!reader || signature.some((value, i) => value !== reader.signature[i])) {
      const count = position.count;
      reader = { signature, bound: new Float64Array(count * 4), indices: new Uint32Array(count * 4),
        weights: new Float64Array(count * 4), positions: new Float64Array(count * 3), stamps: new Float64Array(count) };
      for (let i = 0; i < count; i++) {
        base.set(position.getX(i), position.getY(i), position.getZ(i), 1).applyMatrix4(mesh.bindMatrix);
        base.toArray(reader.bound, i * 4);
        for (let j = 0; j < 4; j++) {
          reader.indices[i * 4 + j] = indices.getComponent(i, j) * 16;
          reader.weights[i * 4 + j] = weights.getComponent(i, j);
        }
      }
      readers.set(mesh, reader);
    }
    const currentRevision = revision, inverse = mesh.bindMatrixInverse.elements;
    const morphing = geometry.morphAttributes.position?.length > 0;
    return (index, target) => {
      const offset = index * 3, skinOffset = index * 4;
      if (reader.stamps[index] !== currentRevision) {
        let x, y, z, w;
        if (morphing) {
          THREE.Mesh.prototype.getVertexPosition.call(mesh, index, target);
          base.set(target.x, target.y, target.z, 1).applyMatrix4(mesh.bindMatrix);
          ({ x, y, z, w } = base);
        } else {
          x = reader.bound[skinOffset]; y = reader.bound[skinOffset + 1]; z = reader.bound[skinOffset + 2]; w = reader.bound[skinOffset + 3];
        }
        let px = 0, py = 0, pz = 0;
        for (let j = 0; j < 4; j++) {
          const weight = reader.weights[skinOffset + j];
          if (!weight) continue;
          const b = reader.indices[skinOffset + j];
          px += (transforms[b] * x + transforms[b + 4] * y + transforms[b + 8] * z + transforms[b + 12] * w) * weight;
          py += (transforms[b + 1] * x + transforms[b + 5] * y + transforms[b + 9] * z + transforms[b + 13] * w) * weight;
          pz += (transforms[b + 2] * x + transforms[b + 6] * y + transforms[b + 10] * z + transforms[b + 14] * w) * weight;
        }
        const divisor = 1 / (inverse[3] * px + inverse[7] * py + inverse[11] * pz + inverse[15]);
        reader.positions[offset] = (inverse[0] * px + inverse[4] * py + inverse[8] * pz + inverse[12]) * divisor;
        reader.positions[offset + 1] = (inverse[1] * px + inverse[5] * py + inverse[9] * pz + inverse[13]) * divisor;
        reader.positions[offset + 2] = (inverse[2] * px + inverse[6] * py + inverse[10] * pz + inverse[14]) * divisor;
        reader.stamps[index] = currentRevision;
      }
      return target.fromArray(reader.positions, offset);
    };
  }

  function refresh(object) {
    revision++;
    object.updateWorldMatrix(true, false);
    // SkinnedMesh.updateMatrixWorld refreshes bindMatrixInverse, unlike
    // updateWorldMatrix. CPU skinning reads bone worlds directly; the renderer
    // owns the separate Float32 GPU skeleton palette.
    object.updateMatrixWorld(true);
    const entries = [];
    object.traverseVisible(mesh => {
      if (mesh.geometry?.attributes.position) entries.push({ mesh, read: readerFor(mesh) });
    });
    return entries;
  }

  function bounds(entries, relativeTo = null, materialFilter = null) {
    const box = new THREE.Box3(), point = new THREE.Vector3();
    const deferred = [];
    const inverse = relativeTo?.matrixWorld.clone().invert();
    for (const { mesh, read } of entries) {
      const target = mesh.userData.paCollapsedProp ? new THREE.Box3() : box;
      const indices = mesh.isMesh ? referencedVertices(mesh, materialFilter) : Array.from({ length: mesh.geometry.attributes.position.count }, (_, i) => i);
      for (const index of indices) {
        read(index, point).applyMatrix4(mesh.matrixWorld);
        if (inverse) point.applyMatrix4(inverse);
        if (Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)) target.expandByPoint(point);
      }
      if (target !== box && !target.isEmpty()) deferred.push(target);
    }
    const referenceExtent = box.isEmpty() ? 0 : box.getSize(new THREE.Vector3()).length();
    for (const prop of deferred) if (!referenceExtent || prop.getSize(new THREE.Vector3()).length() >= referenceExtent * .003) box.union(prop);
    return box;
  }
  return { refresh, bounds };
}
