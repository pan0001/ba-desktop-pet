const { test } = require('node:test');
const assert = require('node:assert/strict');
test('hair and unused vertices do not contribute to contact bounds', async () => {
  const THREE = await import('../assets/vendor/three/three.module.min.js');
  const { getModelBounds } = await import('../scripts/model-viewer.js');
  const { collisionMaterial, isCollisionHit } = await import('../scripts/model-collision.js');
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, -9, -8, 0, 9, -8, 0, 0, -7, 0, 0, -1000, 0], 3));
  geometry.setIndex([0, 1, 2, 3, 4, 5]); geometry.addGroup(0, 3, 0); geometry.addGroup(3, 3, 1);
  const mesh = new THREE.Mesh(geometry, [new THREE.MeshBasicMaterial({ name: 'Body' }), new THREE.MeshBasicMaterial({ name: 'Hair_2' })]);
  assert.equal(getModelBounds(mesh).min.y, -8);
  assert.equal(getModelBounds(mesh, null, collisionMaterial).min.y, 0);
  assert.equal(getModelBounds(mesh, null, collisionMaterial).max.x, 1);
  assert.equal(isCollisionHit({ object: mesh, face: { materialIndex: 1 } }), false);
  assert.equal(isCollisionHit({ object: mesh, face: { materialIndex: 0 } }), true);
});
