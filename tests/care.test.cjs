const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CareSystem } = require('../electron/care.cjs');

const characters = [{ id: 'aris', studentId: 1 }, { id: 'aris-alt', studentId: 1 }, { id: 'hina', studentId: 2 }];
const start = new Date(2026, 8, 26, 12, 0, 0).getTime();
function setup(stored = {}) {
  let time = start;
  const clock = { get: () => time, set: value => { time = value; }, add: seconds => { time += seconds * 1000; } };
  return { clock, care: new CareSystem({ characters, stored, now: clock.get }) };
}
function accompany(care, clock, minutes, id = 'aris') {
  for (let i = 0; i < minutes * 2; i++) { clock.add(30); care.tick(id, { active: true, seconds: 30 }); }
}

test('new care defaults obey the UI contract and snapshots cannot mutate the save', () => {
  const { care } = setup();
  const state = care.snapshot('aris');
  assert.equal(state.studentId, 1); assert.equal(state.level, 1); assert.equal(state.title, '初识');
  assert.equal(state.xp, 0); assert.equal(state.levelXp, 0); assert.equal(state.nextLevelXp, 30); assert.equal(state.progress, 0);
  assert.equal(state.dailyCapRemaining, 52); assert.equal(state.actions.snack.remaining, 3); assert.equal(state.actions.gift.remaining, 1);
  for (const action of Object.values(state.actions)) {
    assert.equal(typeof action.available, 'boolean'); assert.ok(action.cooldownSeconds >= 0);
    assert.equal(typeof action.reason, 'string'); assert.equal(typeof action.label, 'string');
  }
  const before = care.serialize();
  state.actions.snack.remaining = 999; state.daily[0].complete = true; state.achievements[0].unlocked = true; state.recent.push({ text: 'fake', at: start });
  const saved = care.serialize(); saved.students['1'].xp = 810; saved.students['1'].daily.gifts = 99;
  assert.deepEqual(care.serialize(), before);
  assert.equal(care.snapshot('missing'), null);
  assert.deepEqual(care.tick('missing', { active: true, seconds: 60 }), { changed: false });
  assert.equal(care.act('missing', 'gift').ok, false);
});

test('model variants share one student while another student remains isolated', () => {
  const { care } = setup();
  assert.equal(care.act('aris', 'gift').ok, true);
  assert.equal(care.snapshot('aris-alt').xp, 15);
  assert.equal(care.snapshot('aris-alt').actions.gift.remaining, 0);
  assert.equal(care.act('aris-alt', 'gift').ok, false);
  assert.equal(care.snapshot('hina').xp, 0); assert.equal(care.snapshot('hina').actions.gift.remaining, 1);
  assert.equal(care.act('hina', 'gift').ok, true);
  assert.deepEqual(Object.keys(care.serialize().students), ['1', '2']);
});

test('version-zero model saves migrate without multiplying shared progress or allowances', () => {
  const { care } = setup({ schemaVersion: 0, characters: {
    aris: { xp: 30, totalSeconds: 1200, mood: 80, daily: { snacks: 2, gifts: 1 }, cooldowns: { pet: start + 12000 } },
    'aris-alt': { xp: 50, totalSeconds: 1800, mood: 90, daily: { snacks: 1, gifts: 0 }, cooldowns: { pet: start + 16000 } },
    missing: { xp: 810 }
  } });
  const state = care.snapshot('aris');
  assert.equal(state.xp, 50); assert.equal(state.totalMinutes, 30); assert.equal(state.mood, 90);
  assert.equal(state.actions.snack.remaining, 1); assert.equal(state.actions.gift.remaining, 0);
  assert.equal(care.act('aris-alt', 'pet').ok, false);
  assert.equal(care.serialize().schemaVersion, 1); assert.equal(Object.hasOwn(care.serialize(), 'characters'), false);
});

