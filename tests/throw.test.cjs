const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DesktopWorld } = require('../electron/world.cjs');

const area = { id: 1, x: 0, y: 0, width: 2400, height: 1400 };
function world({ footX = 1000, footY = 850, areas = [area], windows = [], ...options } = {}) {
  const w = new DesktopWorld(() => .1);
  w.geometry({ x: 100, y: 200, radius: 12, bodyHeight: 180, canWalk: true, canFall: true });
  w.place({ x: footX - w.foot.x, y: footY - w.foot.y });
  w.configure({ physics: true, roaming: false, ...options });
  w.environment(windows, areas);
  return w;
}
function flick(w, dx, dy, { duplicate = 0, delay = 0, allowThrow = true } = {}) {
  const start = { x: w.x, y: w.y };
  w.grab(1000);
  for (let i = 1; i <= 3; i++) w.dragTo(start.x + dx * i, start.y + dy * i, 1000 + 16 * i);
  if (duplicate) w.dragTo(w.x, w.y, 1048 + duplicate);
  const release = { x: w.x, y: w.y };
  w.release({ now: 1048 + duplicate + delay, allowThrow });
  return release;
}
function untilLand(w) {
  for (let i = 0; i < 500 && !w.platform; i++) w.step(1 / 120);
  assert.ok(w.platform, 'flight reaches a supported surface');
}

test('an upward flick coasts past release, reaches an apex, and reacts to its complete fall height', () => {
  const w = world({ footY: 1400 });
  const released = flick(w, 0, -18);
  assert.equal(w.thrown, true); assert.equal(w.mode, 'fall'); assert.ok(w.snapshot().vy < -900);
  assert.equal(w.x, released.x); assert.equal(w.y, released.y);
  let apex = w.y, descended = false;
  for (let i = 0; i < 500 && !w.platform; i++) {
    const before = w.y; w.step(1 / 120); apex = Math.min(apex, w.y);
    if (w.y > before) descended = true;
  }
  assert.ok(apex < released.y - 300); assert.ok(descended); assert.equal(w.platform.kind, 'floor');
  assert.equal(w.reaction.outcome, 'down-up'); assert.equal(w.snapshot().vx, 0); assert.equal(w.snapshot().vy, 0); assert.equal(w.thrown, false);
});

test('left and right throws keep moving with roaming disabled and lose horizontal speed in air', () => {
  for (const direction of [-1, 1]) {
    const w = world(), released = flick(w, direction * 24, 0);
    const initialSpeed = Math.abs(w.snapshot().vx);
    for (let i = 0; i < 30; i++) w.step(1 / 120);
    assert.ok((w.x - released.x) * direction > 200);
    assert.ok(Math.abs(w.snapshot().vx) < initialSpeed); assert.ok(w.snapshot().vy > 0);
    untilLand(w); assert.equal(w.snapshot().vx, 0);
  }
});

test('a duplicate mouse-up sample preserves the flick but holding still discards it', () => {
  const duplicate = world(); flick(duplicate, 24, -12, { duplicate: 2 });
  assert.ok(duplicate.snapshot().vx > 1000); assert.ok(duplicate.snapshot().vy < -500);
  for (const delay of [140, 260]) {
    const stopped = world({ roaming: true }); flick(stopped, 24, -12, { duplicate: 2, delay });
    assert.equal(stopped.thrown, false); assert.equal(stopped.snapshot().vx, 0); assert.equal(stopped.snapshot().vy, 0);
  }
});

test('unchanged cursor polling frequency cannot alter the same flick velocity', () => {
  for (const interval of [1, 2, 5, 40]) {
    const w = world(); w.grab(1000); const x = w.x, y = w.y;
    const events = [];
    for (let time = interval; time <= 180; time += interval) events.push({ time, movement: false });
    for (let step = 1; step <= 6; step++) events.push({ time: step * 30, movement: true });
    events.sort((a, b) => a.time - b.time || Number(a.movement) - Number(b.movement));
    let offset = 0;
    for (const event of events) {
      if (event.movement) offset += 18;
      w.dragTo(x + offset, y, 1000 + event.time);
    }
    w.release({ now: 1180 });
    assert.ok(Math.abs(w.snapshot().vx - 600) < .001, `${interval} ms polls preserve 600 px/s`);
  }
});

test('a fresh flick after a long stationary hold uses recent movement only', () => {
  const w = world(); w.grab(1000); const x = w.x, y = w.y;
  for (let time = 1010; time <= 1500; time += 10) w.dragTo(x, y, time);
  for (let i = 1; i <= 5; i++) w.dragTo(x + i * 18, y, 1500 + i * 30);
  w.release({ now: 1650 }); assert.ok(Math.abs(w.snapshot().vx - 600) < .001);
});

test('small movement, canceled release, pause, and disabled physics never launch', () => {
  const gentle = world(); flick(gentle, 1, 1); assert.equal(gentle.thrown, false);
  const canceled = world(); flick(canceled, 24, -12, { allowThrow: false }); assert.equal(canceled.thrown, false);
  for (const options of [{ physics: false }, { paused: true }]) {
    const w = world(options); flick(w, 24, -12); assert.equal(w.thrown, false); assert.equal(w.snapshot().vx, 0);
  }
});

