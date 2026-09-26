const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { CareSystem } = require('../electron/care.cjs');
const characters = require('../assets/characters.json');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'test-results');
const executable = process.argv[2] && path.resolve(process.argv[2]);
const variant = executable ? 'packaged' : 'source';
fs.mkdirSync(out, { recursive: true });
const profile = fs.mkdtempSync(path.join(out, `care-ui-${variant}-profile-`));
const errors = [], checks = [], layouts = [];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let app;

async function openSettings(pet) {
  await pet.evaluate(() => window.pet.command('settings'));
  for (let attempt = 0; attempt < 60; attempt++) {
    const page = app.windows().find(candidate => candidate.url().includes('settings.html'));
    if (page) {
      await page.waitForSelector('#characters .character');
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('settings.html'));
        win.setOpacity(0); win.setFocusable(false);
      });
      return page;
    }
    await wait(100);
  }
  throw new Error('Settings did not open');
}

async function capture(page, size) {
  await page.locator('#tab-care').click();
  await page.locator('#care-panel').evaluate(panel => { panel.scrollTop = 0; });
  const layout = await page.evaluate(() => {
    const panel = document.querySelector('#care-panel'), footer = document.querySelector('footer').getBoundingClientRect();
    return { width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth,
      panelWidth: panel.clientWidth, panelScrollWidth: panel.scrollWidth, footerBottom: footer.bottom };
  });
  assert.ok(layout.documentWidth <= layout.width && layout.panelScrollWidth <= layout.panelWidth, 'No horizontal overflow');
  assert.ok(layout.footerBottom <= layout.height + 1, 'Footer stays visible');
  await page.screenshot({ path: path.join(out, `care-ui-${variant}-${size}.png`) });
  for (const id of ['care-badge', 'care-snack', 'care-gift', 'care-play', 'care-rest', 'care-claim']) {
    const button = page.locator(`#${id}`); await button.scrollIntoViewIfNeeded();
    const bounds = await button.evaluate(element => {
      const box = element.getBoundingClientRect(), hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return { visible: box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth,
        uncovered: Boolean(hit && (hit === element || element.contains(hit))) };
    });
    assert.equal(bounds.visible, true, `${size}: ${id} can be fully scrolled into view`);
    assert.equal(bounds.uncovered, true, `${size}: ${id} is not covered`);
  }
  await page.locator('#care-recent').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(out, `care-ui-${variant}-${size}-records.png`) });
  layouts.push({ size, ...layout });
}

