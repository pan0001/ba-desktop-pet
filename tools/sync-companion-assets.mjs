import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = async file => JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
const catalog = await read('assets/media/catalog.json');
const cache = path.join(root, 'test-results/kivo');
const refresh = process.argv.includes('--refresh');
await fs.mkdir(cache, { recursive: true });
async function request(url) {
  const parsed = new URL(url.startsWith('//') ? 'https:' + url : url);
  if (parsed.protocol !== 'https:' || !['api.kivo.wiki', 'static.kivo.wiki'].includes(parsed.hostname)) throw new Error('Unexpected resource host');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(parsed, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${parsed}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) { if (attempt === 2) throw error; await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1))); }
  }
}
async function api(kind, id) {
  const file = path.join(cache, `${kind}-${id}.json`);
  let data;
  try { if (refresh) throw new Error('Refresh requested'); data = JSON.parse(await fs.readFile(file, 'utf8')); } catch { data = JSON.parse(await request(`https://api.kivo.wiki/api/v1/data/${kind}/${id}`)); await fs.writeFile(file, JSON.stringify(data)); }
  if (!data.success || data.data.id !== id) throw new Error('Resource ID mismatch');
  return data.data;
}
async function mapLimit(items, count, fn) {
  let cursor = 0;
  await Promise.all(Array.from({ length: count }, async () => { while (cursor < items.length) await fn(items[cursor++]); }));
}
function triggers(voice) {
  const name = voice.description || '';
  if (/relationship_up/i.test(name)) return ['pet'];
  if (/_cafe_act_/i.test(name) || voice.category === 'cafe') return ['idle', 'interact', 'furniture'];
  if (/_lobby_\d/i.test(name)) return ['interact'];
  if (/_login_/i.test(name)) return ['welcome'];
  if (/_formation_select/i.test(name)) return ['pickup'];
  return [];
}
const manifest = { schemaVersion: 1, source: 'https://kivo.wiki/', fetchedAt: new Date().toISOString(), students: {}, files: [] };
const furniture = { schemaVersion: 1, source: 'https://kivo.wiki/', fetchedAt: manifest.fetchedAt, items: {}, students: {} };
const downloads = new Map(), itemIds = new Set();
await mapLimit(Object.values(catalog.students), 3, async student => {
  const data = await api('students', student.kivoId);
  const record = { studentId: student.id, kivoId: student.kivoId, name: student.name, source: `https://kivo.wiki/data/character/${student.kivoId}?mode=voice`, languages: {} };
  for (const [language, key] of [['jp', 'voice'], ['cn', 'voice_cn']]) {
    record.languages[language] = [];
    for (const voice of data[key] || []) {
      const events = triggers(voice);
      if (!events.length || !voice.file || !voice.text?.trim()) continue;
      const url = new URL(voice.file, 'https://kivo.wiki').href;
      const hash = createHash('sha256').update(url).digest('hex').slice(0, 20);
      const file = `assets/voices/${student.kivoId}/${language}/${hash}.ogg`;
      downloads.set(file, { file, url, kind: 'audio' });
      record.languages[language].push({ id: hash, key: voice.description, text: voice.text.trim(), original: voice.text_original?.trim() || '', events, file, source: url });
    }
  }
  manifest.students[student.id] = record;
  furniture.students[student.id] = data.furniture || [];
  (data.furniture || []).forEach(id => itemIds.add(id));
  console.log('Indexed', student.name, 'JP', record.languages.jp.length, 'CN', record.languages.cn.length);
});
await mapLimit([...itemIds], 3, async id => {
  const data = await api('items', id);
  const file = `assets/furniture/icons/${id}.png`, url = new URL(data.icon, 'https://kivo.wiki').href;
  downloads.set(file, { file, url, kind: 'image' });
  furniture.items[id] = { id, name: data.name, description: data.description, icon: file, source: `https://kivo.wiki/data/item/${id}`, model: null };
});
let done = 0;
await mapLimit([...downloads.values()], 4, async item => {
  const target = path.join(root, item.file);
  let bytes;
  try { bytes = await fs.readFile(target); } catch { bytes = await request(item.url); }
  if (!bytes.length || (item.kind === 'audio' && bytes.toString('ascii', 0, 4) !== 'OggS')) throw new Error(`Invalid resource ${item.file}`);
  await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, bytes);
  manifest.files.push({ ...item, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  if (++done % 50 === 0) console.log('Downloaded', done, '/', downloads.size);
});
await fs.mkdir(path.join(root, 'assets/furniture'), { recursive: true });
await fs.writeFile(path.join(root, 'assets/voices/catalog.json'), JSON.stringify(manifest, null, 2) + '\n');
await fs.writeFile(path.join(root, 'assets/furniture/catalog.json'), JSON.stringify(furniture, null, 2) + '\n');
console.log('Complete', Object.keys(manifest.students).length, 'students,', downloads.size, 'files,', (manifest.files.reduce((n,f) => n + f.bytes, 0) / 1048576).toFixed(1), 'MiB');