test('rising through a window top does not land until the descending crossing', () => {
  const window = { id: 9, x: 200, y: 750, width: 1800, height: 500, standable: true };
  const w = world({ footY: 950, windows: [window] }); flick(w, 0, -36);
  assert.ok(w.y + w.foot.y > window.y);
  while (w.snapshot().vy < 0) { assert.equal(w.platform, null); w.step(1 / 120); }
  assert.ok(w.y + w.foot.y < window.y); untilLand(w);
  assert.equal(w.platform.id, 9); assert.equal(w.y + w.foot.y, 750);
});

test('fast diagonal landing uses horizontal position at the crossed height', () => {
  for (const [left, right, shouldHit] of [[80, 140, true], [140, 220, false]]) {
    const w = world({ footX: 100, footY: 900 }); w.beginFall(); w.thrown = true; w.airVx = 1400; w.vy = 950;
    w.surfaces.unshift({ id: 99, kind: 'window', left, right, y: 906 });
    w.step(.05);
    assert.equal(w.platform?.id === 99, shouldHit);
    if (shouldHit) { assert.ok(w.x + w.foot.x < 120); assert.equal(w.y + w.foot.y, 906); }
    else assert.ok(w.x + w.foot.x > 160);
  }
});

test('screen walls and ceiling gently rebound while keeping the body visible', () => {
  const w = world({ footX: 2300, footY: 210 }); flick(w, 22, -4);
  let bounced = false;
  for (let i = 0; i < 80 && !w.platform; i++) {
    w.step(1 / 120);
    assert.ok(w.x + w.foot.x >= w.foot.radius && w.x + w.foot.x <= area.width - w.foot.radius + .001);
    assert.ok(w.y + w.foot.y >= w.bodyHeight - .001);
    if (w.snapshot().vx < 0) bounced = true;
  }
  assert.ok(bounced); untilLand(w);
});

test('negative-coordinate adjacent monitors allow seam crossing and seam floor landings without a snap', () => {
  const areas = [{ id: 'left', x: -1000, y: 0, width: 1000, height: 900 }, { id: 'right', x: 0, y: 0, width: 1000, height: 900 }];
  const w = world({ footX: -180, footY: 500, areas }); flick(w, 24, 0);
  for (let i = 0; i < 30; i++) w.step(1 / 120);
  assert.ok(w.x + w.foot.x > 100); assert.ok(w.snapshot().vx > 0);
  const seam = world({ footX: -5, footY: 897, areas }); seam.beginFall(); seam.thrown = true; seam.airVx = 0; seam.vy = 300;
  untilLand(seam); const x = seam.x; assert.equal(x + seam.foot.x, -5);
  seam.environment([], areas); seam.step(.02); assert.equal(seam.x, x);
  assert.equal(seam.platform.left, -1000); assert.equal(seam.platform.right, 1000);
});

test('disconnected monitor gaps contain a throw on its current display', () => {
  const areas = [{ id: 1, x: 0, y: 0, width: 1000, height: 900 }, { id: 2, x: 1300, y: 0, width: 1000, height: 900 }];
  const w = world({ footX: 880, footY: 500, areas }); flick(w, 24, 0);
  for (let i = 0; i < 80 && !w.platform; i++) { w.step(.01); assert.ok(w.x + w.foot.x <= 988); }
  untilLand(w); assert.equal(w.platform.id, 'floor:1');
});

test('a neighboring taller display cannot pull a vertical fall sideways at the floor crossing', () => {
  const areas = [{ id: 'tall', x: -1000, y: 0, width: 1000, height: 1400 }, { id: 'short', x: 0, y: 0, width: 1000, height: 900 }];
  const w = world({ footX: 500, footY: 895, areas }); w.beginFall(); w.vy = 900;
  const x = w.x; untilLand(w);
  assert.equal(w.x, x); assert.equal(w.platform.id, 'floor:short');
});

test('pause freezes a flight, regrab and place stop it, and disabling physics still permits descent', () => {
  const w = world(); flick(w, 24, -12); w.step(.02); const initial = w.snapshot();
  w.configure({ paused: true }); for (let i = 0; i < 40; i++) w.step(.05); assert.deepEqual(w.snapshot(), initial);
  w.configure({ paused: false }); w.step(.02); assert.notEqual(w.y, initial.y);
  w.grab(2000); assert.equal(w.thrown, false); assert.equal(w.airVx, 0); assert.equal(w.vy, 0);
  w.place({ x: 10, y: 10 }); assert.equal(w.dragging, false); assert.equal(w.dragSamples.length, 0);
  const stopped = world(); flick(stopped, 24, -12); stopped.configure({ physics: false });
  assert.equal(stopped.airVx, 0); assert.equal(stopped.vy, 0); untilLand(stopped);
});

test('extreme samples are capped, bad positions are ignored, and invalid frame deltas stay finite', () => {
  const w = world(); w.grab(1000); w.dragTo(900000, -900000, 1016); w.release({ now: 1016 });
  assert.ok(Math.abs(w.snapshot().vx) <= 1400); assert.ok(w.snapshot().vy >= -1100);
  for (const delta of [NaN, Infinity, -Infinity, -1, 1000, .00001, .05]) {
    w.step(delta); const state = w.snapshot();
    assert.ok([state.x, state.y, state.vx, state.vy].every(Number.isFinite));
  }
  w.grab(2000); const before = { x: w.x, y: w.y };
  w.dragTo(NaN, 50, 2016); w.dragTo(50, Infinity, 2020);
  assert.equal(w.x, before.x); assert.equal(w.y, before.y);
});
