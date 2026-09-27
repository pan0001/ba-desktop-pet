const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');

const root = path.join(__dirname, '..'), out = path.join(root, 'test-results');
const executable = process.argv[2] && path.resolve(process.argv[2]);
const variant = executable ? 'packaged' : 'source';
const profile = path.join(out, `settings-ui-${variant}-profile`);
const reportFile = path.join(out, `settings-ui-${variant}-report.json`);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const persistentKeys = ['characterId', 'size', 'alwaysOnTop', 'paused', 'physics', 'roaming', 'windowWalking', 'effectsEnabled', 'voiceEnabled', 'voiceLanguage', 'volume', 'idleVoice', 'idleInterval', 'proactiveEvents', 'furniture'];
const errors = [], requests = [], layouts = [], checks = [];
let app;

function options() {
  const env = { ...process.env, BA_PET_TEST_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  return { ...(executable ? { executablePath: executable } : {}), args: [...(executable ? [] : [root]), '--test-mode', '--measure-pet'], env };
}

async function prepareApp() {
  app = await electron.launch(options());
  app.on('window', page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('requestfailed', request => requests.push({ url: request.url(), error: request.failure()?.errorText }));
  });
  const pet = await app.firstWindow();
  await app.evaluate(({ BrowserWindow, app }) => {
    const win = BrowserWindow.getAllWindows()[0]; win.setOpacity(0); win.setFocusable(false); win.webContents.setAudioMuted(true);
    process.mainModule.require(app.getAppPath() + '/electron/main.cjs').testCursor({ x: -10000, y: -10000 });
  });
  await pet.waitForSelector('#stage[data-state="ready"]', { timeout: 45000 });
  return pet;
}

async function openSettings(pet) {
  await pet.evaluate(() => window.pet.command('settings'));
  for (let attempt = 0; attempt < 80; attempt++) {
    const page = app.windows().find(candidate => candidate.url().includes('settings.html'));
    if (page) {
      await page.waitForSelector('#characters .character');
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows().find(candidate => candidate.webContents.getURL().includes('settings.html'));
        win.setOpacity(0); win.setFocusable(false); win.webContents.setAudioMuted(true);
      });
      return page;
    }
    await wait(100);
  }
  throw new Error('Settings window did not open');
}

async function stateIs(page, patch) {
  await page.waitForFunction(async expected => {
    const state = await window.pet.getState();
    return Object.entries(expected).every(([key, value]) => state[key] === value);
  }, patch);
}

async function switchTab(page, name) {
  await page.locator(`#tab-${name}`).click();
  assert.equal(await page.locator(`#tab-${name}`).getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator(`#${name}-panel`).isVisible(), true);
  assert.equal(await page.locator(`#${name === 'buddy' ? 'voice' : 'buddy'}-panel`).isVisible(), false);
}

