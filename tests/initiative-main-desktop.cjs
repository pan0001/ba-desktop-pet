const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');

const root = path.resolve(__dirname, '..'), out = path.join(root, 'test-results');
fs.mkdirSync(out, { recursive: true });
const profile = fs.mkdtempSync(path.join(out, 'initiative-main-'));
const executable = process.argv[2] && path.resolve(process.argv[2]);
const variant = executable ? 'packaged' : 'source';
const reportFile = path.join(out, `initiative-main-${variant}.json`);
const env = { ...process.env, BA_PET_TEST_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
const errors = [], checks = [];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let app, pet, settingsPage, serial = 800000000000;
const diagnostics = () => app.evaluate(({ app }) => process.mainModule.require(app.getAppPath() + '/electron/main.cjs').diagnostics());
const state = () => pet.evaluate(() => window.pet.getState());
const update = patch => pet.evaluate(patch => window.pet.update(patch), patch);
const command = value => pet.evaluate(value => window.pet.command(value), value);
const lease = (value, page = pet) => page.evaluate(value => window.pet.initiative(value), value);
const next = (characterId = '212') => ({ id: `initiative-${++serial}`, phase: 'waiting', characterId });

async function until(predicate, label) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) { if (await predicate()) return; await wait(40); }
  throw new Error(`Timed out: ${label}; diagnostics: ${JSON.stringify(await diagnostics())}`);
}
async function idle(characterId = '212') {
  await pet.waitForSelector(`#stage[data-character="${characterId}"][data-state="ready"]`, { timeout: 45000 });
  await until(async () => {
    const d = await diagnostics();
    return d.geometryReady && !d.world.reaction && !d.world.dragging && ['idle', 'walk'].includes(d.world.mode)
      && (!d.effectiveRoaming || Boolean(d.world.platform))
      && await pet.evaluate(() => ['idle', 'walk'].includes(window.petCompanionTest?.viewer()?.mode));
  }, 'model and world ready for an invitation');
}
async function begin(characterId = '212') {
  await idle(characterId);
  const value = next(characterId), result = await lease(value);
  assert.equal(result.ok, true, `Lease starts: ${JSON.stringify(await diagnostics())}`);
  const d = await diagnostics();
  assert.equal(d.initiative.id, value.id); assert.equal(d.initiative.phase, 'waiting');
  assert.equal(d.effectiveRoaming, false); assert.equal((await state()).roaming, true);
  return value;
}
async function ended(label) {
  await until(async () => (await diagnostics()).initiative === null, label);
}

