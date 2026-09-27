const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), { createHash } = require('node:crypto');
const { CareSystem } = require('../electron/care.cjs');
const root = path.resolve(__dirname, '..');
const imported = require('../assets/media/student-imports.json');
const characters = require('../assets/characters.json');

test('new student resources are self-contained, traceable and retain body skin bindings', () => {
  assert.equal(imported.modelSource, 'kivo');
  for (const student of Object.values(imported.students)) {
    assert.equal(student.source, `https://kivo.wiki/student/${student.kivoId}`);
    for (const locale of ['zh', 'ja', 'en']) assert.ok(student.displayNames[locale]?.trim(), `${student.id}/${locale}`);
    assert.ok(student.portrait && fs.existsSync(path.join(root, student.portrait)), student.name);
    for (const model of student.models.filter(model => model.origin !== 'existing')) {
      assert.equal(model.origin.kind, 'kivo', student.name);
      assert.equal(new URL(model.origin.url).hostname, 'static.kivo.wiki');
      for (const supplement of model.supplementalHalo?.files || []) {
        assert.equal(new URL(supplement.url).hostname, 'static.kivo.wiki');
        assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root, supplement.file))).digest('hex'), supplement.sha256);
      }
      const file = path.resolve(root, model.file);
      assert.ok(file.startsWith(path.join(root, 'assets/media/imported-models') + path.sep));
      const bytes = fs.readFileSync(file);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), model.sha256, student.name);
      const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
      assert.ok(gltf.animations.some(animation => animation.name === model.idle));
      assert.ok(gltf.buffers.every(buffer => !buffer.uri));
      assert.ok((gltf.images || []).every(image => !image.uri || image.uri.startsWith('data:')));
      for (const material of gltf.materials.filter(material => /_(body|hair)$/i.test(material.name))) {
        assert.ok(material.pbrMetallicRoughness?.baseColorTexture != null, `${student.name}: ${material.name} texture`);
      }
      for (const node of gltf.nodes.filter(node => node.mesh != null)) {
        const mesh = gltf.meshes[node.mesh];
        if (mesh.primitives.some(p => /_body$/i.test(gltf.materials?.[p.material]?.name)) &&
            mesh.primitives.some(p => /_(face|eyemouth|hair)$/i.test(gltf.materials?.[p.material]?.name))) {
          assert.ok(Number.isInteger(node.skin), `${student.name}: animated body must have its skeleton`);
        }
      }
    }
  }
});

test('supplemental costumes use their matching body rather than the wrong base-student link', () => {
  for (const [id, modelId] of [[610, '542'], [611, '546'], [612, '544']]) {
    const coverage = imported.coverage.find(student => student.kivoId === id);
    assert.equal(coverage.status, 'included');
    assert.deepEqual(coverage.models, [modelId]);
    const student = Object.values(imported.students).find(student => student.kivoId === id);
    assert.equal(student.models.length, 1);
    assert.equal(String(student.models[0].id), modelId);
    if (id !== 610) assert.ok(coverage.issues.some(issue => /different costume/.test(issue.reason)));
  }
});

test('adding students preserves old care progress and gives new students independent saves', () => {
  const initial = new CareSystem({ characters: characters.filter(c => c.studentId < 100000) });
  initial.act('212', 'tap');
  const xp = initial.snapshot('212').xp;
  const expanded = new CareSystem({ characters, stored: initial.serialize() });
  assert.equal(expanded.snapshot('212').xp, xp);
  const added = characters.find(c => c.studentId >= 100000);
  assert.equal(expanded.snapshot(added.id).xp, 0);
  expanded.act(added.id, 'pet');
  assert.ok(expanded.snapshot(added.id).xp > 0);
  assert.equal(expanded.snapshot('212').xp, xp);
});