test('malformed and hostile saves cannot inject students, NaN, prototypes or unbounded stats', () => {
  const hostile = JSON.parse('{"students":{"__proto__":{"xp":810},"1":{"xp":-50,"mood":1000,"energy":"100","fullness":-9,"resting":"true","totalSeconds":-4,"daily":{"snacks":99,"gifts":-2,"seconds":-3},"achievements":["first-gift","bogus","first-gift"],"recent":[{"text":"future","at":1790467200000}]}}}');
  hostile.students['1'].cooldowns = { pet: start + 999999999, play: Infinity, snack: NaN };
  const { care, clock } = setup(hostile), state = care.snapshot('aris');
  assert.equal(state.xp, 0); assert.equal(state.mood, 100); assert.equal(state.energy, 80); assert.equal(state.fullness, 0);
  assert.equal(state.resting, false); assert.equal(state.totalMinutes, 0); assert.equal(state.actions.snack.remaining, 0);
  assert.equal(care.serialize().students['1'].cooldowns.pet, start + 20000);
  assert.equal(care.serialize().students['1'].cooldowns.play, undefined);
  assert.ok(state.recent.every(item => item.at <= start));
  assert.equal(care.snapshot('__proto__'), null); assert.equal(care.act('aris', '__proto__').ok, false);
  assert.equal(care.act('aris', 'constructor').ok, false); assert.equal({}.xp, undefined);
  clock.add(20); assert.equal(care.act('aris', 'pet').ok, true);
  assert.equal(JSON.stringify(care.serialize()).includes('NaN'), false);
});

test('interaction cooldowns persist across restart and a backwards clock keeps the remaining wait', () => {
  const { care, clock } = setup();
  assert.equal(care.act('aris', 'tap').ok, true); assert.equal(care.snapshot('aris').xp, 2);
  clock.add(10); assert.equal(care.act('aris-alt', 'tap').ok, false);
  const restarted = new CareSystem({ characters, stored: care.serialize(), now: clock.get });
  assert.equal(restarted.act('aris', 'tap').ok, false);
  clock.add(19); assert.equal(restarted.act('aris', 'tap').ok, false);
  clock.add(1); assert.equal(restarted.act('aris', 'tap').ok, true);
  clock.add(10); restarted.tick('aris', { active: false, seconds: 30 });
  clock.add(-3600); assert.equal(restarted.act('aris', 'tap').ok, false);
  clock.add(19); assert.equal(restarted.act('aris', 'tap').ok, false);
  clock.add(1); assert.equal(restarted.act('aris', 'tap').ok, true);
});

test('ordinary interaction and accompaniment each have a daily XP limit', () => {
  const { care, clock } = setup();
  for (let i = 0; i < 40; i++) { care.act('aris', 'tap'); clock.add(30); }
  assert.equal(care.snapshot('aris').xp, 40); assert.equal(care.snapshot('aris').dailyCapRemaining, 12);
  accompany(care, clock, 60);
  assert.equal(care.snapshot('aris').xp, 52); assert.equal(care.snapshot('aris').dailyCapRemaining, 0);
  assert.equal(care.act('aris', 'gift').ok, true); assert.equal(care.snapshot('aris').xp, 67);
  assert.equal(care.act('aris', 'play').ok, true); assert.equal(care.snapshot('aris').xp, 67);
  const state = care.snapshot('aris'); assert.equal(state.level, 2); assert.equal(state.levelXp, 37); assert.equal(state.nextLevelXp, 45);
});

test('snacks reject a full stomach without consuming stock and enforce both cooldown and daily stock', () => {
  const { care, clock } = setup({ students: { 1: { fullness: 0, energy: 20, mood: 50 } } });
  assert.equal(care.act('aris', 'snack').ok, true);
  let state = care.snapshot('aris'); assert.equal(state.fullness, 30); assert.equal(state.energy, 30); assert.equal(state.mood, 58); assert.equal(state.xp, 5);
  assert.equal(care.act('aris', 'snack').ok, false); assert.equal(care.snapshot('aris').actions.snack.remaining, 2);
  clock.add(45); assert.equal(care.act('aris', 'snack').ok, true);
  clock.add(45); assert.equal(care.act('aris', 'snack').ok, true);
  clock.add(45); assert.equal(care.act('aris', 'snack').ok, false); assert.equal(care.snapshot('aris').actions.snack.remaining, 0);
  const full = setup({ students: { 1: { fullness: 90 } } }).care;
  assert.equal(full.act('aris', 'snack').ok, false); assert.equal(full.snapshot('aris').actions.snack.remaining, 3); assert.equal(full.snapshot('aris').xp, 0);
});

