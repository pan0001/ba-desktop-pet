// The authored mouth UV centre is (1/8, 7/8), before the atlas's 1/2 scale.
// Indices here name the visible atlas cells, top-to-bottom, not UV offsets.
export function mouthOffsetFrame(cell) { return ((Math.floor(cell / 8) + 5) % 8) * 8 + cell % 8; }
export function createMouthMotion(texture, sample = () => null) {
  let frame = -1, age = 1, energy = 0, smile = 0, changes = 0;
  function select(cell) {
    if (cell === frame) return;
    frame = cell; changes++; age = 0;
    const offset = mouthOffsetFrame(cell);
    texture.offset.set((offset % 8) / 8, Math.floor(offset / 8) / 8);
    // UV uniforms change without re-uploading the 2048px texture.
  }
  select(0);
  return {
    smile() { smile = 2.4; },
    update(dt) {
      const elapsed = Number.isFinite(dt) ? Math.max(0, Math.min(.1, dt)) : 0;
      age += elapsed; smile = Math.max(0, smile - elapsed);
      const value = sample();
      if (!value?.speaking) { energy = 0; select(smile > 0 ? 16 : 0); return; }
      const level = Number.isFinite(value.level) ? Math.max(0, Math.min(1, value.level)) : 0;
      energy += (level - energy) * (1 - Math.exp(-elapsed * (level > energy ? 35 : 20)));
      const cell = energy < .07 ? 0 : energy < .25 ? 3 : energy < .55 ? 4 : 1;
      if (age >= .075) select(cell);
    },
    close() { energy = 0; smile = 0; select(0); },
    diagnostics: () => ({ frame, energy, changes })
  };
}
