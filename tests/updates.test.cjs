const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { UpdateService, releaseInfo, newerVersion, REPOSITORY } = require('../electron/updates.cjs');
const options = { version: '1.12.0', platform: 'win32', arch: 'x64', mode: 'installed' };
function release(version = '1.12.1') {
  const tag = 'v' + version;
  return { tag_name: tag, body: '<img src=x onerror=alert(1)>\n新版本', assets: [
    `BA-Desktop-Pet-${version}-Setup-x64.exe`, `BA-Desktop-Pet-${version}-Portable-x64.exe`,
    `BA-Desktop-Pet-${version}-macOS-arm64.dmg`, `BA-Desktop-Pet-${version}-macOS-x64.dmg`,
    `BA-Desktop-Pet-${version}-Setup-x64.exe.blockmap`, 'latest.yml'
  ].map(name => ({ name, size: 123, browser_download_url: `${REPOSITORY}/releases/download/${tag}/${name}` })) };
}
function fixture(overrides = {}) {
  let clock = 20000, checks = 0, downloads = 0, creates = 0;
  const calls = [], engine = new EventEmitter();
  engine.checkForUpdates = async () => ({ updateInfo: { version: '1.12.1', files: [{ url: 'BA-Desktop-Pet-1.12.1-Setup-x64.exe', sha512: 'A'.repeat(86) + '==' }] } });
  engine.downloadUpdate = async () => { downloads++; engine.emit('download-progress', { percent: 52, transferred: 52, total: 100 }); return ['downloaded.exe']; };
  engine.quitAndInstall = (...args) => calls.push(['install', ...args]);
  const service = new UpdateService({ ...options, fetchRelease: async () => { checks++; return release(); },
    createUpdater: config => { creates++; calls.push(['provider', config]); return engine; },
    openExternal: async url => calls.push(['open', url]), beforeInstall: () => calls.push(['save']), now: () => clock, ...overrides });
  return { service, engine, calls, counts: () => ({ checks, downloads, creates }), advance: () => { clock += 16000; } };
}
test('update versions compare numerically and never downgrade or take previews', () => {
  assert.ok(newerVersion('v1.12.0', '1.9.99'));
  for (const v of ['1.12.0', '1.11.99', '1.12.1-beta', 'bad', '1.12.Infinity']) assert.equal(newerVersion(v, '1.12.0'), false);
  assert.equal(releaseInfo(release('1.11.0'), options), null);
  assert.throws(() => releaseInfo({ ...release(), prerelease: true }, options));
  assert.throws(() => releaseInfo({ ...release(), draft: true }, options));
});
test('release selection pins repository, platform, architecture and update metadata', () => {
  const raw = release();
  assert.equal(releaseInfo(raw, options).automatic, true);
  for (const [mode, platform, arch, suffix] of [['portable','win32','x64','Portable-x64.exe'],['mac','darwin','arm64','macOS-arm64.dmg'],['mac','darwin','x64','macOS-x64.dmg']]) {
    const info = releaseInfo(raw, { ...options, mode, platform, arch });
    assert.equal(info.automatic, false); assert.ok(info.asset.name.endsWith(suffix));
  }
  assert.equal(releaseInfo({ ...raw, assets: raw.assets.filter(a => a.name !== 'latest.yml') }, options).automatic, false);
  raw.assets[0].browser_download_url = 'https://example.com/malware.exe';
  assert.throws(() => releaseInfo(raw, options));
});
test('checking never downloads, is deduplicated and rate limited', async () => {
  const f = fixture(); await Promise.all([f.service.check(), f.service.check()]); await f.service.check();
  assert.deepEqual(f.counts(), { checks: 1, downloads: 0, creates: 0 });
  f.advance(); await f.service.check(); assert.equal(f.counts().checks, 2);
  const copy = f.service.snapshot(); copy.status = 'downloaded'; assert.equal(f.service.data.status, 'available');
});
test('download progress, full fallback and explicit install preserve state before quitting', async () => {
  const f = fixture(), states = []; f.service.on('state', state => states.push(state));
  f.service.install(); assert.deepEqual(f.calls, []);
  await f.service.check(); await Promise.all([f.service.download(), f.service.download()]);
  assert.equal(f.engine.autoDownload, false); assert.equal(f.engine.autoInstallOnAppQuit, false);
  assert.equal(f.engine.disableDifferentialDownload, false); assert.equal(f.engine.disableWebInstaller, true);
  assert.equal(f.counts().downloads, 1); assert.ok(states.some(s => s.progress === 52));
  assert.equal(f.service.data.status, 'downloaded');
  f.engine.logger.error('Cannot download differentially, fallback to full download: test');
  assert.equal(f.service.data.downloadKind, 'full');
  f.advance(); await f.service.check(); assert.equal(f.counts().checks, 1);
  f.service.install(); f.service.install();
  assert.deepEqual(f.calls.slice(-2), [['save'], ['install', true, true]]);
});
test('mismatched manifest or tampered file never becomes installable', async () => {
  for (const fault of ['version', 'url', 'sha512', 'digest']) {
    const raw = release(); if (fault === 'digest') raw.assets[0].digest = 'sha256:expected';
    const f = fixture({ fetchRelease: async () => raw, hashFile: async () => 'sha256:wrong' });
    const original = f.engine.checkForUpdates;
    f.engine.checkForUpdates = async () => {
      const result = await original();
      if (fault === 'version') result.updateInfo.version = '1.12.2';
      if (fault === 'url') result.updateInfo.files[0].url = 'https://example.com/file.exe';
      if (fault === 'sha512') result.updateInfo.files[0].sha512 = 'invalid';
      return result;
    };
    await f.service.check(); await f.service.download(); f.service.install();
    assert.equal(f.service.data.status, 'error', fault);
    assert.equal(f.calls.some(c => c[0] === 'install'), false);
    if (fault !== 'digest') assert.equal(f.counts().downloads, 0);
  }
});
test('network failure is retryable and manual editions cannot start the installer', async () => {
  const f = fixture({ mode: 'portable', fetchRelease: async () => { throw Error('offline'); } });
  await f.service.check(); assert.equal(f.service.data.status, 'error');
  f.service.fetchRelease = async () => release(); f.advance(); await f.service.check();
  await f.service.download(); f.service.install(); assert.equal(f.counts().creates, 0);
  await f.service.open('download'); assert.ok(f.calls[0][1].endsWith('Portable-x64.exe'));
});
