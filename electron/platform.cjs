const path = require('node:path');
function platformOptions(platform = process.platform) {
  const mac = platform === 'darwin';
  return {
    mac, helper: mac ? 'WindowGeometry' : 'WindowGeometry.exe',
    topLevel: mac ? 'floating' : 'pop-up-menu',
    floorName: mac ? '桌面底部（Dock 上方）' : '任务栏上方',
    shortcut: mac ? '⌘ + ⌥ + B' : 'Ctrl + Alt + B'
  };
}
function helperPath(root, resources, packaged, platform = process.platform) {
  return path.join(packaged ? resources : path.join(root, 'native', 'bin'), packaged ? 'native' : '', platformOptions(platform).helper);
}
function normalizeWindows(list, screen, platform = process.platform) {
  if (!Array.isArray(list)) throw new Error('Invalid window list');
  return list.filter(r => r && typeof r.id === 'string' && ['x','y','width','height'].every(k => Number.isFinite(r[k]) && Math.abs(r[k]) <= 1000000) && r.width > 0 && r.height > 0)
    .map(r => {
      // CoreGraphics already returns logical points, with a top-left origin.
      // screenToDipRect is Windows-only; applying Retina scaling again is wrong.
      const rect = { x:r.x, y:r.y, width:r.width, height:r.height };
      return { id:r.id, standable:r.standable === true, ...(platform === 'win32' ? screen.screenToDipRect(null, rect) : rect) };
    });
}
module.exports = { platformOptions, helperPath, normalizeWindows };
