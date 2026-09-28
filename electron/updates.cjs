const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');
const fs = require('node:fs');
const REPOSITORY = 'https://github.com/pan0001/ba-desktop-pet';
const RELEASE_API = 'https://api.github.com/repos/pan0001/ba-desktop-pet/releases/latest';

function versionParts(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(value));
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}
function newerVersion(next, current) {
  const preview = /^v?(\d+\.\d+\.\d+)-[0-9A-Za-z.-]+$/.exec(String(current));
  const a = versionParts(next), b = versionParts(preview ? preview[1] : current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return Boolean(preview);
}
function releaseInfo(raw, { version, platform, arch, mode }) {
  if (!raw || raw.draft || raw.prerelease || !versionParts(raw.tag_name)) throw new Error('更新信息不是正式版本，请稍后再试。');
  const next = versionParts(raw.tag_name).join('.');
  if (!newerVersion(next, version)) return null;
  const suffix = platform === 'darwin' ? `macOS-${arch}.dmg` : mode === 'portable' ? 'Portable-x64.exe' : 'Setup-x64.exe';
  const name = `BA-Desktop-Pet-${next}-${suffix}`;
  const base = `${REPOSITORY}/releases/download/${encodeURIComponent(raw.tag_name)}/`;
  const assets = Array.isArray(raw.assets) ? raw.assets : [];
  const asset = assets.find(item => item.name === name && item.browser_download_url === base + name && Number.isSafeInteger(item.size) && item.size > 0);
  if (!asset) throw new Error('这个平台的安装包尚未上传完成，请稍后再试。');
  const manifest = assets.find(item => item.name === 'latest.yml' && item.browser_download_url === base + 'latest.yml');
  const blockmap = assets.find(item => item.name === name + '.blockmap' && item.browser_download_url === base + name + '.blockmap');
  return { version: next, url: `${REPOSITORY}/releases/tag/${encodeURIComponent(raw.tag_name)}`, base,
    notes: typeof raw.body === 'string' ? raw.body : '', asset: { name, url: asset.browser_download_url, size: asset.size, digest: asset.digest || null },
    automatic: mode === 'installed' && Boolean(manifest && blockmap) };
}
async function sha256(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return `sha256:${hash.digest('hex')}`;
}

class UpdateService extends EventEmitter {
  constructor({ version, platform, arch, mode, fetchRelease, createUpdater, openExternal, beforeInstall = () => {}, hashFile = sha256, now = Date.now }) {
    super();
    this.options = { version, platform, arch, mode };
    Object.assign(this, { fetchRelease, createUpdater, openExternal, beforeInstall, hashFile, now });
    this.latest = null; this.engine = null; this.pending = null; this.lastCheck = null;
    this.data = { status: 'idle', currentVersion: version, version: null, mode, automatic: false, progress: 0, transferred: 0, total: 0, downloadKind: null, notes: '', checkedAt: null, message: '' };
  }
  snapshot() { return { ...this.data }; }
  change(patch) { Object.assign(this.data, patch); this.emit('state', this.snapshot()); }
  async exclusive(action) {
    if (this.pending) return this.snapshot();
    const pending = Promise.resolve().then(action); this.pending = pending;
    try { await pending; }
    catch (error) {
      const detail = String(error?.message || '');
      this.change({ status: 'error', message: /校验|版本|上传|更新信息/.test(detail) ? detail : '暂时无法完成更新，请检查网络后重试。' });
    } finally { if (this.pending === pending) this.pending = null; }
    return this.snapshot();
  }
  check() {
    if (this.pending || ['downloaded', 'installing'].includes(this.data.status)) return Promise.resolve(this.snapshot());
    if (this.lastCheck !== null && this.now() - this.lastCheck < 15000) return Promise.resolve(this.snapshot());
    return this.exclusive(async () => {
      this.lastCheck = this.now();
      this.change({ status: 'checking', message: '', progress: 0, downloadKind: null });
      const latest = releaseInfo(await this.fetchRelease(), this.options);
      this.latest = latest;
      this.change({ status: latest ? 'available' : 'current', version: latest?.version || null,
        automatic: Boolean(latest?.automatic), notes: latest?.notes || '', checkedAt: this.now() });
    });
  }
  download() {
    if (this.pending || this.data.status !== 'available' || !this.latest?.automatic) return Promise.resolve(this.snapshot());
    return this.exclusive(async () => {
      const latest = this.latest;
      this.engine?.removeAllListeners('download-progress');
      const engine = this.createUpdater({ provider: 'generic', url: latest.base, useMultipleRangeRequest: false });
      this.engine = engine;
      Object.assign(engine, { autoDownload: false, autoInstallOnAppQuit: false, allowPrerelease: false, allowDowngrade: false, disableWebInstaller: true, disableDifferentialDownload: false });
      engine.logger = { info() {}, warn() {}, error: message => {
        if (String(message).includes('fallback to full download')) this.change({ downloadKind: 'full' });
      } };
      engine.on('error', () => {}); // Rejections are handled below; installation errors have their own listener.
      engine.on('download-progress', progress => this.change({
        progress: Number.isFinite(progress.percent) ? Math.max(0, Math.min(100, progress.percent)) : 0,
        transferred: Number.isFinite(progress.transferred) ? Math.max(0, progress.transferred) : 0,
        total: Number.isFinite(progress.total) ? Math.max(0, progress.total) : 0
      }));
      this.change({ status: 'downloading', progress: 0, transferred: 0, total: 0, downloadKind: 'smart', message: '' });
      const result = await engine.checkForUpdates();
      if (result?.updateInfo?.version !== latest.version || !Array.isArray(result.updateInfo.files)) throw new Error('更新清单版本不一致，请重新检查更新。');
      const files = result.updateInfo.files;
      if (files.some(file => new URL(file.url, latest.base).href !== latest.asset.url) || files.length !== 1 || !/^[A-Za-z0-9+/]{86}==$/.test(files[0].sha512 || '')) throw new Error('更新文件校验信息不完整，请从发布页下载。');
      const downloaded = await engine.downloadUpdate();
      if (!Array.isArray(downloaded) || downloaded.length !== 1) throw new Error('更新文件校验失败，请重试。');
      if (latest.asset.digest && await this.hashFile(downloaded[0]) !== latest.asset.digest) throw new Error('更新文件校验失败，请重新下载。');
      engine.on('error', () => { if (this.data.status === 'installing') this.change({ status: 'error', message: '安装未能启动，请从发布页下载安装。' }); });
      this.change({ status: 'downloaded', progress: 100, message: '' });
    });
  }
  install() {
    if (this.pending || this.data.status !== 'downloaded' || !this.latest?.automatic || !this.engine) return this.snapshot();
    this.change({ status: 'installing', message: '' });
    try { this.beforeInstall(); this.engine.quitAndInstall(true, true); }
    catch { this.change({ status: 'error', message: '安装未能启动，请从发布页下载安装。' }); }
    return this.snapshot();
  }
  async open(kind = 'release') {
    await this.openExternal(kind === 'download' && this.latest ? this.latest.asset.url : this.latest?.url || `${REPOSITORY}/releases/latest`);
    return this.snapshot();
  }
  dispose() { this.engine?.removeAllListeners('download-progress'); this.removeAllListeners(); }
}
module.exports = { UpdateService, releaseInfo, newerVersion, RELEASE_API, REPOSITORY };