(async () => {
  const seed = new CareSystem({ characters }).serialize();
  const student = String(characters.find(character => character.id === '212').studentId);
  seed.students[student].cooldowns.play = Date.now() + 11000;
  fs.writeFileSync(path.join(profile, 'care.json'), JSON.stringify(seed));
  fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ layoutVersion: 2, characterId: '212', size: 320,
    paused: false, roaming: false, windowWalking: false, voiceEnabled: false, idleVoice: false, effectsEnabled: true, furniture: 'none' }));
  const env = { ...process.env, BA_PET_TEST_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ ...(executable ? { executablePath: executable } : {}), args: [...(executable ? [] : [root]), '--test-mode', '--measure-pet'], env });
  app.on('window', page => { page.on('pageerror', error => errors.push(error.message)); });
  const pet = await app.firstWindow();
  await app.evaluate(({ BrowserWindow, app }) => {
    const win = BrowserWindow.getAllWindows()[0]; win.setOpacity(0); win.setFocusable(false);
    process.mainModule.require(app.getAppPath() + '/electron/main.cjs').testCursor({ x: -10000, y: -10000 });
  });
  await pet.waitForSelector('#stage[data-state="ready"]', { timeout: 45000 });
  const page = await openSettings(pet);
  await page.locator('#care-badge').click();
  await page.waitForSelector('#care-panel[data-state="ready"]');
  assert.equal(await page.locator('#tab-care').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#care-level').textContent(), '1');
  assert.equal(await page.locator('#care-play').isDisabled(), true, 'Seeded cooldown starts disabled');
  await page.locator('#care-rest').scrollIntoViewIfNeeded(); await page.locator('#care-rest').focus();
  const before = await page.evaluate(() => {
    window.__careFocus = document.activeElement; window.__careDaily = document.querySelector('#care-daily li');
    window.__careChoice = document.querySelector('#characters .character');
    return document.querySelector('#care-panel').scrollTop;
  });
  await page.waitForFunction(() => !document.querySelector('#care-play').disabled, null, { timeout: 18000 });
  assert.equal(await page.evaluate(() => document.activeElement === window.__careFocus), true, 'Cooldown refresh preserves focus');
  assert.equal(await page.evaluate(() => document.querySelector('#care-daily li') === window.__careDaily), true, 'Unchanged daily rows are not replaced');
  assert.equal(await page.evaluate(() => document.querySelector('#characters .character') === window.__careChoice), true, 'Cooldown refresh does not rebuild character choices');
  assert.ok(Math.abs(await page.locator('#care-panel').evaluate(panel => panel.scrollTop) - before) <= 1);
  checks.push({ badgeOpensCare: true, visibleCooldownRefresh: true, preservesFocusScrollAndLists: true });

  const state = () => page.evaluate(() => window.pet.getState());
  await page.locator('#care-snack').click();
  await page.waitForFunction(() => document.querySelector('#care-fullness').value >= 90);
  assert.equal(await page.locator('#care-snack').isDisabled(), true);
  assert.match(await page.locator('#care-snack-status').textContent(), /饱/);
  await page.locator('#care-gift').click();
  await page.waitForFunction(() => document.querySelector('#care-achievements [data-id="first-gift"]').classList.contains('is-unlocked'));
  assert.equal(await page.locator('#care-gift').isDisabled(), true);
  await page.locator('#care-play').click();
  await page.waitForFunction(() => document.querySelector('#care-play').disabled);
  assert.ok((await state()).care.xp >= 25);
  await page.locator('#care-rest').click();
  await page.waitForFunction(() => document.querySelector('#care-rest').getAttribute('aria-pressed') === 'true');
  assert.equal(await page.locator('#care-resting').isVisible(), true);
  assert.match(await page.locator('#care-play-status').textContent(), /休息/);
  await page.locator('#care-rest').click();
  await page.waitForFunction(() => document.querySelector('#care-rest').getAttribute('aria-pressed') === 'false');
  assert.equal(await page.locator('#care-resting').isVisible(), false);
  assert.equal(await page.locator('#care-message').isVisible(), true);
  checks.push({ snackGiftPlay: true, careStateAndAchievementUpdate: true, restAndWake: true });

  for (const action of ['tap', 'pet']) assert.equal(await pet.evaluate(action => window.pet.care(action, '212').then(result => result.ok), action), true);
  await app.evaluate(({ app }) => {
    const main = process.mainModule.require(app.getAppPath() + '/electron/main.cjs');
    for (let minute = 0; minute < 5; minute++) main.testCareTick(60);
  });
  await page.waitForFunction(() => !document.querySelector('#care-claim').disabled);
  assert.equal(await page.locator('#care-daily .is-complete').count(), 3);
  await page.locator('#care-claim').click();
  await page.waitForFunction(() => document.querySelector('#care-claim').disabled);
  assert.match(await page.locator('#care-claim-label').textContent(), /已领取/);
  assert.ok(Number(await page.locator('#care-level').textContent()) >= 2);
  assert.ok(await page.locator('#care-recent li').count() > 0);
  checks.push({ dailyProgressAndClaim: true, levelAndRecentUpdate: true });

  const firstXp = (await state()).care.xp;
  await page.locator('#tab-buddy').click(); await page.locator('#search').fill('Hikari');
  await page.locator('.character[data-id="327"]').click();
  await page.locator('#tab-care').click(); await page.waitForFunction(() => document.querySelector('#care-partner').textContent.includes('光'));
  assert.equal((await state()).care.xp, 0);
  await page.locator('#tab-buddy').click(); await page.locator('#search').fill('Aris');
  await page.locator('.character[data-id="212"]').click();
  await page.locator('#tab-care').click(); await page.waitForFunction(() => document.querySelector('#care-partner').textContent.includes('爱丽丝'));
  assert.equal((await state()).care.xp, firstXp);
  checks.push({ selectedStudentCareSwitchesAndRestores: true });

  const current = await state();
  const sendState = next => app.evaluate(({ BrowserWindow }, value) => {
    BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('settings.html')).webContents.send('pet:state', value);
  }, next);
  await sendState({ ...current, care: null });
  await page.waitForSelector('#care-panel[data-state="loading"]');
  assert.equal(await page.locator('#care-loading').isVisible(), true);
  assert.equal(await page.locator('#care-content').isVisible(), false);
  const strangeName = '<img src=x onerror="window.__careInjected=true">';
  await sendState({ ...current, characters: current.characters.map(character => character.id === current.characterId ? { ...character, name: strangeName } : character) });
  await page.waitForSelector('#care-panel[data-state="ready"]');
  assert.equal(await page.locator('#name').textContent(), strangeName);
  assert.equal(await page.locator('#care-partner img').count(), 0);
  assert.equal(await page.evaluate(() => window.__careInjected), undefined);
  await sendState(current);
  checks.push({ unknownCareLoadingState: true, namesRenderedAsText: true });

  await capture(page, 'default');
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('settings.html'));
    const [width, height] = win.getMinimumSize(); win.setSize(width, height);
  });
  await wait(150); await capture(page, 'minimum');
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(out, `care-ui-${variant}-report.json`), JSON.stringify({ passed: true, profile, checks, layouts, errors }, null, 2));
  console.log(`Care UI ${variant}: actions, cooldown refresh, daily claim, student switching, safety and layouts passed.`);
})().catch(error => {
  console.error(error); process.exitCode = 1;
  fs.writeFileSync(path.join(out, `care-ui-${variant}-report.json`), JSON.stringify({ passed: false, error: error.stack, profile, checks, layouts, errors }, null, 2));
}).finally(async () => { if (app) await app.close(); });
