// Reproducible current-version audit. No application settings or saves are reused.
// Usage: node tests/performance-audit.cjs [seconds=20] [rounds=3] [executable]
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const appRoot = process.env.BA_BENCH_APP_ROOT ? path.resolve(process.env.BA_BENCH_APP_ROOT) : root;
function sourceFingerprint() {
  const files=[];
  const walk=dir=>{for(const e of fs.readdirSync(path.join(appRoot,dir),{withFileTypes:true})){
    const file=path.join(dir,e.name);if(e.isDirectory())walk(file);else files.push(file);
  }};
  for(const dir of ['electron','renderer','scripts'])walk(dir);
  files.push('package.json','pet.html','settings.html','furniture.html');
  const hash=require('node:crypto').createHash('sha256');
  for(const file of files.sort()){hash.update(file.replaceAll('\\','/'));hash.update(fs.readFileSync(path.join(appRoot,file)));}
  return hash.digest('hex');
}
const seconds = Number(process.argv[2] || 20), rounds = Number(process.argv[3] || 3);
assert.ok(seconds >= 5 && seconds <= 600 && Number.isInteger(rounds) && rounds >= 1 && rounds <= 10);
const executablePath = process.argv[4] && path.resolve(process.argv[4]);
const out = path.join(root, 'test-results', `performance-audit-${Date.now()}`);
const profile = path.join(out, 'profile'); fs.mkdirSync(profile, { recursive: true });
const ids = ['212', '426', '218', '327', '208', '209'];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const percentile = (values, q) => values.length ? [...values].sort((a,b) => a-b)[Math.min(values.length-1, Math.ceil(values.length*q)-1)] : null;

// Count rAF timestamps that actually submit WebGL draw calls, not empty rAF ticks
// or multipass draws. This is submission cadence, NOT display presentation/GPU time.
function instrument() {
  let rafTime = null;
  const original = window.requestAnimationFrame;
  window.requestAnimationFrame = callback => original.call(window, time => {
    const previous = rafTime; rafTime = time;
    try { callback(time); } finally { rafTime = previous; }
  });
  window.__audit = { times: [], outsideRaf: 0, active: false, start: 0 };
  for (const Constructor of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!Constructor) continue;
    for (const method of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const originalDraw = Constructor.prototype[method]; if (!originalDraw) continue;
      Constructor.prototype[method] = function (...args) {
        const a = window.__audit;
        if (a.active) {
          if (rafTime === null) a.outsideRaf++;
          else if (a.times.at(-1) !== rafTime) a.times.push(rafTime);
        }
        return originalDraw.apply(this, args);
      };
    }
  }
}