test('daily promises require distinct greeting, petting and active minutes and can be claimed once', () => {
  const { care, clock } = setup();
  assert.equal(care.act('aris', 'claim').ok, false);
  care.act('aris', 'tap'); care.act('aris', 'pet');
  accompany(care, clock, 4.5);
  assert.equal(care.snapshot('aris').actions.claim.available, false);
  accompany(care, clock, .5);
  assert.ok(care.snapshot('aris').daily.every(item => item.complete));
  assert.equal(care.snapshot('aris').xp, 7);
  const before = care.serialize(); care.snapshot('aris'); care.snapshot('aris-alt'); assert.deepEqual(care.serialize(), before);
  assert.equal(care.act('aris', 'claim').ok, true); assert.equal(care.snapshot('aris').xp, 17);
  assert.equal(care.act('aris-alt', 'claim').ok, false); assert.equal(care.snapshot('aris').xp, 17);
  const restarted = new CareSystem({ characters, stored: care.serialize(), now: clock.get });
  assert.equal(restarted.act('aris', 'claim').ok, false);
});

test('local-day rollover resets allowances once and rollback cannot reopen gifts or daily rewards', () => {
  const { care, clock } = setup();
  care.act('aris', 'gift'); care.act('aris', 'tap'); care.act('aris', 'pet'); accompany(care, clock, 5); care.act('aris', 'claim');
  clock.set(new Date(2026, 8, 27, 0, 0, 1).getTime());
  const before = care.serialize();
  assert.equal(care.snapshot('aris').actions.gift.remaining, 0); assert.deepEqual(care.serialize(), before);
  care.tick('aris', { active: false, seconds: 30 });
  assert.equal(care.snapshot('aris').actions.gift.remaining, 1); assert.equal(care.snapshot('aris').todayMinutes, 0);
  care.act('aris', 'gift'); care.act('aris', 'tap'); care.act('aris', 'pet'); accompany(care, clock, 5); care.act('aris', 'claim');
  const xp = care.snapshot('aris').xp;
  clock.set(start);
  assert.equal(care.act('aris', 'gift').ok, false); assert.equal(care.act('aris', 'claim').ok, false);
  const restarted = new CareSystem({ characters, stored: care.serialize(), now: clock.get });
  clock.set(new Date(2026, 8, 27, 16, 0, 0).getTime());
  assert.equal(restarted.act('aris', 'gift').ok, false); assert.equal(restarted.act('aris', 'claim').ok, false);
  assert.equal(restarted.snapshot('aris').xp, xp);
  clock.set(new Date(2026, 8, 28, 0, 0, 1).getTime());
  assert.equal(restarted.act('aris', 'gift').ok, true);
});

test('offline, hidden and paused intervals never consume stats or credit accompaniment', () => {
  const { care, clock } = setup();
  care.act('aris', 'rest'); const before = care.snapshot('aris');
  clock.add(3600); care.tick('aris', { active: false, seconds: 3600 });
  let state = care.snapshot('aris');
  for (const key of ['mood', 'energy', 'fullness', 'xp', 'totalMinutes', 'todayMinutes']) assert.equal(state[key], before[key], key);
  clock.add(86400 * 30);
  const restarted = new CareSystem({ characters, stored: care.serialize(), now: clock.get });
  state = restarted.snapshot('aris'); assert.equal(state.energy, before.energy); assert.equal(state.xp, 0); assert.equal(state.totalMinutes, 0);
  restarted.tick('aris', { active: true, seconds: 999999 });
  state = restarted.snapshot('aris'); assert.equal(state.totalMinutes, 1); assert.equal(state.energy, before.energy + 8); assert.equal(state.xp, 0);
  const saved = restarted.serialize();
  for (const seconds of [NaN, Infinity, -30, '30', undefined]) restarted.tick('aris', { active: true, seconds });
  restarted.tick('aris', { active: 'true', seconds: 60 });
  assert.deepEqual(restarted.serialize(), saved);
});

