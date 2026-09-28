const test = require('node:test');
const assert = require('node:assert/strict');

async function setup() {
  const THREE = await import('../assets/vendor/three/three.module.min.js');
  const adapter = await import('../scripts/ba-model-materials.js');
  function patch(uv, y=0) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0,y,0, 1,y,0, 0,y+1,0],3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1,0,0,0, 1,0,0,0, 1,0,0,0],4));
    geometry.setIndex([0,1,2]);
    return geometry;
  }
  return { THREE, ...adapter, patch };
}

test('a standalone eye is skipped and the authored mouth UV patch is used without changing eyes', async () => {
  const { THREE, attachMouth, patch } = await setup();
  const root = new THREE.Group(), eyeTexture = new THREE.Texture(), mouthTexture = new THREE.Texture();
  const eyeMaterial = new THREE.MeshToonMaterial({ name: 'Student_EyeMouth', map: eyeTexture });
  const eye = new THREE.SkinnedMesh(patch([.4,.1,.9,.1,.4,.7]), eyeMaterial);
  const mouth = new THREE.SkinnedMesh(patch([.01,.8,.24,.8,.01,.96],10), eyeMaterial);
  root.add(eye,mouth);
  const beforeUV = Array.from(mouth.geometry.attributes.uv.array), beforeWeights = Array.from(mouth.geometry.attributes.skinWeight.array);
  const eyeGeometry = eye.geometry;
  assert.equal(attachMouth(root,mouthTexture),mouth);
  assert.equal(eye.material,eyeMaterial); assert.equal(eye.geometry,eyeGeometry);
  assert.equal(eye.material.map,eyeTexture);
  assert.equal(mouth.material[1].map,mouthTexture);
  assert.deepEqual(Array.from(mouth.geometry.attributes.uv.array),beforeUV);
  assert.deepEqual(Array.from(mouth.geometry.attributes.skinWeight.array),beforeWeights);
  assert.equal(attachMouth(root,mouthTexture),null, 'preparing again must not turn the remaining eye into a mouth');
});

test('missing or ambiguous UVs do not assign the mouth texture to an eye', async () => {
  const { findMouthIsland, patch } = await setup();
  const geometry = patch([.01,.8,.24,.8,.01,.96]);
  const island = { indices:[0,1,2] };
  assert.equal(findMouthIsland(geometry,[island,island]),null);
  geometry.deleteAttribute('uv'); assert.equal(findMouthIsland(geometry),null);
  assert.equal(findMouthIsland(patch([.4,.1,.9,.1,.4,.7])),null);
});

test('a mirrored half-mouth keeps its authored UVs and does not match a pupil patch', async () => {
  const { findMouthIsland, patch } = await setup();
  const geometry = patch([.125,.793,.241,.793,.125,.957]);
  const before = Array.from(geometry.attributes.uv.array);
  assert.ok(findMouthIsland(geometry));
  assert.deepEqual(Array.from(geometry.attributes.uv.array), before);
  assert.equal(findMouthIsland(patch([.125,.80,.15,.80,.125,.825])), null);
});

test('source prefab visibility hides only its recorded alternate face', async () => {
  const { THREE, prepareMaterials } = await setup();
  const root = new THREE.Group(), prefab = new THREE.Group(); prefab.name='Cafe_CH0167'; root.add(prefab);
  const neutral = new THREE.Group(); neutral.name='CH0167_Body_Face_Outline';
  const alternate = new THREE.Group(); alternate.name='CH0167_Body_Face01_Outline'; prefab.add(neutral,alternate);
  const unrelated = alternate.clone(); root.add(unrelated);
  prepareMaterials(root);
  assert.equal(alternate.visible,false); assert.equal(alternate.userData.paInactiveExpression,true);
  assert.equal(neutral.visible,true); assert.equal(unrelated.visible,true);
});

test('public cafe roots inherit source visibility and cut-in extras do not hide the student', async () => {
  const { THREE, prepareMaterials } = await setup();
  const root = new THREE.Group(), hare = new THREE.Group(); hare.name = 'Hare_Original'; root.add(hare);
  const drone = new THREE.Group(); drone.name = 'Hare_Original_Dron'; hare.add(drone);
  const body = new THREE.Group(); body.name = 'Hare_Original_Body'; hare.add(body);
  const cherino = new THREE.Group(); cherino.name = 'Cherino_Original'; root.add(cherino);
  const cutin = new THREE.Group(); cutin.name = 'CherinoRoyalGuard_Exs_Cutin'; cherino.add(cutin);
  const unrelated = cutin.clone(); root.add(unrelated);
  prepareMaterials(root);
  assert.equal(drone.visible, false); assert.equal(body.visible, true);
  assert.equal(cutin.visible, false); assert.equal(unrelated.visible, true);
});

test('Toki keeps the maid body and skeleton while excluding overlapping combat parts', async () => {
  const { THREE, prepareMaterials } = await setup();
  const root = new THREE.Group(), toki = new THREE.Group(); toki.name = 'CH0187'; root.add(toki);
  const parts = Object.fromEntries(['CH0187_Body', 'CH0187_A_Body', 'CH0187_B_Body', 'CH0187_Machine', 'CH0187_Weapon', 'bone_root_Machine'].map(name => {
    const part = new THREE.Group(); part.name = name; toki.add(part); return [name, part];
  }));
  const unrelated = parts.CH0187_Machine.clone(); root.add(unrelated);
  prepareMaterials(root);
  assert.equal(parts.CH0187_B_Body.visible, false);
  assert.equal(parts.CH0187_Machine.visible, false);
  for (const name of ['CH0187_Body', 'CH0187_A_Body', 'CH0187_Weapon', 'bone_root_Machine']) assert.equal(parts[name].visible, true);
  assert.equal(unrelated.visible, true);
  assert.equal(toki.children.length, 6, 'retain shared skeleton bindings and source hierarchy');
});
