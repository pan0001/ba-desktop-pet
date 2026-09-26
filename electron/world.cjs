const clamp = (v, low, high) => Math.max(low, Math.min(v, high));
const validCoordinate = v => Number.isFinite(v) && Math.abs(v) <= 1000000;
const validArea = r => r && ['x', 'y', 'width', 'height'].every(k => validCoordinate(r[k])) && r.width > 0 && r.height > 0;
const GRAVITY = 1550, AIR_DRAG = .7, THROW_THRESHOLD = 180;
// Remove covered portions of a window's top edge; source windows are in Z order.
function buildSurfaces(windows, areas, minClearance = 100) {
  const valid = r => r && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(r[k]) && Math.abs(r[k]) <= 1000000) && r.width > 0 && r.height > 0;
  windows = windows.filter(valid); areas = areas.filter(valid);
  const surfaces = [];
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i];
    if (!w.standable) continue;
    for (const area of areas) {
      if (w.y < area.y + minClearance || w.y > area.y + area.height - 10) continue;
      let segments = [[Math.max(w.x, area.x), Math.min(w.x + w.width, area.x + area.width)]];
      for (const front of windows.slice(0, i)) {
        if (front.y > w.y + 2 || front.y + front.height < w.y - 2) continue;
        segments = segments.flatMap(([l, r]) => {
          if (front.x >= r || front.x + front.width <= l) return [[l, r]];
          return [[l, Math.min(r, front.x)], [Math.max(l, front.x + front.width), r]].filter(([a, b]) => b - a > 50);
        });
      }
      for (const [left, right] of segments) if (right - left >= 70) surfaces.push({ id: w.id, kind: 'window', originX: w.x, left, right, y: w.y });
    }
  }
  const floors = areas.map(area => ({ ids: [area.id], left: area.x, right: area.x + area.width, y: area.y + area.height }))
    .sort((a, b) => a.y - b.y || a.left - b.left);
  const joined = [];
  for (const floor of floors) {
    const last = joined.at(-1);
    if (last && floor.y === last.y && floor.left <= last.right + 1) { last.right = Math.max(last.right, floor.right); last.ids.push(...floor.ids); }
    else joined.push(floor);
  }
  for (const floor of joined) surfaces.push({ id: `floor:${floor.ids.join(',')}`, kind: 'floor', left: floor.left, right: floor.right, y: floor.y });
  return surfaces;
}
class DesktopWorld {
  constructor(random = Math.random) {
    this.random = random; this.x = 0; this.y = 0; this.width = 302; this.height = 360;
    this.foot = { x: 151, y: 325, radius: 25 }; this.vy = 0; this.direction = 1;
    this.bodyHeight = 277;
    this.mode = 'idle'; this.platform = null; this.surfaces = []; this.wait = 2; this.walkTime = 0;
    this.dragging = false; this.dragVx = 0; this.dragVy = 0; this.lastDrag = null;
    this.dragSamples = []; this.lastMovement = null; this.airVx = 0; this.thrown = false;
    this.options = { roaming: true, windowWalking: true, paused: false }; this.canWalk = false; this.areas = [];
    this.canFall = false; this.fallStart = null; this.reaction = null; this.reactionId = 0; this.reactionTime = 0;
  }
  configure(options) {
    this.options = { ...this.options, ...options };
    if (this.options.physics === false) { this.airVx = 0; this.vy = Math.max(0, this.vy); }
  }
  place(bounds) {
    Object.assign(this, bounds); this.platform = null; this.vy = 0; this.airVx = 0; this.thrown = false;
    this.dragging = false; this.dragVx = 0; this.dragVy = 0; this.lastDrag = null; this.dragSamples = []; this.lastMovement = null;
    this.mode = 'idle'; this.wait = 2; this.cancelReaction(); this.fallStart = null;
  }
  geometry(value) {
    const oldFoot = this.foot.y;
    this.foot = { x: value.x, y: value.y, radius: value.radius };
    this.canWalk = Boolean(value.canWalk);
    this.canFall = Boolean(value.canFall);
    if (Number.isFinite(value.bodyHeight) && value.bodyHeight > 0) this.bodyHeight = value.bodyHeight;
    if (this.platform) this.y += oldFoot - this.foot.y;
  }
  environment(windows, areas) {
    this.areas = areas.filter(validArea);
    this.surfaces = buildSurfaces(this.options.windowWalking ? windows : [], areas, this.bodyHeight);
    if (this.platform && !this.dragging) {
      const footX = this.x + this.foot.x;
      const same = this.surfaces.filter(s => s.id === this.platform.id);
      // Occlusion changes a segment's left edge without moving its window.
      // Follow the actual window origin, never the changing visible segment.
      const dx = Number.isFinite(same[0]?.originX) && Number.isFinite(this.platform.originX) ? same[0].originX - this.platform.originX : 0;
      const next = same.find(s => footX + dx >= s.left && footX + dx <= s.right && s.right - s.left > this.foot.radius * 2);
      if (next) {
        this.x += dx;
        this.x = clamp(this.x + this.foot.x, next.left + this.foot.radius, next.right - this.foot.radius) - this.foot.x;
        this.y = next.y - this.foot.y; this.platform = next;
      } else { this.beginFall(); }
    }
  }
  cancelReaction() { this.reaction = null; this.reactionTime = 0; this.options.busy = false; }
  beginFall() { this.cancelReaction(); this.platform = null; this.mode = 'fall'; this.vy = 0; this.airVx = 0; this.thrown = false; this.fallStart = this.y + this.foot.y; }
  land(surface) {
    const distance = surface.y - (this.fallStart ?? surface.y);
    this.platform = surface; this.y = surface.y - this.foot.y; this.vy = 0; this.airVx = 0; this.thrown = false; this.mode = 'idle'; this.wait = 1.3; this.fallStart = null;
    if (this.canFall && distance >= Math.max(64, this.bodyHeight * .36)) {
      const roll = this.random();
      this.reaction = { id: ++this.reactionId, outcome: roll < .45 ? 'down-up' : roll < .8 ? 'quick' : 'help', phase: 'start' };
      this.mode = 'landing'; this.reactionTime = 0; this.walkTime = 0;
    }
  }
  reactionStatus(id, phase) {
    if (this.reaction?.id !== id) return;
    if (phase === 'help' && this.reaction.outcome === 'help' && this.reaction.phase === 'start') {
      this.reaction = { ...this.reaction, phase: 'help' }; this.mode = 'help';
    } else if (phase === 'done' && (this.reaction.outcome !== 'help' || this.reaction.phase === 'rise')) {
      this.cancelReaction(); this.mode = 'idle'; this.wait = 1.5;
    }
  }
  assist() {
    if (this.reaction?.phase !== 'help' || this.options.paused) return;
    this.reaction = { ...this.reaction, phase: 'rise' }; this.mode = 'landing'; this.reactionTime = 0;
  }
  grab(now = Date.now()) {
    this.cancelReaction(); this.fallStart = null; this.dragging = true; this.platform = null; this.mode = 'held';
    this.vy = 0; this.airVx = 0; this.thrown = false; this.dragVx = 0; this.dragVy = 0;
    this.lastDrag = null; this.dragSamples = []; this.lastMovement = null;
    this.dragTo(this.x, this.y, now);
  }
  dragTo(x, y, now = Date.now()) {
    if (!validCoordinate(x) || !validCoordinate(y) || !Number.isFinite(now)) return;
    if (this.lastDrag && now < this.lastDrag.time) { this.lastDrag = null; this.dragSamples = []; this.lastMovement = null; }
    const changed = !this.lastDrag || x !== this.lastDrag.x || y !== this.lastDrag.y;
    if (this.lastDrag) {
      const dt = (now - this.lastDrag.time) / 1000;
      if (changed) {
        this.lastMovement = now;
        if (now - this.dragSamples.at(-1)?.time > 160) this.dragSamples = [this.lastDrag];
      }
      if (dt > .002 && dt < .25) {
        this.dragVx = clamp((x - this.lastDrag.x) / dt, -2500, 2500);
        this.dragVy = clamp((y - this.lastDrag.y) / dt, -2500, 2500);
      }
    }
    this.x = x; this.y = y; this.lastDrag = { x, y, time: now };
    // Cursor polling often repeats unchanged coordinates. Sampling only movement
    // keeps a 600 px/s flick identical at both 1 ms and 30 ms polling intervals.
    if (changed) {
      if (this.dragSamples.at(-1)?.time === now) this.dragSamples[this.dragSamples.length - 1] = this.lastDrag;
      else this.dragSamples.push(this.lastDrag);
    }
    while (this.dragSamples.length > 2 && (this.dragSamples[1].time < now - 160 || this.dragSamples.length > 256)) this.dragSamples.shift();
  }
  releaseVelocity(now) {
    const age = now - (this.lastMovement ?? -Infinity);
    if (!Number.isFinite(now) || age < 0 || age >= 140) return { vx: 0, vy: 0 };
    // Average recent segments, weighted by duration and recency. A final unchanged
    // mouse-up sample contributes its short rest, without erasing the whole flick.
    const samples = [...this.dragSamples];
    if (samples.length && samples.at(-1).time < now) samples.push({ ...samples.at(-1), time: now });
    let vx = 0, vy = 0, total = 0;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1], b = samples[i], elapsed = b.time - a.time;
      if (elapsed <= 0 || elapsed > 250 || b.time > now || b.time <= now - 120) continue;
      const start = Math.max(a.time, now - 120), duration = b.time - start;
      const weight = duration * Math.exp(-Math.max(0, now - (start + b.time) / 2) / 65);
      vx += clamp((b.x - a.x) * 1000 / elapsed, -2500, 2500) * weight;
      vy += clamp((b.y - a.y) * 1000 / elapsed, -2500, 2500) * weight;
      total += weight;
    }
    const freshness = clamp((140 - age) / 80, 0, 1);
    return { vx: total ? clamp(vx / total * freshness, -1400, 1400) : 0, vy: total ? clamp(vy / total * freshness, -1100, 950) : 0 };
  }
  release({ now = Date.now(), allowThrow = true } = {}) {
    const velocity = this.dragging && allowThrow && this.options.physics !== false && !this.options.paused ? this.releaseVelocity(now) : { vx: 0, vy: 0 };
    const launch = Math.hypot(velocity.vx, velocity.vy) >= THROW_THRESHOLD;
    this.dragging = false; this.dragVx = 0; this.dragVy = 0; this.lastDrag = null;
    this.dragSamples = []; this.lastMovement = null;
    this.wait = 1.5; this.mode = 'idle'; this.vy = 0; this.airVx = 0; this.thrown = false;
    const footX = this.x + this.foot.x, footY = this.y + this.foot.y;
    const distance = a => (footX - clamp(footX, a.x, a.x + a.width)) ** 2 + (footY - clamp(footY, a.y, a.y + a.height)) ** 2;
    const area = [...this.areas].sort((a, b) => distance(a) - distance(b))[0];
    const onScreen = this.areas.some(a => footX >= a.x && footX <= a.x + a.width && footY >= a.y && footY <= a.y + a.height);
    if (area && (!launch || !onScreen)) {
      this.x = clamp(footX, area.x + this.foot.radius, area.x + area.width - this.foot.radius) - this.foot.x;
      this.y = clamp(this.y, area.y + this.bodyHeight - this.foot.y, Math.max(area.y + this.bodyHeight - this.foot.y, area.y + area.height - this.foot.y));
    }
    if (launch) {
      this.beginFall(); this.thrown = true; this.airVx = velocity.vx; this.vy = velocity.vy;
      if (Math.abs(this.airVx) >= THROW_THRESHOLD) this.direction = Math.sign(this.airVx);
    } else if (this.options.roaming) this.landNear(34);
  }
  containAir(previousX, previousY) {
    if (!this.areas.length) return;
    let footX = this.x + this.foot.x, footY = this.y + this.foot.y;
    const distance = a => (footX - clamp(footX, a.x, a.x + a.width)) ** 2 + (footY - this.bodyHeight / 2 - clamp(footY - this.bodyHeight / 2, a.y, a.y + a.height)) ** 2;
    const area = [...this.areas].sort((a, b) => distance(a) - distance(b))[0];
    if (footY < area.y + this.bodyHeight) {
      footY = area.y + this.bodyHeight; this.y = footY - this.foot.y;
      if (this.vy < 0) this.vy *= -.18;
    }
    // Merge touching display spans before adding body clearance. Shared monitor
    // seams are passable; only the outside edge of the connected span is a wall.
    let spans = this.areas.filter(a => footY - this.bodyHeight >= a.y - 1 && Math.min(footY, previousY) <= a.y + a.height + 1)
      .map(a => [a.x, a.x + a.width]).sort((a, b) => a[0] - b[0]);
    if (!spans.length) spans = [[area.x, area.x + area.width]];
    const merged = [];
    for (const span of spans) {
      const last = merged.at(-1);
      if (last && span[0] <= last[1] + 1) last[1] = Math.max(last[1], span[1]);
      else merged.push([...span]);
    }
    const span = merged.find(([left, right]) => previousX >= left && previousX <= right)
      || merged.reduce((best, value) => Math.abs(footX - clamp(footX, ...value)) < Math.abs(footX - clamp(footX, ...best)) ? value : best);
    const radius = Math.min(this.foot.radius, (span[1] - span[0]) / 2);
    const left = span[0] + radius, right = span[1] - radius;
    if (footX < left || footX > right) {
      this.x = clamp(footX, left, right) - this.foot.x;
      if ((footX < left && this.airVx < 0) || (footX > right && this.airVx > 0)) this.airVx *= -.28;
    }
  }
  stepFall(dt) {
    if (dt <= 0) return;
    const count = Math.max(1, Math.ceil(dt * 120)), slice = dt / count;
    for (let i = 0; i < count && !this.platform; i++) {
      const beforeX = this.x + this.foot.x, beforeY = this.y + this.foot.y;
      const oldVy = this.vy, damping = Math.exp(-AIR_DRAG * slice);
      this.x += this.airVx * (1 - damping) / AIR_DRAG;
      this.airVx *= damping;
      this.vy = Math.min(950, oldVy + GRAVITY * slice);
      this.y += (oldVy + this.vy) * .5 * slice;
      this.containAir(beforeX, beforeY);
      const afterX = this.x + this.foot.x, afterY = this.y + this.foot.y;
      const apex = oldVy < 0 && oldVy + GRAVITY * slice >= 0 ? beforeY - oldVy * oldVy / (2 * GRAVITY) : Math.min(beforeY, afterY);
      this.fallStart = Math.min(this.fallStart ?? beforeY, apex);
      // A fast diagonal throw must cross the actual top edge, not its final X.
      // Small slices also resolve the apex separately from descending landings.
      let hit = null;
      if (this.vy >= 0 && afterY > beforeY) {
        for (const surface of this.surfaces) {
          if (surface.y < beforeY - .001 || surface.y > afterY) continue;
          const fraction = clamp((surface.y - beforeY) / (afterY - beforeY), 0, 1);
          const crossX = beforeX + (afterX - beforeX) * fraction;
          if (crossX < surface.left + this.foot.radius || crossX > surface.right - this.foot.radius) continue;
          if (!hit || fraction < hit.fraction) hit = { surface, fraction, x: crossX };
        }
      }
      if (hit) { this.x = hit.x - this.foot.x; this.land(hit.surface); }
      else {
        this.mode = 'fall';
        // A removed display or release below a work area must recover locally.
        const floor = this.surfaces.find(s => s.kind === 'floor' && afterX >= s.left && afterX <= s.right);
        if (floor && afterY > floor.y && this.vy >= 0) {
          this.x = clamp(afterX, floor.left + this.foot.radius, floor.right - this.foot.radius) - this.foot.x;
          this.land(floor);
        }
      }
    }
  }
  landNear(tolerance = 12) {
    const footX = this.x + this.foot.x, footY = this.y + this.foot.y;
    const nearby = this.surfaces.filter(s => footX >= s.left + this.foot.radius && footX <= s.right - this.foot.radius && Math.abs(s.y - footY) <= tolerance)
      .sort((a, b) => Math.abs(a.y - footY) - Math.abs(b.y - footY))[0];
    if (nearby) { this.platform = nearby; this.y = nearby.y - this.foot.y; this.mode = 'idle'; this.vy = 0; }
    else { this.beginFall(); }
  }
  interact(seconds = 4) { this.wait = Math.max(this.wait, seconds); this.walkTime = 0; if (this.platform && !this.reaction) this.mode = 'idle'; }
  step(delta) {
    const dt = Number.isFinite(delta) ? clamp(delta, 0, .05) : 0;
    if (this.dragging) {
      this.dragVx *= Math.exp(-dt * 8); this.dragVy *= Math.exp(-dt * 8);
      return this.snapshot(this.dragVx, this.dragVy);
    }
    if (this.options.paused || this.options.menuOpen) return this.snapshot();
    if (this.reaction && this.platform) {
      this.y = this.platform.y - this.foot.y;
      // A missing renderer acknowledgement must never strand an automatic recovery.
      if (this.reaction.phase !== 'help' && (this.reactionTime += dt) > 15) { this.cancelReaction(); this.mode = 'idle'; }
      return this.snapshot();
    }
    if (!this.options.roaming && this.mode !== 'fall') { this.mode = 'idle'; return this.snapshot(); }
    if (!this.platform && this.mode !== 'fall') this.landNear();
    if (!this.platform) {
      this.stepFall(dt);
      return this.snapshot();
    }
    this.y = this.platform.y - this.foot.y;
    if (this.options.busy || !this.canWalk || this.platform.right - this.platform.left < this.foot.radius * 2 + 45) { this.mode = 'idle'; return this.snapshot(); }
    if (this.wait > 0) { this.wait -= dt; this.mode = 'idle'; return this.snapshot(); }
    if (this.walkTime <= 0) { this.walkTime = 3 + this.random() * 5; this.direction = this.random() < .5 ? -1 : 1; }
    this.mode = 'walk';
    const speed = (this.options.size || this.bodyHeight / .77) * .13, vx = this.direction * speed;
    this.x += vx * dt; this.walkTime -= dt;
    const left = this.platform.left + this.foot.radius, right = this.platform.right - this.foot.radius;
    const footX = this.x + this.foot.x;
    if (footX <= left || footX >= right) {
      this.x = clamp(footX, left, right) - this.foot.x; this.direction *= -1; this.wait = .6; this.walkTime = 3 + this.random() * 3; this.mode = 'idle';
    } else if (this.walkTime <= 0) { this.wait = 2 + this.random() * 4; this.mode = 'idle'; }
    return this.snapshot(this.mode === 'walk' ? vx : 0);
  }
  snapshot(vx = this.mode === 'fall' ? this.airVx : 0, vy = this.mode === 'fall' ? this.vy : 0) { return { x: this.x, y: this.y, vx, vy, thrown: this.thrown, direction: this.direction, mode: this.mode, platform: this.platform?.kind || null, dragging: this.dragging, reaction: this.reaction }; }
}
module.exports = { DesktopWorld, buildSurfaces };