async function imageAssets(page) {
  const result = await page.evaluate(async () => {
    const urls = new Set();
    for (const element of document.querySelectorAll('*')) {
      for (const pseudo of [null, '::before', '::after']) {
        const background = getComputedStyle(element, pseudo).backgroundImage;
        for (const match of background.matchAll(/url\(["']?([^"')]+)["']?\)/g)) urls.add(match[1]);
      }
    }
    for (const img of document.images) if (img.src && !img.hidden && getComputedStyle(img).display !== 'none') urls.add(img.src);
    const images = await Promise.all([...urls].map(url => new Promise(resolve => {
      const image = new Image();
      image.onload = () => resolve({ url, width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => resolve({ url, failed: true }); image.src = url;
    })));
    return { images, ui: images.filter(image => image.url.includes('/assets/ui/')).length };
  });
  assert.deepEqual(result.images.filter(image => image.failed || !image.width || !image.height), [], 'Every visible image and CSS background decodes');
  assert.ok(result.ui > 0, 'Settings uses local extracted UI assets');
  return { decoded: result.images.length, uiAssets: result.ui };
}

async function layout(page, label, tab) {
  await switchTab(page, tab);
  await page.evaluate(() => {
    for (const node of document.querySelectorAll('main,.workspace,#buddy-panel,#voice-panel,#characters')) node.scrollTop = 0;
  });
  await wait(100);
  const geometry = await page.evaluate(() => {
    const footer = document.querySelector('footer').getBoundingClientRect();
    const header = document.querySelector('header').getBoundingClientRect();
    const tabs = document.querySelector('#tab-buddy').getBoundingClientRect();
    return { width: innerWidth, height: innerHeight, pageWidth: document.documentElement.scrollWidth, footer: { top: footer.top, bottom: footer.bottom }, headerBottom: header.bottom, tabsTop: tabs.top };
  });
  assert.ok(geometry.pageWidth <= geometry.width + 1, `${label}: page has no horizontal overflow`);
  assert.ok(geometry.footer.top >= 0 && geometry.footer.bottom <= geometry.height + 1, `${label}: footer stays in viewport`);
  assert.ok(geometry.tabsTop >= geometry.headerBottom - 1, `${label}: tabs are not behind the header`);
  const images = await imageAssets(page);
  await page.screenshot({ path: path.join(out, `settings-ui-${variant}-${label}.png`) });
  const selectors = tab === 'buddy'
    ? ['#interact', '#show', '#size', '#top', '#paused', '#physics', '#roaming', '#windowWalking', '#effectsEnabled', '#reset', '#search', '#characters .character:first-child', '#characters .character:last-child', '#quit']
    : ['#interact', '#show', '#voiceEnabled', '#voiceLanguage', '#volume', '#idleVoice', '#idleInterval', '#voice-preview', '#proactiveEvents', '#initiative-preview', '[data-furniture="none"]', '[data-furniture="sofa"]', '[data-furniture="arcade"]', '#quit'];
  for (const selector of selectors) {
    const control = page.locator(selector);
    assert.equal(await control.count(), 1, `${label}: ${selector} exists`);
    await control.scrollIntoViewIfNeeded();
    const box = await control.evaluate(element => {
      const rect = element.getBoundingClientRect(), centerX = rect.left + rect.width / 2, centerY = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(centerX, centerY), label = element.closest('label');
      return { x: rect.left, y: rect.top, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom,
        viewportWidth: innerWidth, viewportHeight: innerHeight,
        reachable: Boolean(hit && (hit === element || element.contains(hit) || (label && label.contains(hit)))) };
    });
    assert.ok(box.width > 0 && box.height > 0, `${label}: ${selector} is visible`);
    assert.ok(box.x >= -1 && box.y >= -1 && box.right <= box.viewportWidth + 1 && box.bottom <= box.viewportHeight + 1, `${label}: ${selector} can scroll fully into view: ${JSON.stringify(box)}`);
    assert.equal(box.reachable, true, `${label}: ${selector} is not covered by a header/footer/decoration`);
  }
  if (tab === 'voice') {
    await page.locator('.initiative-preferences').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, `settings-ui-${variant}-${label}-initiative.png`) });
    await page.locator('[data-furniture="arcade"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, `settings-ui-${variant}-${label}-furniture.png`) });
  }
  layouts.push({ label, tab, geometry, images, reachableControls: selectors.length });
}

