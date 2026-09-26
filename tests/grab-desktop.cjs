const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), out = path.join(root, 'test-results');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const env = { ...process.env, BA_PET_TEST_PROFILE: path.join(out, 'grab-profile') }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [root, '--test-mode', '--measure-pet'], env });
  const errors = [], results = [];
  app.on('window', p => { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); });
  const main = (action, arg) => app.evaluate(({ app }, { action, arg }) => process.mainModule.require(app.getAppPath() + '/electron/main.cjs')[action](arg), { action, arg });
  try {
    const page = await app.firstWindow(); await page.waitForSelector('#stage[data-state="ready"]');
    // CDP supplies pointer events; do not steal OS focus from the person using
    // the desktop, or a real app switch would correctly cancel this test drag.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFocusable(false));
    await page.evaluate(() => window.pet.update({ characterId: '212', roaming: false, windowWalking: false, paused: false, physics: true, size: 360 }));
    await page.waitForSelector('#stage[data-character="212"][data-state="ready"]');
    await wait(500);
    await page.screenshot({ path: path.join(out, 'overscan-idle.png'), omitBackground: true });
    for (const kind of ['face', 'body']) {
      const d = await main('diagnostics');
      const y = Math.round(d.foot.y - (kind === 'face' ? 185 : 100));
      let point;
      for (let offset = 0; offset < 90 && !point; offset += 8) {
        for (const sign of [-1, 1]) {
          const x = Math.round(d.foot.x + sign * offset);
          await main('testCursor', { x: d.bounds.x + x, y: d.bounds.y + y }); await wait(85);
          if (await page.locator('#stage').getAttribute('data-hover') === 'true') { point = { x, y }; break; }
        }
      }
      assert.ok(point, `${kind} accepts input`);
      await page.mouse.move(point.x, point.y); await page.mouse.down();
      const start = await main('diagnostics'); assert.equal(start.world.dragging, true);
      await main('testCursor', { x: start.bounds.x + point.x - 20, y: start.bounds.y + point.y });
      await page.waitForSelector('#stage[data-drag="true"]');
      // Reproduce an old pre-pointerdown motion packet arriving after hold().
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('pet:motion', { dragging: false, mode: 'idle', vx: 0 }));
      await page.evaluate(() => { window.petFrames = []; });
      let lastCursor;
      for (let i = 0; i < 65; i++) {
        const dx = Math.round(Math.sin(i / 8) * 170), dy = Math.round(Math.sin(i / 13) * 55);
        lastCursor = { x: start.bounds.x + point.x + dx, y: start.bounds.y + point.y + dy };
        await main('testCursor', lastCursor); await wait(30);
      }
      const frames = (await page.evaluate(() => window.petFrames)).filter(f => f.mode === 'held');
      fs.writeFileSync(path.join(out, 'grab-debug.json'), JSON.stringify(frames, null, 2));
      await page.screenshot({ path: path.join(out, `overscan-drag-${kind}.png`), omitBackground: true });
      assert.ok(frames.length > 20); assert.ok(frames.every(f => f.grabError !== null), 'Late motion packets must not detach the pivot');
      assert.ok(frames.every(f => !/hair/i.test(f.grabbedSurface)), 'Hair is never a grab surface');
      assert.ok(Math.max(...frames.map(f => f.grabError)) < .5, 'Actual clicked skin point stays under cursor');
      for (const f of frames) {
        const b = f.visibleBounds;
        assert.ok(b.left > 3 && b.right < d.bounds.width - 3 && b.top > 3 && b.bottom < d.bounds.height - 3, `Entire character and weapon fit: ${JSON.stringify(b)}`);
      }
      const end = await main('diagnostics');
      fs.writeFileSync(path.join(out, 'grab-window-debug.json'), JSON.stringify({ kind, point, start, end, lastCursor }, null, 2));
      assert.equal(end.world.dragging, true, 'Test gesture remains held until pointerup');
      assert.ok(Math.abs(end.bounds.x + point.x - lastCursor.x) < 1);
      assert.ok(Math.abs(end.bounds.y + point.y - lastCursor.y) < 1);
      await page.screenshot({ path: path.join(out, `overscan-drag-${kind}.png`), omitBackground: true });
      results.push({ kind, frames: frames.length, maxGrabError: Math.max(...frames.map(f => f.grabError)), surface: frames.at(-1).grabbedSurface,
        leftMargin: Math.min(...frames.map(f => f.visibleBounds.left)), rightMargin: d.bounds.width - Math.max(...frames.map(f => f.visibleBounds.right)) });
      await page.mouse.up(); await wait(500);
      const releaseFrames = await page.evaluate(() => window.petFrames);
      fs.writeFileSync(path.join(out, `release-frames-${kind}.json`), JSON.stringify(releaseFrames, null, 2));
      const released = releaseFrames.findIndex((f,i) => i > 0 && releaseFrames[i-1].mode === 'held' && f.mode !== 'held');
      if (released > 0) {
        const before = releaseFrames[released-1].pose.root, after = releaseFrames[released].pose.root;
        const releaseStep = Math.hypot(before.x-after.x, before.y-after.y);
        assert.ok(releaseStep < 1, `Release preserves the body position: ${releaseStep}`);
        results.at(-1).releaseStep = releaseStep;
      }
      assert.ok(released > 0, 'Recorded the handoff from dragging to released movement');
      assert.equal((await main('diagnostics')).world.dragging, false);
      await page.waitForFunction(() => document.querySelector('#stage').dataset.grabSurface === '');
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'grab-report.json'), JSON.stringify({ passed: true, results, errors }, null, 2));
    console.log(results);
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
