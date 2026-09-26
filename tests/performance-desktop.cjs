const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), wait = ms => new Promise(r => setTimeout(r, ms));
const label = process.argv[2] || 'after', executable = process.argv[3] !== 'source' ? process.argv[3] : null;
const hover = process.argv[4] === 'hover';
(async () => {
  const env = { ...process.env, BA_PET_TEST_PROFILE: path.join(root, 'test-results', `performance-${label}-profile`) }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ ...(executable ? { executablePath: path.resolve(executable), args: ['--test-mode'] } : { args: [root, '--test-mode'] }), env });
  try {
    const page = await app.firstWindow(); await page.waitForSelector('#stage[data-state="ready"]', { timeout: 45000 });
    await app.evaluate(({ app, BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0]; w.setFocusable(false);
      process.mainModule.require(app.getAppPath() + '/electron/main.cjs').testCursor({ x: -10000, y: -10000 });
    });
    await page.evaluate(() => window.pet.update({ characterId: '327', size: 320, paused: false, roaming: false, windowWalking: false, voiceEnabled: false, furniture: 'none', effectsEnabled: false }));
    await page.waitForSelector('#stage[data-character="327"][data-state="ready"]'); await wait(2000);
    if (hover) {
      await app.evaluate(({ app }) => {
        const main = process.mainModule.require(app.getAppPath() + '/electron/main.cjs'), d = main.diagnostics();
        main.testCursor({ x: Math.round(d.bounds.x + d.foot.x), y: Math.round(d.bounds.y + d.foot.y - 100) });
      });
      await page.waitForSelector('#stage[data-hover="true"]');
    }
    const cdp = await page.context().newCDPSession(page); await cdp.send('Performance.enable');
    const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
    const a = await metrics(); await cdp.send('Profiler.enable'); await cdp.send('Profiler.start');
    await wait(6000);
    const { profile } = await cdp.send('Profiler.stop'); const b = await metrics();
    const ticks = new Map(); for (const id of profile.samples || []) ticks.set(id, (ticks.get(id) || 0) + 1);
    const hot = profile.nodes.map(n => ({ name: n.callFrame.functionName, url: n.callFrame.url.split('/').slice(-2).join('/'), samples: ticks.get(n.id) || 0 })).sort((a,b) => b.samples-a.samples).slice(0,12);
    await page.evaluate(() => window.pet.update({ paused: true })); await wait(200);
    const c = await metrics(); await wait(2000); const d = await metrics();
    const report = { character: 'Hikari', size: 320, scenario: hover ? 'cursor-on-body' : 'idle', seconds: b.Timestamp-a.Timestamp, taskMsPerSecond: 1000*(b.TaskDuration-a.TaskDuration)/(b.Timestamp-a.Timestamp), scriptMsPerSecond: 1000*(b.ScriptDuration-a.ScriptDuration)/(b.Timestamp-a.Timestamp), heapMiB: b.JSHeapUsedSize/1048576, pausedTaskMsPerSecond:1000*(d.TaskDuration-c.TaskDuration)/(d.Timestamp-c.Timestamp), hot };
    fs.writeFileSync(path.join(root, 'test-results', `performance-${label}.json`), JSON.stringify(report,null,2)); console.log(JSON.stringify(report,null,2));
  } finally { await app.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
