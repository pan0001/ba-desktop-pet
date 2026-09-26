const { test } = require('node:test');
const assert = require('node:assert/strict');
test('mouth follows sound energy, closes during pauses and uses only UV uniforms', async () => {
  const { createMouthMotion, mouthOffsetFrame } = await import('../scripts/mouth-motion.js');
  let input = null, uploads = 0, offset;
  const texture = { offset: { set(x,y) { offset = [x,y]; } }, set needsUpdate(_) { uploads++; } };
  const mouth = createMouthMotion(texture, () => input);
  assert.equal(mouthOffsetFrame(0), 40);
  assert.deepEqual(offset, [0, 5/8]);
  for (const level of [.16, .4, 1]) {
    input = { speaking: true, level };
    for (let i=0;i<30;i++) mouth.update(1/30);
    assert.equal(mouth.diagnostics().frame, level < .25 ? 3 : level < .55 ? 4 : 1);
  }
  input.level = 0;
  for (let i=0;i<15;i++) mouth.update(1/30);
  assert.equal(mouth.diagnostics().frame, 0);
  input = null; mouth.smile(); mouth.update(.03);
  assert.equal(mouth.diagnostics().frame, 16);
  mouth.close(); assert.equal(mouth.diagnostics().frame, 0);
  assert.equal(uploads, 0);
});
