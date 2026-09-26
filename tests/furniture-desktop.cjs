const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), out = path.join(root, 'test-results'), wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const env = { ...process.env, BA_PET_TEST_PROFILE: path.join(out, 'furniture-profile') }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [root, '--test-mode', '--measure-pet'], env });
  const main = (action, arg) => app.evaluate(({ app }, { action, arg }) => process.mainModule.require(app.getAppPath() + '/electron/main.cjs')[action](arg), { action, arg });
  try {
    const page = await app.firstWindow(); await page.waitForSelector('#stage[data-state="ready"]');
    await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setFocusable(false); w.setOpacity(0); });
    await page.evaluate(() => window.pet.update({ characterId: '212', size: 360, paused: false, voiceEnabled: false, furniture: 'none', roaming: true, windowWalking: false }));
    await page.waitForSelector('#stage[data-character="212"][data-state="ready"]'); await wait(300);
    const area = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
    for (const furniture of ['sofa', 'arcade']) {
      const d = await main('diagnostics');
      await main('testPlace', { ...d.bounds, x: Math.round(area.x + area.width - d.foot.x - 30), y: Math.round(area.y + area.height - d.foot.y) });
      await page.evaluate(furniture => window.pet.update({ furniture }), furniture);
      await page.waitForSelector(`#stage[data-furniture="${furniture}"][data-mode="furniture"]`); await wait(800);
      const f = await page.evaluate(() => window.petFrames.at(-1)), placed = await main('diagnostics');
      fs.writeFileSync(path.join(out, 'furniture-edge-debug.json'), JSON.stringify({ furniture, area, frame: f, placed }, null, 2));
      assert.ok(placed.bounds.x + f.visibleBounds.right <= area.x + area.width + 1, `Furniture fits the physical screen: ${JSON.stringify({ furniture, area, bounds: placed.bounds, visible: f.visibleBounds })}`);
      const findGrab = () => page.evaluate(() => {
        const p = window.petFrames.at(-1).headPoint;
        for (let y = p.y - 35; y <= p.y + 35; y += 7) for (let x = p.x - 35; x <= p.x + 35; x += 7) if (window.petCompanionTest.hitRegion(x, y) === 'head') return { x, y };
      });
      let grab = await findGrab();
      assert.ok(grab);
      await main('testCursor', { x: placed.bounds.x + grab.x, y: placed.bounds.y + grab.y }); await wait(90);
      await page.mouse.click(grab.x, grab.y); await wait(100);
      const sitting = await main('diagnostics'); await wait(1800);
      assert.equal((await main('diagnostics')).world.x, sitting.world.x, 'Clicking a seated character must not start furniture walking');
      grab = await findGrab(); assert.ok(grab);
      await main('testCursor', { x: placed.bounds.x + grab.x, y: placed.bounds.y + grab.y }); await wait(90);
      await page.mouse.move(grab.x, grab.y); await page.mouse.down();
      await main('testCursor', { x: placed.bounds.x + grab.x + 50, y: placed.bounds.y + grab.y - 40 });
      await page.waitForSelector('#stage[data-drag="true"][data-furniture="none"]'); await wait(100);
      assert.equal((await page.evaluate(() => window.pet.getState())).furniture, 'none');
      assert.equal((await main('diagnostics')).world.dragging, true);
      assert.ok(Number(await page.locator('#stage').getAttribute('data-grab-error')) < .5);
      await page.mouse.up(); await main('testCursor', { x: -10000, y: -10000 });
      await wait(1000);
    }
    await page.evaluate(() => window.pet.update({ furniture: 'sofa' })); await page.waitForSelector('#stage[data-furniture="sofa"]');
    await page.evaluate(() => window.pet.update({ characterId: '327' }));
    await page.waitForSelector('#stage[data-character="327"][data-state="ready"]');
    assert.equal((await page.evaluate(() => window.pet.getState())).furniture, 'none');
    fs.writeFileSync(path.join(out, 'furniture-report.json'), JSON.stringify({ passed: true, staysOnScreen: true, seatedClickStaysStill: true, pickupDismissesFurniture: true, keepsMousePivot: true, characterSwitchClearsFurniture: true }, null, 2));
    console.log('Furniture screen margins, real pickup and character switching passed.');
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
