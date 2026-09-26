const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), out = path.join(root, 'test-results');
const profile = path.join(out, 'dynamics-profile'); fs.mkdirSync(profile, { recursive: true });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const env = { ...process.env, BA_PET_TEST_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const fixture = await electron.launch({ args: [path.join(__dirname, 'platform-fixture.cjs')], env });
  await fixture.firstWindow();
  const app = await electron.launch({ args: [root, '--test-mode'], env });
  const errors = [], results = [];
  app.on('window', p => { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); });
  const diagnostics = () => app.evaluate(({ app }) => process.mainModule.require(app.getAppPath() + '/electron/main.cjs').diagnostics());
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('#stage[data-state="ready"]', { timeout: 45000 });
    await page.evaluate(() => window.pet.update({ characterId: '212', roaming: true, windowWalking: true, physics: true, paused: false, size: 360 }));
    await page.waitForSelector('#stage[data-character="212"][data-state="ready"]');
    await wait(1600);
    const fixturePid = await fixture.evaluate(() => process.pid);
    let platform;
    for (let i = 0; i < 30; i++) { platform = (await diagnostics()).surfaces.find(s => s.id.endsWith(':' + fixturePid)); if (platform) break; await wait(200); }
    if (!platform) fs.writeFileSync(path.join(out, 'platform-failure.json'), JSON.stringify({ fixturePid, diagnostics: await diagnostics(), fixture: await fixture.evaluate(({ BrowserWindow, screen }) => ({ bounds: BrowserWindow.getAllWindows()[0].getBounds(), area: screen.getPrimaryDisplay().workArea })) }, null, 2));
    assert.ok(platform, 'Native helper detects real test window');
    await app.evaluate(({ app }, platform) => {
      const main = process.mainModule.require(app.getAppPath() + '/electron/main.cjs');
      main.testRandom(.6);
      const d = main.diagnostics();
      main.testPlace({ ...d.bounds, x: Math.round(platform.left + 180 - d.foot.x), y: Math.round(platform.y - d.foot.y - 35) });
    }, platform);
    await page.waitForFunction(() => document.querySelector('#stage').dataset.platform === 'window', { timeout: 8000 });
    await page.waitForFunction(() => document.querySelector('#stage').dataset.mode === 'walk', { timeout: 14000 });
    const before = await diagnostics(); await wait(900); const after = await diagnostics();
    assert.ok(Math.abs(before.world.x - after.world.x) > 10, 'Walk really moves window');
    await page.screenshot({ path: path.join(out, 'walking-window.png'), omitBackground: true });
    results.push({ windowWalking: true, dx: after.world.x - before.world.x });
    await page.evaluate(() => window.pet.update({ paused: true }));
    const a = await diagnostics();
    const timeA = await page.locator('#stage').getAttribute('data-time'); await wait(350);
    assert.equal((await diagnostics()).world.x, a.world.x);
    assert.equal(await page.locator('#stage').getAttribute('data-time'), timeA);
    await page.evaluate(() => window.pet.update({ paused: false }));
    await fixture.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0], b = w.getBounds(); w.setPosition(b.x + 70, b.y - 25); });
    await wait(700);
    const moved = await diagnostics(); assert.equal(moved.world.platform, 'window');
    results.push({ followsMovedWindow: true });
    await fixture.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize());
    await page.waitForFunction(() => document.querySelector('#stage').dataset.platform === 'floor', { timeout: 8000 });
    results.push({ fallsAfterMinimize: true });
    await page.waitForFunction(() => document.querySelector('#stage').dataset.outcome === '', { timeout: 10000 });
    // Isolate the renderer's spring response using actual motion IPC, after the
    // world movement loop is suspended by hiding the window.
    await page.evaluate(() => window.pet.update({ roaming: false }));
    await page.evaluate(() => window.pet.command('hide'));
    await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.showInactive(); w.webContents.send('pet:action', 'resume'); });
    for (let i = 0; i < 24; i++) {
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('pet:motion', { vx: -900, vy: 0, mode: 'held', direction: 1, dragging: true, physics: true }));
      await wait(25);
    }
    const tilt = Number(await page.locator('#stage').getAttribute('data-tilt'));
    const hair = Number(await page.locator('#stage').getAttribute('data-hair'));
    assert.ok(tilt < -.05); assert.ok(hair > .02);
    await page.screenshot({ path: path.join(out, 'physics-left.png'), omitBackground: true });
    await wait(3200);
    assert.ok(Math.abs(Number(await page.locator('#stage').getAttribute('data-tilt'))) < .03);
    results.push({ leftwardDragTilt: tilt, hairResponse: hair });
    await page.evaluate(() => window.pet.command('show'));
    const chars = (await page.evaluate(() => window.pet.getState())).characters;
    for (const c of chars) {
      await page.evaluate(id => window.pet.update({ characterId: id }), c.id);
      await page.waitForSelector(`#stage[data-character="${c.id}"][data-state="ready"]`, { timeout: 30000 });
      await page.waitForFunction(() => Number(document.querySelector('#stage').dataset.hairBones) > 0);
      console.log(`Dynamics loaded ${c.id}: ${c.name}`);
    }
    await page.evaluate(() => window.pet.update({ characterId: '212', roaming: false }));
    await page.waitForSelector('#stage[data-character="212"][data-state="ready"]');
    await page.waitForFunction(() => document.querySelector('#stage').dataset.mode === 'idle', { timeout: 10000 });
    const firstTime = await page.locator('#stage').getAttribute('data-time'); await wait(700);
    assert.notEqual(await page.locator('#stage').getAttribute('data-time'), firstTime);
    await page.evaluate(() => window.pet.command('settings'));
    await wait(500); const settingsPage = app.windows().find(p => p.url().includes('settings.html'));
    await settingsPage.screenshot({ path: path.join(out, 'settings-1.3.png') });
    assert.deepEqual(errors, []);
    results.push({ animatedHairModels: 40, idleKeepsPlaying: true });
    fs.writeFileSync(path.join(out, 'dynamics-report.json'), JSON.stringify({ passed: true, results, errors }, null, 2));
  } finally { await app.close(); await fixture.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
