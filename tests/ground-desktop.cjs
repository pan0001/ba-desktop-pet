const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), out = path.join(root, 'test-results');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const env = { ...process.env, BA_PET_TEST_PROFILE: path.join(out, 'ground-profile') }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [root, '--test-mode', '--measure-pet'], env });
  const errors = [], results = [];
  app.on('window', p => p.on('pageerror', e => errors.push(e.message)));
  await app.evaluate(({ ipcMain }) => {
    global.groundEvents = [];
    for (const channel of ['pet:reaction', 'pet:command', 'pet:drag-start', 'pet:drag-end']) ipcMain.on(channel, (_event, value) => global.groundEvents.push({ channel, value, at: Date.now() }));
  });
  try {
    const page = await app.firstWindow(); await page.waitForSelector('#stage[data-state="ready"]');
    await app.evaluate(({ app, BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0]; w.setFocusable(false); w.setOpacity(0);
      process.mainModule.require(app.getAppPath() + '/electron/main.cjs').testCursor({ x: -100000, y: -100000 });
    });
    for (const characterId of ['327', '212']) {
      await page.evaluate(characterId => window.pet.update({ characterId, roaming: true, windowWalking: false, paused: false, physics: true, size: 320 }), characterId);
      await page.waitForSelector(`#stage[data-character="${characterId}"][data-state="ready"]`);
      await page.evaluate(() => { window.petFrames = []; });
      await app.evaluate(({ app, screen }) => {
        const main = process.mainModule.require(app.getAppPath() + '/electron/main.cjs'), a = screen.getPrimaryDisplay().workArea, d = main.diagnostics();
        main.testRandom(.9); main.testPlace({ ...d.bounds, x: Math.round(a.x + 500 - d.foot.x), y: Math.round(a.y + 350 - d.foot.y) });
      });
      await page.locator('#help').waitFor({ state: 'visible', timeout: 12000 });
      await wait(1400);
      await page.screenshot({ path: path.join(out, `ground-help-${characterId}.png`), omitBackground: true });
      await page.locator('#help').click();
      await page.waitForFunction(() => document.querySelector('#stage').dataset.mode === 'recovering');
      await wait(600);
      await page.screenshot({ path: path.join(out, `ground-rise-${characterId}.png`), omitBackground: true });
      await page.waitForFunction(() => document.querySelector('#stage').dataset.outcome === '' && document.querySelector('#stage').dataset.mode === 'idle');
      await wait(3500);
      const frames = await page.evaluate(() => window.petFrames);
      fs.writeFileSync(path.join(out, `ground-frames-${characterId}.json`), JSON.stringify(frames, null, 2));
      fs.writeFileSync(path.join(out, 'ground-events.json'), JSON.stringify(await app.evaluate(() => global.groundEvents), null, 2));
      const spans = {};
      for (const mode of ['idle', 'landing', 'help', 'recovering', 'walk']) {
        const f = frames.filter(f => f.mode === mode), values = f.map(f => f.pose.bottom);
        spans[mode] = { frames: f.length, bottomRange: Math.max(...values) - Math.min(...values), maxStrideStep: Math.max(0, ...frames.slice(1).map((f, i) => f.mode === mode ? Math.hypot(...f.pose.stride.map((v,j) => v - frames[i].pose.stride[j])) : 0)) };
      }
      const switches = frames.slice(1).flatMap((b,i) => { const a = frames[i]; return a.mode !== b.mode && b.mode !== 'walk' ? [Math.hypot(b.pose.root.x - a.pose.root.x, b.pose.root.y - a.pose.root.y)] : []; });
      results.push({ characterId, spans, maxTransitionStep: Math.max(...switches) });
      assert.ok(spans.recovering.frames >= 30, 'Full recovery plays before returning to idle');
      const bottom = frames.map(f => f.pose.bottom);
      const baseline = await app.evaluate(({ app }) => process.mainModule.require(app.getAppPath() + '/electron/main.cjs').diagnostics().foot.y);
      assert.ok(Math.max(...bottom) - Math.min(...bottom) < .5, 'Every ground pose shares one stable contact baseline');
      assert.ok(bottom.every(y => Math.abs(y - baseline) < .5), 'Rendered contact matches the desktop collision baseline');
      const help = frames.filter(f => f.mode === 'help').slice(5);
      assert.ok(help.length > 20);
      assert.ok(Math.max(...help.map(f => f.pose.root.y)) - Math.min(...help.map(f => f.pose.root.y)) < .1, 'A resting body stays still');
      assert.ok(Math.max(...switches) < 3, `No instant body jump at clip transitions: ${switches}`);
    }
    fs.writeFileSync(path.join(out, 'ground-report.json'), JSON.stringify({ passed: true, results, errors }, null, 2));
    assert.deepEqual(errors, []); console.log(JSON.stringify(results));
  } finally {
    fs.writeFileSync(path.join(out, 'ground-events.json'), JSON.stringify(await app.evaluate(() => global.groundEvents), null, 2));
    await app.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
