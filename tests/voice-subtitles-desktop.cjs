const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const root = path.resolve(__dirname, '..'), profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ba-subtitles-'));
require('./resource-profile.cjs').prepareResourceProfile(profile, ['212', '426']);
const env = { ...process.env, BA_PET_TEST_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ languageConfigured: true, uiLocale: 'zh', voiceLanguage: 'jp', roaming: false, windowWalking: false, proactiveEvents: false, idleVoice: false, volume: .01 }));
(async () => {
  const app = await electron.launch({ args: [root, '--test-mode', '--measure-pet'], env }), errors = [], results = [];
  const ready = page => page.waitForFunction(() => document.querySelector('#stage')?.dataset.state === 'ready' && window.petCompanionTest, { timeout: 60000 });
  const { voiceSubtitle } = await import('../scripts/voice-subtitles.js');
  const catalog = require('../assets/voices/catalog.json');
  try {
    const primary = await app.firstWindow(); primary.on('pageerror', e => errors.push(e.message)); await ready(primary);
    const opening = app.waitForEvent('window'); await primary.evaluate(() => window.pet.command('settings')); const settings = await opening;
    await settings.waitForSelector('#uiLocale');
    const added = app.waitForEvent('window');
    assert.equal((await settings.evaluate(() => window.pet.scene('addStudent', { characterId: '426' }))).ok, true);
    const secondary = await added;
    assert.ok(secondary); secondary.on('pageerror', e => errors.push(e.message)); await ready(secondary);
    for (const page of [primary, secondary]) { await page.addInitScript(() => { Math.random = () => 0; }); await page.reload(); await ready(page); }
    for (const locale of ['zh', 'ja', 'en']) {
      await settings.selectOption('#uiLocale', locale, { force: true });
      await settings.waitForFunction(locale => document.documentElement.lang === ({ zh: 'zh-CN', ja: 'ja', en: 'en' })[locale] && document.querySelector('#uiLocale')?.value === locale, locale);
      for (const page of [primary, secondary]) {
        await page.waitForFunction(locale => document.documentElement.lang === ({ zh: 'zh-CN', ja: 'ja', en: 'en' })[locale], locale);
        await ready(page);
        for (const event of ['idle', 'interact']) {
          const played = await page.evaluate(event => window.petCompanionTest.speak(event), event);
          assert.equal(played, true, JSON.stringify(await page.evaluate(() => window.petCompanionTest.voice())));
          await page.waitForSelector('#speech:not([hidden])');
          const actual = await page.evaluate(() => ({ line: window.petCompanionTest.voice().lastLine, text: document.querySelector('#speech').textContent, locale: document.querySelector('#speech').dataset.subtitleLanguage, characterId: document.querySelector('#stage').dataset.character }));
          const state = await page.evaluate(() => window.pet.getState());
          const studentId = state.characters.find(c => c.id === actual.characterId).studentId;
          const source = catalog.students[studentId].languages.jp.find(line => line.id === actual.line.id);
          assert.ok(source); assert.equal(actual.text, voiceSubtitle(source, locale, 'jp').text);
          assert.equal(actual.line.file, source.file); assert.equal(actual.line.language, 'jp'); assert.equal(actual.locale, locale);
          results.push({ locale, event, studentId, text: actual.text });
        }
      }
      await primary.screenshot({ path: path.join(root, `test-results/subtitles-${locale}.png`) });
      // The UI setting may reload the settings page; wait before the next update.
      await settings.waitForSelector('#uiLocale');
    }
    await settings.evaluate(() => window.pet.update({ voiceLanguage: 'cn' }));
    assert.equal(await primary.evaluate(() => window.petCompanionTest.speak('idle')), true);
    const cn = await primary.evaluate(() => window.petCompanionTest.voice().lastLine);
    assert.equal(cn.language, 'cn'); assert.equal(cn.subtitleLanguage, 'en'); assert.equal(cn.subtitleFallback, false);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(root, 'test-results/voice-subtitles-desktop.json'), JSON.stringify({ passed: true, results, chineseVoiceEnglishCaption: true, errors }, null, 2));
    console.log(JSON.stringify({ passed: true, checks: results.length, chineseVoiceEnglishCaption: true, errors }));
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
