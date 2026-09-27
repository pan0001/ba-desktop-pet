const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('separately published Minori halo stays above the head and follows head motion', async () => {
  const THREE = await import('../assets/vendor/three/three.module.min.js');
  const { createMinoriHalo, attachMinoriHalo } = await import('../scripts/minori-halo.js');
  const root = new THREE.Group(); root.name = 'CH0214';
  const head = new THREE.Bone(); head.name = 'Bip001_Head'; head.position.set(0, 2, 0); root.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial({ name: 'CH0214_Hair' }));
  hair.position.copy(head.position); root.add(hair);
  const obj = fs.readFileSync(path.join(__dirname, '../assets/media/models/75/CH0214_Halo.obj'), 'utf8');
  const halo = createMinoriHalo(obj, new THREE.Texture());
  assert.equal(attachMinoriHalo(root, halo), true);
  root.updateMatrixWorld(true);
  assert.equal(root.getObjectByName('HaloRoot').parent, head);
  const box = new THREE.Box3().setFromObject(halo, true);
  assert.ok(box.min.y > 3);
  assert.ok(Math.abs(box.getSize(new THREE.Vector3()).x - 1.7) < 1e-6);
  const before = halo.getWorldPosition(new THREE.Vector3());
  head.position.x += 1; root.updateMatrixWorld(true);
  assert.ok(Math.abs(halo.getWorldPosition(new THREE.Vector3()).x - before.x - 1) < 1e-6);
  assert.equal(attachMinoriHalo(root, createMinoriHalo(obj, new THREE.Texture())), false);
});

test('known baked halo offsets are repaired without mutating source clips or genuine motion', async () => {
  const THREE = await import('../assets/vendor/three/three.module.min.js');
  const { prepareImportedHaloAnimations } = await import('../scripts/ba-model-materials.js');
  const root = new THREE.Group(), anchor = new THREE.Group(), mesh = new THREE.Object3D();
  anchor.name = 'HaloRoot'; mesh.name = 'Ako_Original_Halo'; mesh.position.set(0, .0002501857, -.0000136591);
  root.add(anchor); anchor.add(mesh);
  const exported = [0, .010550185106694698, -.002013659104704857];
  const original = new THREE.AnimationClip('Ako_Original_Cafe_Walk', 1, [new THREE.VectorKeyframeTrack(mesh.name + '.position', [0,1], [...exported,...exported])]);
  const moving = original.clone(); moving.tracks[0].values[4] += .002;
  const result = prepareImportedHaloAnimations(root, [original, moving]);
  assert.notEqual(result[0], original);
  assert.ok(Math.abs(result[0].tracks[0].values[1] - mesh.position.y) < 1e-8);
  assert.ok(Math.abs(original.tracks[0].values[1] - exported[1]) < 1e-8);
  assert.equal(result[1], moving, 'moving halo tracks retain their authored motion');
});

