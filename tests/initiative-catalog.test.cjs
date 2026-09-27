const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const voicesRoot = path.join(root, 'assets', 'voices');
const catalog = require('../assets/voices/catalog.json');
const initiatives = require('../assets/voices/initiatives.json');
const ordinaryKey = /^[^_]+_(?:cafe_(?:act|monolog)|lobby|login|relationship_up)_\d+(?:_\d+)?(?:（[^）]+）)?(?:\.ogg)?$/i;
const normalizeKey = key => key.toLowerCase().replace(/\.ogg$/, '').replace(/（[^）]+）$/, '');
const findLine = (studentId, language, id) => catalog.students[studentId].languages[language]?.find(line => line.id === id);

// These are desktop-pet arrangements of existing whole voice clips, not claims
// that the game originally plays these conversations as continuous scenes.
test('initiative catalog covers every voice student with a stable waiting UI contract', () => {
  assert.equal(initiatives.schemaVersion, 1);
  assert.deepEqual(Object.keys(initiatives.students).sort(), Object.keys(catalog.students).sort());
  const kinds = new Set();
  for (const [studentId, events] of Object.entries(initiatives.students)) {
    assert.match(studentId, /^\d+$/);
    const eligible = catalog.students[studentId].languages.jp.some(line => ordinaryKey.test(line.key) && !/新年|圣诞|万圣|情人节|生日/.test(line.text));
    assert.ok(Array.isArray(events));
    assert.equal(events.length > 0, eligible, `${studentId} has events exactly when source dialogue is available`);
    const ids = new Set();
    for (const event of events) {
      assert.match(event.id, /^[a-z][a-z0-9_-]*$/);
      assert.ok(!ids.has(event.id), `${studentId} duplicate event ${event.id}`);
      ids.add(event.id);
      kinds.add(event.id.split('-')[0]);
      for (const field of ['label', 'prompt']) {
        assert.equal(typeof event[field], 'string');
        assert.ok(event[field].trim().length > 0 && event[field].length <= 100);
        assert.ok(!/[<>\r\n]/.test(event[field]), `${studentId}/${event.id} plain UI ${field}`);
      }
      assert.match(event.prompt, /点击/, 'waiting prompt describes the click action');
      assert.ok(event.languages.jp, `${studentId}/${event.id} has a complete JP fallback`);
      // Subtitles remain in catalog.json; UI prompts must not replace them.
      assert.equal(Object.hasOwn(event, 'text'), false);
    }
  }
  for (const kind of ['greeting', 'company', 'chat']) assert.ok(kinds.has(kind), `${kind} is represented`);
});

test('every invitation and reply resolves within its student and language to real local audio', () => {
  const checkedFiles = new Set();
  for (const [studentId, events] of Object.entries(initiatives.students)) {
    for (const event of events) {
      for (const [language, pair] of Object.entries(event.languages)) {
        const context = `${studentId}/${event.id}/${language}`;
        assert.ok(['jp', 'cn'].includes(language), context);
        assert.deepEqual(Object.keys(pair).sort(), ['invite', 'reply']);
        assert.equal(typeof pair.reply, 'string', `${context} reply is required`);
        assert.ok(pair.invite === null || typeof pair.invite === 'string', context);
        assert.notEqual(pair.invite, pair.reply, `${context} does not repeat the same clip`);
        for (const id of [pair.invite, pair.reply].filter(id => id !== null)) {
          const line = findLine(studentId, language, id);
          assert.ok(line, `${context} missing reference ${id}`);
          assert.ok(typeof line.text === 'string' && line.text.trim(), `${context} original caption`);
          assert.ok(typeof line.file === 'string' && line.file.startsWith('assets/voices/'), `${context} voice path`);
          const file = path.resolve(root, line.file);
          const relative = path.relative(voicesRoot, file);
          assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), `${context} path stays inside voices`);
          assert.ok(['.ogg', '.wav'].includes(path.extname(file)));
          if (checkedFiles.has(file)) continue;
          checkedFiles.add(file);
          assert.ok(fs.statSync(file).isFile(), `${context} local clip exists`);
          const bytes = fs.readFileSync(file);
          assert.ok(bytes.length > 32, `${context} nonempty clip`);
          assert.equal(bytes.toString('ascii', 0, 4), file.endsWith('.wav') ? 'RIFF' : 'OggS', `${context} actual audio container`);
        }
      }
    }
  }
  assert.ok(checkedFiles.size >= Object.values(initiatives.students).filter(events => events.length).length);
});

test('only ordinary cafe, lobby, login and relationship dialogue is used', () => {
  for (const [studentId, events] of Object.entries(initiatives.students)) {
    for (const event of events) {
      for (const [language, pair] of Object.entries(event.languages)) {
        for (const id of [pair.invite, pair.reply].filter(id => id !== null)) {
          const line = findLine(studentId, language, id);
          assert.match(line.key, ordinaryKey, `${studentId}/${event.id} excludes battle, display, event shops and holiday categories`);
          assert.doesNotMatch(line.text, /新年|圣诞|万圣|情人节|生日/, `${studentId}/${event.id} no holiday-only captions`);
        }
      }
    }
  }
});

test('CN selections are whole corresponding pairs and students without CN retain whole JP fallback', () => {
  let silentInvitations = 0;
  let jpOnlyStudents = 0;
  for (const [studentId, events] of Object.entries(initiatives.students)) {
    const hasCn = Boolean(catalog.students[studentId].languages.cn?.length);
    if (!hasCn) jpOnlyStudents++;
    for (const event of events) {
      const { jp, cn } = event.languages;
      if (jp.invite === null) silentInvitations++;
      if (!hasCn) assert.equal(cn, undefined);
      if (!cn) continue;
      assert.equal(cn.invite === null, jp.invite === null, 'silent invitations remain silent in both languages');
      for (const part of ['invite', 'reply']) {
        if (jp[part] === null) continue;
        assert.equal(normalizeKey(findLine(studentId, 'cn', cn[part]).key), normalizeKey(findLine(studentId, 'jp', jp[part]).key), `${studentId}/${event.id}/${part} same source dialogue in both languages`);
      }
    }
  }
  assert.ok(jpOnlyStudents > 0, 'catalog exercises whole-language fallback');
  assert.ok(silentInvitations > 0, 'catalog permits a UI invitation without inventing a voiced line');
});

test('representative invitation sequences retain their curated source meaning', () => {
  const examples = [
    ['1', 'company', 'Aris_Cafe_Act_5', 'Aris_Relationship_Up_4'],
    ['2', 'greeting', 'ch0334_login_2_1', 'ch0334_login_2_2'],
    ['6', 'chat', 'Chise_Lobby_4', 'Chise_Lobby_5'],
    ['10', 'chat', 'ch0242_lobby_2_1', 'ch0242_lobby_2_2'],
    ['16', 'chat', 'ch0335_lobby_3_1', 'ch0335_lobby_3_2'],
  ];
  for (const [studentId, eventId, inviteKey, replyKey] of examples) {
    const pair = initiatives.students[studentId].find(event => event.id === eventId).languages.jp;
    assert.equal(normalizeKey(findLine(studentId, 'jp', pair.invite).key), normalizeKey(inviteKey));
    assert.equal(normalizeKey(findLine(studentId, 'jp', pair.reply).key), normalizeKey(replyKey));
  }
});
