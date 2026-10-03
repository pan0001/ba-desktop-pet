const test = require('node:test'), assert = require('node:assert/strict');
const { CareSystem } = require('../electron/care.cjs');
const messages = require('../assets/locales/ui.json');

test('care labels, levels, achievements, limits and statuses have Japanese and English translations', async () => {
  const { createTranslator } = await import('../scripts/localization-core.js');
  const translators = ['en', 'ja'].map(locale => [locale, createTranslator(messages, locale)]);
  const now = new Date(2026, 9, 4, 12).getTime(), characters = [{ id: '212', studentId: 1 }];
  const text = new Set();
  function collect(value) {
    if (typeof value === 'string' && /[\u3400-\u9fff]/u.test(value)) text.add(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') Object.values(value).forEach(collect);
  }
  for (const xp of [0, 30, 75, 135, 210, 300, 405, 525, 660, 810]) {
    for (const metric of [0, 20, 50, 75, 90, 100]) for (const resting of [false, true]) {
      const system = new CareSystem({ characters, now: () => now, stored: { students: { 1: { xp, mood: metric, energy: metric, fullness: metric, resting } } } });
      collect(system.snapshot('212'));
      for (const action of ['tap', 'pet', 'assist', 'snack', 'gift', 'play', 'rest', 'claim']) { collect(system.act('212', action)); collect(system.snapshot('212')); }
    }
  }
  const completed = new CareSystem({ characters, now: () => now, stored: { students: { 1: { daily: { greeted: true, petted: true, seconds: 300, snacks: 3, gifts: 1 }, totalSeconds: 3600 } } } });
  collect(completed.act('212', 'claim')); collect(completed.snapshot('212'));
  for (const source of ['初识', '形影不离', '今天已领取', '有点累了', '一起玩', '成就达成：小小心意']) assert.ok(text.has(source), source);
  for (const source of text) for (const [locale, tr] of translators) {
    assert.notEqual(tr(source), source, `${locale}: ${source}`);
    if (locale === 'en') assert.doesNotMatch(tr(source), /[\u3400-\u9fff]/u, source);
  }
});

test('existing care history translates composed XP and level messages without changing saved source text', async () => {
  const { createTranslator } = await import('../scripts/localization-core.js');
  const en = createTranslator(messages, 'en'), ja = createTranslator(messages, 'ja');
  assert.equal(en('今天也请多关照，老师！ 羁绊 +2'), "It's good to see you today, Sensei! Bond +2");
  assert.equal(en('收到老师的小礼物了！ 羁绊 +15，升到 2 级啦！'), 'A little gift from Sensei! Bond +15 Reached level 2!');
  assert.equal(en('成就达成：初次交流'), 'Milestone reached: First interaction');
  assert.equal(ja('成就达成：初次交流'), '実績達成：初めてのふれあい');
  assert.equal(en('又一起度过了五分钟，羁绊 +2，升到 3 级啦！'), 'Another five minutes together. Bond +2. Reached level 3!');
  assert.equal(en('日常互动与陪伴还可获得 50 点羁绊经验。'), 'Earn up to 50 more bond XP from interactions and time together today.');
  const source = { students: { 1: { recent: [{ text: '成就达成：初次交流', at: Date.now() }] } } };
  const saved = JSON.stringify(source); en(source.students[1].recent[0].text); ja(source.students[1].recent[0].text);
  assert.equal(JSON.stringify(source), saved);
});