test('Mika halo stays horizontal with both public and rotated cafe anchors, then follows their motion', async () => {
  const THREE = await import('../assets/vendor/three/three.module.min.js');
  const { createMikaHalo, attachMikaHalo } = await import('../scripts/mika-halo.js');
  const base = path.join(__dirname,'../assets/media/models/201');
  for (const imported of [false,true]) {
    const root = new THREE.Group(); root.name = imported ? 'Cafe_CH0069' : 'CH0069';
    const head = new THREE.Bone(); head.name='Bip001_Head'; head.position.set(.3,2,.2); root.add(head);
    const hair = new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshBasicMaterial({name:'CH0069_Hair'}));
    hair.position.copy(head.position); root.add(hair);
    const anchor = new THREE.Group(); anchor.name='HaloRoot'; root.add(anchor);
    anchor.rotation.x = imported ? Math.PI/2 : 0;
    anchor.scale.setScalar(imported ? .01 : 1);
    root.updateMatrixWorld(true);
    const original = new THREE.Mesh(new THREE.BoxGeometry(2,.1,2)); original.name='CH0069_Halo';
    original.position.set(0,2,0); original.updateMatrix();
    original.applyMatrix4(anchor.matrixWorld.clone().invert()); anchor.add(original);
    const halo = createMikaHalo(fs.readFileSync(path.join(base,'ミカ.obj'),'utf8'),fs.readFileSync(path.join(base,'ミカ.mtl'),'utf8'),new THREE.Texture());
    assert.equal(attachMikaHalo(root,halo),true);
    root.updateMatrixWorld(true);
    const normal = new THREE.Vector3(0,1,0).applyQuaternion(halo.getWorldQuaternion(new THREE.Quaternion()));
    assert.ok(normal.distanceTo(new THREE.Vector3(0,1,0)) < 1e-6, 'halo axis must point up, including the 90-degree imported anchor');
    const ring = halo.getObjectByName('円');
    const ringCenter = ring.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(ring.matrixWorld);
    assert.ok(Math.abs(ringCenter.x-head.position.x)<1e-6 && Math.abs(ringCenter.z-head.position.z)<1e-6, 'ring is centered above the head, not at the old rear attachment');
    assert.ok(new THREE.Box3().setFromObject(halo,true).min.y >= 3.16-1e-6, 'all halo geometry clears the hair surface');
    const scale = halo.getWorldScale(new THREE.Vector3());
    const delta = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),.4);
    anchor.quaternion.premultiply(delta); root.updateMatrixWorld(true);
    const tilted = new THREE.Vector3(0,1,0).applyQuaternion(halo.getWorldQuaternion(new THREE.Quaternion()));
    assert.ok(tilted.distanceTo(normal.applyQuaternion(delta)) < 1e-6);
    assert.ok(halo.getWorldScale(new THREE.Vector3()).distanceTo(scale) < 1e-6);
    assert.equal(original.visible,false);
    assert.equal(attachMikaHalo(root,halo),false, 'repeated setup cannot duplicate the replacement');
  }
});

test('halo retains its authored placement and follows the animated head', async () => {
  const THREE = await import('../assets/vendor/three/three.module.min.js');
  const { bindHalo } = await import('../scripts/ba-model-materials.js');
  for (const name of ['Bip001_Head', 'Bip001 Head']) {
    const root = new THREE.Group(), head = new THREE.Bone(); head.name = name;
    head.position.set(.2, 1.5, 0); root.add(head);
    const body = new THREE.SkinnedMesh(); body.bind(new THREE.Skeleton([head])); root.add(body);
    const halo = new THREE.Group(); halo.name = 'HaloRoot'; halo.position.set(.2, 2, .1); root.add(halo);
    const before = halo.getWorldPosition(new THREE.Vector3());
    assert.equal(bindHalo(root), true);
    assert.ok(halo.getWorldPosition(new THREE.Vector3()).distanceTo(before) < 1e-8);
    const relative = halo.position.clone();
    head.position.x += .4; head.rotation.z = .6; root.updateMatrixWorld(true);
    assert.ok(halo.getWorldPosition(new THREE.Vector3()).distanceTo(head.localToWorld(relative)) < 1e-8);
    assert.equal(bindHalo(root), false, 'repeated setup must not move or scale the halo');
  }
});

test('halo keeps original texture and alpha while bypassing body lighting', async () => {
  const THREE = await import('../assets/vendor/three/three.module.min.js');
  const { prepareMaterials } = await import('../scripts/ba-model-materials.js');
  const texture = new THREE.Texture();
  const source = new THREE.MeshStandardMaterial({ name: 'Airi_Original_Halo', map: texture,
    color: 0x86ffcc, transparent: true, opacity: .8, alphaTest: .1, depthWrite: false });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(), source);
  prepareMaterials(halo);
  assert.equal(halo.material.isMeshBasicMaterial, true);
  assert.equal(halo.material.map, texture);
  assert.equal(halo.material.color.getHex(), 0x86ffcc);
  assert.equal(halo.material.transparent, true);
  assert.equal(halo.material.opacity, .8);
  assert.equal(halo.material.alphaTest, .1);
  assert.equal(halo.material.depthWrite, false);
  assert.equal(halo.material.toneMapped, false);
  assert.equal(halo.material.userData.paHalo, true);
});
