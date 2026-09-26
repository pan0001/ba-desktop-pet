const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), out = path.join(root, 'test-results');
(async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [root, '--test-mode'], env });
  try {
    const page = await app.firstWindow(); await page.waitForSelector('#stage[data-state="ready"]');
    await page.evaluate(() => window.pet.update({ paused: true, roaming: false }));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 720));
    const details = await page.evaluate(async () => {
      const THREE = await import('/assets/vendor/three/three.module.min.js');
      const { GLTFLoader } = await import('/assets/vendor/three/GLTFLoader.js');
      const { prepareMaterials, prepareAnimations, bindHalo } = await import('/scripts/ba-model-materials.js');
      const gltf = await new GLTFLoader().loadAsync('/assets/media/models/212/Aris_Original.glb');
      const root = gltf.scene; prepareMaterials(root); const clips = prepareAnimations(root, gltf.animations); bindHalo(root);
      const scene = new THREE.Scene(), wrapper = new THREE.Group(); wrapper.add(root); scene.add(wrapper);
      scene.add(new THREE.AmbientLight(0xffffff, 2)); const key = new THREE.DirectionalLight(0xffffff, 2); key.position.set(2, 4, 5); scene.add(key);
      const mixer = new THREE.AnimationMixer(root), idle = clips.find(c => /Cafe_Idle$/.test(c.name));
      mixer.clipAction(idle).play(); mixer.update(0); root.updateMatrixWorld(true);
      root.traverse(o => { if (o.isSkinnedMesh) o.skeleton.update(); });
      const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
      const scale = 2.8 / size.y; wrapper.scale.setScalar(scale); wrapper.position.set(-center.x * scale, -box.min.y * scale, 0);
      mixer.stopAllAction();
      const renderer = new THREE.WebGLRenderer({ alpha: false, antialias: true }); renderer.setSize(220, 260); renderer.setClearColor('#e8f2f8');
      const camera = new THREE.OrthographicCamera(-1.9, 1.9, 3.5, -.3, .01, 100); camera.position.set(0, 0, 10); camera.lookAt(0, 0, 0);
      document.body.innerHTML = ''; document.body.style.cssText = 'height:auto;overflow:visible;background:#fff;color:#20394d;display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:12px';
      document.documentElement.style.cssText = 'height:auto;overflow:visible';
      const summary = [];
      for (const suffix of ['Vital_Death', 'Vital_Dying_Ing', 'Vital_Retreat']) {
        const clip = clips.find(c => c.name.toLowerCase().endsWith(suffix.toLowerCase()));
        summary.push({ name: clip.name, duration: clip.duration });
        for (const portion of [0, .33, .66, .999]) {
          mixer.stopAllAction(); const action = mixer.clipAction(clip); action.reset().setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play(); mixer.setTime(clip.duration * portion); renderer.render(scene, camera);
          const figure = document.createElement('div'), label = document.createElement('div'), img = document.createElement('img');
          label.textContent = `${suffix} · ${Math.round(portion * 100)}%`; label.style.cssText = 'font:12px Segoe UI;margin:6px'; img.src = renderer.domElement.toDataURL(); img.style.width = '100%'; figure.append(label, img); document.body.append(figure);
        }
      }
      renderer.dispose(); return summary;
    });
    fs.writeFileSync(path.join(out, 'landing-clips.json'), JSON.stringify(details, null, 2));
    await page.screenshot({ path: path.join(out, 'landing-clips.png'), fullPage: true });
    console.log(details);
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
