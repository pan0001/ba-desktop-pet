// Validate converted prefabs with the same GLTF loader and material/halo adapter
// as the desktop renderer. Reports are QA evidence, not catalogue approval.
const fs = require('node:fs'), path = require('node:path');
const { createHash } = require('node:crypto');
const { _electron: electron } = require('playwright');
const root = path.resolve(__dirname, '../..');
const source = process.argv[2];
if (!source) throw Error('Usage: node tools/game-assets/validate-halos.cjs EXPORT_DIRECTORY [group,...]');
const only = process.argv[3]?.split(',');
const output = path.join(root, 'test-results/content-import/halo-audit');
fs.mkdirSync(output, { recursive: true });
const selectedHistoryFile = path.join(output, 'installed-selected-report.json');
const selectedHistory = new Map(source === '--catalog' && only && fs.existsSync(selectedHistoryFile)
  ? JSON.parse(fs.readFileSync(selectedHistoryFile)).map(record => [record.group, record]) : []);
const files = source === '--catalog'
  ? JSON.parse(fs.readFileSync(path.join(root, 'assets/characters.json'))).filter(item => !only || only.includes(item.id)).map(item => ({ name: `installed-${item.id}`, file: path.join(root, item.file), haloMode: item.haloMode }))
  : fs.readdirSync(source).filter(name => !only || only.includes(name))
  .map(name => ({ name, file: path.join(source, name, 'model.glb'), result: path.join(source, name, 'result.json') }))
  .filter(item => fs.existsSync(item.result) && JSON.parse(fs.readFileSync(item.result)).status === 'converted');
