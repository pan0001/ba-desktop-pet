const { test } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { sanitizeSettings } = require('../electron/core.cjs');
const root = path.join(__dirname, '..');
test('every installed character has local Japanese interaction, petting and idle lines with matching text', () => {
  const voices = require('../assets/voices/catalog.json'), characters = require('../assets/characters.json');
  for (const c of characters) {
    const bank = voices.students[c.studentId]; assert.ok(bank, c.name);
    for (const event of ['pet', 'interact', 'idle']) assert.ok(bank.languages.jp.some(line => line.events.includes(event)), `${c.name}: ${event}`);
  }
  for (const bank of Object.values(voices.students)) for (const lines of Object.values(bank.languages)) for (const line of lines) {
    assert.ok(line.text.trim()); assert.equal(new URL(line.source).hostname, 'static.kivo.wiki');
    assert.equal(fs.readFileSync(path.join(root, line.file)).toString('ascii', 0, 4), 'OggS');
    assert.ok(!line.events.includes('idle') || /cafe/i.test(line.key), 'Battle and birthday lines cannot enter random idle speech');
  }
});
test('voice settings clamp malformed saved values and default to Japanese', () => {
  const state = sanitizeSettings({ volume: 12, idleInterval: -1, voiceEnabled: 'false', voiceLanguage: 'unknown', furniture: 'bad' }, ['212']);
  assert.equal(state.volume, 1); assert.equal(state.idleInterval, 30); assert.equal(state.voiceLanguage, 'jp'); assert.equal(state.voiceEnabled, true); assert.equal(state.furniture, 'none');
});
test('voice playback keeps subtitles paired, refuses overlap, cancels old character callbacks and respects quiet periods', async () => {
  const { createPetVoice, voicePool } = await import('../scripts/pet-voice.js');
  let time = 0, lines = [], ended = 0; const players = [];
  const makeAudio = () => { const a = { handlers: {}, volume: 0, src: '', pause() { this.paused = true; }, removeAttribute() { this.src = ''; }, load() {}, play: async () => {}, addEventListener(k, cb) { this.handlers[k] = cb; } }; players.push(a); return a; };
  const bank = { languages: { jp: [{ id: 'jp-a', text: '日本語对应台词', file: 'a.ogg', events: ['interact', 'idle', 'pet'] }, { id: 'jp-b', text: '另一句', file: 'b.ogg', events: ['interact', 'idle', 'pet'] }], cn: [{ id: 'cn-a', text: '中文原声台词', file: 'c.ogg', events: ['interact'] }] } };
  const voice = createPetVoice({ makeAudio, now: () => time, random: () => 0, onLine: line => lines.push(line), onEnd: () => ended++ });
  voice.setCharacter(bank); await voice.speak('interact'); assert.equal(lines.at(-1).text, bank.languages.jp[0].text); assert.equal(players[0].src, 'a.ogg');
  assert.equal(await voice.speak('interact'), false); assert.equal(players.length, 1);
  players[0].handlers.ended(); time += 3000; await voice.speak('interact'); assert.equal(lines.at(-1).id, 'jp-b');
  voice.configure({ voiceLanguage: 'cn' }); time += 3000; await voice.speak('interact'); assert.equal(lines.at(-1).file, 'c.ogg');
  const current = voice.diagnostics().active, ends = ended; players[1].handlers.ended(); assert.deepEqual(voice.diagnostics().active, current); assert.equal(ended, ends);
  voice.configure({ voiceEnabled: false }); assert.equal(voice.diagnostics().playing, false); assert.equal(await voice.speak('pet', { force: true }), false);
  voice.configure({ voiceEnabled: true, voiceLanguage: 'jp', idleInterval: 30 }); time += 31000; voice.tick(false); const count = players.length; voice.tick(true); assert.equal(players.length, count);
  time += 31000; voice.tick(true); await Promise.resolve(); assert.equal(players.length, count + 1); assert.equal(lines.at(-1).event, 'idle');
  voice.setCharacter({ languages: { jp: bank.languages.jp, cn: [] } }); assert.equal(voicePool({ languages: { jp: bank.languages.jp, cn: [] } }, 'cn', 'pet').language, 'jp');
  voice.configure({ paused: true }); time += 999999; voice.tick(true); assert.equal(voice.diagnostics().playing, false);
  voice.dispose();
});
test('head stroking needs repeated movement over the head and has a cooldown', async () => {
  const { createHeadStroke } = await import('../scripts/pet-voice.js');
  const stroke = createHeadStroke(); const move = (x, time, head = true) => stroke.sample({ x, y: 100, time, head });
  assert.equal(move(0, 0), false); assert.equal(move(30, 120), false); assert.equal(move(0, 250), false); assert.equal(move(30, 400), true);
  for (let i = 1; i < 10; i++) assert.equal(move(i % 2 ? 0 : 30, 400 + i * 100), false);
  for (let i = 0; i < 8; i++) assert.equal(move(i % 2 ? 0 : 30, 10000 + i * 120, false), false);
});
