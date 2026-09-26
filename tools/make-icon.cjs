// Code-drawn halo icon. PNG is also wrapped as ICO for Windows packaging.
const fs = require('node:fs'), zlib = require('node:zlib'), path = require('node:path');
const n = 256, raw = Buffer.alloc((n * 4 + 1) * n);
for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
  const dx = x - 128, dy = y - 128, r = Math.hypot(dx, dy);
  let c = r < 121 ? [28, 149 + Math.round(y / 7), 232, 255] : [0, 0, 0, 0];
  const halo = Math.sqrt((dx / 68) ** 2 + ((y - 85) / 26) ** 2);
  if (halo > .76 && halo < 1.04) c = [238, 254, 255, 255];
  if (Math.hypot(dx + 27, y - 143) < 8 || Math.hypot(dx - 27, y - 143) < 8) c = [255, 255, 255, 255];
  if (Math.abs(dx) < 18 && Math.abs(y - (173 - dx * dx / 45)) < 3) c = [255, 255, 255, 255];
  const i = y * (n * 4 + 1) + 1 + x * 4; raw.set(c, i);
}
const crc = b => { let c = 0xffffffff; for (const v of b) { c ^= v; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const t = Buffer.from(type), size = Buffer.alloc(4), checksum = Buffer.alloc(4); size.writeUInt32BE(data.length); checksum.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([size, t, data, checksum]); };
const header = Buffer.alloc(13); header.writeUInt32BE(n); header.writeUInt32BE(n, 4); header[8] = 8; header[9] = 6;
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
fs.writeFileSync(path.join(__dirname, '../assets/app.png'), png);
const ico = Buffer.alloc(22); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4); ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12); ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18);
fs.writeFileSync(path.join(__dirname, '../assets/app.ico'), Buffer.concat([ico, png]));
