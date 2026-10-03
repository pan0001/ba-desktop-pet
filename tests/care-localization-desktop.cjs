const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const root = path.resolve(__dirname, '..'), profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ba-care-language-'));
const { CareSystem } = require('../electron/care.cjs');
const seed = new CareSystem({ characters: require('../assets/characters.json'), stored: { students: { 1: {
  xp: 2, interactions: 1, totalSeconds: 60, daily: { greeted: true, seconds: 60 },
  recent: [{ text: '成就达成：初次交流', at: Date.now() }, { text: '今天也请多关照，老师！ 羁绊 +2', at: Date.now() - 1000 }]
} } } });
fs.writeFileSync(path.join(profile, 'care.json'), JSON.stringify(seed.serialize()));
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ uiLocale: 'en', languageConfigured: true, paused: true, voiceEnabled: false, proactiveEvents: false, roaming: false }));
const env = { ...process.env, BA_PET_TEST_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
(async () => {
  const app = await electron.launch({ args: [root, '--test-mode'], env }), errors = [];
  try {
    const pet = await app.firstWindow(); await pet.waitForSelector('#stage[data-state="ready"]');
    const opening = app.waitForEvent('window'); await pet.evaluate(() => window.pet.command('settings')); const ui = await opening;
    ui.on('pageerror', e => errors.push(e.message)); await ui.waitForSelector('#uiLocale');
    const baseline = (await ui.evaluate(() => window.pet.getState())).care;
    const { createTranslator } = await import('../scripts/localization-core.js');
    const messages = require('../assets/locales/ui.json');
    for (const locale of ['en', 'ja', 'zh', 'en']) {
      await ui.selectOption('#uiLocale', locale, { force: true });
      await ui.waitForFunction(locale => document.documentElement.lang === { en: 'en', ja: 'ja', zh: 'zh-CN' }[locale] && document.querySelector('#uiLocale')?.value === locale, locale);
      await ui.locator('#tab-care').click(); await ui.waitForSelector('#care-panel[data-state="ready"]');
      const tr = createTranslator(messages, locale);
      await ui.waitForFunction(text => document.querySelector('#care-snack-label').textContent === text, tr('给点心'));
      for (const [id, source] of [['care-snack-label', '给点心'], ['care-gift-label', '送礼物'], ['care-play-label', '一起玩'], ['care-claim-label', '领取今日奖励'], ['care-title', '初识']]) assert.equal(await ui.locator('#' + id).textContent(), tr(source));
      assert.match(await ui.locator('#care-recent').innerText(), new RegExp(tr('成就达成：初次交流')));
      const text = await ui.locator('#care-panel').innerText();
      if (locale === 'en') assert.doesNotMatch(text, /[\u3400-\u9fff]/u);
      assert.equal(await ui.locator('#care-progress').getAttribute('aria-valuetext'), tr('羁绊 1 级，7%'));
      assert.equal(await ui.locator('#presence').textContent(), tr('安静陪伴中'));
      const current = (await ui.evaluate(() => window.pet.getState())).care;
      assert.equal(current.xp, baseline.xp); assert.deepEqual(current.recent, baseline.recent); assert.deepEqual(current.daily, baseline.daily);
      await ui.locator('.care-actions-section').scrollIntoViewIfNeeded();
      await ui.screenshot({ path: path.join(root, `test-results/care-language-${locale}.png`) });
      await ui.locator('.care-recent-section').scrollIntoViewIfNeeded();
      await ui.screenshot({ path: path.join(root, `test-results/care-history-${locale}.png`) });
    }
    await ui.locator('#care-gift').click();
    await ui.waitForFunction(() => document.querySelector('#care-message').textContent.includes('A little gift from Sensei! Bond +15'));
    assert.match(await ui.locator('#care-gift-status').textContent(), /Come back tomorrow/);
    assert.match(await ui.locator('#care-recent').innerText(), /Milestone reached: A little gift/);
    await ui.locator('#care-rest').click();
    await ui.waitForFunction(() => document.querySelector('#care-rest-label').textContent === 'Finish resting');
    assert.match(await ui.locator('#care-play-status').textContent(), /Finish resting first/);
    await ui.locator('#care-rest').click();
    await ui.waitForFunction(() => document.querySelector('#care-rest-label').textContent === 'Take a rest');
    assert.doesNotMatch(await ui.locator('#care-panel').innerText(), /[\u3400-\u9fff]/u);
    assert.equal((await ui.evaluate(() => window.pet.getState())).care.xp, 17);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, languages: ['en', 'ja', 'zh'], legacyHistory: true, dynamicActions: true, progressPreserved: true, errors }));
  } finally { await app.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
