const furnitureIds = new Set(Object.keys(require('../assets/furniture/models.json').items));
const {sanitizeScene} = require('./scene-rules.cjs');
const DEFAULTS = Object.freeze({ characterId: '212', size: 360, alwaysOnTop: true, paused: false, physics: true, roaming: true, windowWalking: true, proactiveEvents: true, x: null, y: null });
const PET_CANVAS_SCALE = 2.6;
// Electron rejects JS -0 even though it is finite and Number.isInteger(-0).
// Adding +0 canonicalizes it without hiding NaN.
const pixelCoordinate = value => Math.round(value) + 0;
function sanitizeSettings(value, validIds) {
  const v = value && typeof value === 'object' ? value : {};
  const size = Number.isFinite(v.size) ? Math.round(Math.min(560, Math.max(220, v.size))) : DEFAULTS.size;
  const oldLayout = v.layoutVersion !== 2;
  return {
    layoutVersion: 2,
    uiLocale: ['zh', 'ja', 'en'].includes(v.uiLocale) ? v.uiLocale : 'zh',
    languageConfigured: v.languageConfigured === true,
    primaryEnabled: v.primaryEnabled !== false,
    characterId: validIds.includes(String(v.characterId)) ? String(v.characterId) : validIds.includes(DEFAULTS.characterId) ? DEFAULTS.characterId : validIds[0],
    size,
    alwaysOnTop: typeof v.alwaysOnTop === 'boolean' ? v.alwaysOnTop : true,
    paused: typeof v.paused === 'boolean' ? v.paused : false,
    physics: typeof v.physics === 'boolean' ? v.physics : true,
    roaming: typeof v.roaming === 'boolean' ? v.roaming : true,
    windowWalking: typeof v.windowWalking === 'boolean' ? v.windowWalking : true,
    effectsEnabled: typeof v.effectsEnabled === 'boolean' ? v.effectsEnabled : true,
    voiceEnabled: typeof v.voiceEnabled === 'boolean' ? v.voiceEnabled : true,
    voiceLanguage: v.voiceLanguage === 'cn' ? 'cn' : 'jp',
    volume: Number.isFinite(v.volume) ? Math.min(1, Math.max(0, v.volume)) : .45,
    idleVoice: typeof v.idleVoice === 'boolean' ? v.idleVoice : true,
    proactiveEvents: typeof v.proactiveEvents === 'boolean' ? v.proactiveEvents : DEFAULTS.proactiveEvents,
    checkUpdatesAutomatically: typeof v.checkUpdatesAutomatically === 'boolean' ? v.checkUpdatesAutomatically : true,
    idleInterval: Number.isFinite(v.idleInterval) ? Math.round(Math.min(600, Math.max(30, v.idleInterval))) : 120,
    furniture: furnitureIds.has(v.furniture) ? v.furniture : 'none',
    desktopScene: sanitizeScene(v.desktopScene, validIds, furnitureIds, validIds.includes(String(v.characterId)) ? String(v.characterId) : DEFAULTS.characterId, v.primaryEnabled !== false),
    x: Number.isFinite(v.x) ? pixelCoordinate(v.x - (oldLayout ? size * (PET_CANVAS_SCALE - .84) / 2 : 0)) : null,
    y: Number.isFinite(v.y) ? pixelCoordinate(v.y - (oldLayout ? size * (PET_CANVAS_SCALE - 1) / 2 : 0)) : null
  };
}
function fitBounds(settings, area) {
  const logicalHeight = Math.min(settings.size, area.height), logicalWidth = Math.min(Math.round(logicalHeight * .84), area.width);
  const height = Math.round(logicalHeight * PET_CANVAS_SCALE), width = height;
  const padX = (width - logicalWidth) / 2, padY = (height - logicalHeight) / 2;
  const x = settings.x === null || settings.x === undefined ? area.x + area.width - logicalWidth - 28 : settings.x + padX;
  const y = settings.y === null || settings.y === undefined ? area.y + area.height - logicalHeight : settings.y + padY;
  // Only the character's logical frame must fit the monitor. Transparent
  // overscan may extend beyond it, without shrinking the character itself.
  return { x: pixelCoordinate(Math.max(area.x, Math.min(x, area.x + area.width - logicalWidth)) - padX),
    y: pixelCoordinate(Math.max(area.y, Math.min(y, area.y + area.height - logicalHeight)) - padY), width, height };
}
function motionPosition(motion) {
  // Electron converts coordinates to signed 32-bit integers in native code.
  // Reject broken simulation values before calling the window API.
  if (!motion || ![motion.x, motion.y].every(v => Number.isFinite(v) && Math.abs(v) <= 1000000)) return null;
  return { x: pixelCoordinate(motion.x), y: pixelCoordinate(motion.y) };
}
function assetPath(url, root) {
  const path = require('node:path');
  const parsed = new URL(url);
  if (parsed.protocol !== 'pet:' || parsed.hostname !== 'app') return null;
  let relative;
  try { relative = decodeURIComponent(parsed.pathname).replace(/^\/+/, ''); } catch { return null; }
  if (!/^(?:assets\/|scripts\/|renderer\/|pet\.html$|furniture\.html$|settings\.html$)/.test(relative)) return null;
  const target = path.resolve(root, relative);
  const local = path.relative(root, target);
  if (local.startsWith('..') || path.isAbsolute(local) || relative.includes('\0')) return null;
  return target;
}
module.exports = { DEFAULTS, PET_CANVAS_SCALE, sanitizeSettings, fitBounds, assetPath, motionPosition };
