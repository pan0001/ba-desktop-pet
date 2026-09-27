// Exercise the real NSIS updater and HTTP range reconstruction, without running an installer.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), http = require('node:http');
if (!process.versions.electron) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const result = require('node:child_process').spawnSync(require('electron'), [__filename, ...process.argv.slice(2)], { env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
const { app } = require('electron');
const { NsisUpdater } = require('electron-updater');
const { ElectronHttpExecutor } = require('electron-updater/out/electronHttpExecutor');
const { buildBlockMap } = require('app-builder-lib/out/targets/blockmap/blockmap');
const out = path.resolve(__dirname, '../test-results');
const report = { passed: false, installersExecuted: false, scenarios: [] };
const digest = bytes => crypto.createHash('sha512').update(bytes).digest('base64');
let server, stage;
(async () => {
  fs.mkdirSync(out, { recursive: true }); stage = fs.mkdtempSync(path.join(out, '.update-download-'));
  app.setPath('userData', path.join(out, 'update-download-electron-profile'));
  await app.whenReady();
  const old = process.argv[2] ? fs.readFileSync(path.resolve(process.argv[2])) : crypto.randomBytes(8 * 1024 * 1024);
  const next = process.argv[3] ? fs.readFileSync(path.resolve(process.argv[3])) : Buffer.from(old);
  if (!process.argv[3]) crypto.randomFillSync(next, 2 * 1024 * 1024, 32 * 1024);
  const oldName = 'BA-Desktop-Pet-1.12.0-Setup-x64.exe', newName = 'BA-Desktop-Pet-1.12.1-Setup-x64.exe';
  fs.writeFileSync(path.join(stage, oldName), old); fs.writeFileSync(path.join(stage, newName), next);
  for (const name of [oldName, newName]) await buildBlockMap(path.join(stage, name), 'gzip', path.join(stage, name + '.blockmap'));
  let traffic, corrupt = false;
  server = http.createServer((req, res) => {
    const route = new URL(req.url, 'http://localhost').pathname;
    if (route.endsWith('/latest.yml')) return res.end(JSON.stringify({ version: '1.12.1', files: [{ url: newName, sha512: digest(next), size: next.length }] }));
    if (route.endsWith('.blockmap')) {
      const name = path.basename(route);
      if (![oldName, newName].some(n => name === n + '.blockmap')) { res.statusCode = 404; return res.end(); }
      traffic.blockmaps.push(route); return res.end(fs.readFileSync(path.join(stage, name)));
    }
    if (route.endsWith('/' + newName)) { res.writeHead(302, { Location: '/objects/installer' }); return res.end(); }
    if (route !== '/objects/installer') { res.statusCode = 404; return res.end(); }
    const range = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || '');
    const start = range ? Number(range[1]) : 0, end = range ? Number(range[2]) : next.length - 1;
    let data = next.subarray(start, end + 1);
    if (corrupt) { data = Buffer.from(data); data[0] ^= 255; }
    traffic.bytes += data.length; traffic.requests.push({ start, end, range: Boolean(range) });
    res.writeHead(range ? 206 : 200, { 'Content-Length': data.length, 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${next.length}` } : {}) });
    res.end(data);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  for (const mode of ['differential', 'missing-cache', 'corrupt-download']) {
    traffic = { bytes: 0, requests: [], blockmaps: [] }; corrupt = mode === 'corrupt-download';
    const directory = path.join(stage, mode); fs.mkdirSync(directory);
    const config = path.join(directory, 'app-update.yml'); fs.writeFileSync(config, 'updaterCacheDirName: update-test\n');
    const fakeApp = { version: '1.12.0', isPackaged: true, name: 'update-test', appUpdateConfigPath: config, userDataPath: directory, baseCachePath: directory,
      whenReady: async () => {}, onQuit: () => { throw Error('Must not install on quit'); }, quit: () => { throw Error('Must not quit'); } };
    const engine = new NsisUpdater(null, fakeApp);
    engine.httpExecutor = new ElectronHttpExecutor();
    engine.createProviderRuntimeOptions = () => ({ platform: 'win32', executor: engine.httpExecutor, isUseMultipleRangeRequest: false });
    engine.setFeedURL({ provider: 'generic', url: `http://127.0.0.1:${server.address().port}/releases/download/v1.12.1/`, useMultipleRangeRequest: false });
    engine.autoDownload = false; engine.autoInstallOnAppQuit = false; engine.disableWebInstaller = true;
    const messages = [], progress = []; engine.logger = { info: text => messages.push(String(text)), warn() {}, error: text => messages.push(String(text)) };
    engine.on('error', () => {}); engine.on('download-progress', value => progress.push(value.percent));
    if (mode !== 'missing-cache') { fs.mkdirSync(path.join(directory, 'update-test')); fs.writeFileSync(path.join(directory, 'update-test/installer.exe'), old); }
    await engine.checkForUpdates(); assert.equal(traffic.bytes, 0, 'Checking does not download installer bytes');
    if (corrupt) {
      await assert.rejects(engine.downloadUpdate(), /checksum/i);
      assert.equal(engine.installerPath, null, 'Corrupt download cannot be installed');
    } else {
      const [file] = await engine.downloadUpdate(); assert.equal(digest(fs.readFileSync(file)), digest(next));
      if (mode === 'differential') {
        assert.ok(traffic.requests.every(r => r.range), 'Differential download uses HTTP Range through a redirect: ' + messages.join(' | ') + JSON.stringify(traffic));
        assert.ok(traffic.bytes < next.length, 'Copies unchanged bytes from the installed cache');
        assert.ok(traffic.blockmaps.some(url => url.includes('/v1.12.0/' + oldName)), 'Resolves the previous GitHub release blockmap');
      } else {
        assert.ok(messages.some(text => text.includes('fallback to full download')));
        assert.equal(traffic.bytes, next.length, 'Missing cache safely falls back to full download');
      }
      assert.ok(progress.length > 0, 'Reports download progress');
      const before = traffic.bytes; await engine.downloadUpdate(); assert.equal(traffic.bytes, before, 'Valid pending download is reused');
    }
    report.scenarios.push({ mode, fullBytes: next.length, downloadedBytes: traffic.bytes, requests: traffic.requests.length, savedPercent: Math.round((1 - traffic.bytes / next.length) * 10000) / 100, sha512Verified: !corrupt, rejectedCorruption: corrupt });
  }
  report.passed = true; console.log(JSON.stringify(report, null, 2));
})().catch(error => { report.error = error.stack; console.error(error); process.exitCode = 1; }).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(path.join(out, process.argv[2] ? 'update-real-packages-report.json' : 'update-download-report.json'), JSON.stringify(report, null, 2));
  if (stage) { assert.equal(path.dirname(path.resolve(stage)), out); assert.ok(path.basename(stage).startsWith('.update-download-')); fs.rmSync(stage, { recursive: true, force: true }); }
  app.exit(process.exitCode || 0);
});
