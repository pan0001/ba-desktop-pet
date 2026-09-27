const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'test-results');
const executablePath = process.argv[2] && path.resolve(process.argv[2]);
const variant = executablePath ? 'packaged' : 'source', profile = path.join(out, `updates-ui-${variant}-profile`);
let app;
const report = { passed: false, variant, errors: [], checks: [] };
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const env = { ...process.env, BA_PET_TEST_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ ...(executablePath ? { executablePath } : {}), args: [...(executablePath ? [] : [root]), '--test-mode'], env });
  const pet = await app.firstWindow();
  await pet.waitForSelector('#stage[data-state="ready"]', { timeout: 60000 });
  assert.equal(await pet.evaluate(() => window.pet.updater('check')), null, 'Pet renderer cannot control updates');
  await pet.evaluate(() => window.pet.command('settings'));
  let page;
  for (let i = 0; i < 100 && !page; i++) { page = app.windows().find(p => p.url().includes('settings.html')); if (!page) await new Promise(r => setTimeout(r, 100)); }
  assert.ok(page); page.on('pageerror', error => report.errors.push(error.message));
  await page.waitForSelector('#characters .character');
  await app.evaluate(({ app, BrowserWindow }) => {
    for (const win of BrowserWindow.getAllWindows()) { win.setOpacity(0); win.setFocusable(false); win.webContents.setAudioMuted(true); }
    const loader = process.mainModule.require.bind(process.mainModule);
    const service = loader(app.getAppPath() + '/electron/main.cjs').testUpdatesService();
    const { EventEmitter } = loader('node:events');
    const next = '1.12.1', base = 'https://github.com/pan0001/ba-desktop-pet/releases/download/v' + next + '/';
    global.updateCalls = []; global.updateService = service;
    service.options.mode = 'installed'; service.change({ mode: 'installed' });
    service.fetchRelease = async () => ({ tag_name: 'v' + next, body: '<img src=x onerror="alert(1)">\n老师，新版本准备好了。', assets: [
      `BA-Desktop-Pet-${next}-Setup-x64.exe`, `BA-Desktop-Pet-${next}-Setup-x64.exe.blockmap`, 'latest.yml'
    ].map(name => ({ name, browser_download_url: base + name, size: 100 })) });
    service.createUpdater = config => {
      global.updateCalls.push(['provider', config]); const engine = new EventEmitter();
      engine.checkForUpdates = async () => ({ updateInfo: { version: next, files: [{ url: `BA-Desktop-Pet-${next}-Setup-x64.exe`, sha512: 'A'.repeat(86) + '==' }] } });
      engine.downloadUpdate = async () => { engine.emit('download-progress', { percent: 43, transferred: 43, total: 100 }); await new Promise(r => setTimeout(r, 700)); return ['verified.exe']; };
      engine.quitAndInstall = (...args) => global.updateCalls.push(['install', ...args]); return engine;
    };
    service.openExternal = async url => global.updateCalls.push(['external', url]);
    // The actual dependency must resolve in the packaged ASAR, not from development node_modules.
    const updater = loader(app.getAppPath() + '/node_modules/electron-updater');
    const engine = new updater.NsisUpdater({ provider: 'generic', url: base });
    if (typeof engine.downloadUpdate !== 'function') throw Error('Updater dependency missing');
  });
  await page.locator('#tab-updates').click();
  await page.locator('#update-check').click();
  await page.waitForFunction(() => document.querySelector('#update-status').textContent === '有新的陪伴版本');
  assert.equal(await page.locator('#update-notes img').count(), 0, 'Release notes render as plain text');
  assert.ok((await page.locator('#update-notes').textContent()).includes('<img'));
  await page.locator('#checkUpdatesAutomatically').uncheck();
  await page.waitForFunction(async () => !(await window.pet.getState()).checkUpdatesAutomatically);
  await page.locator('#update-release').click();
  for (const [width, height] of [[1040, 760], [780, 580]]) {
    await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('settings.html')).setSize(...size), [width, height]);
    await page.waitForTimeout(150);
    const geometry = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, tabs: document.querySelector('.setting-tabs').scrollWidth, available: document.querySelector('.setting-tabs').clientWidth }));
    assert.ok(geometry.scroll <= geometry.width + 1); assert.ok(geometry.tabs <= geometry.available + 1);
    await page.locator('#update-notes').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('#update-notes').isVisible(), true);
    await page.locator('#update-check').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, `updates-ui-${variant}-${width}.png`) });
  }
  await page.locator('#update-download').click();
  await page.waitForFunction(() => document.querySelector('#update-progress').value === 43);
  await page.waitForFunction(() => document.querySelector('#update-status').textContent === '新版准备好了');
  assert.equal(await app.evaluate(() => global.updateCalls.some(c => c[0] === 'install')), false);
  await page.locator('#update-install').click();
  await page.waitForFunction(() => document.querySelector('#update-status').textContent === '正在重启安装…');
  assert.deepEqual(await app.evaluate(() => global.updateCalls.find(c => c[0] === 'install')), ['install', true, true]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'))).checkUpdatesAutomatically, false);
  await app.evaluate(() => global.updateService.change({ status: 'available', mode: 'mac', automatic: false, message: '' }));
  assert.equal(await page.locator('#update-download').textContent(), '下载新版');
  assert.match(await page.locator('#update-mode').textContent(), /手动替换/);
  await page.locator('#update-download').click();
  assert.ok((await app.evaluate(() => global.updateCalls.filter(c => c[0] === 'external').at(-1)[1])).endsWith('.exe'));
  await app.evaluate(() => global.updateService.change({ status: 'error', message: '暂时无法完成更新，请检查网络后重试。' }));
  assert.equal(await page.locator('#update-check').isEnabled(), true);
  assert.deepEqual(report.errors, []);
  report.checks = ['IPC scope', 'packaged updater dependency', 'plain text release notes', 'two window sizes', 'download progress', 'explicit install only', 'saved preference', 'manual download', 'network error retry'];
  report.passed = true; console.log(`Updates UI ${variant}: ${report.checks.join(', ')} passed.`);
})().catch(error => { report.error = error.stack; console.error(error); process.exitCode = 1; }).finally(async () => {
  if (app) await app.close(); fs.writeFileSync(path.join(out, `updates-ui-${variant}-report.json`), JSON.stringify(report, null, 2));
});
