const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DesktopWorld, buildSurfaces } = require('../electron/world.cjs');
const area = { id: 1, x: 0, y: 0, width: 1200, height: 900 };
function world() { const w = new DesktopWorld(() => .8); w.place({ x: 250, y: 100, width: 300, height: 360 }); w.geometry({ x: 150, y: 310, radius: 30, canWalk: true }); return w; }
test('occluded window tops are split and maximized tops without headroom are excluded', () => {
  const surfaces = buildSurfaces([{ id: 'front', x: 350, y: 100, width: 300, height: 500, standable: true }, { id: 'back', x: 100, y: 400, width: 800, height: 350, standable: true }], [area], 300);
  assert.deepEqual(surfaces.filter(s => s.kind === 'window').map(s => [s.left, s.right]), [[100, 350], [650, 900]]);
});
test('drop lands on a window, follows it and falls to taskbar after it disappears', () => {
  const w = world(); let platform = { id: 'window', x: 100, y: 500, width: 800, height: 300, standable: true };
  w.environment([platform], [area]); w.release();
  for (let i = 0; i < 40; i++) w.step(1 / 60);
  assert.equal(w.platform?.id, 'window'); assert.equal(w.y + w.foot.y, 500);
  platform = { ...platform, x: 140, y: 520 }; w.environment([platform], [area]);
  assert.equal(w.x, 290); assert.equal(w.y + w.foot.y, 520);
  w.environment([], [area]); for (let i = 0; i < 100; i++) w.step(1 / 60);
  assert.equal(w.platform.kind, 'floor'); assert.equal(w.y + w.foot.y, 900);
});
test('walking turns at the edge, pauses, and unsupported models never slide', () => {
  const w = world(); w.environment([], [area]); w.y = 900 - w.foot.y; w.release(); w.wait = 0; w.walkTime = 10; w.x = 1200 - w.foot.radius - w.foot.x - 1;
  w.step(.05); assert.equal(w.direction, -1); assert.equal(w.mode, 'idle');
  const before = { x: w.x, y: w.y }; w.configure({ paused: true }); for (let i = 0; i < 50; i++) w.step(.05);
  assert.equal(w.x, before.x); assert.equal(w.y, before.y);
  w.configure({ paused: false }); w.canWalk = false; w.wait = 0; w.step(.05); assert.equal(w.x, before.x); assert.equal(w.mode, 'idle');
});

test('changing a window occluder cannot shake or teleport the supported body', () => {
  const w = world(), back = { id: 'back', x: 100, y: 500, width: 900, height: 350, standable: true };
  const front = { id: 'front', x: 100, y: 100, width: 180, height: 500, standable: true };
  w.environment([front, back], [area]); w.y = 500 - w.foot.y; w.release();
  const x = w.x;
  for (const width of [100, 200, 120, 220, 180]) { w.environment([{ ...front, width }, back], [area]); assert.equal(w.x, x); assert.equal(w.platform.id, 'back'); }
  w.environment([{ ...front, width: 500 }, back], [area]);
  assert.equal(w.platform, null); assert.equal(w.mode, 'fall'); assert.equal(w.x, x);
});
test('dropping with feet beyond a screen edge recovers instead of falling forever', () => {
  const w = world(); w.environment([], [area]); w.x = -280; w.y = 1000; w.release();
  for (let i = 0; i < 20; i++) w.step(.05);
  assert.ok(w.x + w.foot.x >= w.foot.radius); assert.equal(w.platform?.kind, 'floor');
});
test('spring leans opposite leftward acceleration, settles and stays finite under spikes', async () => {
  const { createInertia } = await import('../scripts/spring.mjs'); const spring = createInertia();
  let motion; for (let i = 0; i < 20; i++) { spring.input(-800); motion = spring.step(1 / 60); }
  assert.ok(motion.tilt < -.05); assert.ok(motion.hair > .02);
  for (let i = 0; i < 400; i++) { spring.input(0); motion = spring.step(1 / 60); }
  assert.ok(Math.abs(motion.tilt) < .001); assert.ok(Math.abs(motion.hair) < .001);
  for (let i = 0; i < 50; i++) { spring.input(i % 2 ? 1e8 : -1e8); motion = spring.step(.8); assert.ok(Number.isFinite(motion.tilt)); assert.ok(Math.abs(motion.tilt) <= .36); }
  spring.reset(); spring.displace(-100); motion = spring.step(1 / 60); assert.ok(motion.tilt < -.1); assert.ok(motion.hair > .1);
});
test('idle loops repeatedly; pickup and released hold return to an animated state', async () => {
  const THREE = await import('../assets/vendor/three/three.module.min.js');
  const { createModelAnimationPlayer } = await import('../scripts/model-viewer.js');
  const root = new THREE.Object3D(); root.name = 'body';
  const clip = (name, duration) => new THREE.AnimationClip(name, duration, [new THREE.NumberKeyframeTrack('body.position[x]', [0, duration / 2, duration], [0, 1, 0])]);
  const clips = [clip('A_Cafe_Idle', 1), clip('A_Formation_Pickup', 2), clip('A_Cafe_Walk', 1)];
  const player = createModelAnimationPlayer(new THREE.AnimationMixer(root), clips); player.start();
  for (let i = 0; i < 210; i++) player.update(1 / 60);
  assert.ok(player.getTime() > .4 && player.getTime() < .6);
  player.pickUp(); for (let i = 0; i < 150; i++) player.update(1 / 60); assert.equal(player.getMode(), 'idle');
  player.hold(); for (let i = 0; i < 180; i++) player.update(1 / 60); assert.equal(player.getMode(), 'held');
  player.rest(); player.update(.1); assert.equal(player.getMode(), 'idle'); player.walk(); assert.equal(player.getMode(), 'walk');
  player.dispose();
});

test('releasing a suspended body preserves its angle and settles without a sign flip', async () => {
  const THREE = await import('../assets/vendor/three/three.module.min.js');
  const { createSecondaryMotion } = await import('../scripts/secondary-motion.js');
  const root = new THREE.Group(), sway = new THREE.Group(), turn = new THREE.Group();
  sway.add(turn); turn.add(root);
  const physics = createSecondaryMotion(root, sway, turn);
  physics.setGrabbed(true);
  for (let i = 0; i < 30; i++) { physics.input({ vx: -800, mode: 'held', dragging: true }); physics.step(1 / 60); }
  const held = sway.rotation.z; assert.ok(held > .1);
  physics.setGrabbed(false); physics.input({ vx: 0, mode: 'fall', dragging: false }); physics.step(0);
  assert.equal(sway.rotation.z, held, 'Release alone cannot teleport the body to its mirror angle');
  physics.step(1 / 60); assert.ok(Math.abs(sway.rotation.z - held) < .025);
  for (let i = 0; i < 400; i++) physics.step(1 / 60);
  assert.ok(Math.abs(sway.rotation.z) < .001); physics.dispose();
});
