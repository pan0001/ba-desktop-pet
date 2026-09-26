const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const assert = require('node:assert/strict');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const env = { ...process.env, BA_PET_TEST_PROFILE: path.resolve('test-results/slow-drag-profile') }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [process.cwd(), '--test-mode', '--measure-pet', ...process.argv.slice(2)], env });
  try {
    const page = await app.firstWindow(); await page.waitForSelector('#stage[data-state="ready"]');
    await page.evaluate(() => window.pet.update({ roaming: false, windowWalking: false, proactiveEvents: false, voiceEnabled: false, size: 351 }));
    const displays = await app.evaluate(({ screen, BrowserWindow }) => { BrowserWindow.getAllWindows()[0].setFocusable(false); return screen.getAllDisplays(); });
    const rows = [];
    for (const x of Array.from({ length: 60 }, (_, i) => -400 + i)) {
      await app.evaluate(({ app }, x) => process.mainModule.require(app.getAppPath() + '/electron/main.cjs').testMotionPosition({ x, y: 300 }), x);
      await wait(45);
      rows.push(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds()));
    }
    const expected = Math.round(351 * 2.6);
    // Allow native DIP rounding, but never accumulation with each move.
    for (const row of rows.slice(3)) {
      assert.ok(Math.abs(row.width - expected) <= 2, `Window grew: ${JSON.stringify(row)}`);
      assert.ok(Math.abs(row.height - expected) <= 2, `Window grew: ${JSON.stringify(row)}`);
    }
    assert.equal((await page.evaluate(() => window.pet.getState())).size, 351);
    const result = { displays, rows, renderer: await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio })) };
    fs.writeFileSync(`test-results/slow-drag-${result.renderer.dpr}.json`, JSON.stringify({ passed: true, ...result }, null, 2));
    console.log(JSON.stringify(result));
  } finally { await app.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
