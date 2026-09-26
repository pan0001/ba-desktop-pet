const { execFileSync } = require('node:child_process');
const path = require('node:path'), fs = require('node:fs');
if (process.platform !== 'win32') throw new Error('The desktop geometry helper targets Windows.');
const root = path.join(__dirname, '..'), output = path.join(root, 'native/bin');
fs.mkdirSync(output, { recursive: true });
const compiler = path.join(process.env.WINDIR || 'C:/Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
const source = path.join(root, 'native/WindowGeometry.cs'), binary = path.join(output, 'WindowGeometry.exe');
if (fs.existsSync(binary) && fs.statSync(binary).mtimeMs >= fs.statSync(source).mtimeMs) {
  console.log('Windows geometry helper is up to date.'); process.exit(0);
}
execFileSync(compiler, ['/nologo', '/target:exe', '/platform:x64', '/optimize+', '/out:' + binary, source], { stdio: 'inherit', windowsHide: true });
console.log('Built read-only Windows geometry helper.');
