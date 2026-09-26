const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), out = path.join(root, 'test-results');
const executablePath = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
const reportName = executablePath ? 'emotions-packaged-report.json' : 'effects-report.json';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const env = { ...process.env, BA_PET_TEST_PROFILE: path.join(out, executablePath ? 'emotions-packaged-profile' : 'effects-profile') }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath, args: [...(executablePath ? [] : [root]), '--test-mode', '--measure-pet'], env });
  const errors = [], results = [];
  app.on('window', page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  });
  const main = (action, arg) => app.evaluate(({ app }, { action, arg }) => process.mainModule.require(app.getAppPath() + '/electron/main.cjs')[action](arg), { action, arg });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('#stage[data-state="ready"]', { timeout: 45000 });
    await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.setOpacity(0); win.setFocusable(false); });
    await main('testCursor', { x: -10000, y: -10000 });
    await main('testRandom', .6);
    await page.evaluate(() => window.pet.update({ characterId: '212', size: 360, roaming: false, windowWalking: false, paused: false, physics: true, voiceEnabled: false, furniture: 'none', effectsEnabled: true }));
    await page.waitForSelector('#stage[data-character="212"][data-state="ready"]');
    await page.waitForFunction(() => window.petCompanionTest?.effects().enabled);
    await wait(4500); // Let the startup notice leave the portrait clear in captures.
    const effects = () => page.evaluate(() => window.petCompanionTest.effects());
    const idle = () => page.waitForFunction(() => {
      const state = window.petCompanionTest.effects();
      return !state.running && !state.active && !state.emotion?.active && !state.emotion?.loading;
    });
    const expectEmotion = kind => page.waitForFunction(kind => {
      const state = window.petCompanionTest.effects();
      return state.emotion?.active && state.emotion.kind === kind && state.emotion.bounds && state.emotion.draws > 0;
    }, kind);
    async function captureEmotion(kind, file) {
      await expectEmotion(kind);
      await wait(170);
      const state = await effects(), bounds = state.emotion.bounds;
      assert.ok(bounds && bounds.x - bounds.width / 2 >= 0 && bounds.y - bounds.height / 2 >= 0, 'Emotion is inside the canvas');
      assert.ok(bounds.x + bounds.width / 2 <= state.width + 1 && bounds.y + bounds.height / 2 <= state.height + 1, 'Emotion is not clipped');
      assert.ok(state.lastEmotion.file.startsWith('assets/emotions/'), 'The decoded sprite comes from the local original resource');
      await page.screenshot({ path: path.join(out, file), omitBackground: true });
      return state;
    }
    const expectBurst = type => page.waitForFunction(type => {
      const effect = window.petCompanionTest.effects(); return effect.active > 0 && effect.lastType === type;
    }, type);
    const findHead = () => page.evaluate(() => {
      const { x, y } = window.petFrames.at(-1).headPoint;
      for (let yy = y - 45; yy < y + 45; yy += 8) for (let xx = x - 40; xx < x + 40; xx += 8) {
        if ([xx, xx + 12, xx + 24].every(px => window.petCompanionTest.hitRegion(px, yy) === 'head')) return { x: xx, y: yy };
      }
    });
    assert.equal(await page.locator('#effects').evaluate(canvas => getComputedStyle(canvas).pointerEvents), 'none');

    const tap = await findHead(); assert.ok(tap, 'A real non-hair head surface accepts input');
    const initial = await main('diagnostics');
    await main('testCursor', { x: initial.bounds.x + tap.x, y: initial.bounds.y + tap.y });
    await page.mouse.click(tap.x, tap.y);
    await expectBurst('tap'); await wait(190);
    await captureEmotion('twinkle', 'effects-tap.png');
    results.push({ realPointerTap: true, diagnostics: await effects() });
    await main('testCursor', { x: -10000, y: -10000 });
    await idle(); const framesAfterBurst = (await effects()).frames; await wait(350);
    assert.equal((await effects()).frames, framesAfterBurst, 'Idle particles perform no animation frames');

    await page.waitForSelector('#stage[data-mode="idle"]', { timeout: 15000 });
    const head = await findHead(); assert.ok(head);
    const bounds = (await main('diagnostics')).bounds;
    const beforePets = Number(await page.locator('#stage').getAttribute('data-pets') || 0);
    for (const offset of [0, 12, 24, 12, 0, 12, 24, 12]) {
      await main('testCursor', { x: bounds.x + head.x + offset, y: bounds.y + head.y }); await wait(100);
    }
    await page.waitForFunction(before => Number(document.querySelector('#stage').dataset.pets || 0) > before, beforePets);
    await expectBurst('pet');
    await captureEmotion('heart', 'effects-pet.png');
    assert.equal((await main('diagnostics')).world.dragging, false);
    results.push({ realHeadStroke: true, diagnostics: await effects() });
    await main('testCursor', { x: -10000, y: -10000 }); await idle();

    await page.waitForSelector('#stage[data-mode="idle"]', { timeout: 15000 });
    const grab = await findHead(); assert.ok(grab);
    const start = await main('diagnostics');
    await main('testCursor', { x: start.bounds.x + grab.x, y: start.bounds.y + grab.y });
    await page.mouse.move(grab.x, grab.y); await page.mouse.down();
    await main('testCursor', { x: start.bounds.x + grab.x + 25, y: start.bounds.y + grab.y });
    await expectBurst('pickup'); assert.equal((await main('diagnostics')).world.dragging, true);
    const pickup = await captureEmotion('exclamation', 'emotion-pickup.png');
    for (let i = 1; i <= 6; i++) {
      await wait(30);
      await main('testCursor', { x: start.bounds.x + grab.x + 25 + i * 18, y: start.bounds.y + grab.y - i * 8 });
    }
    const moved = await effects();
    const projectedHead = await page.evaluate(() => window.petFrames.at(-1).headPoint);
    assert.ok(Math.hypot(moved.emotion.anchor.x - projectedHead.x, moved.emotion.anchor.y - projectedHead.y) < 3, 'The emotion uses the current animated head anchor');
    assert.ok(Math.hypot(moved.emotion.anchor.x - pickup.emotion.anchor.x, moved.emotion.anchor.y - pickup.emotion.anchor.y) > .05, 'The emotion follows head movement during the drag');
    await page.mouse.up();
    await captureEmotion('sweat_2', 'emotion-thrown.png');
    assert.equal((await effects()).lastEmotion.priority, 4, 'Throwing replaces the lower-priority pickup emotion');
    await main('testCursor', { x: -10000, y: -10000 }); await idle();
    results.push({ realPickup: true, realThrow: true, animatedHeadAnchor: true });

    let peak = 0; const burstsBefore = (await effects()).bursts;
    for (let i = 0; i < 24; i++) {
      await page.evaluate(() => window.pet.command('interact')); await wait(35);
      const state = await effects(); peak = Math.max(peak, state.active);
      assert.ok(state.active <= state.capacity, 'Rapid input stays within the particle pool');
    }
    assert.ok((await effects()).bursts - burstsBefore < 10, 'Rapid input is rate limited');
    results.push({ rapidInteractions: 24, peakParticles: peak, capacity: (await effects()).capacity });
    await idle();

    await page.evaluate(() => window.pet.update({ effectsEnabled: false }));
    await page.waitForFunction(() => !window.petCompanionTest.effects().enabled);
    const disabledEmitted = (await effects()).emitted;
    await page.evaluate(() => window.pet.command('interact')); await wait(200);
    assert.equal((await effects()).emitted, disabledEmitted);
    assert.equal((await effects()).running, false);
    assert.equal((await effects()).emotion.active, false);
    await page.evaluate(() => window.pet.update({ effectsEnabled: true }));
    await page.waitForFunction(() => window.petCompanionTest.effects().enabled);
    await wait(400);
    await page.evaluate(() => window.pet.command('interact')); await expectBurst('tap');
    await page.evaluate(() => window.pet.update({ paused: true }));
    await page.waitForFunction(() => window.petCompanionTest.effects().paused);
    assert.equal((await effects()).active, 0); assert.equal((await effects()).running, false);
    assert.equal((await effects()).emotion.active, false);
    await page.evaluate(() => window.pet.update({ paused: false }));
    await page.waitForFunction(() => !window.petCompanionTest.effects().paused); await wait(400);
    await page.evaluate(() => window.pet.command('interact')); await expectBurst('tap');
    await page.evaluate(() => window.pet.command('hide'));
    await page.waitForFunction(() => window.petCompanionTest.effects().paused);
    assert.equal((await effects()).active, 0); assert.equal((await effects()).running, false);
    assert.equal((await effects()).emotion.active, false);
    await page.evaluate(() => window.pet.command('show'));
    await page.waitForFunction(() => !window.petCompanionTest.effects().paused); await wait(400);
    await page.evaluate(() => window.pet.command('interact')); await expectBurst('tap');
    await page.evaluate(() => window.pet.update({ characterId: '327' }));
    await page.waitForSelector('#stage[data-character="327"][data-state="ready"]');
    assert.equal((await effects()).active, 0); assert.equal((await effects()).running, false);
    assert.equal((await effects()).emotion.active, false);
    results.push({ disabledSuppresses: true, pauseHideAndCharacterChangeClear: true });

    await page.evaluate(() => window.pet.update({ roaming: true }));
    await app.evaluate(({ app, screen }) => {
      const main = process.mainModule.require(app.getAppPath() + '/electron/main.cjs');
      const area = screen.getPrimaryDisplay().workArea, d = main.diagnostics();
      main.testRandom(.9);
      main.testPlace({ ...d.bounds, x: Math.round(area.x + 350 - d.foot.x), y: Math.round(area.y + 330 - d.foot.y) });
    });
    await expectBurst('landing');
    await page.locator('#help').waitFor({ state: 'visible', timeout: 15000 });
    await captureEmotion('anxiety', 'emotion-help.png');
    await page.locator('#help').click(); await expectBurst('assist');
    await captureEmotion('heart', 'emotion-assist.png');
    results.push({ fallingTriggersLanding: true, helpClickTriggersAssist: true });
    await idle();
    await page.evaluate(() => window.pet.update({ roaming: false }));
    await page.waitForSelector('#stage[data-mode="idle"]', { timeout: 15000 });
    for (const size of [220, 560]) {
      await page.evaluate(size => window.pet.update({ size }), size); await wait(300);
      await page.evaluate(() => window.pet.command('interact'));
      const state = await captureEmotion('twinkle', `emotion-size-${size}.png`);
      const longestSide = Math.max(state.emotion.bounds.width, state.emotion.bounds.height);
      assert.ok(Math.abs(longestSide - 52 * size / 360) < 1, 'Emotion size follows the character size');
      await idle();
    }
    await page.evaluate(() => window.pet.update({ size: 360, voiceEnabled: true }));
    await page.waitForFunction(() => window.petCompanionTest.voice().enabled);
    assert.equal(await page.evaluate(() => window.petCompanionTest.speak('idle')), true);
    await captureEmotion('note', 'emotion-idle-voice.png');
    assert.equal(await page.locator('#speech').isVisible(), true, 'Idle emotion coexists with matching subtitles');
    await page.evaluate(() => window.pet.update({ voiceEnabled: false }));
    await idle();
    results.push({ minimumAndMaximumSizes: true, idleVoiceEmotion: true });
    await page.evaluate(() => window.pet.command('settings')); await wait(400);
    const settings = app.windows().find(window => window.url().includes('settings.html'));
    assert.ok(settings); assert.equal(await settings.locator('#effectsEnabled').isChecked(), true);
    await settings.locator('#effectsEnabled').uncheck();
    await page.waitForFunction(() => !window.petCompanionTest.effects().enabled);
    results.push({ settingsToggleWorks: true });
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, reportName), JSON.stringify({ passed: true, packaged: Boolean(executablePath), results, errors }, null, 2));
    console.log(results);
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