(async () => {
  const env = { ...process.env, BA_PET_TEST_PROFILE: path.join(output, `profile-${process.pid}-${Date.now()}`) };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [root, '--test-mode'], env });
  const records = [];
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('#stage[data-state="ready"]', { timeout: 60000 });
    await page.evaluate(() => window.pet.update({ paused: true, roaming: false }));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1200, 850));
    await page.evaluate(async () => {
      const THREE = await import('/assets/vendor/three/three.module.min.js');
      const { GLTFLoader } = await import('/assets/vendor/three/GLTFLoader.js');
      const { prepareMaterials, prepareAnimations, bindHalo, attachMouth, MOUTH_ATLAS, setMouthFrame } = await import('/scripts/ba-model-materials.js');
      const { getModelBounds, loadReplacementHalo, selectModelAnimations } = await import('/scripts/model-viewer.js');
      const { createToonRenderer } = await import('/scripts/toon-renderer.js');
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
      renderer.setSize(220, 270); renderer.setClearColor('#d5e8f2');
      window.auditHalo = async ({ encoded, haloMode }) => {
        const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
        const gltf = await new GLTFLoader().parseAsync(bytes.buffer, document.baseURI);
        const model = gltf.scene;
        let toon, mixer;
        try {
          prepareMaterials(model);
          const clips = prepareAnimations(model, gltf.animations);
          const rebound = bindHalo(model);
          await loadReplacementHalo(model, new AbortController().signal);
          const anchor = model.getObjectByName('HaloRoot');
          const response = await fetch(MOUTH_ATLAS);
          const bitmap = await createImageBitmap(await response.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
          const mouth = new THREE.Texture(bitmap); mouth.colorSpace = THREE.SRGBColorSpace; mouth.needsUpdate = true;
          setMouthFrame(mouth);
          if (!attachMouth(model, mouth)) { mouth.dispose(); bitmap.close(); }
          const halos = [], bones = [];
          model.traverse(object => {
            if (object.isMesh && [object.material].flat().some(material => material.userData.paHalo)) halos.push(object);
            if (object.isBone && /bip.*[ _]head$/i.test(object.name)) bones.push(object);
          });
          const head = bones[0];
          const embedded = haloMode === 'embedded-hair-accessory';
          if (!halos.length && !embedded) throw Error('No renderable halo material');
          if (!head) throw Error('No head bone');
          if (anchor && anchor.parent !== head) throw Error('HaloRoot is not attached to head');
          const samples = [], errors = [];
          let previewMetrics;
          mixer = new THREE.AnimationMixer(model);
          const actions = selectModelAnimations(clips);
          const selected = [...new Set([actions.idle, actions.walk, actions.pickup, actions.down].filter(Boolean))];
          if (!selected.length) throw Error('No playable animations');
          const scene = new THREE.Scene(); scene.add(model);
          scene.add(new THREE.AmbientLight(0xffffff, 2));
          const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(2, 4, 5); scene.add(light);
          const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .001, 10000);
          toon = createToonRenderer(renderer, scene, camera, model);
          let standingHeight, preview;
          for (const clip of selected) {
            mixer.stopAllAction();
            mixer.clipAction(clip).reset().setLoop(THREE.LoopOnce, 1).play();
            for (const fraction of [0, .33, .67, .999]) {
              mixer.setTime(clip.duration * fraction); model.updateMatrixWorld(true);
              model.traverse(object => { if (object.isSkinnedMesh) object.skeleton.update(); });
              const box = getModelBounds(model), size = box.getSize(new THREE.Vector3());
              standingHeight ||= size.y;
              const haloBox = new THREE.Box3();
              for (const mesh of halos) if (mesh.visible) haloBox.union(getModelBounds(mesh));
              const center = haloBox.getCenter(new THREE.Vector3()), headPosition = head.getWorldPosition(new THREE.Vector3());
              const distance = center.distanceTo(headPosition) / standingHeight;
              if (!Number.isFinite(size.length()) || (!embedded && (!Number.isFinite(distance) || haloBox.isEmpty() || distance > 1))) errors.push(`${clip.name}@${fraction}: invalid or detached halo (${distance})`);
              samples.push({ clip: clip.name, fraction, headDistance: distance });
              if (!preview) {
                const middle = box.getCenter(new THREE.Vector3()), half = Math.max(size.y / 2, size.x * 270 / 440) * 1.12;
                camera.left = -half * 220 / 270; camera.right = -camera.left; camera.top = half; camera.bottom = -half;
                camera.position.copy(middle).add(new THREE.Vector3(0, 0, Math.max(10, size.z + standingHeight * 4)));
                camera.lookAt(middle); camera.updateProjectionMatrix(); toon.render(); preview = renderer.domElement.toDataURL('image/png');
                let bodyBox = getModelBounds(model, null, material => /_(?:body|hair|face)$/i.test(material.name));
                // Scenario models can have one combined material named after
                // the character rather than separate Body/Hair/Face materials.
                if (bodyBox.isEmpty()) bodyBox = getModelBounds(model, null, material => !/halo|weapon/i.test(material.name));
                const bodySize = bodyBox.getSize(new THREE.Vector3());
                const headGap = embedded ? null : center.distanceTo(headPosition) / bodySize.y;
                previewMetrics = { bodyHeight: bodySize.y, fullHeight: size.y, headGap };
                if (!bodySize.y || bodySize.y / size.y < .25) errors.push('Character is dwarfed by detached geometry');
                // Seated/box-hiding cafe poses shorten the current body bounds.
                if (!embedded && headGap > .9) errors.push('Halo is too far from the head');
                // A mesh with an empty alpha texture can pass all geometry tests.
                // Render the halo alone to catch this in the real GPU pipeline.
                const hidden = [];
                model.traverse(object => { if (object.isMesh && object.visible && !halos.includes(object)) { hidden.push(object); object.visible = false; } });
                renderer.setClearColor(0, 0); renderer.render(scene, camera);
                const pixels = new Uint8Array(220 * 270 * 4), gl = renderer.getContext();
                gl.readPixels(0, 0, 220, 270, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                let visiblePixels = 0;
                for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 8) visiblePixels++;
                if (!embedded && visiblePixels < 3) errors.push('Halo produces no visible pixels');
                hidden.forEach(object => { object.visible = true; }); renderer.setClearColor('#d5e8f2');
              }
            }
          }
          return { status: errors.length ? 'needs-review' : 'passed', halos: halos.map(mesh => mesh.name), head: head.name, rebound, previewMetrics, samples, errors, preview };
        } finally {
          mixer?.stopAllAction(); mixer?.uncacheRoot(model); toon?.dispose();
          const textures = new Set(), materials = new Set(), geometry = new Set();
          model.traverse(object => { if (object.geometry) geometry.add(object.geometry); for (const material of [object.material].flat().filter(Boolean)) materials.add(material); });
          for (const material of materials) { for (const value of Object.values(material)) if (value?.isTexture) textures.add(value); material.dispose(); }
          for (const texture of textures) { texture.dispose(); texture.source?.data?.close?.(); }
          geometry.forEach(value => value.dispose()); renderer.renderLists.dispose();
        }
      };
    });
    for (const item of files) {
      let result;
      try { result = await page.evaluate(args => window.auditHalo(args), { encoded: fs.readFileSync(item.file).toString('base64'), haloMode: item.haloMode }); }
      catch (error) { result = { status: 'failed', error: error.message }; }
      if (result.preview) { fs.writeFileSync(path.join(output, `${item.name}.png`), Buffer.from(result.preview.split(',')[1], 'base64')); delete result.preview; }
      records.push({ group: item.name, sha256: createHash('sha256').update(fs.readFileSync(item.file)).digest('hex'), ...result });
      const reportPath = path.join(output, source === '--catalog' ? (only ? 'installed-selected-report.json' : 'installed-report.json') : 'report.json');
      if (source === '--catalog' && only) selectedHistory.set(item.name, records.at(-1));
      fs.writeFileSync(reportPath + '.tmp', JSON.stringify(source === '--catalog' && only ? [...selectedHistory.values()] : records, null, 2));
      fs.renameSync(reportPath + '.tmp', reportPath);
      console.log(`${records.length}/${files.length} ${item.name}: ${result.status}`);
    }
  } finally { await app.close(); }
  if (records.some(record => record.status !== 'passed')) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