(async () => {
  if (executablePath) require('./resource-profile.cjs').prepareResourceProfile(profile, ids);
  fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ characterId: ids[0], size: 320,
    roaming: false, windowWalking: false, voiceEnabled: false, proactiveEvents: false,
    effectsEnabled: true, physics: true, languageConfigured: true, checkUpdatesAutomatically: false }));
  const env = { ...process.env, BA_PET_TEST_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath, args: [...(executablePath ? [] : [appRoot]), '--test-mode'], env });
  const errors = [], results = [];
  const observe = page => page.on('pageerror', error => errors.push(error.message));
  app.on('window', observe);
  const pages = () => app.windows().filter(p => /\/pet\.html/.test(p.url()));
  const metrics = () => app.evaluate(({ app, BrowserWindow }) => ({ time: Date.now(), processes: app.getAppMetrics(),
    windows:BrowserWindow.getAllWindows().map(w=>({id:w.id,visible:w.isVisible()})) }));
  const report = { date: new Date().toISOString(), version: require('../package.json').version,
    commit: execFileSync('git', ['rev-parse','HEAD'], { cwd: root, encoding:'utf8' }).trim(),
    mode: executablePath ? 'packaged' : 'source', variant:process.env.BA_BENCH_VARIANT || 'current',
    sourceFingerprint:executablePath ? null : sourceFingerprint(), seconds, rounds, ids,
    machine: { platform: os.platform(), release: os.release(), cpu: os.cpus()[0].model,
      logicalCPUs: os.cpus().length, memoryGiB: os.totalmem()/2**30 },
    method: { cpu: 'Delta cumulative CPU seconds of Electron-managed processes; 100% one core; divide by logical CPUs for machine-normalized percent. Native scan helper and benchmark driver excluded.',
      memory: 'Electron-managed process working-set sum (includes shared-page double counting), plus private bytes where available. Not JS heap alone.',
      frames: 'Unique rAF timestamps with WebGL submission; not compositor presentation, GPU utilization, VRAM, or GPU execution duration.',
      limits: 'One high-end Windows machine; short repeated samples; no before/after causal comparison, low-end/Mac/battery result, or long-term leak guarantee. Debugger and lightweight instrumentation add overhead. Voice/roaming/window walking disabled; effects/physics enabled.' }, results, errors };
  try {
    await app.context().addInitScript(instrument);
    const page = await app.firstWindow(); observe(page);
    await page.reload(); await page.waitForSelector('#stage[data-state="ready"]', { timeout: 60000 });
    await app.evaluate(({ app, BrowserWindow }) => {
      process.mainModule.require(app.getAppPath() + '/electron/main.cjs').testCursor({x:-10000,y:-10000});
      for (const w of BrowserWindow.getAllWindows()) w.setFocusable(false);
    });
    report.runtime = await app.evaluate(async ({ app, screen }) => ({ electron: process.versions.electron,
      version: app.getVersion(), displays: screen.getAllDisplays().map(d => ({size:d.size,scaleFactor:d.scaleFactor,displayFrequency:d.displayFrequency})), gpu: await app.getGPUInfo('basic') }));
    report.webgl = await page.evaluate(() => {
      const gl = document.querySelector('#stage canvas').getContext('webgl2');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return gl ? { version:gl.getParameter(gl.VERSION), renderer:ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) } : null;
    });
    async function sample(scenario, round) {
      const windows = pages();
      for (const p of windows) await p.evaluate(() => Object.assign(window.__audit, { times:[],outsideRaf:0,active:true,start:performance.now() }));
      const begin = await metrics(), samples = [begin];
      while (Date.now() - begin.time < seconds*1000) { await wait(1000); samples.push(await metrics()); }
      const frames = [];
      for (const p of windows) frames.push(await p.evaluate(() => {
        const a = window.__audit; a.active = false;
        return { id:document.querySelector('#stage').dataset.character, elapsed: (performance.now()-a.start)/1000,
          times:a.times, outsideRaf:a.outsideRaf, hidden:document.hidden,
          canvas:[...document.querySelectorAll('canvas')].map(c=>({width:c.width,height:c.height})),dpr:devicePixelRatio };
      }));
      if (scenario.endsWith('-idle')) assert.ok(frames.every(f=>f.times.length>0), 'Each visible student submits frames');
      const cpu = [];
      for (let i=1;i<samples.length;i++) {
        const previous = new Map(samples[i-1].processes.map(p=>[p.pid,p])); let total=0;
        for (const p of samples[i].processes) {
          const old = previous.get(p.pid);
          assert.ok(Number.isFinite(p.cpu.cumulativeCPUUsage), 'Cumulative CPU counter is supported');
          if (old && old.creationTime === p.creationTime) total += Math.max(0,p.cpu.cumulativeCPUUsage-old.cpu.cumulativeCPUUsage);
        }
        cpu.push(100*total/((samples[i].time-samples[i-1].time)/1000));
      }
      const rss = samples.map(s=>s.processes.reduce((sum,p)=>sum+p.memory.workingSetSize,0)/1024);
      const privateMiB = samples.map(s=>s.processes.reduce((sum,p)=>sum+(p.memory.privateBytes||0),0)/1024);
      const row = { scenario, round, cpuOneCorePercent:cpu.reduce((a,b)=>a+b,0)/cpu.length,
        cpuMachinePercent:cpu.reduce((a,b)=>a+b,0)/cpu.length/os.cpus().length,
        workingSetMiB:percentile(rss,.5), peakWorkingSetMiB:Math.max(...rss),privateMiB:percentile(privateMiB,.5),
        windows:frames.map(f=> { const gaps=f.times.slice(1).map((t,i)=>t-f.times[i]); return {...f,times:undefined,
          submittedFps:f.times.length/f.elapsed,p95IntervalMs:percentile(gaps,.95),intervalsOver50ms:gaps.filter(x=>x>50).length,frameCount:f.times.length}; }), samples };
      results.push(row); fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
      console.log(JSON.stringify({...row,samples:undefined}));
    }
    for (const count of [1,3,6]) {
      for (const id of ids.slice(pages().length,count)) {
        const opened = app.waitForEvent('window');
        const response = await page.evaluate(characterId=>window.pet.scene('addStudent',{characterId}),id);
        assert.ok(response.ok,JSON.stringify(response)); await opened;
      }
      for (const p of pages()) await p.waitForSelector('#stage[data-state="ready"]',{timeout:60000});
      assert.equal(pages().length,count); await wait(5000);
      for(let round=1;round<=rounds;round++) await sample(`${count}-students-idle`,round);
    }
    await page.evaluate(()=>window.pet.update({paused:true})); await wait(3000);
    for(let round=1;round<=rounds;round++) await sample('6-students-paused',round);
    await page.evaluate(()=>window.pet.update({paused:false}));
    await page.evaluate(()=>window.pet.command('hide')); await wait(3000);
    for(let round=1;round<=rounds;round++) await sample('6-students-hidden',round);
    assert.deepEqual(errors,[]); report.completed=true;
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
    console.log('REPORT '+path.join(out,'report.json'));
  } finally { await app.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
