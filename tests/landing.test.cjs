const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DesktopWorld, buildSurfaces } = require('../electron/world.cjs');
const { motionPosition } = require('../electron/core.cjs');
const area = { id: 1, x: 0, y: 0, width: 1200, height: 900 };
function dropped(roll, height = 300, canFall = true) {
  const w = new DesktopWorld(() => roll);
  w.place({ x: 250, y: 900 - 310 - height, width: 300, height: 360 });
  w.geometry({ x: 150, y: 310, radius: 30, canWalk: true, canFall });
  w.environment([], [area]); w.release();
  for (let i = 0; i < 100 && !w.platform; i++) w.step(.02);
  return w;
}
test('significant falls choose all three outcomes once and wait for recovery', () => {
  for (const [roll, outcome] of [[.1, 'down-up'], [.6, 'quick'], [.9, 'help']]) {
    const w = dropped(roll), reaction = w.reaction, x = w.x;
    assert.equal(reaction.outcome, outcome);
    for (let i = 0; i < 200; i++) w.step(.02);
    assert.equal(w.x, x); assert.equal(w.reaction.id, reaction.id);
    w.reactionStatus(reaction.id - 1, 'done'); assert.ok(w.reaction);
    if (outcome === 'help') {
      w.reactionStatus(reaction.id, 'help');
      for (let i = 0; i < 1000; i++) w.step(.02);
      assert.equal(w.mode, 'help'); assert.equal(w.x, x);
      w.configure({ paused: true }); w.assist(); assert.equal(w.reaction.phase, 'help');
      w.configure({ paused: false }); w.assist(); assert.equal(w.reaction.phase, 'rise');
    }
    w.reactionStatus(reaction.id, 'done'); assert.equal(w.reaction, null);
    w.wait = 0; w.step(.02); assert.equal(w.mode, 'walk');
  }
});
test('small drops and unsupported models do not fall down; interrupted reactions clear', () => {
  assert.equal(dropped(.9, 50).reaction, null);
  assert.equal(dropped(.9, 300, false).reaction, null);
  const w = dropped(.9); w.reactionStatus(w.reaction.id, 'help'); w.grab(); assert.equal(w.reaction, null);
  const other = dropped(.1); other.place({ x: 20, y: 20 }); assert.equal(other.reaction, null);
  const stalled = dropped(.1); for (let i = 0; i < 400; i++) stalled.step(.05); assert.equal(stalled.reaction, null);
});
test('invalid coordinates and platform data cannot reach native window movement', () => {
  for (const bad of [NaN, Infinity, -Infinity, undefined, '22', 2147483648]) assert.equal(motionPosition({ x: bad, y: 2 }), null);
  assert.deepEqual(motionPosition({ x: -320.8, y: 1.8 }), { x: -321, y: 2 });
  assert.deepEqual(motionPosition({ x: -.1, y: -0 }), { x: 0, y: 0 });
  assert.equal(Object.is(motionPosition({ x: -.49, y: -.01 }).x, -0), false);
  assert.equal(buildSurfaces([{ id: 'bad', standable: true, x: 20, y: NaN, width: 600, height: 400 }], [area]).length, 1);
  const w = dropped(.6, 20); w.step(NaN); assert.ok(motionPosition(w.snapshot()));
});
test('Cafe actions outrank showcase clips and recovery clips leave source untouched', async () => {
  const THREE = await import('../assets/vendor/three/three.module.min.js');
  const { createModelAnimationPlayer, makeRecoveryClip, selectModelAnimations } = await import('../scripts/model-viewer.js');
  const root = new THREE.Object3D(); root.name = 'body';
  const clip = (name, end = 1) => new THREE.AnimationClip(name, 1, [new THREE.NumberKeyframeTrack('body.position[x]', [0, 1], [0, end])]);
  const down = clip('A_Vital_Death', 3), source = Array.from(down.tracks[0].values);
  const recovery = makeRecoveryClip(down);
  assert.equal(recovery.tracks[0].values[0], 3); assert.equal(recovery.tracks[0].values.at(-1), 0);
  assert.deepEqual(Array.from(down.tracks[0].values), source);
  const clips = [clip('A_Victory_Start'), clip('A_Victory_End'), clip('A_Cafe_Idle'), clip('A_Cafe_Reaction'), down];
  assert.equal(selectModelAnimations(clips).reaction.name, 'A_Cafe_Reaction');
  const events = [], player = createModelAnimationPlayer(new THREE.AnimationMixer(root), clips, () => {}, value => events.push(value));
  const advance = seconds => { for (let i = 0; i < seconds * 60; i++) player.update(1 / 60); };
  player.start(); assert.equal(player.getAnimation(), 'A_Cafe_Idle');
  player.react(); assert.equal(player.getAnimation(), 'A_Cafe_Reaction'); advance(1.5); assert.equal(player.getAnimation(), 'A_Cafe_Idle');
  player.landing({ id: 1, outcome: 'help', phase: 'start' }); advance(2);
  assert.equal(player.getMode(), 'help'); assert.deepEqual(events, [{ id: 1, phase: 'help' }]);
  advance(8); assert.equal(player.getMode(), 'help');
  player.landing({ id: 1, outcome: 'help', phase: 'rise' }); advance(2); assert.equal(player.getMode(), 'idle');
  assert.deepEqual(events.at(-1), { id: 1, phase: 'done' });
  player.landing({ id: 1, outcome: 'help', phase: 'rise' }); assert.equal(player.getMode(), 'idle');
  player.landing({ id: 2, outcome: 'down-up', phase: 'start' }); advance(3); assert.equal(player.getMode(), 'idle');
  player.landing({ id: 3, outcome: 'quick', phase: 'start' }); assert.equal(player.getMode(), 'recovering'); advance(1); assert.equal(player.getMode(), 'idle');
  player.dispose();
});
