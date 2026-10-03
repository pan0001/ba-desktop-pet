const { test } = require('node:test');
const assert = require('node:assert/strict');
const { applySubtitles } = require('../tools/sync-voice-subtitles.cjs');

test('subtitle imports use exact full recording keys, rejecting ambiguity and untranslated English sources', () => {
  const line = key => ({ key, text: '中文', original: '', subtitles: { en: 'stale' } });
  const catalog = { students: { 1: { languages: { jp: [line('Aris_Lobby_1.ogg'), line('Aris_Lobby_2'), line('ArisMaid_Lobby_1'), line('Aris_Lobby_3')] } } } };
  const source = texts => ({ 10015: { Normal: texts.map(([key, text]) => ({ AudioClip: `jp_aris/${key}.mp3`, Transcription: text })) } });
  applySubtitles(catalog, source([['aris_lobby_1', 'Hello.'], ['aris_lobby_2', 'こんにちは。'], ['aris_lobby_3', 'One'], ['aris_lobby_3', 'Another']]), {});
  const [first, untranslated, costume, ambiguous] = catalog.students[1].languages.jp;
  assert.equal(first.subtitles.en, 'Hello.');
  for (const row of [untranslated, costume, ambiguous]) assert.equal(row.subtitles.en, undefined);
});

test('captions follow interface language independently of the recording and explicitly label missing translations', async () => {
  const { voiceSubtitle } = await import('../scripts/voice-subtitles.js');
  const line = { text: '你好', original: 'こんにちは', subtitles: { en: 'Hello' } };
  assert.equal(voiceSubtitle(line, 'zh', 'jp').text, '你好');
  assert.equal(voiceSubtitle(line, 'ja-JP', 'jp').text, 'こんにちは');
  assert.equal(voiceSubtitle(line, 'en', 'jp').text, 'Hello');
  assert.equal(voiceSubtitle({ ...line, subtitles: { ja: 'こんにちは' }, original: '' }, 'ja', 'cn').text, 'こんにちは');
  const fallback = voiceSubtitle({ text: '你好', original: 'こんにちは' }, 'en', 'jp');
  assert.equal(fallback.subtitleFallback, true); assert.equal(fallback.subtitleLanguage, 'ja');
  assert.match(fallback.text, /Translation unavailable/); assert.match(fallback.text, /こんにちは/);
});

test('idle, interaction, and silent initiative captions use the selected UI language without changing audio', async () => {
  const { createPetVoice } = await import('../scripts/pet-voice.js');
  const bank = { languages: { jp: [{ id: 'hello', text: '你好', original: 'こんにちは', subtitles: { en: 'Hello' }, file: 'jp.ogg', events: ['idle', 'interact'] }] } };
  const shown = [], players = [];
  const voice = createPetVoice({ onLine: line => shown.push(line), makeAudio: () => {
    const player = { addEventListener() {}, play: async () => {}, pause() {}, removeAttribute() {}, load() {} }; players.push(player); return player;
  } });
  try {
    voice.setCharacter(bank);
    for (const [locale, text] of [['zh', '你好'], ['ja', 'こんにちは'], ['en', 'Hello']]) {
      voice.configure({ uiLocale: locale, voiceLanguage: 'jp' });
      for (const event of ['idle', 'interact']) {
        await voice.speak(event, { force: true });
        assert.equal(shown.at(-1).text, text); assert.equal(players.at(-1).src, 'jp.ogg');
      }
      await voice.speakLine('hello', { force: true, silent: true });
      assert.equal(shown.at(-1).text, text); assert.equal(shown.at(-1).silent, true);
    }
  } finally { voice.dispose(); }
});

test('installed subtitles and the byte index stay complete and consistent', async () => {
  const fs = require('node:fs'), path = require('node:path');
  const { buildVoiceIndex } = require('../tools/build-voice-index.cjs');
  const catalog = require('../assets/voices/catalog.json');
  const { voiceSubtitle } = await import('../scripts/voice-subtitles.js');
  let total = 0, ja = 0, en = 0;
  for (const bank of Object.values(catalog.students)) for (const [language, lines] of Object.entries(bank.languages)) for (const line of lines) {
    total++; if (line.subtitles.ja) ja++; if (line.subtitles.en) en++;
    for (const locale of ['zh', 'ja', 'en']) assert.ok(voiceSubtitle(line, locale, language).text.trim());
    if (line.subtitles.en) assert.doesNotMatch(line.subtitles.en, /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u);
  }
  const report = require('../assets/voices/subtitle-sources.json').coverage;
  assert.deepEqual({ total, ja, en }, { total: report.total, ja: report.ja, en: report.en });
  assert.ok(en / total > .95); assert.ok(ja / total > .99);
  assert.deepEqual(buildVoiceIndex(path.join(__dirname, '../assets/voices/catalog.json')), JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/voices/catalog-index.json'))));
});
