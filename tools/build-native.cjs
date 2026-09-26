const { execFileSync } = require('node:child_process');
const path = require('node:path'), fs = require('node:fs');
if (!['win32','darwin'].includes(process.platform)) throw new Error('Build on Windows or macOS.');
const root = path.join(__dirname, '..'), output = path.join(root, 'native/bin');
fs.mkdirSync(output, { recursive: true });
if (process.platform === 'darwin') {
  if (!['x64','arm64'].includes(process.arch)) throw new Error('Unsupported Mac architecture.');
  const source = path.join(root, 'native/WindowGeometry.swift'), binary = path.join(output, 'WindowGeometry');
  const target = `${process.arch === 'x64' ? 'x86_64' : 'arm64'}-apple-macosx13.0`;
  execFileSync('xcrun', ['swiftc', '-O', '-target', target, '-framework', 'CoreGraphics', source, '-o', binary], { stdio: 'inherit' });
  fs.chmodSync(binary, 0o755);
  const iconStage = fs.mkdtempSync(path.join(output, '.icon-'));
  try {
    const iconset = path.join(iconStage, 'app.iconset'); fs.mkdirSync(iconset);
    for (const size of [16,32,128,256,512]) for (const scale of [1,2]) {
      execFileSync('sips', ['-z', String(size * scale), String(size * scale), path.join(root,'assets/app.png'), '--out', path.join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`)], { stdio: 'ignore' });
    }
    execFileSync('iconutil', ['-c','icns',iconset,'-o',path.join(output,'app.icns')], { stdio:'inherit' });
  } finally {
    if (path.dirname(path.resolve(iconStage)) !== path.resolve(output)) throw new Error('Unexpected icon staging path');
    fs.rmSync(iconStage,{ recursive:true, force:true });
  }
  console.log(`Built read-only macOS ${process.arch} geometry helper.`); process.exit(0);
}
const compiler = path.join(process.env.WINDIR || 'C:/Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
const source = path.join(root, 'native/WindowGeometry.cs'), binary = path.join(output, 'WindowGeometry.exe');
if (fs.existsSync(binary) && fs.statSync(binary).mtimeMs >= fs.statSync(source).mtimeMs) {
  console.log('Windows geometry helper is up to date.'); process.exit(0);
}
execFileSync(compiler, ['/nologo', '/target:exe', '/platform:x64', '/optimize+', '/out:' + binary, source], { stdio: 'inherit', windowsHide: true });
console.log('Built read-only Windows geometry helper.');