(async () => {
  fs.mkdirSync(profile, { recursive: true });
  const pet = await prepareApp();
  await pet.evaluate(() => window.pet.update({ characterId: '212', size: 360, alwaysOnTop: false, paused: false,
    physics: true, roaming: false, windowWalking: false, effectsEnabled: true, voiceEnabled: true,
    voiceLanguage: 'jp', volume: .45, idleVoice: true, idleInterval: 120, proactiveEvents: true, furniture: 'none' }));
  await pet.waitForSelector('#stage[data-character="212"][data-state="ready"]', { timeout: 45000 });
  const page = await openSettings(pet);
  const windowSizes = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find(candidate => candidate.webContents.getURL().includes('settings.html'));
    return { initial: win.getSize(), minimum: win.getMinimumSize() };
  });
  await layout(page, 'default-buddy', 'buddy');
  await layout(page, 'default-voice', 'voice');
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find(candidate => candidate.webContents.getURL().includes('settings.html'));
    const [width, height] = win.getMinimumSize(); win.setSize(width, height);
  });
  await wait(300);
  await layout(page, 'minimum-buddy', 'buddy');
  await layout(page, 'minimum-voice', 'voice');
  checks.push({ defaultAndMinimumWindows: windowSizes });

  // Native controls remain usable with the keyboard, including all three tabs.
  await switchTab(page, 'buddy');
  assert.equal(await page.locator('#tab-buddy').getAttribute('role'), 'tab');
  assert.equal(await page.locator('#buddy-panel').getAttribute('role'), 'tabpanel');
  await page.locator('#tab-buddy').focus(); await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#tab-voice').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#tab-voice').evaluate(element => element === document.activeElement), true);
  await page.keyboard.press('Home'); assert.equal(await page.locator('#tab-buddy').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('End'); assert.equal(await page.locator('#tab-updates').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#updates-panel').isVisible(), true);
  await page.keyboard.press('ArrowLeft'); assert.equal(await page.locator('#tab-care').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('ArrowLeft'); assert.equal(await page.locator('#tab-voice').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('ArrowLeft'); assert.equal(await page.locator('#tab-buddy').getAttribute('aria-selected'), 'true');
  checks.push({ keyboardTabs: true });

  for (const [id, key, value] of [['top', 'alwaysOnTop', true], ['paused', 'paused', true], ['roaming', 'roaming', true], ['windowWalking', 'windowWalking', true], ['effectsEnabled', 'effectsEnabled', false]]) {
    await page.locator(`#${id}`).setChecked(value); await stateIs(page, { [key]: value });
  }
  await page.locator('#physics').focus(); await page.keyboard.press('Space'); await stateIs(page, { physics: false });
  await page.locator('#size').focus(); await page.keyboard.press('End'); await stateIs(page, { size: 560 });
  for (let size = 540; size >= 420; size -= 20) { await page.keyboard.press('ArrowLeft'); await stateIs(page, { size }); }
  assert.equal(await page.locator('#size-label').textContent(), '420 px');
  checks.push({ activityTogglesAndKeyboardSize: true });

  const characters = (await page.evaluate(() => window.pet.getState())).characters;
  const unsupported = characters.find(character => character.id === '327') || characters.find(character => !character.animations.includes('Aris_Original_Cafe_my_gamedevdept_01_sofa_01_01'));
  assert.ok(unsupported);
  await page.locator('#search').fill('no-match-character-8927');
  assert.equal(await page.locator('#empty').isVisible(), true); assert.equal(await page.locator('#characters .character').count(), 0);
  const query = unsupported.name.replace(/\s*\([^)]*\)\s*$/, '');
  await page.locator('#search').fill(query);
  await page.locator(`.character[data-id="${unsupported.id}"]`).click(); await stateIs(page, { characterId: unsupported.id });
  assert.equal(await page.locator(`.character[data-id="${unsupported.id}"]`).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#name').textContent(), query);
  await switchTab(page, 'voice');
  assert.equal(await page.locator('[data-furniture="sofa"]').isDisabled(), true);
  assert.equal(await page.locator('[data-furniture="arcade"]').isDisabled(), true);
  assert.equal(await page.locator('[data-furniture="none"]').isEnabled(), true);
  await switchTab(page, 'buddy'); await page.locator('#search').fill('Aris');
  await page.locator('.character[data-id="212"]').click(); await stateIs(page, { characterId: '212' });
  await page.locator('#search').fill(''); assert.equal(await page.locator('#characters .character').count(), characters.length);
  checks.push({ searchEmptyResultAndSelection: true, unsupportedFurnitureDisabled: true });

  await switchTab(page, 'voice');
  assert.equal(await page.locator('#voice-preview').isDisabled(), true, 'Paused companion does not preview voice');
  assert.equal(await page.locator('#initiative-preview').isDisabled(), true, 'Paused companion does not start an invitation');
  await page.locator('#voiceEnabled').uncheck(); await stateIs(page, { voiceEnabled: false });
  await page.locator('#voiceLanguage').selectOption('cn'); await stateIs(page, { voiceLanguage: 'cn' });
  await page.locator('#idleVoice').uncheck(); await stateIs(page, { idleVoice: false });
  await page.locator('#idleInterval').selectOption('300'); await stateIs(page, { idleInterval: 300 });
  await page.locator('#volume').focus(); await page.keyboard.press('Home'); await stateIs(page, { volume: 0 });
  for (let percent = 5; percent <= 35; percent += 5) { await page.keyboard.press('ArrowRight'); await stateIs(page, { volume: percent / 100 }); }
  assert.equal(await page.locator('#volume-label').textContent(), '35%');
  await page.locator('[data-furniture="sofa"]').click(); await stateIs(page, { furniture: 'sofa' });
  assert.equal(await page.locator('[data-furniture="sofa"]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-furniture="arcade"]').click(); await stateIs(page, { furniture: 'arcade' });
  await page.locator('[data-furniture="none"]').click(); await stateIs(page, { furniture: 'none' });
  checks.push({ languageFrequencyAndKeyboardVolume: true, supportedFurnitureSelection: true });

  // Verify both causes of preview disabling, not merely an already paused page.
  await switchTab(page, 'buddy'); await page.locator('#paused').uncheck(); await stateIs(page, { paused: false });
  await switchTab(page, 'voice'); assert.equal(await page.locator('#voice-preview').isDisabled(), true);
  assert.equal(await page.locator('#initiative-preview').isEnabled(), true, 'Invitations remain available with character voice disabled');
  await pet.evaluate(() => { window.__settingsUIActions = []; window.pet.onAction(action => window.__settingsUIActions.push(action)); });
  await page.locator('#initiative-preview').click();
  await pet.waitForFunction(() => window.__settingsUIActions.includes('initiative-preview'));
  await page.locator('#proactiveEvents').uncheck(); await stateIs(page, { proactiveEvents: false });
  assert.equal(await page.locator('#initiative-preview').isDisabled(), true, 'Opting out disables manual invitations');
  assert.match(await page.locator('#initiative-status').innerText(), /开启/);
  await page.locator('#proactiveEvents').focus(); await page.keyboard.press('Space'); await stateIs(page, { proactiveEvents: true });
  assert.equal(await page.locator('#initiative-preview').isEnabled(), true);
  await page.locator('#show').click(); await stateIs(page, { hidden: true });
  assert.equal(await page.locator('#initiative-preview').isDisabled(), true, 'Hidden companion does not start an invitation');
  assert.match(await page.locator('#initiative-status').innerText(), /显示桌宠/);
  await page.locator('#show').click(); await stateIs(page, { hidden: false });
  assert.equal(await page.locator('#initiative-preview').isEnabled(), true);
  assert.match(await page.locator('#initiative-description').innerText(), /45 秒.*不扣羁绊/);
  await page.locator('#proactiveEvents').uncheck(); await stateIs(page, { proactiveEvents: false });
  checks.push({ proactivePreviewCommand: true, proactiveOptOutAndKeyboard: true, proactivePausedHiddenVoiceAvailability: true });
  await page.locator('#voiceEnabled').check(); await stateIs(page, { voiceEnabled: true });
  assert.equal(await page.locator('#voice-preview').isEnabled(), true);
  await page.locator('#voiceEnabled').uncheck(); await stateIs(page, { voiceEnabled: false });
  await switchTab(page, 'buddy'); await page.locator('#paused').check(); await stateIs(page, { paused: true });

  const showBackground = await page.locator('#show').evaluate(element => getComputedStyle(element).backgroundImage);
  assert.match(showBackground, /assets\/ui\/common-atlas\.png/, 'The show/hide button uses the original Common atlas');
  assert.equal(await page.locator('#show-label').count(), 1);
  await page.locator('#show').click(); await stateIs(page, { hidden: true });
  assert.match(await page.locator('#show').innerText(), /显示桌宠/);
  assert.equal(await page.locator('#show-label').count(), 1, 'Label update preserves its own node');
  assert.equal(await page.locator('#show').evaluate(element => getComputedStyle(element).backgroundImage), showBackground, 'Label update preserves the original button background');
  await page.locator('#show').click(); await stateIs(page, { hidden: false });
  assert.match(await page.locator('#show').innerText(), /隐藏桌宠/);
  await page.locator('#reset').click(); await stateIs(page, { hidden: false });
  checks.push({ showHideAndReset: true, dynamicButtonIconPreserved: true, voicePreviewAvailability: true });

  const finalState = await page.evaluate(() => window.pet.getState());
  const expected = Object.fromEntries(persistentKeys.map(key => [key, finalState[key]]));
  await wait(600);
  const saved = JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'), 'utf8'));
  for (const key of persistentKeys) assert.equal(saved[key], expected[key], `Saved ${key}`);
  await app.close(); app = null;
  const restartedPet = await prepareApp();
  await stateIs(restartedPet, expected);
  const restartedSettings = await openSettings(restartedPet);
  assert.equal(await restartedSettings.locator('#size').inputValue(), String(expected.size));
  assert.equal(await restartedSettings.locator('#effectsEnabled').isChecked(), expected.effectsEnabled);
  await switchTab(restartedSettings, 'voice');
  assert.equal(await restartedSettings.locator('#voiceLanguage').inputValue(), expected.voiceLanguage);
  assert.equal(await restartedSettings.locator('#volume').inputValue(), '35');
  assert.equal(await restartedSettings.locator('#proactiveEvents').isChecked(), false, 'Opt-out is preserved after restarting');
  assert.equal(await restartedSettings.locator('#initiative-preview').isDisabled(), true);
  checks.push({ persistedAndRestored: persistentKeys });
  assert.deepEqual(errors, [], 'No renderer errors');
  assert.deepEqual(requests.filter(request => !request.error?.includes('ERR_ABORTED')), [], 'No failed local asset requests');
  fs.writeFileSync(reportFile, JSON.stringify({ passed: true, variant, layouts, checks, errors, requests }, null, 2));
  console.log(`Settings UI ${variant}: four-tab keyboard navigation, ${layouts.length} layouts, all controls and restart persistence passed.`);
})().catch(error => {
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(reportFile, JSON.stringify({ passed: false, variant, error: error.stack || String(error), layouts, checks, errors, requests }, null, 2));
  console.error(error); process.exitCode = 1;
}).finally(async () => { if (app) await app.close(); });
