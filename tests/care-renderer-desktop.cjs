const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), out = path.join(root, 'test-results');
const executablePath = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
const profile = path.join(out, executablePath ? 'care-renderer-packaged-profile' : 'care-renderer-profile');
const reportName = executablePath ? 'care-renderer-packaged-report.json' : 'care-renderer-report.json';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ characterId: '212', size: 360, roaming: false, windowWalking: false, physics: true, paused: false, voiceEnabled: false, voiceLanguage: 'jp', idleVoice: true, idleInterval: 30, effectsEnabled: true }));
  fs.writeFileSync(path.join(profile, 'care.json'), JSON.stringify({ schemaVersion: 1, students: { '1': { xp: 23, energy: 80 }, '2': { xp: 29, energy: 15 } } }));
  const env = { ...process.env, BA_PET_TEST_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath, args: [...(executablePath ? [] : [root]), '--test-mode', '--measure-pet'], env });
  const errors = [], results = [];
  app.on('window', page => page.on('pageerror', error => errors.push(error.message)));
  const main = (action, arg) => app.evaluate(({ app }, { action, arg }) => process.mainModule.require(app.getAppPath() + '/electron/main.cjs')[action](arg), { action, arg });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('#stage[data-character="212"][data-state="ready"]');
    if (executablePath) assert.equal(await app.evaluate(({ app }) => app.isPackaged), true);
    await app.evaluate(({ app, BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]; window.setOpacity(0); window.setFocusable(false);
      // Count real care method calls, including rejected cooldown attempts, so
      // the cooldown cannot conceal duplicate renderer/main IPC accounting.
      const { CareSystem } = process.mainModule.require(app.getAppPath() + '/electron/care.cjs');
      const original = CareSystem.prototype.act; global.careRendererCalls = [];
      CareSystem.prototype.act = function(characterId, action) { global.careRendererCalls.push({ characterId, action }); return original.call(this, characterId, action); };
    });
    await main('testCursor', { x: -10000, y: -10000 }); await main('testRandom', .6); await wait(4500);
    const care = () => page.evaluate(async () => (await window.pet.getState()).care);
    const calls = action => app.evaluate((_, action) => global.careRendererCalls.filter(item => item.action === action).length, action);
    const findHead = () => page.evaluate(() => {
      const { x, y } = window.petFrames.at(-1).headPoint;
      for (let yy = y - 45; yy < y + 45; yy += 8) for (let xx = x - 40; xx < x + 40; xx += 8) {
        if ([xx, xx + 12, xx + 24].every(px => window.petCompanionTest.hitRegion(px, yy) === 'head')) return { x: xx, y: yy };
      }
    });
    const point = await findHead(); assert.ok(point);
    const initial = await main('diagnostics');
    await main('testCursor', { x: initial.bounds.x + point.x, y: initial.bounds.y + point.y });
    await page.mouse.click(point.x, point.y); await wait(350);
    assert.equal(await calls('tap'), 1); assert.equal((await care()).xp, 25);
    await page.evaluate(() => window.pet.command('interact')); await wait(250);
    assert.equal(await calls('tap'), 2, 'One menu interaction results in one care call');
    assert.equal((await care()).xp, 25, 'The normal cooldown applies equally to mouse and menu');
    await main('testCursor', { x: -10000, y: -10000 });
    await page.waitForSelector('#stage[data-mode="idle"]');
    const head = await findHead(), bounds = (await main('diagnostics')).bounds; assert.ok(head);
    for (const offset of [0, 12, 24, 12, 0, 12, 24, 12]) {
      await main('testCursor', { x: bounds.x + head.x + offset, y: bounds.y + head.y }); await wait(100);
    }
    await page.waitForFunction(() => document.querySelector('#stage').dataset.careAction === 'pet');
    assert.equal(await calls('pet'), 1); assert.equal((await care()).xp, 28);
    await main('testCursor', { x: -10000, y: -10000 });
    results.push({ realTapAndMenuEachCallCareOnce: true, realHeadStrokeCallsCareOnce: true });

    await page.evaluate(() => window.pet.update({ voiceEnabled: true }));
    await page.waitForFunction(() => window.petCompanionTest.voice().enabled);
    const gift = await page.evaluate(() => window.pet.care('gift', '212'));
    assert.equal(gift.levelUp, true);
    await page.waitForFunction(() => window.petCompanionTest.voice().lastLine?.event === 'bond');
    const bond = await page.evaluate(() => window.petCompanionTest.voice().lastLine);
    assert.match(bond.key, /Relationship_Up/i); assert.equal(bond.language, 'jp');
    assert.equal(await page.locator('#speech').textContent(), bond.text);
    assert.match(await page.locator('#message').textContent(), /羁绊提升至 Lv.2/);
    await page.waitForFunction(() => {
      const box = document.querySelector('#speech').getBoundingClientRect();
      return box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight;
    });
    await wait(150);
    await page.screenshot({ path: path.join(out, executablePath ? 'care-bond-level-up-packaged.png' : 'care-bond-level-up.png'), omitBackground: true });
    results.push({ realBondAudioAndExactSubtitle: true, level: (await care()).level });

    await page.evaluate(() => window.petCompanionTest.speak('idle'));
    await page.waitForFunction(() => window.petCompanionTest.voice().active?.event === 'idle');
    const rest = await page.evaluate(() => window.pet.care('rest', '212'));
    assert.equal(rest.state.care.resting, true);
    await page.waitForFunction(() => window.petCompanionTest.voice().resting && !window.petCompanionTest.voice().playing);
    assert.equal(await page.evaluate(() => window.petCompanionTest.speak('idle')), false);
    await page.evaluate(() => window.pet.care('rest', '212'));
    await page.waitForFunction(() => !window.petCompanionTest.voice().resting);
    assert.equal((await page.evaluate(() => window.petCompanionTest.voice())).idleInterval, 30);
    await page.evaluate(() => window.pet.update({ voiceEnabled: false }));
    await page.waitForSelector('#stage[data-mode="idle"]');
    results.push({ restStopsAutomaticVoiceAndResumesUserInterval: true });

    const grab = await findHead(), start = await main('diagnostics'); assert.ok(grab);
    await main('testCursor', { x: start.bounds.x + grab.x, y: start.bounds.y + grab.y });
    await page.mouse.move(grab.x, grab.y); await page.mouse.down();
    await main('testCursor', { x: start.bounds.x + grab.x + 25, y: start.bounds.y + grab.y });
    await page.waitForSelector('#stage[data-mode="held"]');
    const beforeHeld = await page.evaluate(() => window.petCompanionTest.effects());
    const snack = await page.evaluate(() => window.pet.care('snack', '212')); assert.equal(snack.ok, true);
    await wait(180);
    assert.equal((await main('diagnostics')).world.dragging, true);
    assert.equal(await page.locator('#stage').getAttribute('data-mode'), 'held');
    const held = await page.evaluate(() => ({ effect: window.petCompanionTest.effects(), frame: window.petFrames.at(-1) }));
    assert.equal(held.effect.emitted, beforeHeld.emitted, 'A care result cannot replace pickup particles while held');
    assert.ok(held.frame.grabError < .5, 'Care feedback preserves the actual mouse pivot');
    await page.mouse.up(); await main('testCursor', { x: -10000, y: -10000 });
    results.push({ careDuringRealDragPreservesHeldAnimationAndMousePivot: true });

    await page.evaluate(() => window.pet.update({ characterId: '500', voiceEnabled: true, voiceLanguage: 'cn', roaming: true }));
    await page.waitForSelector('#stage[data-character="500"][data-state="ready"]');
    await page.waitForFunction(() => window.petCompanionTest.voice().idleInterval === 60);
    await page.waitForSelector('#stage[data-character="500"][data-mode="idle"]');
    await wait(100); // Allow the first new-character motion packet to replace the old drag state.
    assert.equal((await main('diagnostics')).effectiveRoaming, false, 'Low energy suppresses roaming in the main process');
    const fallback = await page.evaluate(() => window.pet.care('gift', '500')); assert.equal(fallback.levelUp, true);
    await page.waitForFunction(() => window.petCompanionTest.voice().lastLine?.event === 'bond');
    const fallbackLine = await page.evaluate(() => window.petCompanionTest.voice().lastLine);
    assert.equal(fallbackLine.language, 'jp'); assert.match(fallbackLine.key, /Relationship_Up/i);
    assert.equal(await page.locator('#speech').textContent(), fallbackLine.text);
    results.push({ missingChineseFallsBackToOriginalJapaneseBondRecording: true, lowEnergySlowsIdleWithoutChangingSavedInterval: true });
    assert.equal((await page.evaluate(() => window.pet.getState())).idleInterval, 30);

    const beforeOldEvent = await page.evaluate(() => window.petCompanionTest.effects().emitted);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('pet:care-event', { ok: true, changed: true, action: 'gift', characterId: '212', levelUp: true, emote: 'pet', care: { level: 9, resting: false } }));
    await wait(200);
    assert.equal(await page.evaluate(() => window.petCompanionTest.effects().emitted), beforeOldEvent);
    assert.equal((await care()).level, 2);
    results.push({ staleOtherCharacterCareEventIgnored: true });
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, reportName), JSON.stringify({ passed: true, packaged: Boolean(executablePath), results, errors }, null, 2));
    console.log(results);
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