(async () => {
  fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ characterId: '212', size: 360,
    alwaysOnTop: false, voiceEnabled: false, idleVoice: false, proactiveEvents: true, effectsEnabled: false,
    roaming: true, windowWalking: false, physics: false, paused: false, furniture: 'none' }));
  app = await electron.launch({ ...(executable ? { executablePath: executable } : {}), args: [...(executable ? [] : [root]), '--test-mode', '--measure-pet'], env });
  app.on('window', page => page.on('pageerror', error => errors.push(error.message)));
  pet = await app.firstWindow(); pet.on('pageerror', error => errors.push(error.message));
  await app.evaluate(({ BrowserWindow, app }) => {
    const win = BrowserWindow.getAllWindows()[0]; win.setOpacity(0); win.setFocusable(false); win.webContents.setAudioMuted(true);
    process.mainModule.require(app.getAppPath() + '/electron/main.cjs').testCursor({ x: -10000, y: -10000 });
  });
  await idle();
  await pet.evaluate(() => { window.__initiativeCancels = []; window.pet.onInitiativeCancel(value => window.__initiativeCancels.push(value)); });
  await command('settings');
  await until(async () => {
    settingsPage = app.windows().find(page => page.url().includes('settings.html')); return Boolean(settingsPage);
  }, 'settings window opens');
  await settingsPage.waitForSelector('#proactiveEvents', { state: 'attached' });
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('settings.html'));
    win.setOpacity(0); win.setFocusable(false);
  });

  assert.equal((await lease(next(), settingsPage)).ok, false, 'Settings cannot acquire a pet lease');
  for (const value of [null, {}, { ...next(), id: 'invalid-id' }, { ...next(), phase: 'unknown' }, next('218')]) {
    assert.equal((await lease(value)).ok, false, 'Invalid or stale-character requests are rejected');
  }
  assert.equal((await diagnostics()).initiative, null);
  checks.push('Only the pet renderer can acquire a lease; invalid ids/phases and another character are rejected');

  const first = await begin();
  const original = (await diagnostics()).initiative;
  assert.ok(original.until - Date.now() > 58500 && original.until - Date.now() <= 60000, 'Waiting lease has a 60-second safety deadline');
  assert.equal((await lease(first)).ok, false, 'A repeated waiting request cannot renew the lease');
  assert.equal((await lease(next())).ok, false, 'A second invitation cannot replace an active lease');
  assert.equal((await diagnostics()).initiative.until, original.until);
  for (const phase of ['responding', 'idle']) {
    assert.equal((await lease({ ...first, phase }, settingsPage)).ok, false, `Settings cannot ${phase} the pet lease`);
    assert.equal((await diagnostics()).initiative.phase, 'waiting');
  }
  assert.equal((await lease({ ...first, phase: 'responding', characterId: '218' })).ok, false);
  assert.equal((await lease({ ...first, phase: 'responding' })).ok, true);
  const responding = (await diagnostics()).initiative;
  assert.equal(responding.phase, 'responding');
  assert.ok(responding.until - Date.now() > 33500 && responding.until - Date.now() <= 35000);
  assert.equal((await lease({ ...first, phase: 'responding' })).ok, false, 'Repeated response cannot extend its deadline');
  assert.equal((await diagnostics()).initiative.until, responding.until);
  await lease({ ...first, phase: 'idle' }); await ended('normal release');
  assert.equal((await diagnostics()).effectiveRoaming, true);
  const second = await begin();
  await lease({ ...first, phase: 'idle' });
  assert.equal((await diagnostics()).initiative.id, second.id, 'A stale release cannot end a newer invitation');
  await lease({ ...second, phase: 'idle', characterId: '218' });
  assert.equal((await diagnostics()).initiative.id, second.id, 'A stale character cannot release the active invitation');
  await lease({ ...second, phase: 'idle' }); await ended('newer invitation release');
  checks.push('Waiting stops effective roaming only; duplicates cannot renew; response gets 35 seconds; stale ids/characters cannot release newer leases');

  for (const [label, interrupt, restore] of [
    ['pause', () => update({ paused: true }), () => update({ paused: false })],
    ['hide', () => command('hide'), () => command('show')],
    ['opt-out', () => update({ proactiveEvents: false }), () => update({ proactiveEvents: true })]
  ]) {
    const current = await begin(); await interrupt(); await ended(`${label} cancels`);
    assert.equal((await lease(next())).ok, false, `${label} rejects a new invitation`);
    await restore(); await idle();
    assert.equal((await diagnostics()).effectiveRoaming, true);
    assert.ok(await pet.evaluate(id => window.__initiativeCancels.some(value => value.id === id), current.id), `${label} cancellation notifies the pet`);
  }
  checks.push('Pause, hide and opting out cancel, notify the pet, reject new leases while blocked and restore roaming when cleared');

  await begin(); await update({ characterId: '218' }); await ended('character change cancels');
  assert.equal((await lease(next('212'))).ok, false, 'Old character cannot begin a new invitation');
  await begin('218'); await update({ characterId: '212' }); await ended('switching back cancels'); await idle();
  checks.push('Changing characters cancels the old lease and grants leases only to the newly loaded character');

  await begin();
  const resting = await pet.evaluate(() => window.pet.care('rest', '212'));
  assert.equal(resting.ok, true); assert.equal(resting.state.care.resting, true); await ended('rest cancels');
  assert.equal((await lease(next())).ok, false, 'Resting companion cannot be invited');
  assert.equal((await diagnostics()).effectiveRoaming, false);
  const awake = await pet.evaluate(() => window.pet.care('rest', '212'));
  assert.equal(awake.ok, true); assert.equal(awake.state.care.resting, false);
  await idle(); assert.equal((await diagnostics()).effectiveRoaming, true);
  checks.push('Rest cancels and blocks invitations; waking restores ordinary roaming');

  await begin();
  const bounds = (await diagnostics()).bounds, point = { x: bounds.width / 2, y: bounds.height / 2 };
  await app.evaluate(({ app }, cursor) => process.mainModule.require(app.getAppPath() + '/electron/main.cjs').testCursor(cursor), { x: bounds.x + point.x, y: bounds.y + point.y });
  await pet.evaluate(point => window.pet.dragStart(point), point); await ended('drag cancels');
  assert.equal((await diagnostics()).world.dragging, true);
  assert.equal((await lease(next())).ok, false, 'Dragging companion cannot be invited');
  await pet.evaluate(() => window.pet.dragEnd(false));
  await until(async () => !(await diagnostics()).world.dragging, 'drag ends');
  await app.evaluate(({ app }) => process.mainModule.require(app.getAppPath() + '/electron/main.cjs').testCursor({ x: -10000, y: -10000 }));
  await command('reset'); await idle();
  checks.push('Beginning a drag cancels and blocks the lease; ending the test drag restores normal activity');

  const expiring = await begin();
  const xp = (await state()).care.xp;
  // Test only this isolated lease's deadline. No global clock changes and no 60-second wall-clock wait.
  await app.evaluate(({ app }, id) => {
    const hold = process.mainModule.require(app.getAppPath() + '/electron/main.cjs').diagnostics().initiative;
    if (!hold || hold.id !== id) throw new Error('Expected lease is no longer active');
    hold.until = Date.now() - 1;
  }, expiring.id);
  await ended('main movement timer expires the waiting lease');
  assert.equal((await diagnostics()).effectiveRoaming, true);
  assert.equal((await state()).care.xp, xp, 'A timed-out invitation has no bond deduction');
  assert.ok(await pet.evaluate(id => window.__initiativeCancels.some(value => value.id === id && value.reason === 'interrupted'), expiring.id));
  const afterExpiry = await begin();
  await lease({ ...expiring, phase: 'idle' });
  assert.equal((await diagnostics()).initiative.id, afterExpiry.id, 'A delayed release of an expired lease cannot end its successor');
  await lease({ ...afterExpiry, phase: 'idle' }); await ended('successor release');
  checks.push('Real movement timer releases an expired lease and restores roaming with no bond change; deadline was advanced directly in isolated diagnostics, not waited for 60 seconds');

  assert.deepEqual(errors, [], 'No renderer errors');
  fs.writeFileSync(reportFile, JSON.stringify({ passed: true, variant, executable: executable || 'source', profile, checks, errors }, null, 2));
  console.log(`Initiative main ${variant}: ${checks.length} groups passed; isolated profile ${profile}`);
})().catch(error => {
  fs.writeFileSync(reportFile, JSON.stringify({ passed: false, variant, profile, error: error.stack || String(error), checks, errors }, null, 2));
  console.error(error); process.exitCode = 1;
}).finally(async () => { if (app) await app.close(); });
