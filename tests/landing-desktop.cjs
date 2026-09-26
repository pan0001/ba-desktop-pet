const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), out = path.join(root, 'test-results');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const env = { ...process.env, BA_PET_TEST_PROFILE: path.join(out, 'landing-profile') }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [root, '--test-mode'], env });
  const errors = [], results = [];
  app.on('window', p => { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); });
  const diagnostics = () => app.evaluate(({ app }) => process.mainModule.require(app.getAppPath() + '/electron/main.cjs').diagnostics());
  try {
    const page = await app.firstWindow(); await page.waitForSelector('#stage[data-state="ready"]', { timeout: 45000 });
    await page.evaluate(() => window.pet.update({ characterId: '212', roaming: true, windowWalking: false, paused: false, size: 360 }));
    await page.waitForSelector('#stage[data-character="212"][data-state="ready"]');
    for (const [roll, outcome] of [[.1, 'down-up'], [.6, 'quick'], [.9, 'help']]) {
      const characterId = outcome === 'help' ? '327' : '212';
      await page.evaluate(characterId => window.pet.update({ characterId }), characterId);
      await page.waitForSelector(`#stage[data-character="${characterId}"][data-state="ready"]`);
      await app.evaluate(({ app, screen }, roll) => {
        const main = process.mainModule.require(app.getAppPath() + '/electron/main.cjs'), a = screen.getPrimaryDisplay().workArea;
        const d = main.diagnostics();
        main.testRandom(roll); main.testPlace({ ...d.bounds, x: Math.round(a.x + 350 - d.foot.x), y: Math.round(a.y + 330 - d.foot.y) });
      }, roll);
      await page.waitForSelector(`#stage[data-outcome="${outcome}"]`);
      if (outcome === 'quick') await page.screenshot({ path: path.join(out, 'landing-quick.png'), omitBackground: true });
      if (outcome === 'help') {
        await page.locator('#help').waitFor({ state: 'visible' });
        await page.screenshot({ path: path.join(out, 'landing-help.png'), omitBackground: true });
        const before = await diagnostics(); await wait(1300); const after = await diagnostics();
        assert.equal(before.world.x, after.world.x); assert.equal(after.world.reaction.phase, 'help');
        await page.evaluate(() => window.pet.update({ paused: true }));
        await wait(300); const time = await page.locator('#stage').getAttribute('data-time'); await wait(400);
        assert.equal(await page.locator('#stage').getAttribute('data-time'), time);
        await page.evaluate(() => window.pet.update({ paused: false }));
        await page.locator('#help').click();
      }
      await page.waitForFunction(() => document.querySelector('#stage').dataset.outcome === '' && document.querySelector('#stage').dataset.mode === 'idle', { timeout: 10000 });
      assert.match(await page.locator('#stage').getAttribute('data-animation'), /Cafe_Idle$/i);
      results.push({ outcome, characterId, returnsToCafe: true });
    }
    await page.evaluate(() => window.pet.update({ roaming: false }));
    await page.evaluate(() => window.pet.command('interact'));
    await page.waitForFunction(() => /Cafe_Reaction$/i.test(document.querySelector('#stage').dataset.animation));
    await page.waitForFunction(() => /Cafe_Idle$/i.test(document.querySelector('#stage').dataset.animation), { timeout: 15000 });
    await app.evaluate(({ app }) => process.mainModule.require(app.getAppPath() + '/electron/main.cjs').testInvalidMotion());
    await wait(350); assert.ok(Number.isFinite((await diagnostics()).world.x));
    results.push({ cafeInteraction: true, invalidCoordinatesRecovered: true });
    // Full pointer/IPC/window/renderer drag regression is in grab-desktop.cjs.
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'landing-report.json'), JSON.stringify({ passed: true, results, errors }, null, 2));
    console.log(results);
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
