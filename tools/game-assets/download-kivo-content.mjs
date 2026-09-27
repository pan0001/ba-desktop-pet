import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const cache = path.resolve(process.argv[2] || 'test-results/content-import/kivo-content');
const index = JSON.parse(await fs.readFile('test-results/content-import/kivo/index.json', 'utf8'));
const models = JSON.parse(await fs.readFile('test-results/content-import/kivo-fallback-models.json', 'utf8'));
await fs.mkdir(cache, { recursive: true });
const requests = [
  ...models.map(model => ({ kind: 'model', id: model.id, name: model.name, url: model.model_file, file: `models/${model.id}/model.glb` })),
  ...index.students.filter(student => student.avatar).map(student => ({ kind: 'avatar', id: student.id, url: student.avatar, file: `avatars/${student.id}.png` }))
];
let cursor = 0, completed = 0;
const records = [], failures = [];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (cursor < requests.length) {
    const item = requests[cursor++];
    try {
      const url = new URL(item.url.startsWith('//') ? 'https:' + item.url : item.url);
      if (url.protocol !== 'https:' || url.hostname !== 'static.kivo.wiki') throw Error('Unexpected content host');
      const file = path.join(cache, item.file);
      let bytes;
      try { bytes = await fs.readFile(file); } catch {}
      if (!bytes) {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
            if (!response.ok) throw Error(`HTTP ${response.status}`);
            bytes = Buffer.from(await response.arrayBuffer()); break;
          } catch (error) { if (attempt === 2) throw error; }
        }
      }
      const extra = {};
      if (item.kind === 'model') {
        if (bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw Error('Invalid GLB');
        const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
        extra.animations = (gltf.animations || []).map(animation => animation.name);
        extra.halos = (gltf.meshes || []).filter(mesh => /halo/i.test(mesh.name || '') || mesh.primitives.some(p => /halo/i.test(gltf.materials?.[p.material]?.name || ''))).map(mesh => mesh.name);
      } else if (bytes.length < 32 || !((bytes[0] === 137 && bytes.toString('ascii', 1, 4) === 'PNG') || bytes.readUInt16BE(0) === 0xffd8 || bytes.toString('ascii', 8, 12) === 'WEBP')) {
        throw Error('Invalid avatar image');
      }
      await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, bytes);
      records.push({ ...item, ...extra, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    } catch (error) { failures.push({ ...item, error: error.message }); }
    if (++completed % 25 === 0) console.log(`Kivo content ${completed}/${requests.length}; failures=${failures.length}`);
  }
}));
await fs.writeFile(path.join(cache, 'manifest.json'), JSON.stringify({ source: 'https://kivo.wiki/', records, failures }, null, 2));
console.log(`Downloaded ${records.length}; failures=${failures.length}`);
