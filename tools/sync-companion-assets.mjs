import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = async file => JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
const catalog = await read('assets/media/catalog.json');
const knownCorrupt = await read('tools/game-assets/voice-exclusions.json');
const studentsOnly = process.argv.includes('--students-only');
const concurrency = Math.max(1, Math.min(8, Number(process.argv.find(arg => arg.startsWith('--concurrency='))?.split('=')[1]) || 4));
try { Object.assign(catalog.students, (await read('assets/media/student-imports.json')).students); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const cache = path.join(root, 'test-results/kivo');
const refresh = process.argv.includes('--refresh');
await fs.mkdir(cache, { recursive: true });
async function request(url) {
  const parsed = new URL(url.startsWith('//') ? 'https:' + url : url);
  if (parsed.protocol !== 'https:' || !['api.kivo.wiki', 'static.kivo.wiki'].includes(parsed.hostname)) throw new Error('Unexpected resource host');
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(parsed, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${parsed}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) { if (attempt === 4) throw new Error(`${parsed.href}: ${error.message}`); await new Promise(resolve => setTimeout(resolve, Math.min(5000, 800 * (attempt + 1)))); }
  }
}
async function api(kind, id) {
  if (!refresh && kind === 'students') {
    try {
      const cached = await read(`test-results/content-import/kivo/students_${id}.json`);
      if (cached.id === id) return cached;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
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
const manifest = { schemaVersion: 1, source: 'https://kivo.wiki/', fetchedAt: new Date().toISOString(), students: {}, files: [], excluded: [] };
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
      if (knownCorrupt[hash]?.kivoId === student.kivoId) {
        manifest.excluded.push({ ...knownCorrupt[hash], source: url, language }); continue;
      }
      const extension = /\.wav$/i.test(new URL(url).pathname) ? '.wav' : '.ogg';
      const file = `assets/voices/${student.kivoId}/${language}/${hash}${extension}`;
      downloads.set(file, { file, url, kind: 'audio' });
      record.languages[language].push({ id: hash, key: voice.description, text: voice.text.trim(), original: voice.text_original?.trim() || '', events, file, source: url });
    }
  }
  record.unavailableEvents = Object.fromEntries(['jp', 'cn'].map(language => [language,
    ['pet', 'interact', 'idle'].filter(event => !record.languages[language].some(line => line.events.includes(event))) ]));
  record.availabilitySource = `https://kivo.wiki/student/${student.kivoId}`;
  manifest.students[student.id] = record;
  furniture.students[student.id] = data.furniture || [];
  (data.furniture || []).forEach(id => itemIds.add(id));
  console.log('Indexed', student.name, 'JP', record.languages.jp.length, 'CN', record.languages.cn.length);
});
await mapLimit(studentsOnly ? [] : [...itemIds], 3, async id => {
  const data = await api('items', id);
  const file = `assets/furniture/icons/${id}.png`, url = new URL(data.icon, 'https://kivo.wiki').href;
  downloads.set(file, { file, url, kind: 'image' });
  furniture.items[id] = { id, name: data.name, description: data.description, icon: file, source: `https://kivo.wiki/data/item/${id}`, model: null };
});
let done = 0;
function completeOgg(bytes) {
  let offset = 0, ended = false;
  while (offset < bytes.length) {
    if (offset + 27 > bytes.length || bytes.toString('ascii', offset, offset + 4) !== 'OggS') return false;
    const segments = bytes[offset + 26];
    if (offset + 27 + segments > bytes.length) return false;
    let length = 0;
    for (let n = 0; n < segments; n++) length += bytes[offset + 27 + n];
    ended = Boolean(bytes[offset + 5] & 4);
    offset += 27 + segments + length;
  }
  return offset === bytes.length && ended;
}
function completeAudio(bytes) {
  if (bytes.toString('ascii', 0, 4) === 'OggS') return completeOgg(bytes);
  if (bytes.length < 44 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE' || bytes.readUInt32LE(4) + 8 !== bytes.length) return false;
  let offset = 12, data = false;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32LE(offset + 4);
    if (bytes.toString('ascii', offset, offset + 4) === 'data' && length > 0) data = true;
    offset += 8 + length + length % 2;
  }
  return data && offset === bytes.length;
}
const failures = [];
await mapLimit([...downloads.values()], concurrency, async item => {
 try {
  const target = path.join(root, item.file);
  let bytes;
  try { bytes = await fs.readFile(target); if (item.kind === 'audio' && !completeAudio(bytes)) bytes = null; } catch {}
  if (!bytes) bytes = await request(item.url);
  if (!bytes.length || (item.kind === 'audio' && !completeAudio(bytes))) throw new Error(`Invalid resource ${item.file}`);
  await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target + '.tmp', bytes); await fs.rename(target + '.tmp', target);
  manifest.files.push({ ...item, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
 } catch (error) { failures.push({ ...item, error: error.message }); }
  if (++done % 50 === 0) console.log('Downloaded', done, '/', downloads.size);
});
await fs.writeFile(path.join(cache, 'download-failures.json'), JSON.stringify(failures, null, 2));
if (failures.length) throw new Error(`${failures.length} downloads failed; existing voice catalogue retained. Rerun to resume.`);
await fs.mkdir(path.join(root, 'assets/furniture'), { recursive: true });
await fs.writeFile(path.join(root, 'assets/voices/catalog.json'), JSON.stringify(manifest, null, 2) + '\n');
if (!studentsOnly) await fs.writeFile(path.join(root, 'assets/furniture/catalog.json'), JSON.stringify(furniture, null, 2) + '\n');
console.log('Complete', Object.keys(manifest.students).length, 'students,', downloads.size, 'files,', (manifest.files.reduce((n,f) => n + f.bytes, 0) / 1048576).toFixed(1), 'MiB');
