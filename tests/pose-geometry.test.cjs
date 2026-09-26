const { test } = require('node:test');
const assert = require('node:assert/strict');

test('cached pose vertices match Three skinning through animation, morphs, bind modes, and geometry edits', async () => {
  const THREE = await import('../assets/vendor/three/three.module.min.js');
  const { createPoseGeometry } = await import('../scripts/pose-geometry.js');
  const { getModelBounds } = await import('../scripts/model-viewer.js');
  const { collisionMaterial, referencedVertices } = await import('../scripts/model-collision.js');
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const bones = Array.from({ length: 5 }, () => new THREE.Bone());
  body.add(bones[0]);
  bones.slice(1).forEach((bone, i) => { bones[i].add(bone); bone.position.set(.15 * (i + 1), .4, -.08 * i); });
  const positions = [], skinIndices = [], weights = [], morph = [];
  for (let i = 0; i < 90; i++) {
    positions.push(Math.sin(i * .37), Math.cos(i * .13), Math.sin(i * .07) * 2);
    skinIndices.push(i % 5, (i + 1) % 5, (i + 2) % 5, (i + 3) % 5);
    // Deliberately include non-unit weights and rigid/zero weights: affine
    // translations cannot be pulled inside a weighted sum unless it sums to 1.
    weights.push(...(i % 3 === 0 ? [1, 0, 0, 0] : i % 3 === 1 ? [.1, .2, .3, .4] : [.2, .35, 0, .1]));
    morph.push(.1 * Math.cos(i), .05 * Math.sin(i * .9), .03);
  }
  const geometry = new THREE.BufferGeometry();
  const interleaved = new THREE.InterleavedBuffer(new Float32Array(positions.flatMap((v, i) => i % 3 === 2 ? [v, 42] : [v])), 4);
  geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(interleaved, 3, 0));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  geometry.setIndex(Array.from({ length: 90 }, (_, i) => i));
  geometry.addGroup(0, 60, 0); geometry.addGroup(60, 30, 1);
  const mesh = new THREE.SkinnedMesh(geometry, [new THREE.MeshBasicMaterial({ name: 'Body' }), new THREE.MeshBasicMaterial({ name: 'Hair' })]);
  body.add(mesh); mesh.position.set(.3, -.2, .4); root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  const pose = createPoseGeometry(), actual = new THREE.Vector3(), expected = new THREE.Vector3();
  let compared = 0;
  function verify() {
    const entry = pose.refresh(root).find(value => value.mesh === mesh);
    for (let i = 0; i < 90; i++) {
      mesh.getVertexPosition(i, expected); entry.read(i, actual);
      assert.ok(actual.distanceTo(expected) < 1e-11, `vertex ${i}: ${actual.distanceTo(expected)}`);
      // Repeated triangle references use the exact same cached point.
      entry.read(i, actual); assert.ok(actual.distanceTo(expected) < 1e-11);
      compared++;
    }
    const reference = new THREE.Box3();
    for (const i of referencedVertices(mesh, collisionMaterial)) reference.expandByPoint(mesh.getVertexPosition(i, expected).applyMatrix4(mesh.matrixWorld));
    const bounds = getModelBounds(root, null, collisionMaterial);
    assert.ok(bounds.min.distanceTo(reference.min) < 1e-11);
    assert.ok(bounds.max.distanceTo(reference.max) < 1e-11);
  }
  for (const mode of ['attached', 'detached']) {
    mesh.bindMode = mode;
    for (let frame = 0; frame < 12; frame++) {
      root.position.set(frame * .03, -.1 * frame, .02);
      root.scale.set(1.7, .8, 1.2); root.rotation.z = frame * .01;
      bones.forEach((bone, i) => bone.rotation.set(frame * .03 + i * .1, frame * -.07, i * .13));
      if (frame === 3) { geometry.morphAttributes.position = [new THREE.Float32BufferAttribute(morph, 3)]; geometry.morphTargetsRelative = true; mesh.updateMorphTargets(); }
      if (frame >= 3) mesh.morphTargetInfluences[0] = frame / 12;
      if (frame === 6) geometry.morphTargetsRelative = false;
      if (frame === 8) { geometry.attributes.position.setXYZ(8, .5, -.4, .7); interleaved.needsUpdate = true; }
      if (frame === 9) { geometry.attributes.skinWeight.setXYZW(4, .3, .1, .2, .4); geometry.attributes.skinWeight.needsUpdate = true; }
      if (frame === 10) mesh.bindMatrix.makeRotationY(.15);
      verify();
    }
  }
  assert.equal(compared, 2160);
});
