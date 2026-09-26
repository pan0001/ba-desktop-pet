const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const fs = require('node:fs');
const { normalizeWindows } = require('./platform.cjs');
function watchWindowSurfaces({ executable, excludePid, screen, onWindows, onError, platform = process.platform }) {
  if (!fs.existsSync(executable)) { onError('窗口检测组件缺失'); return { scan() {}, close() {} }; }
  const child = spawn(executable, [String(excludePid)], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
  let pending = 0, closed = false;
  const reader = createInterface({ input: child.stdout });
  reader.on('line', line => {
    pending = 0;
    try {
      const list = JSON.parse(line);
      if (!Array.isArray(list)) return;
      onWindows(normalizeWindows(list, screen, platform));
    } catch { onError('窗口检测数据异常'); }
  });
  child.on('error', () => { if (!closed) onError('窗口检测组件未能启动'); });
  child.on('exit', () => { if (!closed) onError('窗口检测组件已停止'); });
  child.stdin.on('error', () => {});
  return {
    scan() {
      if (closed || child.exitCode !== null || !child.stdin.writable) return;
      if (pending && Date.now() - pending > 2500) { pending = 0; onWindows([]); onError('窗口检测暂时不可用'); }
      if (!pending) { pending = Date.now(); child.stdin.write('scan\n'); }
    },
    close() { closed = true; reader.close(); if (child.stdin.writable) child.stdin.end('quit\n'); setTimeout(() => { if (child.exitCode === null) child.kill(); }, 1200).unref(); }
  };
}
module.exports = { watchWindowSurfaces };
