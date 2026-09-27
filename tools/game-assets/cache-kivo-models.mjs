import fs from 'node:fs/promises';
import path from 'node:path';
import dns from 'node:dns/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const run = promisify(execFile), root = fileURLToPath(new URL('../../', import.meta.url));
const read = async file => JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
const index = await read('test-results/content-import/kivo/index.json');
const overrides = await read('tools/game-assets/student-overrides.json');
const imported = await read('assets/media/student-imports.json');
const wanted = new Set(Object.values(imported.students).flatMap(s => s.models).filter(m => m.origin !== 'existing').map(m => Number(m.id)));
for (const models of Object.values(overrides.additionalModels || {})) for (const model of models) wanted.add(model.id);
const models = [...new Map([...index.students.flatMap(s => s.models), ...Object.values(overrides.additionalModels || {}).flat()].filter(m => wanted.has(m.id)).map(m => [m.id, m])).values()];
const edgeOption = process.argv.find(arg => arg.startsWith('--edges='))?.slice(8);
const addresses = edgeOption ? edgeOption.split(',') : [...new Set((await dns.lookup('static.kivo.wiki', { all: true, family: 4 })).map(a => a.address))];
if (!addresses.length || addresses.some(address => !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(address))) throw Error('Expected IPv4 CDN endpoints');
const valid = async file => { try { const b = await fs.readFile(file); return b.length >= 20 && b.toString('ascii', 0, 4) === 'glTF' && b.readUInt32LE(8) === b.length; } catch { return false; } };
let cursor = 0, complete = 0; const failures = [];
await Promise.all(Array.from({ length: 8 }, async (_, worker) => {
  while (cursor < models.length) {
    const model = models[cursor++], file = path.join(root, `test-results/content-import/kivo-content/models/${model.id}/model.glb`);
    if (await valid(file)) { complete++; continue; }
    const url = new URL(model.model_file, 'https://kivo.wiki');
    if (url.protocol !== 'https:' || url.hostname !== 'static.kivo.wiki') throw Error(`Unexpected model host: ${model.id}`);
    await fs.mkdir(path.dirname(file), { recursive: true });
    let done = false;
    for (let attempt = 0; attempt < addresses.length; attempt++) {
      const address = addresses[(worker + attempt) % addresses.length];
      try {
        await run(process.platform === 'win32' ? 'curl.exe' : 'curl', ['--fail', '--silent', '--show-error', '--connect-timeout', '10', '--max-time', '600', '--resolve', `static.kivo.wiki:443:${address}`, '--output', file + '.partial', '--url', url.href], { windowsHide: true, timeout: 610000 });
        if (!await valid(file + '.partial')) throw Error('Invalid GLB');
        await fs.rename(file + '.partial', file); done = true; complete++;
        console.log(`${complete}/${models.length}: ${model.id} ${model.name}`); break;
      } catch (error) { console.warn(`Retry model ${model.id}: ${error.stderr?.trim() || error.message}`); }
    }
    if (!done) failures.push(model.id);
  }
}));
console.log(JSON.stringify({ total: models.length, complete, failures }));
if (failures.length) process.exitCode = 1;
