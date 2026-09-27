// Cache public Kivo metadata, retaining source IDs to avoid confusing costumes.
import fs from 'node:fs/promises';
import path from 'node:path';
const output = path.resolve(process.argv[2] || 'test-results/content-import/kivo');
await fs.mkdir(output, { recursive: true });
async function api(route) {
  const file = path.join(output, route.replace(/[^\w-]/g, '_') + '.json');
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch {}
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(`https://api.kivo.wiki/api/v1/data/${route}`, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      const body = await response.json();
      if (!body.success || !body.data) throw Error('Invalid Kivo response');
      await fs.writeFile(file, JSON.stringify(body.data));
      return body.data;
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}
async function map(items, fn) {
  let cursor = 0;
  const result = new Array(items.length);
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (cursor < items.length) { const index = cursor++; result[index] = await fn(items[index]); }
  }));
  return result;
}
const first = await api('students/?page=1');
const pages = await map(Array.from({ length: first.max_page - 1 }, (_, i) => i + 2), page => api(`students/?page=${page}`));
const ids = [...new Set([first, ...pages].flatMap(page => page.students.map(student => student.id)))];
const failures = [];
let finished = 0;
const students = (await map(ids, async id => {
  try {
    const student = await api(`students/${id}`);
    const models = await map(student.model || [], id => api(`models/${id}`));
    const names = {};
    for (const [locale, suffix] of [['zh', ''], ['ja', '_jp'], ['en', '_en']]) {
      const family = student[`family_name${suffix}`] || '';
      const given = student[`given_name${suffix}`] || '';
      names[locale] = { family, given, full: [family, given].filter(Boolean).join(locale === 'en' ? ' ' : ''),
        costume: student[locale === 'ja' ? 'skin_jp' : 'skin'] || '' };
    }
    return { id, names, avatar: student.avatar, npc: student.is_npc, installed: student.is_install,
      characters: (student.character_datas || []).map(row => ({ id: row.character_id, devName: row.dev_name })),
      furniture: student.furniture || [], models,
      source: `https://kivo.wiki/data/character/${id}` };
  } catch (error) { failures.push({ id, error: error.message }); return null; }
  finally { if (++finished % 25 === 0) console.log(`Kivo students ${finished}/${ids.length}; failures=${failures.length}`); }
})).filter(Boolean);
const result = { schemaVersion: 1, source: 'https://kivo.wiki/', fetchedAt: new Date().toISOString(), students, failures };
await fs.writeFile(path.join(output, 'index.json'), JSON.stringify(result, null, 2));
console.log(`Saved ${students.length} student records; failures=${failures.length}`);
if (failures.length) process.exitCode = 1;
