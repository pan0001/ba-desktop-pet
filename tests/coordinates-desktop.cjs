const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const out = path.resolve('test-results');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const env = { ...process.env, BA_PET_TEST_PROFILE: path.join(out, 'coordinate-profile') }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [process.cwd(), '--test-mode'], env });
  try {
    const page = await app.firstWindow(); await page.waitForSelector('#stage[data-state="ready"]');
    await page.evaluate(() => window.pet.update({ roaming: false, windowWalking: false }));
    const native = await app.evaluate(({ app, BrowserWindow }) => {
      const { motionPosition } = process.mainModule.require(app.getAppPath() + '/electron/core.cjs');
      const probe = new BrowserWindow({ show: false, width: 200, height: 200 });
      const cases = [-0, Math.round(-.1), -.49, -.001, 0, .49, 1, -1, 1000000, -1000000];
      const results = cases.map(value => {
        let rawError = null;
        try { probe.setPosition(value, 100); } catch (error) { rawError = error.message; }
        const fixed = motionPosition({ x: value, y: value });
        probe.setPosition(fixed.x, fixed.y);
        return { input: String(value), negativeZero: Object.is(value, -0), rawError, fixed, normalized: !Object.is(fixed.x, -0) && !Object.is(fixed.y, -0) };
      }); probe.destroy();
      globalThis.coordinateErrors = [];
      process.on('uncaughtException', error => globalThis.coordinateErrors.push(error.message));
      return results;
    });
    assert.match(native[0].rawError, /conversion failure/); assert.ok(native.every(c => c.normalized));
    for (const point of [{ x: -.49, y: 100 }, { x: -.1, y: 100 }, { x: 0, y: -.1 }, { x: .1, y: .1 }, { x: -1.1, y: -1.1 }]) {
      await app.evaluate(({ app }, point) => process.mainModule.require(app.getAppPath() + '/electron/main.cjs').testMotionPosition(point), point);
      await wait(100);
      const d = await app.evaluate(({ app }) => process.mainModule.require(app.getAppPath() + '/electron/main.cjs').diagnostics());
      assert.equal(d.bounds.x, Math.round(point.x) + 0); assert.equal(d.bounds.y, Math.round(point.y) + 0);
    }
    const errors = await app.evaluate(() => globalThis.coordinateErrors); assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'coordinates-report.json'), JSON.stringify({ passed: true, native, movementTickCrossesZero: true, errors }, null, 2));
    console.log('Reproduced native -0 rejection; normalized inputs and actual movementTick pass across zero.');
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
