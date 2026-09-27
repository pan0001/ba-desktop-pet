const test = require('node:test');
const assert = require('node:assert/strict');
const messages = require('../assets/locales/ui.json');
const { sanitizeSettings } = require('../electron/core.cjs');

test('locale selection is bounded and independent from voice language', () => {
  const value = sanitizeSettings({ uiLocale: 'ja', languageConfigured: true, voiceLanguage: 'cn' }, ['212']);
  assert.equal(value.uiLocale, 'ja'); assert.equal(value.voiceLanguage, 'cn');
  assert.equal(value.languageConfigured, true);
  const invalid = sanitizeSettings({ uiLocale: '../../other', languageConfigured: 'yes' }, ['212']);
  assert.equal(invalid.uiLocale, 'zh'); assert.equal(invalid.languageConfigured, false);
});
test('translations preserve unknown names and safely format nested status text', async () => {
  const { createTranslator, normalizeLocale } = await import('../scripts/localization-core.js');
  const en = createTranslator(messages, 'en-US'), ja = createTranslator(messages, 'ja-JP');
  assert.equal(normalizeLocale('zh-Hans'), 'zh');
  assert.equal(en('今日还可 3 次'), '3 left today');
  assert.equal(en('累计陪伴 2 小时 8 分钟'), 'Time together: 2 hr 8 min');
  assert.equal(ja('羁绊 Lv.3 · 初次见面'), '絆 Lv.3 · はじめまして');
  assert.equal(en('  音量  '), '  Volume  ');
  assert.equal(en('<img src=x onerror=alert(1)>'), '<img src=x onerror=alert(1)>');
  assert.equal(en('爱丽丝'), '爱丽丝');
  assert.equal(createTranslator(messages, 'zh')('今日还可 3 次'), '今日还可 3 次');
});
