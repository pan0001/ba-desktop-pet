export const clamp = (value, low, high) => Math.max(low, Math.min(value, high));
// Bounded substeps keep the spring stable after a slow frame or monitor change.
export function springStep(state, target, delta, stiffness = 100, damping = 15, limit = .5) {
  let remaining = clamp(delta, 0, .08);
  while (remaining > 0) {
    const dt = Math.min(remaining, 1 / 120);
    state.velocity += ((target - state.value) * stiffness - state.velocity * damping) * dt;
    state.value += state.velocity * dt;
    if (Math.abs(state.value) > limit) { state.value = clamp(state.value, -limit, limit); state.velocity *= .2; }
    remaining -= dt;
  }
  return state.value;
}
export function createInertia() {
  const body = { value: 0, velocity: 0 }, hair = { value: 0, velocity: 0 };
  let speed = 0, previous = 0, input = 0, age = 1;
  return {
    input(vx) { input = clamp(Number(vx) || 0, -2500, 2500); age = 0; },
    displace(dx, orientation = 1) {
      // A fast move can start and finish between two rendered frames. Preserve
      // that displacement as spring deflection rather than dropping the motion.
      body.value = clamp(body.value + dx * .0015 * orientation, -.32, .32);
      hair.value = clamp(hair.value - dx * .0018, -.34, .34);
    },
    step(dt, enabled = true, orientation = 1) {
      age += dt;
      const desired = enabled && age < .2 ? input : 0;
      speed += (desired - speed) * (1 - Math.exp(-dt * 12));
      const acceleration = clamp((speed - previous) / Math.max(dt, .001), -10000, 10000); previous = speed;
      const target = enabled ? clamp(speed * .00032 + acceleration * .000012, -.30, .30) * orientation : 0;
      const tilt = springStep(body, target, dt, 78, 12, .36);
      // Hair hangs below its attachment, so the opposite sign makes the ends
      // trail the body's movement. More spring/less damping gives a soft rebound.
      const hairTilt = springStep(hair, enabled ? clamp(-speed * .00028 - acceleration * .000025 - body.velocity * .08, -.32, .32) : 0, dt, 52, 8, .38);
      return { tilt, hair: hairTilt, speed };
    },
    reset() { body.value = body.velocity = hair.value = hair.velocity = speed = previous = input = 0; age = 1; }
  };
}
