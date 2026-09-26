const { app, BrowserWindow, screen } = require('electron');
app.whenReady().then(() => {
  const area = screen.getPrimaryDisplay().workArea;
  const window = new BrowserWindow({ x: area.x + 320, y: area.y + Math.round(area.height * .62), width: 660, height: 260, title: 'BA 测试平台', backgroundColor: '#d8eafa', autoHideMenuBar: true, alwaysOnTop: true });
  window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<title>BA 测试平台</title><body style="font:22px Segoe UI;background:#d8eafa;color:#2c648d;padding:32px">桌宠窗口平台测试<br><small>只用于验证站立、跟随和下落。</small></body>'));
});
app.on('window-all-closed', () => app.quit());