test('rest restores energy only during active time, auto finishes at 100, and play checks energy and cooldown', () => {
  const { care, clock } = setup({ students: { 1: { energy: 10, mood: 40, fullness: 80 } } });
  assert.equal(care.act('aris', 'play').ok, false); assert.equal(care.snapshot('aris').xp, 0);
  assert.equal(care.act('aris', 'rest').ok, true); assert.equal(care.act('aris', 'play').ok, false);
  accompany(care, clock, 2); assert.equal(care.snapshot('aris').energy, 26); assert.ok(care.snapshot('aris').mood >= 40);
  assert.equal(care.act('aris', 'rest').ok, true); assert.equal(care.snapshot('aris').resting, false);
  assert.equal(care.act('aris', 'play').ok, true); assert.equal(care.snapshot('aris').energy, 16);
  assert.equal(care.act('aris', 'play').ok, false);
  care.act('aris', 'rest');
  let completed = false;
  for (let i = 0; i < 21; i++) { clock.add(30); const result = care.tick('aris', { active: true, seconds: 30 }); completed ||= result.event?.message.includes('精力满满') || false; }
  assert.equal(care.snapshot('aris').energy, 100); assert.equal(care.snapshot('aris').resting, false); assert.ok(completed);
  assert.equal(care.act('aris', 'play').ok, true); assert.equal(care.snapshot('aris').energy, 90);
  assert.equal(care.snapshot('aris').actions.play.cooldownSeconds, 60);
  clock.add(60); assert.equal(care.act('aris', 'play').ok, true);
});

test('level gains and achievements are bounded, automatic and do not duplicate; recent history is capped', () => {
  const { care, clock } = setup({ students: { 1: { xp: 74, totalSeconds: 3590 } } });
  const result = care.act('aris', 'tap'); assert.equal(result.levelUp, true); assert.equal(care.snapshot('aris').level, 3);
  care.act('aris', 'gift'); clock.add(10); care.tick('aris', { active: true, seconds: 10 });
  assert.ok(care.snapshot('aris').achievements.every(item => item.unlocked));
  const achieved = care.serialize().students['1'].achievements;
  for (let i = 0; i < 30; i++) { clock.add(30); care.act('aris', 'tap'); }
  assert.deepEqual(care.serialize().students['1'].achievements, achieved); assert.equal(care.snapshot('aris').recent.length, 8);
  assert.ok(care.snapshot('aris').recent.every(item => item.at <= clock.get()));
  const maxed = setup({ students: { 1: { xp: 809 } } }).care;
  assert.equal(maxed.act('aris', 'gift').levelUp, true);
  const state = maxed.snapshot('aris'); assert.equal(state.level, 10); assert.equal(state.xp, 810); assert.equal(state.progress, 1); assert.equal(state.nextLevelXp, 0); assert.equal(state.levelXp, 0);
  assert.equal(maxed.act('aris', 'tap').levelUp, false); assert.equal(maxed.snapshot('aris').xp, 810);
});

test('future save dates are only a no-refresh watermark, and invalid clocks grant no elapsed-time credit', () => {
  const futureDay = '2026-09-27';
  const { care, clock } = setup({ maxDay: futureDay, students: { 1: { daily: { date: futureDay, gifts: 1, claimed: true }, energy: 50, xp: 12 } } });
  assert.equal(care.act('aris', 'gift').ok, false); assert.equal(care.act('aris', 'claim').ok, false);
  clock.set(Infinity); care.tick('aris', { active: false, seconds: Infinity });
  assert.equal(care.snapshot('aris').xp, 12); assert.equal(care.snapshot('aris').totalMinutes, 0);
  clock.set(-1); care.tick('aris', { active: true, seconds: -99 }); assert.equal(care.snapshot('aris').energy, 50);
  clock.set(new Date(2026, 8, 27, 12).getTime()); assert.equal(care.act('aris', 'gift').ok, false);
  clock.set(new Date(2026, 8, 28, 12).getTime()); assert.equal(care.act('aris', 'gift').ok, true);
});
