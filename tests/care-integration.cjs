const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'test-results');
fs.mkdirSync(out, { recursive: true });
const profile = fs.mkdtempSync(path.join(out, 'care-integration-'));
const executable = process.argv[2] && path.resolve(process.argv[2]);
const env = { ...process.env, BA_PET_TEST_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
const options = { ...(executable ? { executablePath: executable } : {}), args: [...(executable ? [] : [root]), '--test-mode', '--measure-pet'], env };
const errors = [], checks = [];
let app;
async function launch() {
  app = await electron.launch(options);
  app.on('window', p => p.on('pageerror', error => errors.push(error.message)));
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await app.evaluate(({ BrowserWindow, app }) => {
    const w = BrowserWindow.getAllWindows()[0]; w.setOpacity(0); w.setFocusable(false);
    process.mainModule.require(app.getAppPath() + '/electron/main.cjs').testCursor({ x: -10000, y: -10000 });
  });
  await page.waitForSelector('#stage[data-state="ready"]', { timeout: 45000 });
  return page;
}
const state = page => page.evaluate(() => window.pet.getState());
const act = (page, action, characterId = '212') => page.evaluate(args => window.pet.care(...args), [action, characterId]);
const tick = seconds => app.evaluate(({ app }, seconds) => process.mainModule.require(app.getAppPath() + '/electron/main.cjs').testCareTick(seconds), seconds);
const diagnostics = () => app.evaluate(({ app }) => process.mainModule.require(app.getAppPath() + '/electron/main.cjs').diagnostics());
(async () => {
  try {
    fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ characterId: '212', size: 360, voiceLanguage: 'jp', volume: .28, roaming: true }));
    let page = await launch();
    const initial = await state(page);
    assert.equal(initial.volume, .28); assert.equal(initial.care.level, 1);
    assert.equal((await act(page, 'gift')).ok, true);
    const gifted = await state(page);
    assert.equal(gifted.care.xp, 15);
    assert.equal((await act(page, 'gift')).ok, false);
    assert.equal((await state(page)).care.xp, 15);
    assert.equal(await act(page, '__proto__'), null);
    assert.equal((await act(page, 'gift', '218')).ok, false);
    checks.push('Existing settings migrate; daily gift is credited once; unknown actions and stale character actions rejected');

    assert.equal((await act(page, 'tap')).ok, true);
    assert.equal((await act(page, 'pet')).ok, true);
    assert.equal((await act(page, 'pet')).ok, false);
    for (let i = 0; i < 5; i++) await tick(60);
    let companion = (await state(page)).care;
    assert.ok(companion.todayMinutes >= 5);
    assert.equal(companion.actions.claim.available, true);
    const claimed = await act(page, 'claim');
    assert.equal(claimed.ok, true); assert.equal(claimed.levelUp, true);
    assert.equal((await act(page, 'claim')).ok, false);
    assert.equal(claimed.state.care.level, 2);
    checks.push('Interaction cooldowns, visible companionship, daily goals, single claim and level-up work through IPC');

    const started = await act(page, 'rest');
    assert.equal(started.ok, true); assert.equal(started.state.care.resting, true);
    assert.equal((await diagnostics()).effectiveRoaming, false);
    assert.equal((await state(page)).roaming, true);
    const energy = started.state.care.energy;
    await tick(60);
    assert.ok((await state(page)).care.energy > energy);
    if ((await state(page)).care.resting) await act(page, 'rest');
    assert.equal((await diagnostics()).effectiveRoaming, true);
    checks.push('Rest restores energy and stops walking without altering the roaming preference');

    await page.evaluate(() => window.pet.command('hide'));
    const hidden = (await state(page)).care;
    for (let i = 0; i < 6; i++) await tick(60);
    assert.deepEqual((await state(page)).care, hidden);
    await page.evaluate(() => window.pet.command('show'));
    await page.evaluate(() => window.pet.update({ paused: true }));
    const paused = (await state(page)).care;
    await tick(60); assert.deepEqual((await state(page)).care, paused);
    assert.equal((await act(page, 'tap')).ok, false);
    await page.evaluate(() => window.pet.update({ paused: false }));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize());
    const minimized = (await state(page)).care.totalMinutes;
    await tick(60); assert.equal((await state(page)).care.totalMinutes, minimized);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].restore());
    const gap = (await state(page)).care.totalMinutes;
    await tick(3600); assert.equal((await state(page)).care.totalMinutes, gap);
    checks.push('Hidden, paused, minimized and long timer gaps grant no companionship or decay');

    const saved = (await state(page)).care;
    await page.evaluate(() => window.pet.update({ characterId: '218' }));
    await page.waitForSelector('#stage[data-character="218"][data-state="ready"]');
    assert.equal((await state(page)).care.xp, 0);
    assert.equal((await act(page, 'snack', '212')).ok, false);
    await page.evaluate(() => window.pet.update({ characterId: '212' }));
    await page.waitForSelector('#stage[data-character="212"][data-state="ready"]');
    assert.equal((await state(page)).care.xp, saved.xp);
    await app.close(); app = null;
    assert.ok(fs.existsSync(path.join(profile, 'care.json')));
    page = await launch();
    const restored = await state(page);
    assert.equal(restored.care.xp, saved.xp); assert.equal(restored.care.level, 2);
    assert.equal(restored.care.actions.gift.remaining, 0);
    assert.equal(restored.care.actions.claim.available, false);
    assert.equal(restored.volume, .28);
    checks.push('Student progress stays separate and survives a full restart with cooldowns, claims and preferences');
    await app.close(); app = null;

    fs.writeFileSync(path.join(profile, 'care.json'), '{incomplete');
    page = await launch();
    assert.equal((await state(page)).care.level, 1);
    assert.equal((await state(page)).volume, .28);
    assert.ok(fs.readdirSync(profile).some(file => file.startsWith('care.json.invalid-')));
    checks.push('Malformed care data is backed up and recovered without losing normal settings');
    assert.deepEqual(errors, []);
    const report = { passed: true, executable: executable || 'source', profile, checks, errors };
    fs.writeFileSync(path.join(out, `care-integration-${executable ? 'packaged' : 'source'}.json`), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { if (app) await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
