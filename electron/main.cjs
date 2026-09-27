const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, protocol, net, screen, session, globalShortcut, powerMonitor, dialog, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { sanitizeSettings, fitBounds, assetPath, motionPosition, PET_CANVAS_SCALE } = require('./core.cjs');
const { DesktopWorld } = require('./world.cjs');
const { watchWindowSurfaces } = require('./window-surfaces.cjs');
const { CareSystem } = require('./care.cjs');
const { platformOptions, helperPath } = require('./platform.cjs');
const { UpdateService, RELEASE_API } = require('./updates.cjs');
const desktopPlatform = platformOptions();
const root = path.join(__dirname, '..');
const testing = process.argv.includes('--test-mode');
if (testing) app.setPath('userData', process.env.BA_PET_TEST_PROFILE || path.join(root, 'test-results', 'profile'));
if (process.platform === 'win32') app.setAppUserModelId('local.inuni.ba-desktop-pet');
protocol.registerSchemesAsPrivileged([{ scheme: 'pet', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
const characters = JSON.parse(fs.readFileSync(path.join(root, 'assets/characters.json')));
let petWindow, settingsWindow, tray, settings, settingsPath, cursorTimer, saveTimer;
let hidden = false, quitting = false, ready = false, drag = null, ignoring = false, suspended = false, testCursor = null;
let petExtent = null;
let updates, updateTimer, updateInterval;
function movePet(x, y) {
  // setPosition reads rounded DIP bounds back on Windows. At fractional DPI,
  // feeding that size into the next native move repeatedly grows the window.
  // Keep the requested extent, never an OS-rounded measurement, as the source.
  petWindow.setBounds({ x, y, ...petExtent });
}
const world = new DesktopWorld();
let geometryReady = false, scanner, scanTimer, movementTimer, lastTick = 0, lastSave = 0, windowRects = [], windowWarning = '';
let lastMotion = null, positionDirty = false, savedSettings = '';
let care, carePath, careTimer, careSaveTimer, savedCare = '', lastCareTick = 0;
let initiativeHold = null;
function endInitiative(reason = 'cancelled', notify = true) {
  const previous = initiativeHold;
  if (!previous) return;
  initiativeHold = null;
  configureWorld();
  if (notify) send(petWindow, 'pet:initiative-cancel', { id: previous.id, reason });
}
function initiative(value) {
  if (!value || typeof value.id !== 'string' || !/^initiative-\d{1,12}$/.test(value.id)) return { ok: false };
  if (value.phase === 'idle') {
    if (initiativeHold?.id === value.id && initiativeHold.characterId === value.characterId) endInitiative('released', false);
    return { ok: true };
  }
  if (value.characterId !== settings.characterId) return { ok: false };
  if (value.phase === 'responding') {
    if (initiativeHold?.id !== value.id || initiativeHold.phase !== 'waiting') return { ok: false };
    initiativeHold.phase = 'responding'; initiativeHold.until = Date.now() + 35000;
    return { ok: true };
  }
  const companion = care?.snapshot(settings.characterId);
  if (value.phase !== 'waiting' || initiativeHold || !settings.proactiveEvents || !careActive() || drag
    || world.reaction || !['idle', 'walk'].includes(world.mode) || (world.options.roaming && !world.platform) || world.options.busy || world.options.menuOpen
    || settings.furniture !== 'none' || companion?.resting || (companion?.energy ?? 100) < 25) return { ok: false };
  initiativeHold = { id: value.id, phase: 'waiting', characterId: settings.characterId, until: Date.now() + 60000 };
  configureWorld();
  sendMotion(world.step(0));
  return { ok: true };
}
const careActions = new Set(['tap', 'pet', 'snack', 'gift', 'play', 'rest', 'claim']);
function flushCare() {
  if (!care || !carePath) return;
  try {
    const contents = JSON.stringify(care.serialize(), null, 2);
    if (contents !== savedCare) {
      fs.writeFileSync(carePath + '.tmp', contents);
      fs.renameSync(carePath + '.tmp', carePath); savedCare = contents;
    }
  } catch (error) { console.error('Care progress could not be saved:', error.message); }
}
function saveCare() { clearTimeout(careSaveTimer); careSaveTimer = setTimeout(flushCare, 180); }
function careActive() { return geometryReady && !hidden && !suspended && !settings.paused && petWindow?.isVisible() && !petWindow.isMinimized(); }
function configureWorld() {
  const companion = care?.snapshot(settings.characterId);
  world.configure({ ...settings, roaming: settings.roaming && !initiativeHold && !companion?.resting && (companion?.energy ?? 100) > 20 });
}
function settleCare(seconds) {
  if (!care || !settings) return;
  const now = Date.now(), elapsed = seconds ?? (lastCareTick ? (now - lastCareTick) / 1000 : 0);
  lastCareTick = now;
  // Discard long timer gaps (sleep or a blocked process), never credit offline time.
  const result = care.tick(settings.characterId, { active: careActive(), seconds: elapsed >= 0 && elapsed <= 60 ? elapsed : 0 });
  if (result.changed) { saveCare(); configureWorld(); publish(); }
  if (result.event) send(petWindow, 'pet:care-event', { ...result.event, action: 'companionship', characterId: settings.characterId, care: care.snapshot(settings.characterId) });
}
function careAction(action, characterId = settings.characterId) {
  if (characterId !== settings.characterId || !care || (!careActions.has(action) && action !== 'assist')) return { ok: false, changed: false, message: '角色已切换，请重新操作。', state: state() };
  if (['tap', 'pet', 'assist'].includes(action) && !careActive()) return { ok: false, changed: false, message: '伙伴正在休息，稍后再互动吧。', state: state() };
  settleCare();
  if (!['tap', 'pet', 'assist'].includes(action)) endInitiative('care');
  const result = care.act(characterId, action);
  if (result.changed) { saveCare(); configureWorld(); publish(); }
  if (result.ok) send(petWindow, 'pet:care-event', { ...result, action, characterId, care: care.snapshot(characterId) });
  return { ...result, state: state() };
}
function sendMotion(motion) {
  const value = { ...motion, physics: settings.physics };
  // Standing still and paused pets need no identical motion IPC every 33 ms.
  if (lastMotion && ['x', 'y', 'vx', 'vy', 'direction', 'mode', 'platform', 'dragging', 'physics', 'thrown'].every(key => value[key] === lastMotion[key])
    && value.reaction?.id === lastMotion.reaction?.id && value.reaction?.phase === lastMotion.reaction?.phase && value.reaction?.outcome === lastMotion.reaction?.outcome) return;
  lastMotion = value; send(petWindow, 'pet:motion', value);
}
const state = () => ({ ...settings, hidden, windowWarning, platform: process.platform, version: app.getVersion(), canvasScale: PET_CANVAS_SCALE,
  canvasWidth: petExtent?.width, canvasHeight: petExtent?.height,
  measureFrames: testing && process.argv.includes('--measure-pet'), characters, care: care?.snapshot(settings.characterId) ?? null, updates: updates?.snapshot() ?? null });
function environment() {
  configureWorld();
  world.environment(windowRects, screen.getAllDisplays().map(display => ({ id: display.id, ...display.workArea })));
}
function movementTick() {
  const now = Date.now(), delta = lastTick ? (now - lastTick) / 1000 : 0; lastTick = now;
  if (initiativeHold && (now >= initiativeHold.until || !careActive() || world.reaction || ['fall', 'held'].includes(world.mode))) endInitiative('interrupted');
  if (!geometryReady || hidden || suspended || !petWindow || petWindow.isDestroyed()) return;
  const motion = world.step(delta);
  const position = motionPosition(motion);
  if (!position) {
    console.warn('Recovered invalid pet motion:', motion.x, motion.y, motion.mode);
    endDrag(); place(true); send(petWindow, 'pet:action', 'recover'); save(); return;
  }
  if (!drag) {
    const { x, y } = position, bounds = petWindow.getBounds();
    if (x !== bounds.x || y !== bounds.y) { movePet(x, y); settings.x = x; settings.y = y; positionDirty = true; }
    if (positionDirty && now - lastSave > 3000) { lastSave = now; save(); }
  }
  sendMotion(motion);
}
function send(win, channel, value) { if (win && !win.isDestroyed()) win.webContents.send(channel, value); }
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const contents = JSON.stringify(settings, null, 2);
      if (contents !== savedSettings) { fs.writeFileSync(settingsPath + '.tmp', contents); fs.renameSync(settingsPath + '.tmp', settingsPath); savedSettings = contents; }
      positionDirty = false;
    }
    catch (error) { console.error('Settings could not be saved:', error.message); }
  }, 180);
}
function publish() { send(petWindow, 'pet:state', state()); send(settingsWindow, 'pet:state', state()); updateTray(); }
function displayArea() {
  if (Number.isFinite(settings.x) && Number.isFinite(settings.y)) return screen.getDisplayNearestPoint({ x: settings.x, y: settings.y }).workArea;
  return screen.getPrimaryDisplay().workArea;
}
function place(reset = false) {
  if (reset) { settings.x = null; settings.y = null; }
  const bounds = fitBounds(settings, reset ? screen.getPrimaryDisplay().workArea : displayArea());
  petExtent = { width: bounds.width, height: bounds.height };
  petWindow.setBounds(bounds);
  world.place(bounds); environment();
  settings.x = bounds.x; settings.y = bounds.y;
}
function mouseThrough(value) {
  if (!petWindow || petWindow.isDestroyed() || ignoring === value) return;
  ignoring = value;
  petWindow.setIgnoreMouseEvents(value, { forward: true });
}
function endDrag(allowThrow = false) {
  if (!drag) return;
  const moved = drag.moved;
  drag = null;
  const bounds = petWindow.getBounds();
  // A native window move may still be queued when mouseup arrives. Keep the
  // latest requested cursor position instead of sampling a stale bounds jump.
  const point = allowThrow === true && moved ? motionPosition(world) || bounds : bounds;
  settings.x = point.x; settings.y = point.y;
  const now = Date.now();
  world.dragTo(point.x, point.y, now);
  world.release({ now, allowThrow: allowThrow === true && moved && !hidden && !suspended }); save();
  send(petWindow, 'pet:drag', false);
  sendMotion(world.snapshot());
}
function showPet() {
  settleCare();
  const wasHidden = hidden; hidden = false; if (wasHidden) place(); petWindow.showInactive();
  petWindow.setAlwaysOnTop(settings.alwaysOnTop, desktopPlatform.topLevel);
  send(petWindow, 'pet:action', suspended ? 'suspend' : 'resume'); publish();
}
function hidePet() { settleCare(); endInitiative('hidden'); endDrag(); hidden = true; send(petWindow, 'pet:action', 'suspend'); petWindow.hide(); publish(); }
function secureWindow(win) {
  if (testing) win.webContents.setAudioMuted(true);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer stopped:', details.reason);
    if (win === petWindow) endInitiative('renderer-stopped', false);
    if (!quitting) dialog.showErrorBox('BA桌宠', '显示进程已停止。请退出后重新启动桌宠。');
  });
}
const preferences = () => ({ preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' });
function openSettings(section) {
  if (settingsWindow && !settingsWindow.isDestroyed()) { settingsWindow.show(); settingsWindow.focus(); if(section === 'updates')send(settingsWindow,'pet:section','updates'); return; }
  settingsWindow = new BrowserWindow({ title: 'BA桌宠 · 设置', width: 1060, height: 780, minWidth: 780, minHeight: 620,
    backgroundColor: '#d9edf7', autoHideMenuBar: true, show: false, icon: path.join(root, 'assets/app.png'), webPreferences: preferences() });
  secureWindow(settingsWindow);
  settingsWindow.loadURL(`pet://app/settings.html${section === 'updates' ? '#updates' : ''}`);
  settingsWindow.once('ready-to-show', () => settingsWindow.show());
  settingsWindow.on('closed', () => { settingsWindow = null; });
}
function commands(command) {
  switch (command) {
    case 'settings': openSettings(); break;
    case 'hide': hidePet(); break;
    case 'show': showPet(); break;
    case 'reset': endInitiative('reset'); endDrag(); place(true); showPet(); save(); break;
    case 'interact': showPet(); world.interact(); send(petWindow, 'pet:action', 'interact'); break;
    case 'pause': settleCare(); endInitiative('pause'); settings.paused = !settings.paused; configureWorld(); save(); publish(); break;
    case 'roaming': settings.roaming = !settings.roaming; environment(); save(); publish(); break;
    case 'recover': endInitiative('recover'); endDrag(); world.cancelReaction(); world.interact(2); send(petWindow, 'pet:action', 'recover'); break;
    case 'assist': if (world.reaction?.phase === 'help' && !settings.paused && !hidden && !suspended) { world.assist(); careAction('assist'); } break;
    case 'voice-preview': endInitiative('voice-preview'); send(petWindow, 'pet:action', 'voice-preview'); break;
    case 'initiative-preview': send(petWindow, 'pet:action', 'initiative-preview'); break;
    case 'quit': app.quit(); break;
    case 'menu': endInitiative('menu'); world.configure({ menuOpen: true }); Menu.buildFromTemplate(menuItems()).popup({ window: petWindow, callback: () => world.configure({ menuOpen: false }) }); break;
  }
}
function menuItems() {
  const selected = characters.find(c => c.id === settings.characterId);
  const companion = care?.snapshot(settings.characterId);
  return [
    { label: `BA桌宠 ${app.getVersion()} · ${selected?.name || ''}`, enabled: false }, { type: 'separator' },
    { label: '角色与设置…', click: openSettings },
    { label: updates?.data.status === 'downloaded' ? '更新已下载，重启安装…' : updates?.data.version ? `发现新版 v${updates.data.version}…` : '检查更新…', click: () => openSettings('updates') },
    { label: hidden ? '显示桌宠' : '隐藏桌宠', click: () => commands(hidden ? 'show' : 'hide') },
    { label: '互动一下', click: () => commands('interact') },
    { label: companion ? `羁绊 Lv.${companion.level} · ${companion.title}` : '日常照顾', submenu: ['snack', 'gift', 'play', 'rest'].map(action => ({
      label: companion?.actions[action]?.label || action, enabled: Boolean(companion?.actions[action]?.available), click: () => careAction(action)
    })) },
    { label: '恢复待机动作', click: () => commands('recover') },
    { label: '暂停动画', type: 'checkbox', checked: settings.paused, click: () => commands('pause') },
    { label: '自主散步', type: 'checkbox', checked: settings.roaming, click: () => commands('roaming') },
    { label: '找回桌宠 / 重置位置', click: () => commands('reset') },
    { type: 'separator' }, { label: '退出桌宠', click: () => commands('quit') }
  ];
}
function updateTray() { if (tray) tray.setContextMenu(Menu.buildFromTemplate(menuItems())); }
function isOwn(event) { return [petWindow?.webContents, settingsWindow?.webContents].includes(event.sender) && event.senderFrame?.url.startsWith('pet://app/'); }
function isPet(event) { return isOwn(event) && event.sender === petWindow?.webContents; }
function registerIPC() {
  ipcMain.handle('pet:state', event => isOwn(event) ? state() : null);
  ipcMain.handle('pet:updater', async (event, action) => {
    if (!isOwn(event) || event.sender !== settingsWindow?.webContents || event.senderFrame !== event.sender.mainFrame || !updates) return null;
    if (action === 'check') return updates.check();
    if (action === 'download') return updates.download();
    if (action === 'install') return updates.install();
    if (action === 'release' || action === 'manual-download') {
      try { return await updates.open(action === 'manual-download' ? 'download' : 'release'); }
      catch { return { ...updates.snapshot(), message: '无法打开浏览器，请稍后重试。' }; }
    }
    return null;
  });
  ipcMain.handle('pet:initiative', (event, value) => isPet(event) ? initiative(value) : { ok: false });
  ipcMain.handle('pet:care', (event, value) => {
    if (!isOwn(event) || !value || typeof value !== 'object' || !careActions.has(value.action) || typeof value.characterId !== 'string') return null;
    if (['tap', 'pet'].includes(value.action) && !isPet(event)) return null;
    return careAction(value.action, value.characterId);
  });
  ipcMain.handle('pet:update', (event, patch) => {
    if (!isOwn(event) || !patch || typeof patch !== 'object') return null;
    settleCare();
    const allowed = {};
    for (const key of ['characterId', 'size', 'alwaysOnTop', 'paused', 'physics', 'roaming', 'windowWalking', 'voiceEnabled', 'voiceLanguage', 'volume', 'idleVoice', 'idleInterval', 'furniture', 'effectsEnabled', 'proactiveEvents', 'checkUpdatesAutomatically']) if (Object.hasOwn(patch, key)) allowed[key] = patch[key];
    if (allowed.characterId && allowed.characterId !== settings.characterId) allowed.furniture = 'none';
    const previous = settings;
    settings = sanitizeSettings({ ...settings, ...allowed }, characters.map(c => c.id));
    if (['characterId', 'size', 'paused', 'furniture', 'voiceEnabled', 'voiceLanguage', 'proactiveEvents'].some(key => settings[key] !== previous[key])) endInitiative('settings');
    if (!characters.find(c => c.id === settings.characterId)?.animations.includes('Aris_Original_Cafe_my_gamedevdept_01_sofa_01_01')) settings.furniture = 'none';
    if (settings.characterId !== previous.characterId) {
      endDrag(); geometryReady = false; world.cancelReaction(); world.platform = null; world.mode = 'idle'; world.canWalk = false; world.canFall = false;
      if (care.tick(settings.characterId, { active: false, seconds: 0 }).changed) saveCare();
    }
    if (settings.size !== previous.size) {
      endDrag();
      settings.x += (previous.size - settings.size) * PET_CANVAS_SCALE / 2;
      settings.y += (previous.size - settings.size) * (PET_CANVAS_SCALE / 2 + .385);
      place();
    }
    if (settings.furniture !== previous.furniture && settings.furniture !== 'none' && geometryReady) {
      world.interact(2);
      const point = motionPosition({ x: world.x + world.foot.x, y: world.y + world.foot.y });
      if (point) {
        const area = screen.getDisplayNearestPoint(point).workArea, unit = world.bodyHeight / 2.8;
        // Leave room for the furniture pose's swept hair/weapon silhouette.
        // This is display placement only; the hair still has no collider.
        const left = Math.max(area.x + unit * 2.4, world.platform ? world.platform.left + world.foot.radius : -Infinity);
        const right = Math.min(area.x + area.width - unit * 2.4, world.platform ? world.platform.right - world.foot.radius : Infinity);
        if (left <= right) world.x = Math.max(left, Math.min(point.x, right)) - world.foot.x;
      }
    }
    petWindow.setAlwaysOnTop(settings.alwaysOnTop, desktopPlatform.topLevel);
    environment();
    save(); publish(); return state();
  });
  ipcMain.on('pet:command', (event, command) => { if (isOwn(event) && typeof command === 'string') commands(command); });
  ipcMain.on('pet:hit', (event, hit) => { if (isPet(event) && !drag) mouseThrough(!hit); });
  ipcMain.on('pet:drag-start', (event, point) => {
    if (!isPet(event) || drag || !ready || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    const bounds = petWindow.getBounds();
    if (point.x < 0 || point.y < 0 || point.x > bounds.width || point.y > bounds.height) return;
    endInitiative('drag');
    // Derive the grab point from the original event: the OS cursor can already
    // have moved by the time this IPC message arrives during a quick drag.
    drag = { cursor: { x: bounds.x + point.x, y: bounds.y + point.y }, bounds, moved: false };
    const now = Date.now(); world.grab(now); world.dragTo(bounds.x, bounds.y, now);
    if (settings.windowWalking && !settings.paused) scanner?.scan();
    mouseThrough(false);
  });
  ipcMain.on('pet:drag-move', event => { if (isPet(event) && drag) pollCursor(); });
  ipcMain.on('pet:drag-end', (event, allowThrow) => { if (isPet(event)) { if (drag) pollCursor(); endDrag(allowThrow === true); } });
  ipcMain.on('pet:ready', event => {
    if (!isPet(event)) return;
    ready = true;
    if (!hidden) petWindow.showInactive();
  });
  ipcMain.on('pet:geometry', (event, value) => {
    if (!isPet(event) || !value || !['x', 'y', 'radius', 'bodyHeight'].every(k => Number.isFinite(value[k]))) return;
    const bounds = petWindow.getBounds();
    if (value.x < 0 || value.x > bounds.width || value.y < 0 || value.y > bounds.height || value.radius < 1 || value.radius > bounds.width / 2 || value.bodyHeight < 1 || value.bodyHeight > bounds.height) return;
    if (!geometryReady) lastCareTick = Date.now();
    world.width = bounds.width; world.height = bounds.height; world.geometry(value); geometryReady = true; environment();
  });
  ipcMain.on('pet:animation', (event, mode) => {
    if (!isPet(event) || !['idle', 'walk', 'held', 'intro', 'interaction', 'landing', 'recovering', 'help', 'furniture'].includes(mode)) return;
    world.configure({ busy: !['idle', 'walk'].includes(mode) });
    if (mode === 'interaction') world.interact();
  });
  ipcMain.on('pet:reaction', (event, value) => {
    if (!isPet(event) || !value || !Number.isSafeInteger(value.id) || !['help', 'done'].includes(value.phase)) return;
    world.reactionStatus(value.id, value.phase);
  });
}
function pollCursor() {
  if (hidden || suspended || !petWindow || petWindow.isDestroyed()) return;
  const cursor = testCursor || screen.getCursorScreenPoint();
  const now = Date.now();
  if (drag) {
    const dx = cursor.x - drag.cursor.x, dy = cursor.y - drag.cursor.y;
    if (!drag.moved && Math.hypot(dx, dy) > 4) { drag.moved = true; send(petWindow, 'pet:drag', true); }
    if (drag.moved) {
      const position = motionPosition({ x: drag.bounds.x + dx, y: drag.bounds.y + dy });
      if (!position) return;
      // Repositioning an unchanged window can produce another pointermove and
      // feed a stream of duplicate drag samples back through the renderer.
      const bounds = petWindow.getBounds();
      if (position.x !== bounds.x || position.y !== bounds.y) movePet(position.x, position.y);
      world.dragTo(position.x, position.y, now);
      sendMotion(world.snapshot(world.dragVx, world.dragVy));
    }
    return;
  }
  const bounds = petWindow.getBounds();
  const x = cursor.x - bounds.x, y = cursor.y - bounds.y;
  if (x < 0 || y < 0 || x >= bounds.width || y >= bounds.height) mouseThrough(true);
  else send(petWindow, 'pet:cursor', { x, y });
}
function startUpdates() {
  const directory = path.dirname(process.execPath);
  const mode = !app.isPackaged ? 'development' : process.platform === 'darwin' ? 'mac'
    : process.env.PORTABLE_EXECUTABLE_FILE ? 'portable' : fs.existsSync(path.join(directory, '.ba-nsis-install')) ? 'installed' : 'unpacked';
  updates = new UpdateService({ version: app.getVersion(), platform: process.platform, arch: process.arch, mode,
    fetchRelease: async () => {
      const response = await net.fetch(RELEASE_API, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': `BA-Desktop-Pet/${app.getVersion()}` }, signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
      return response.json();
    },
    createUpdater: options => {
      const { NsisUpdater } = require('electron-updater');
      const engine = new NsisUpdater(options); engine.installDirectory = directory; return engine;
    },
    openExternal: url => shell.openExternal(url),
    beforeInstall: () => { settleCare(); flushCare(); if(settingsPath)fs.writeFileSync(settingsPath,JSON.stringify(settings,null,2)); }
  });
  let menuState = '';
  updates.on('state', value => {
    send(settingsWindow, 'pet:updater-state', value);
    const key = `${value.status}:${value.version}`;
    if (key !== menuState) { menuState = key; updateTray(); }
  });
  if (!testing && app.isPackaged) {
    const check = () => { if(settings.checkUpdatesAutomatically)void updates.check(); };
    updateTimer = setTimeout(check, 15000); updateInterval = setInterval(check, 6 * 60 * 60 * 1000);
  }
}
if (!testing && !app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (petWindow) { showPet(); openSettings(); } });
  app.whenReady().then(() => {
    settingsPath = path.join(app.getPath('userData'), 'settings.json');
    let stored = {};
    try { stored = JSON.parse(fs.readFileSync(settingsPath)); } catch {}
    settings = sanitizeSettings(stored, characters.map(c => c.id));
    carePath = path.join(app.getPath('userData'), 'care.json');
    let storedCare = {};
    try { storedCare = JSON.parse(fs.readFileSync(carePath, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') {
        try { fs.copyFileSync(carePath, carePath + '.invalid-' + Date.now()); } catch {}
        console.warn('Care progress was unreadable; preserved a backup when possible.');
      }
    }
    care = new CareSystem({ characters, stored: storedCare }); lastCareTick = Date.now();
    if (care.tick(settings.characterId, { active: false, seconds: 0 }).changed) saveCare();
    protocol.handle('pet', request => {
      const file = assetPath(request.url, root);
      if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(file).href);
    });
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    Menu.setApplicationMenu(desktopPlatform.mac ? Menu.buildFromTemplate([
      { label: app.name, submenu: [{ label: '角色与设置…', click: openSettings }, { type: 'separator' }, { role: 'quit' }] },
      { role: 'editMenu' }, { role: 'windowMenu' }
    ]) : null);
    startUpdates(); registerIPC();
    const initialBounds = fitBounds(settings, displayArea());
    petExtent = { width: initialBounds.width, height: initialBounds.height };
    petWindow = new BrowserWindow({ ...initialBounds, title: 'BA桌宠', frame: false, transparent: true,
      backgroundColor: '#00000000', hasShadow: false, resizable: false, maximizable: false, fullscreenable: false,
      skipTaskbar: true, alwaysOnTop: settings.alwaysOnTop, show: false, icon: path.join(root, 'assets/app.png'), webPreferences: preferences() });
    secureWindow(petWindow);
    // Electron's default floating level can be placed below ordinary windows
    // on Windows. Use an explicit topmost level, including after showing again.
    petWindow.setAlwaysOnTop(settings.alwaysOnTop, desktopPlatform.topLevel);
    if (desktopPlatform.mac) petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    world.place(petWindow.getBounds()); environment();
    petWindow.on('close', event => { if (!quitting) { event.preventDefault(); hidePet(); } });
    petWindow.on('blur', endDrag);
    for (const event of ['minimize', 'restore', 'show']) petWindow.on(event, () => { lastCareTick = Date.now(); });
    petWindow.webContents.on('did-fail-load', (_event, code, description) => { if (code !== -3) console.error(description); });
    petWindow.loadURL('pet://app/pet.html');
    tray = new Tray(nativeImage.createFromPath(path.join(root, 'assets/app.png')).resize({ width: 32, height: 32 }));
    tray.setToolTip(desktopPlatform.mac ? 'BA桌宠 · 点击打开菜单' : 'BA桌宠 · 双击打开设置');
    tray.on('double-click', openSettings);
    updateTray();
    globalShortcut.register('CommandOrControl+Alt+B', () => commands(hidden ? 'show' : 'hide'));
    cursorTimer = setInterval(pollCursor, 40);
    const executable = helperPath(root, process.resourcesPath, app.isPackaged);
    scanner = watchWindowSurfaces({ executable, excludePid: process.pid, screen,
      onWindows(rects) { windowRects = rects; environment(); if (windowWarning) { windowWarning = ''; publish(); } },
      onError() { windowRects = []; environment(); if (!windowWarning) { windowWarning = `窗口边缘暂不可用，仍可在${desktopPlatform.floorName}散步`; publish(); } }
    });
    const scan = () => { if (settings.windowWalking && (settings.roaming || drag || world.mode === 'fall') && !hidden && !suspended && !settings.paused) scanner.scan(); };
    scan(); scanTimer = setInterval(scan, 450); movementTimer = setInterval(movementTick, 33);
    careTimer = setInterval(settleCare, 30000);
    for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(event, () => { endDrag(); place(); save(); });
    const suspend = () => { settleCare(); endInitiative('suspend'); suspended = true; flushCare(); endDrag(); send(petWindow, 'pet:action', 'suspend'); };
    const resume = () => { lastCareTick = Date.now(); suspended = false; if (!hidden) send(petWindow, 'pet:action', 'resume'); };
    powerMonitor.on('suspend', suspend); powerMonitor.on('lock-screen', suspend);
    powerMonitor.on('resume', resume); powerMonitor.on('unlock-screen', resume);
    if (!testing && !fs.existsSync(settingsPath)) openSettings();
  }).catch(error => { console.error(error); dialog.showErrorBox('BA桌宠启动失败', error.message); app.quit(); });
}
app.on('window-all-closed', () => {});
app.on('activate', () => { if (ready && petWindow && !petWindow.isDestroyed()) { showPet(); openSettings(); } });
app.on('before-quit', () => {
  clearTimeout(updateTimer); clearInterval(updateInterval); updates?.dispose();
  settleCare(); clearInterval(careTimer); clearTimeout(careSaveTimer); flushCare();
  quitting = true; clearInterval(cursorTimer); clearInterval(scanTimer); clearInterval(movementTimer); scanner?.close(); clearTimeout(saveTimer); globalShortcut.unregisterAll();
  if (settings && settingsPath) { try { fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2)); } catch {} }
  tray?.destroy();
});
// Internal diagnostics are accessible to Electron integration tests, never to web content.
module.exports = { diagnostics: () => ({ world: world.snapshot(), foot: world.foot, bounds: petWindow?.getBounds(), cursor: testCursor || screen.getCursorScreenPoint(), surfaces: world.surfaces, geometryReady, hairPhysics: settings?.physics,
  care: care?.snapshot(settings?.characterId), effectiveRoaming: world.options.roaming, initiative: initiativeHold,
  throwSamples: testing ? world.dragSamples : undefined }) };
if (testing) module.exports.testPlace = bounds => { petExtent = { width: bounds.width, height: bounds.height }; petWindow.setBounds(bounds); world.place(bounds); environment(); world.release(); };
if (testing) module.exports.testRandom = value => { world.random = () => value; };
if (testing) module.exports.testInvalidMotion = () => { world.x = NaN; };
if (testing) module.exports.testCursor = point => { testCursor = point; pollCursor(); };
if (testing) module.exports.testMotionPosition = point => { world.x = point.x; world.y = point.y; };
if (testing) module.exports.testCareTick = seconds => { settleCare(seconds); return care.snapshot(settings.characterId); };
if (testing) module.exports.testUpdatesService = () => updates;
