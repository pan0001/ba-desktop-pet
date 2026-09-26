const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), out = path.join(root, 'test-results'), wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const env = { ...process.env, BA_PET_TEST_PROFILE: path.join(out, 'companion-profile') }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [root, '--test-mode', '--measure-pet'], env });
  const errors = [], results = [];
  app.on('window', p => { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); });
  const main = (action, arg) => app.evaluate(({ app }, { action, arg }) => process.mainModule.require(app.getAppPath() + '/electron/main.cjs')[action](arg), { action, arg });
  try {
    const page = await app.firstWindow(); await page.waitForSelector('#stage[data-state="ready"]');
    await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setOpacity(0); w.setFocusable(false); });
    await main('testCursor', { x: -10000, y: -10000 });
    await page.evaluate(() => window.pet.update({ characterId: '212', roaming: false, windowWalking: false, paused: false, size: 360, voiceEnabled: false, furniture: 'none' }));
    await page.waitForSelector('#stage[data-character="212"][data-state="ready"]'); await wait(1800);
    const decoded = await page.evaluate(async () => {
      const catalog = await (await fetch('assets/voices/catalog.json')).json(), context = new AudioContext(), results = [];
      for (const bank of Object.values(catalog.students)) for (const [language, lines] of Object.entries(bank.languages)) {
        if (!lines.length) continue;
        const data = await (await fetch(lines[0].file)).arrayBuffer(); const audio = await context.decodeAudioData(data);
        if (!(audio.duration > .1)) throw new Error('Empty decoded audio'); results.push({ student: bank.studentId, language, duration: audio.duration });
      }
      await context.close(); return results;
    });
    results.push({ decodedBanks: decoded.length });
    await page.evaluate(() => window.pet.update({ voiceEnabled: true, voiceLanguage: 'jp', volume: .3 }));
    await page.evaluate(() => window.pet.command('interact'));
    await page.waitForSelector('#speech:not([hidden])');
    await page.waitForFunction(() => window.petCompanionTest.voice().currentTime > .2);
    const spoken = await page.evaluate(() => window.petCompanionTest.voice());
    assert.equal(spoken.lastLine.language, 'jp'); assert.equal(await page.locator('#speech').textContent(), spoken.lastLine.text); assert.equal(spoken.volume, .3);
    await page.screenshot({ path: path.join(out, 'voice-japanese.png'), omitBackground: true });
    await page.waitForFunction(() => !window.petCompanionTest.voice().playing, { timeout: 30000 });
    assert.ok((await page.evaluate(() => window.petCompanionTest.voice())).completed > 0);
    results.push({ japaneseAudioAndMatchingSubtitle: true });
    await page.evaluate(() => window.pet.update({ voiceLanguage: 'cn' }));
    await page.waitForFunction(() => window.petCompanionTest.voice().language === 'cn');
    const cnStarted = await page.evaluate(() => window.petCompanionTest.speak('interact'));
    assert.equal(cnStarted, true, JSON.stringify(await page.evaluate(() => window.petCompanionTest.voice())));
    assert.equal((await page.evaluate(() => window.petCompanionTest.voice())).lastLine.language, 'cn');
    await page.evaluate(() => window.pet.update({ paused: true })); assert.equal((await page.evaluate(() => window.petCompanionTest.voice())).playing, false);
    await page.evaluate(() => window.pet.update({ paused: false, voiceLanguage: 'jp' }));
    await wait(3000);
    await page.waitForSelector('#stage[data-mode="idle"]');
    const d = await main('diagnostics');
    const face = await page.evaluate(() => {
      const { x, y } = window.petFrames.at(-1).headPoint;
      for (let yy = y - 45; yy < y + 45; yy += 8) for (let xx = x - 40; xx < x + 40; xx += 8) {
        if ([xx, xx + 12, xx + 24].every(a => window.petCompanionTest.hitRegion(a, yy) === 'head')) return { x: xx, y: yy };
      }
    });
    assert.ok(face, 'Find real non-hair head surfaces');
    const beforePets = Number(await page.locator('#stage').getAttribute('data-pets') || 0);
    for (const offset of [0, 12, 24, 12, 0, 12, 24, 12]) { await main('testCursor', { x: d.bounds.x + face.x + offset, y: d.bounds.y + face.y }); await wait(100); }
    await page.waitForFunction(n => Number(document.querySelector('#stage').dataset.pets || 0) > n, beforePets);
    await page.waitForFunction(() => window.petCompanionTest.voice().lastLine?.event === 'pet');
    assert.equal((await main('diagnostics')).world.dragging, false); results.push({ headStrokesSpeakWithoutDragging: true });
    await main('testCursor', { x: -10000, y: -10000 });
    await page.evaluate(() => window.pet.update({ voiceEnabled: false }));
    for (const furniture of ['sofa', 'arcade']) {
      await page.evaluate(furniture => window.pet.update({ furniture }), furniture);
      await page.waitForSelector(`#stage[data-furniture="${furniture}"][data-mode="furniture"]`);
      await wait(1800);
      await page.screenshot({ path: path.join(out, `furniture-${furniture}.png`), omitBackground: true });
      const f = await page.evaluate(() => window.petFrames.at(-1));
      assert.ok(f.visibleBounds.left > 0 && f.visibleBounds.right < d.bounds.width && f.visibleBounds.top > 0 && f.visibleBounds.bottom < d.bounds.height);
      results.push({ furniture, animation: await page.locator('#stage').getAttribute('data-animation') });
    }
    await page.evaluate(() => window.pet.update({ furniture: 'none' }));
    await page.waitForSelector('#stage[data-mode="idle"]');
    await page.evaluate(() => window.pet.update({ characterId: '500', voiceEnabled: true, voiceLanguage: 'cn' }));
    await page.waitForSelector('#stage[data-character="500"][data-state="ready"]');
    await page.evaluate(() => window.petCompanionTest.speak('interact'));
    assert.equal((await page.evaluate(() => window.petCompanionTest.voice())).lastLine.language, 'jp');
    results.push({ missingChineseFallsBackToJapanese: true });
    await page.evaluate(() => window.pet.update({ characterId: '212', voiceEnabled: true, voiceLanguage: 'jp' }));
    await page.waitForSelector('#stage[data-character="212"][data-state="ready"]');
    await page.evaluate(() => window.pet.command('settings')); await wait(500);
    const settings = app.windows().find(p => p.url().includes('settings.html'));
    await settings.locator('#tab-voice').click();
    await settings.screenshot({ path: path.join(out, 'settings-voice-furniture.png') });
    assert.equal(await settings.locator('#voiceLanguage').inputValue(), 'jp');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'companion-report.json'), JSON.stringify({ passed: true, results, decoded, errors }, null, 2)); console.log(results);
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
