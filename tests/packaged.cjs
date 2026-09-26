const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), profile = path.join(root, 'test-results', 'packaged-profile');
fs.mkdirSync(profile, { recursive: true });
const env = { ...process.env, BA_PET_TEST_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
const options = { executablePath: path.join(root, 'dist/v1.8/win-unpacked/BA-Desktop-Pet.exe'), args: ['--test-mode', '--measure-pet'], env };
(async () => {
  const app = await electron.launch(options);
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('#stage[data-state="ready"]', { timeout: 45000 });
    await page.evaluate(() => window.pet.update({ characterId: '218', size: 420, paused: true, voiceLanguage: 'jp', voiceEnabled: true, volume: .35, idleInterval: 300, furniture: 'none', effectsEnabled: false }));
    await page.waitForSelector('#stage[data-character="218"][data-state="ready"]', { timeout: 30000 });
  } finally { await app.close(); }
  const restarted = await electron.launch(options);
  try {
    const page = await restarted.firstWindow();
    await restarted.evaluate(({ app, BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0]; w.setOpacity(0); w.setFocusable(false);
      process.mainModule.require(app.getAppPath() + '/electron/main.cjs').testCursor({ x: -10000, y: -10000 });
    });
    await page.waitForSelector('#stage[data-character="218"][data-state="ready"]', { timeout: 45000 });
    const state = await page.evaluate(() => window.pet.getState());
    assert.equal(state.size, 420); assert.equal(state.paused, true);
    assert.equal(state.version, '1.8.0'); assert.equal(state.volume, .35); assert.equal(state.voiceLanguage, 'jp'); assert.equal(state.idleInterval, 300);
    assert.equal(state.effectsEnabled, false);
    assert.equal(await restarted.evaluate(({ app }) => app.isPackaged), true);
    await page.screenshot({ path: path.join(root, 'test-results/packaged-pet.png'), omitBackground: true });
    await page.evaluate(() => window.pet.update({ paused: false, roaming: true, windowWalking: true }));
    await new Promise(resolve => setTimeout(resolve, 1500));
    assert.equal((await page.evaluate(() => window.pet.getState())).windowWarning, '');
    assert.ok(fs.existsSync(path.join(root, 'dist/v1.8/win-unpacked/resources/native/WindowGeometry.exe')));
    await page.evaluate(() => window.pet.update({ roaming: false, windowWalking: false }));
    await page.waitForFunction(() => !window.petCompanionTest.voice().paused);
    const started = await page.evaluate(() => window.petCompanionTest.speak('interact'));
    assert.equal(started, true, JSON.stringify(await page.evaluate(() => window.petCompanionTest.voice())));
    await page.waitForFunction(() => window.petCompanionTest.voice().currentTime > .1).catch(async error => { throw new Error(`${error.message}\n${JSON.stringify(await page.evaluate(() => window.petCompanionTest.voice()))}`); });
    assert.equal((await page.evaluate(() => window.petCompanionTest.voice())).lastLine.language, 'jp');
    await page.evaluate(() => window.pet.update({ effectsEnabled: true }));
    await page.waitForFunction(() => window.petCompanionTest.effects().enabled);
    await page.evaluate(() => window.pet.command('interact'));
    await page.waitForFunction(() => window.petCompanionTest.effects().active > 0);
    await page.waitForFunction(() => !window.petCompanionTest.effects().running);
    fs.writeFileSync(path.join(root, 'test-results/packaged-report.json'), JSON.stringify({ passed: true, packaged: true, packagedVoicePlays: true, packagedParticles: true, restartRestores: ['character', 'size', 'pause', 'voiceLanguage', 'volume', 'idleInterval', 'effectsEnabled'] }, null, 2));
    console.log('Packaged EXE and restart persistence passed.');
  } finally { await restarted.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
