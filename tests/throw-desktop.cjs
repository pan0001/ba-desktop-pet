const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), out = path.join(root, 'test-results');
const executablePath = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
const reportName = executablePath ? 'throw-packaged-report.json' : 'throw-report.json';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const env = { ...process.env, BA_PET_TEST_PROFILE: path.join(out, executablePath ? 'throw-packaged-profile' : 'throw-profile') };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath, args: [...(executablePath ? [] : [root]), '--test-mode', '--measure-pet'], env });
  const errors = [], results = [];
  app.on('window', page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  });
  const main = (action, arg) => app.evaluate(({ app }, { action, arg }) =>
    process.mainModule.require(app.getAppPath() + '/electron/main.cjs')[action](arg), { action, arg });
  const until = async (read, predicate, label, timeout = 6000) => {
    const start = Date.now(); let value;
    do { value = await read(); if (predicate(value)) return value; await wait(20); } while (Date.now() - start < timeout);
    assert.fail(`${label}: ${JSON.stringify(value)}`);
  };
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('#stage[data-state="ready"]');
    // Exercise actual renderer pointer events and main-process cursor polling,
    // without taking focus or showing a second pet over the user's desktop.
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]; window.setFocusable(false); window.setOpacity(0);
    });
    await main('testCursor', { x: -10000, y: -10000 });
    await page.evaluate(() => window.pet.update({ characterId: '212', size: 320, roaming: false,
      windowWalking: false, paused: false, physics: true, voiceEnabled: false, effectsEnabled: false, furniture: 'none' }));
    await page.waitForSelector('#stage[data-character="212"][data-state="ready"]');
    await main('testRandom', .6); // A quick automatic recovery cannot leave the test asking for help.
    const area = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);

    async function prepare(physics = true) {
      await page.evaluate(physics => window.pet.update({ paused: true, physics, roaming: false }), physics);
      const geometry = await main('diagnostics');
      // Leave space above and below for a visibly rising/falling flight, with
      // autonomous walking disabled to distinguish throwing from roaming.
      await main('testPlace', { ...geometry.bounds,
        x: Math.round(area.x + area.width * .5 - geometry.foot.x),
        y: Math.round(area.y + area.height * .68 - geometry.foot.y) });
      await main('testCursor', { x: -10000, y: -10000 });
      await page.evaluate(() => window.pet.update({ paused: false }));
      await wait(220);
      const grab = await page.evaluate(() => {
        const point = window.petFrames.at(-1)?.headPoint;
        if (!point) return null;
        for (let y = point.y - 28; y <= point.y + 28; y += 7)
          for (let x = point.x - 28; x <= point.x + 28; x += 7)
            if (window.petCompanionTest.hitRegion(x, y) === 'head') return { x, y };
        return null;
      });
      assert.ok(grab, 'A non-hair head triangle can be grabbed');
      const placed = await main('diagnostics');
      const cursor = { x: Math.round(placed.bounds.x + grab.x), y: Math.round(placed.bounds.y + grab.y) };
      await main('testCursor', cursor); await wait(50);
      await page.mouse.move(grab.x, grab.y); await page.mouse.down();
      await until(() => main('diagnostics'), d => d.world.dragging, 'Pointerdown starts a real drag', 1500);
      await page.evaluate(() => { window.petFrames = []; });
      return cursor;
    }
    async function flick(name, direction, { physics = true, hold = 0, duplicate = false, cancel = false } = {}) {
      const cursor = await prepare(physics);
      // Existing non-throw releases obey the autonomous-motion switch. Enable
      // it only for these controls; an effective throw must work without it.
      if (hold || !physics || cancel) await page.evaluate(() => window.pet.update({ roaming: true }));
      let lastCursor;
      for (let i = 1; i <= 6; i++) {
        await wait(30);
        lastCursor = { x: cursor.x + direction.x * i * 18, y: cursor.y + direction.y * i * 18 };
        await main('testCursor', lastCursor);
      }
      if (hold) await wait(hold);
      // Mouse polling and mouseup can produce the same final screen point.
      // That duplicate must not erase the preceding short flick gesture.
      if (duplicate) await main('testCursor', lastCursor);
      const held = await main('diagnostics');
      assert.equal(held.world.dragging, true);
      if (cancel) await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      else await page.mouse.up();
      const released = await until(() => main('diagnostics'), d => !d.world.dragging, 'Release or cancellation ends dragging', 1500);
      if (cancel) { await page.mouse.up(); assert.equal(released.world.thrown, false, 'Losing focus cancels the gesture instead of throwing'); }
      assert.equal(released.world.mode, 'fall', 'The release starts an airborne movement');
      const trajectory = [released.world];
      for (let i = 0; i < 9; i++) { await wait(25); trajectory.push((await main('diagnostics')).world); }
      const heldFrames = (await page.evaluate(() => window.petFrames)).filter(frame => frame.mode === 'held');
      assert.ok(heldFrames.length >= 2, 'The renderer actually displayed the held gesture');
      const maximumPivotError = Math.max(...heldFrames.map(frame => frame.grabError ?? Infinity));
      assert.ok(maximumPivotError < .5, `The flick preserves the mouse pivot (${maximumPivotError}px)`);
      const result = { name, physics, hold, duplicate, cancel, samples: held.throwSamples, held: held.world, released: released.world,
        trajectory, maximumPivotError };
      results.push(result);
      if (physics && !hold && !cancel) {
        assert.equal(released.world.thrown, true, 'Mouseup creates an inertial throw');
        const samples = held.throwSamples, first = samples[0], last = samples.at(-1);
        const expectedSpeed = Math.hypot(last.x - first.x, last.y - first.y) * 1000 / (last.time - first.time);
        const releaseSpeed = Math.hypot(released.world.vx, released.world.vy);
        assert.ok(releaseSpeed > expectedSpeed * .35 && releaseSpeed < expectedSpeed * 1.8 + 50,
          `Native sampling retains a plausible gesture speed: ${releaseSpeed} vs ${expectedSpeed}`);
        if (direction.y < 0) {
          assert.ok(trajectory.some(frame => frame.y < released.world.y - 15), 'An upward throw keeps rising after mouseup');
          assert.ok(trajectory.some(frame => frame.vy < -50), 'The upward flight retains negative vertical velocity');
          await page.screenshot({ path: path.join(out, 'throw-airborne.png'), omitBackground: true });
        } else {
          const deltaX = trajectory.at(-1).x - released.world.x;
          assert.ok(deltaX * direction.x > 30, `A ${name} throw continues horizontally (${deltaX}px)`);
          assert.ok(trajectory.some(frame => frame.vx * direction.x > 80), 'The flight publishes its horizontal velocity');
        }
      } else {
        assert.ok(Math.abs(trajectory.at(-1).x - released.world.x) < 1, 'Holding still or disabling physics removes throw inertia');
        assert.ok(trajectory.every(frame => frame.y >= released.world.y - 1), 'A plain drop never rises');
      }
      const landed = await until(() => main('diagnostics'), d => d.world.platform === 'floor', 'Flight returns to the desktop floor');
      result.landed = landed.world;
      if (!physics || hold || cancel) assert.ok(Math.abs(landed.world.x - released.world.x) < 1, 'A plain drop must not shift sideways late in its fall');
      assert.ok(Math.abs(landed.world.y + landed.foot.y - (area.y + area.height)) < 1, 'The pet lands at the actual work-area floor');
      assert.ok(landed.world.x + landed.foot.x >= area.x && landed.world.x + landed.foot.x <= area.x + area.width, 'The throw stays on the desktop');
      await main('testCursor', { x: -10000, y: -10000 });
    }

    await flick('up', { x: 0, y: -1 }, { duplicate: true });
    await flick('left', { x: -1, y: 0 });
    await flick('right', { x: 1, y: 0 }, { duplicate: true });
    await flick('held-still', { x: 1, y: 0 }, { hold: 260 });
    await flick('physics-off', { x: 1, y: -1 }, { physics: false });
    await flick('blur-cancels', { x: 1, y: -1 }, { cancel: true });
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, reportName), JSON.stringify({ passed: true, area, results, errors }, null, 2));
    console.log(results.map(({ name, maximumPivotError, released, trajectory }) => ({ name, maximumPivotError,
      vx: released.vx, vy: released.vy, dx: trajectory.at(-1).x - released.x,
      rise: released.y - Math.min(...trajectory.map(frame => frame.y)) })));
  } catch (error) {
    fs.writeFileSync(path.join(out, reportName), JSON.stringify({ passed: false, results, errors, failure: error.message }, null, 2));
    throw error;
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
