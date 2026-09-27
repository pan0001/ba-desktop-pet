const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'test-results');
const profile = path.join(out, `locale-first-run-${Date.now()}`);
const env = { ...process.env, BA_PET_TEST_PROFILE: profile, BA_PET_TEST_FIRST_LAUNCH: '1' };
delete env.ELECTRON_RUN_AS_NODE;
async function launch() {
  const app = await electron.launch({ args: [root, '--test-mode'], env });
  const pet = await app.firstWindow();
  await pet.waitForSelector('#stage[data-state="ready"]', { timeout: 60000 });
  const pending = app.waitForEvent('window');
  await pet.evaluate(() => window.pet.command('settings'));
  const page = await pending;
  await page.waitForSelector('#uiLocale');
  return { app, pet, page };
}
(async () => {
  let session = await launch();
  const errors = [];
  try {
    session.page.on('pageerror', error => errors.push(error.message));
    await session.page.waitForSelector('#language-welcome[open]');
    await session.page.selectOption('#welcome-language', 'en');
    await session.page.click('#language-start');
    await session.page.waitForFunction(() => document.documentElement.lang === 'en' && !document.querySelector('#language-welcome').open);
    assert.equal(await session.page.locator('#tab-buddy').innerText(), 'Companion');
    assert.equal(await session.page.locator('#voiceLanguage').inputValue(), 'jp');
    assert.match(await session.page.locator('.character[data-id="440"]').innerText(), /Shiroko/);
    await session.page.screenshot({ path: path.join(out, 'locale-en.png') });
    await session.page.selectOption('#uiLocale', 'ja');
    await session.page.waitForFunction(() => document.documentElement.lang === 'ja');
    assert.equal(await session.page.locator('#tab-buddy').innerText(), 'パートナーと活動');
    assert.match(await session.page.locator('.character[data-id="440"]').innerText(), /シロコ/);
    await session.page.screenshot({ path: path.join(out, 'locale-ja.png') });
    const state = await session.page.evaluate(() => window.pet.getState());
    assert.equal(state.languageConfigured, true); assert.equal(state.uiLocale, 'ja');
    assert.equal(state.voiceLanguage, 'jp');
  } finally { await session.app.close(); }
  session = await launch();
  try {
    await session.page.waitForFunction(() => document.documentElement.lang === 'ja');
    assert.equal(await session.page.locator('#language-welcome').evaluate(dialog => dialog.open), false);
    assert.equal(await session.page.locator('#uiLocale').inputValue(), 'ja');
    assert.deepEqual(errors, []);
    const saved = JSON.parse(fs.readFileSync(path.join(profile, 'settings.json')));
    assert.equal(saved.uiLocale, 'ja'); assert.equal(saved.languageConfigured, true);
    console.log(JSON.stringify({ firstRun: true, languages: ['en', 'ja'], persisted: true, voiceIndependent: true, errors }));
  } finally { await session.app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
