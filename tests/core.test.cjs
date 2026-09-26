const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { sanitizeSettings, fitBounds, assetPath } = require('../electron/core.cjs');
const root = path.join(__dirname, '..');
const characters = require('../assets/characters.json');
test('corrupt and obsolete saved settings recover to a usable character and size', () => {
  const settings = sanitizeSettings({ characterId: 'missing', size: Infinity, x: NaN, paused: 'true' }, ['212', '218']);
  assert.equal(settings.characterId, '212'); assert.equal(settings.size, 360); assert.equal(settings.x, null); assert.equal(settings.paused, false);
  assert.equal(sanitizeSettings({ size: 900 }, ['212']).size, 560);
});
test('recover from disconnected monitors and preserve negative-coordinate monitors', () => {
  const area = { x: -1920, y: 0, width: 1920, height: 1040 };
  const result = fitBounds({ size: 360, x: -1000, y: 800 }, area);
  assert.equal(result.x, -1000); assert.equal(result.y + (result.height - 360) / 2, 680);
  const detached = fitBounds({ size: 560, x: 6000, y: 2000 }, { x: 0, y: 0, width: 800, height: 500 });
  assert.ok(detached.x + detached.width / 2 + 500 * .42 <= 800);
  assert.ok(detached.y + detached.height / 2 + 500 / 2 <= 500);
});

test('proactive invitations migrate on by default and preserve an explicit opt-out', () => {
  for (const value of [undefined, null, {}, { proactiveEvents: 'false' }, { proactiveEvents: 0 }]) {
    assert.equal(sanitizeSettings(value, ['212']).proactiveEvents, true);
  }
  for (const enabled of [false, true]) {
    const saved = sanitizeSettings({ proactiveEvents: enabled }, ['212']);
    assert.equal(saved.proactiveEvents, enabled);
    assert.equal(sanitizeSettings(saved, ['212']).proactiveEvents, enabled);
  }
});

test('overscan preserves the old visible position and does not repeatedly migrate it', () => {
  const stored = { characterId: '212', size: 360, x: 500, y: 400 };
  const first = sanitizeSettings(stored, ['212']), again = sanitizeSettings(first, ['212']);
  assert.deepEqual(again, first);
  assert.equal(first.x + Math.round(360 * (2.6 - .84) / 2), stored.x);
  assert.equal(first.y + Math.round(360 * (2.6 - 1) / 2), stored.y);
});
test('asset protocol denies outside files and unexpected origins', () => {
  assert.equal(assetPath('pet://app/assets/app.png', root), path.join(root, 'assets/app.png'));
  for (const url of ['pet://evil/assets/app.png', 'pet://app/electron/main.cjs', 'pet://app/assets/..%2f..%2fsecret.txt', 'pet://app/assets/%00x', 'https://app/assets/app.png']) assert.equal(assetPath(url, root), null);
});
test('all character choices resolve to intact GLBs, animations and local portraits', () => {
  assert.equal(characters.length, 40);
  assert.equal(new Set(characters.map(c => c.id)).size, 40);
  for (const c of characters) {
    const b = fs.readFileSync(path.join(root, c.file));
    assert.equal(b.toString('ascii', 0, 4), 'glTF'); assert.equal(b.readUInt32LE(8), b.length);
    assert.ok(c.animations.length > 0, c.name);
    if (c.portrait) assert.ok(fs.existsSync(path.join(root, c.portrait)));
  }
});
