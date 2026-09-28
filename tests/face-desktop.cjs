const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { _electron: electron } = require('playwright');
const root = path.resolve(__dirname, '..');
const only = process.argv[2]?.split(',');
(async () => {
  const env = { ...process.env, BA_PET_TEST_PROFILE: path.join(root, 'test-results/face-regression-profile') };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [root, '--test-mode'], env });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('#stage[data-state="ready"]');
    const report = await page.evaluate(async only => {
      const THREE = await import('/assets/vendor/three/three.module.min.js');
      const { GLTFLoader } = await import('/assets/vendor/three/GLTFLoader.js');
      const { prepareMaterials, attachMouth, setMouthFrame, MOUTH_ATLAS } = await import('/scripts/ba-model-materials.js');
      const { selectModelAnimations } = await import('/scripts/model-viewer.js');
      const catalog = await (await fetch('/assets/characters.json')).json();
      const records = [];
      for (const character of catalog.filter(character => !only || only.includes(character.id))) {
        const gltf = await new GLTFLoader().loadAsync('/' + character.file), model = gltf.scene;
        prepareMaterials(model);
        const texture = new THREE.Texture(); setMouthFrame(texture);
        const meshes = []; model.traverse(mesh => { if (mesh.isMesh) meshes.push(mesh); });
        const originals = meshes.map(mesh => ({ mesh, geometry: mesh.geometry, material: mesh.material,
          uv: Array.from(mesh.geometry.attributes.uv?.array || []), positions: Array.from(mesh.geometry.attributes.position.array) }));
        const face = attachMouth(model, texture), errors = [];
        const mixer = new THREE.AnimationMixer(model), actions = selectModelAnimations(gltf.animations);
        let samples = 0;
        for (const clip of [...new Set([actions.idle, actions.walk, actions.pickup, actions.down].filter(Boolean))]) {
          mixer.stopAllAction(); mixer.clipAction(clip).reset().play();
          for (const fraction of [0, .5, .99]) {
            mixer.setTime(clip.duration * fraction);
            setMouthFrame(texture, Math.floor(fraction * 63)); samples++;
            if (character.id === '287') {
              for (const name of ['CH0187_B_Body', 'CH0187_Machine']) {
                if (model.getObjectByName(name)?.visible !== false) errors.push('Toki combat part overlaps desktop outfit: ' + name);
              }
              for (const name of ['CH0187_Body', 'CH0187_A_Body', 'bone_root_Machine']) {
                if (model.getObjectByName(name)?.visible !== true) errors.push('Toki body or shared rig missing: ' + name);
              }
              if (!face) errors.push('Toki mouth missing');
            }
            for (const original of originals) {
              const { mesh } = original;
              if (mesh !== face && (mesh.material !== original.material || mesh.geometry !== original.geometry)) errors.push('Non-mouth mesh changed: ' + mesh.name);
              if (mesh === face && mesh.material[0] !== original.material) errors.push('Eye material changed');
              if (JSON.stringify(Array.from(mesh.geometry.attributes.uv?.array || [])) !== JSON.stringify(original.uv)) errors.push('Eye UVs changed: ' + mesh.name);
              if (JSON.stringify(Array.from(mesh.geometry.attributes.position.array)) !== JSON.stringify(original.positions)) errors.push('Face vertices changed: ' + mesh.name);
            }
          }
        }
        // Atsuko's original model has a full mask and no eye/mouth primitive.
        const legacy = character.studentId < 100000;
        if (legacy && character.id !== '216' && !face) errors.push('Previously supported mouth is missing');
        records.push({ id: character.id, mouth: face?.name || null, samples, errors: [...new Set(errors)] });
        mixer.stopAllAction(); mixer.uncacheRoot(model);
        const textures = new Set(), materials = new Set();
        model.traverse(mesh => { mesh.geometry?.dispose(); for (const material of [mesh.material].flat().filter(Boolean)) materials.add(material); });
        for (const material of materials) { if (material.map) textures.add(material.map); material.dispose(); }
        for (const value of textures) { value.dispose(); value.source?.data?.close?.(); }
      }
      return records;
    }, only);
    const reportFile = path.join(root, 'test-results/face-regression.json');
    const merged = new Map(only && fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile)).map(record => [record.id, record]) : []);
    for (const record of report) merged.set(record.id, record);
    fs.writeFileSync(reportFile, JSON.stringify([...merged.values()], null, 2));
    assert.deepEqual(report.filter(record => record.errors.length), []);
    console.log(JSON.stringify({ models: report.length, mouths: report.filter(record => record.mouth).length, samples: report.reduce((sum,record) => sum + record.samples,0), errors: 0 }));
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
