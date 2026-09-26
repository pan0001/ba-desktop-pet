const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), out = path.join(root, 'test-results');
fs.mkdirSync(out, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const errors = [], findings = [];
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [root, '--test-mode'], env, timeout: 30000 });
  app.on('window', page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  });
  try {
    const page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForSelector('#stage[data-state="ready"]', { timeout: 60000 });
    const call = (fn, arg) => page.evaluate(fn, arg);
    await call(() => window.pet.update({ characterId: '212', size: 360, paused: false, alwaysOnTop: true, roaming: false }));
    await page.waitForSelector('#stage[data-character="212"][data-state="ready"]');
    await wait(1200);
    findings.push({ initialAnimation: await page.locator('#stage').getAttribute('data-animation') });
    const winState = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find(w => w.getTitle() === 'BA桌宠');
      return { transparent: w.isVisible(), onTop: w.isAlwaysOnTop(), bounds: w.getBounds(), preferences: w.webContents.getLastWebPreferences() };
    });
    assert.equal(winState.onTop, true, JSON.stringify(winState)); assert.equal(winState.preferences.nodeIntegration, false); assert.equal(winState.preferences.sandbox, true);
    findings.push({ window: { visible: winState.transparent, onTop: winState.onTop, bounds: winState.bounds } });
    await page.screenshot({ path: path.join(out, 'pet-aris.png'), omitBackground: true });
    const pixels = await app.evaluate(async ({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find(w => w.getTitle() === 'BA桌宠');
      const image = await w.webContents.capturePage();
      const bitmap = image.toBitmap(); let clear = 0, colored = 0;
      for (let i = 0; i < bitmap.length; i += 4) {
        if (bitmap[i + 3] === 0) clear++;
        if (bitmap[i + 3] > 200 && Math.max(bitmap[i], bitmap[i + 1], bitmap[i + 2]) - Math.min(bitmap[i], bitmap[i + 1], bitmap[i + 2]) > 30) colored++;
      }
      return { clear, colored, total: bitmap.length / 4 };
    });
    assert.ok(pixels.clear / pixels.total > .3, 'Transparent background is present');
    assert.ok(pixels.colored > 2500, 'Character textures contain color within the larger transparent canvas');
    findings.push({ pixels });
    await app.evaluate(({ app, BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find(w => w.getTitle() === 'BA桌宠');
      w.hitCalls = [];
      const original = w.setIgnoreMouseEvents.bind(w);
      w.setIgnoreMouseEvents = (...args) => { w.hitCalls.push(args[0]); return original(...args); };
      const main = process.mainModule.require(app.getAppPath() + '/electron/main.cjs'), d = main.diagnostics();
      main.testCursor({ x: Math.round(d.bounds.x + d.foot.x), y: Math.round(d.bounds.y + d.foot.y - 100) });
    });
    await wait(100);
    await page.waitForSelector('#stage[data-hover="true"]');
    await wait(100);
    await app.evaluate(({ app }) => { const main = process.mainModule.require(app.getAppPath() + '/electron/main.cjs'), d = main.diagnostics(); main.testCursor({ x: d.bounds.x + 2, y: d.bounds.y + 2 }); });
    await wait(100);
    const misses = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.getTitle() === 'BA桌宠').hitCalls);
    assert.ok(misses.includes(true), 'Empty corner allows click-through');
    findings.push({ mouseHitTesting: 'body interactive; transparent corner passes through' });
    await call(() => window.pet.command('interact'));
    await page.waitForFunction(() => /Cafe_Reaction$/i.test(document.querySelector('#stage').dataset.animation));
    await page.waitForFunction(() => /Cafe_Idle$/i.test(document.querySelector('#stage').dataset.animation), { timeout: 20000 });
    findings.push({ interaction: 'Cafe_Reaction returns to Cafe_Idle' });
    await page.screenshot({ path: path.join(out, 'pet-after-interaction.png'), omitBackground: true });
    await call(() => window.pet.command('settings'));
    let settingsPage;
    for (let i = 0; i < 50; i++) { settingsPage = app.windows().find(p => p.url().includes('settings.html')); if (settingsPage) break; await wait(100); }
    assert.ok(settingsPage);
    await settingsPage.waitForSelector('.character');
    assert.equal(await settingsPage.locator('.character').count(), 40);
    await settingsPage.screenshot({ path: path.join(out, 'settings.png') });
    await settingsPage.locator('#search').fill('梓');
    assert.ok(await settingsPage.locator('.character').count() >= 1);
    await settingsPage.locator('.character').first().click();
    await page.waitForSelector('#stage[data-character="218"][data-state="ready"]', { timeout: 30000 });
    await settingsPage.locator('#paused').check();
    assert.equal((await call(() => window.pet.getState())).paused, true);
    await settingsPage.locator('#paused').uncheck();
    await call(() => window.pet.update({ size: 440 }));
    assert.equal((await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.getTitle() === 'BA桌宠').getBounds())).height, Math.round(440 * 2.6));
    await call(() => window.pet.command('hide')); await wait(200);
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.getTitle() === 'BA桌宠').isVisible()), false);
    await call(() => window.pet.command('show')); await wait(200);
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.getTitle() === 'BA桌宠').isVisible()), true);
    findings.push({ controls: 'search, selection, pause, resize, hide/show passed' });
    // Exercise every actual asset through the same WebGL rendering path used by the app.
    const characters = await call(async () => (await window.pet.getState()).characters);
    for (const c of characters) {
      await call(id => window.pet.update({ characterId: id }), c.id);
      await page.waitForSelector(`#stage[data-character="${c.id}"][data-state="ready"]`, { timeout: 45000 });
      const animation = await page.locator('#stage').getAttribute('data-animation');
      assert.ok(animation, c.name);
      if (c.id !== '502') assert.match(animation, /Cafe_Idle$/i, c.name);
      console.log(`Rendered ${c.id}: ${c.name}`);
    }
    findings.push({ modelsRendered: characters.length });
    await call(() => window.pet.update({ characterId: '212', size: 360, paused: false }));
    await page.waitForSelector('#stage[data-character="212"][data-state="ready"]');
    await wait(500);
    const persisted = JSON.parse(fs.readFileSync(path.join(out, 'profile/settings.json')));
    assert.equal(persisted.characterId, '212'); assert.equal(persisted.size, 360);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'desktop-report.json'), JSON.stringify({ passed: true, findings, errors }, null, 2));
    console.log('Desktop integration checks passed.');
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
