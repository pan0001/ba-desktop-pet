const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), out = path.join(root, 'test-results');
const executablePath = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
const suffix = executablePath ? '-packaged' : '';
const profile = path.join(out, `initiative-renderer${suffix}-profile`);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ characterId: '212', size: 360, roaming: true, windowWalking: false, physics: true, paused: false, voiceEnabled: false, voiceLanguage: 'jp', idleVoice: false, idleInterval: 600, effectsEnabled: true, proactiveEvents: true }));
  fs.writeFileSync(path.join(profile, 'care.json'), JSON.stringify({ schemaVersion: 1, students: { '1': { energy: 80 }, '2': { energy: 80 } } }));
  const env = { ...process.env, BA_PET_TEST_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath, args: [...(executablePath ? [] : [root]), '--test-mode', '--measure-pet'], env });
  const errors = [], results = [];
  app.on('window', page => page.on('pageerror', error => errors.push(error.message)));
  const main = (action, arg) => app.evaluate(({ app }, { action, arg }) => process.mainModule.require(app.getAppPath() + '/electron/main.cjs')[action](arg), { action, arg });
  let page;
  try {
    page = await app.firstWindow();
    await app.evaluate(({ app, BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]; window.setOpacity(0); window.setFocusable(false);
      const { CareSystem } = process.mainModule.require(app.getAppPath() + '/electron/care.cjs');
      const original = CareSystem.prototype.act; global.initiativeCareCalls = [];
      CareSystem.prototype.act = function(characterId, action) { global.initiativeCareCalls.push({ characterId, action }); return original.call(this, characterId, action); };
    });
    await main('testCursor', { x: -10000, y: -10000 }); await main('testRandom', .6);
    await page.waitForSelector('#stage[data-character="212"][data-state="ready"]', { timeout: 45000 });
    if (executablePath) assert.equal(await app.evaluate(({ app }) => app.isPackaged), true);
    // Select the invitation that includes an original spoken invite first.
    await page.evaluate(() => { Math.random = () => .99; });
    await wait(1800);
    const initiative = () => page.evaluate(() => window.petCompanionTest.initiative());
    const voice = () => page.evaluate(() => window.petCompanionTest.voice());
    const taps = () => app.evaluate(() => global.initiativeCareCalls.filter(item => item.action === 'tap').length);
    async function idle() {
      await page.waitForFunction(() => window.petCompanionTest.initiative().phase === 'idle' && !window.petCompanionTest.voice().playing && ['idle', 'walk'].includes(document.querySelector('#stage').dataset.mode));
      // Showing a previously hidden window calls place() and briefly leaves
      // the last renderer frame intact while the main process finds its floor.
      let stable = 0;
      for (let i = 0; i < 150 && stable < 3; i++) {
        const { world } = await main('diagnostics');
        stable = world.platform && !world.dragging && !world.reaction && ['idle', 'walk'].includes(world.mode) ? stable + 1 : 0;
        await wait(100);
      }
      assert.equal(stable, 3, 'The physical body is settled before starting an invitation');
      await page.waitForFunction(() => !window.petCompanionTest.voice().playing && ['idle', 'walk'].includes(document.querySelector('#stage').dataset.mode));
    }
    async function preview() {
      await idle(); await page.evaluate(() => window.petCompanionTest.previewInitiative());
      await page.waitForFunction(() => window.petCompanionTest.initiative().phase === 'waiting');
      return initiative();
    }
    async function released() {
      await page.waitForFunction(() => window.petCompanionTest.initiative().phase === 'idle');
      for (let i = 0; i < 50 && (await main('diagnostics')).initiative; i++) await wait(20);
      assert.equal((await main('diagnostics')).initiative, null);
      assert.equal(await page.locator('#initiative').isVisible(), false);
    }
    const findHead = () => page.evaluate(() => {
      const { x, y } = window.petFrames.at(-1).headPoint;
      for (let yy = y - 35; yy < y + 35; yy += 6) for (let xx = x - 30; xx < x + 30; xx += 6) {
        if (window.petCompanionTest.hitRegion(xx, yy) === 'head') return { x: xx, y: yy };
      }
    });
    async function exactSubtitle(context, kind) {
      await page.waitForFunction(({ kind, id }) => {
        const line = window.petCompanionTest.voice().lastLine;
        return line?.event === `initiative-${kind}` && line.id === id;
      }, { kind, id: context.pair[kind] });
      const record = await voice();
      assert.equal(record.lastLine.id, context.pair[kind]); assert.equal(record.lastLine.language, context.language);
      assert.equal(await page.locator('#speech').textContent(), record.lastLine.text);
      return record;
    }
    async function bubbleLayout() {
      const layout = await page.evaluate(() => ({
        speech: document.querySelector('#speech').getBoundingClientRect().toJSON(),
        invitation: document.querySelector('#initiative').getBoundingClientRect().toJSON(), width: innerWidth, height: innerHeight,
      }));
      for (const [name, box] of [['speech', layout.speech], ['invitation', layout.invitation]]) {
        assert.ok(box.width > 0 && box.height > 0, `${name} is visible`);
        assert.ok(box.left >= 0 && box.top >= 0 && box.right <= layout.width + 1 && box.bottom <= layout.height + 1, `${name} fits without clipping`);
      }
      assert.ok(layout.speech.bottom <= layout.invitation.top + 1 || layout.invitation.bottom <= layout.speech.top + 1
        || layout.speech.right <= layout.invitation.left + 1 || layout.invitation.right <= layout.speech.left + 1, 'Original subtitles and invitation button do not overlap');
      return layout;
    }

    await idle();
    const initial = await initiative(); assert.ok(initial.targetDelay >= 60 && initial.targetDelay <= 120);
    const seconds = Math.max(0, Math.floor(initial.targetDelay - initial.quietSeconds) - 4);
    await page.evaluate(seconds => window.petCompanionTest.advanceInitiative(seconds), seconds);
    assert.equal((await initiative()).phase, 'idle');
    // Leave room for the live performance clock between diagnostic sampling
    // and virtual ticks, then cross the threshold one tick at a time.
    for (let i = 0; i < 10 && (await initiative()).phase === 'idle'; i++) await page.evaluate(() => window.petCompanionTest.advanceInitiative(1));
    await page.waitForFunction(() => window.petCompanionTest.initiative().phase === 'waiting');
    const first = await initiative(); assert.equal(first.preview, false); assert.ok(first.context.pair.invite);
    await exactSubtitle(first.context, 'invite');
    const waiting = await main('diagnostics'); assert.equal(waiting.effectiveRoaming, false);
    assert.equal((await page.evaluate(() => window.pet.getState())).roaming, true);
    await wait(400); const still = await main('diagnostics');
    assert.equal(still.world.x, waiting.world.x); assert.equal(still.world.y, waiting.world.y);
    const waitingLayout = await bubbleLayout();
    await page.screenshot({ path: path.join(out, `initiative-waiting${suffix}.png`), omitBackground: true });
    const beforeDoubleTap = await taps(), bubble = await page.locator('#initiative').boundingBox();
    await main('testCursor', { x: still.bounds.x + bubble.x + bubble.width / 2, y: still.bounds.y + bubble.y + bubble.height / 2 });
    await page.mouse.dblclick(bubble.x + bubble.width / 2, bubble.y + bubble.height / 2, { delay: 30 });
    await page.waitForFunction(() => window.petCompanionTest.initiative().phase === 'responding');
    const silent = await exactSubtitle(first.context, 'reply'); assert.equal(silent.lastLine.silent, true);
    assert.equal((await main('diagnostics')).world.dragging, false); assert.equal((await main('diagnostics')).world.platform, waiting.world.platform);
    assert.equal(await taps(), beforeDoubleTap, 'Reward is not granted before the response completes');
    await wait(200); const replyLayout = await bubbleLayout();
    await page.screenshot({ path: path.join(out, `initiative-reply${suffix}.png`), omitBackground: true });
    await released(); await wait(100);
    assert.equal(await taps(), beforeDoubleTap + 1, 'A double click produces exactly one ordinary care tap');
    assert.equal((await main('diagnostics')).effectiveRoaming, true);
    assert.ok((await initiative()).targetDelay >= 300 && (await initiative()).targetDelay <= 600);
    await main('testCursor', { x: -10000, y: -10000 });
    results.push({ firstAutomaticDelayWithinOneToTwoMinutes: true, waitingActuallyStopsMotion: true, muteKeepsExactSubtitle: true, doubleClickRewardsOnceAfterReply: true });
    results.push({ bubblesDoNotOverlapOrClip: true, waitingLayout, replyLayout });

    await page.evaluate(() => window.pet.update({ voiceEnabled: true }));
    const second = await preview(), head = await findHead(), beforeCharacterClick = await main('diagnostics'); assert.ok(head);
    await main('testCursor', { x: beforeCharacterClick.bounds.x + head.x, y: beforeCharacterClick.bounds.y + head.y });
    await page.evaluate(() => { window.petFrames = []; });
    await page.mouse.move(head.x, head.y); await page.mouse.down(); await wait(100);
    assert.equal((await main('diagnostics')).world.dragging, false, 'Invitation pointerdown does not start the physical grab');
    assert.equal((await main('diagnostics')).world.platform, beforeCharacterClick.world.platform);
    await page.mouse.up();
    await page.waitForFunction(() => window.petCompanionTest.initiative().phase === 'responding');
    const spoken = await exactSubtitle(second.context, 'reply'); assert.equal(spoken.lastLine.silent, false);
    await page.waitForFunction(() => window.petCompanionTest.voice().currentTime > .1);
    assert.equal((await main('diagnostics')).effectiveRoaming, false);
    assert.equal(await page.evaluate(() => window.petFrames.some(frame => frame.mode === 'held')), false);
    await released(); assert.equal((await main('diagnostics')).effectiveRoaming, true);
    await main('testCursor', { x: -10000, y: -10000 });
    results.push({ characterResponseDoesNotGrabOrDropPlatform: true, originalAudioPlaysUntilActualEnd: true });

    await page.evaluate(() => window.pet.update({ voiceEnabled: false }));
    await preview(); const beforeTimeout = await taps();
    await page.evaluate(() => window.petCompanionTest.advanceInitiative(46));
    await released(); assert.equal((await initiative()).lastReason, 'wait-timeout'); assert.equal(await taps(), beforeTimeout);
    results.push({ ignoredInvitationExpiresAt45SecondsWithoutReward: true });

    await preview(); const grab = await findHead(), start = await main('diagnostics'); assert.ok(grab);
    await main('testCursor', { x: start.bounds.x + grab.x, y: start.bounds.y + grab.y });
    await page.mouse.move(grab.x, grab.y); await page.mouse.down();
    await main('testCursor', { x: start.bounds.x + grab.x + 25, y: start.bounds.y + grab.y - 15 });
    await page.mouse.move(grab.x + 25, grab.y - 15);
    await page.waitForSelector('#stage[data-mode="held"]'); await released();
    assert.equal((await main('diagnostics')).world.dragging, true);
    await wait(120); assert.ok((await page.evaluate(() => window.petFrames.at(-1))).grabError < .5);
    await wait(250); await page.mouse.up(); await main('testCursor', { x: -10000, y: -10000 });
    results.push({ actualDragCancelsWaitingAndPreservesMousePivot: true });

    await idle(); await preview();
    await page.evaluate(() => window.pet.command('hide')); await released();
    assert.equal((await voice()).playing, false);
    await page.evaluate(() => window.pet.command('show')); await idle();
    await preview();
    await page.evaluate(() => window.pet.care('rest', '212')); await released();
    assert.equal((await page.evaluate(() => window.pet.getState())).care.resting, true);
    await page.evaluate(() => window.petCompanionTest.previewInitiative()); assert.equal((await initiative()).phase, 'idle');
    await page.evaluate(() => window.pet.care('rest', '212')); await idle();
    await preview();
    await page.evaluate(() => window.pet.update({ proactiveEvents: false })); await released();
    await page.evaluate(() => window.petCompanionTest.previewInitiative()); assert.equal((await initiative()).phase, 'idle');
    await page.evaluate(() => window.pet.update({ proactiveEvents: true }));
    results.push({ hideRestAndDisabledCancelImmediately: true });

    await preview();
    await page.evaluate(() => window.pet.update({ characterId: '500', voiceLanguage: 'cn' }));
    await released(); await page.waitForSelector('#stage[data-character="500"][data-state="ready"]', { timeout: 45000 });
    await idle(); const fallback = await preview();
    assert.equal(fallback.context.language, 'jp'); assert.ok(fallback.context.pair.invite);
    await exactSubtitle(fallback.context, 'invite');
    await page.locator('#initiative').click(); await page.waitForFunction(() => window.petCompanionTest.initiative().phase === 'responding');
    await exactSubtitle(fallback.context, 'reply'); await released();
    assert.equal((await page.evaluate(() => window.pet.getState())).voiceLanguage, 'cn');
    results.push({ characterChangeCancels: true, missingChineseFallsBackAsOneJapanesePairWithoutChangingPreference: true });
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, `initiative-renderer${suffix}-report.json`), JSON.stringify({ passed: true, packaged: Boolean(executablePath), results, errors }, null, 2));
    console.log(results);
  } catch (error) {
    const diagnostics = page && !page.isClosed() ? await page.evaluate(() => ({ initiative: window.petCompanionTest?.initiative(), voice: window.petCompanionTest?.voice(), stage: { ...document.querySelector('#stage')?.dataset } })).catch(() => null) : null;
    fs.writeFileSync(path.join(out, `initiative-renderer${suffix}-failure.json`), JSON.stringify({ message: error.message, results, diagnostics, main: await main('diagnostics').catch(() => null), errors }, null, 2));
    throw error;
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
