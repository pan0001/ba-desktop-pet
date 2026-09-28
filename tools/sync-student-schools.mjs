// Cache Kivo school membership by Kivo ID (not the app's independent student ID).
// Runtime filtering is entirely local, including for undownloaded models.
import fs from 'node:fs/promises';
const root = new URL('../', import.meta.url);
async function api(route) {
  const response = await fetch(`https://api.kivo.wiki/api/v1/data/${route}`, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error(`${route}: HTTP ${response.status}`);
  const result = await response.json();
  if (!result.success || !result.data) throw Error(`Invalid response: ${route}`);
  return result.data;
}
const characters = JSON.parse(await fs.readFile(new URL('assets/characters.json', root)));
const wanted = new Set(characters.map(c => c.kivoId));
const first = await api('students/?page=1');
const students = [...first.students];
let page = 2;
await Promise.all(Array.from({ length: 3 }, async () => {
  while (page <= first.max_page) students.push(...(await api(`students/?page=${page++}`)).students);
}));
const studentSchools = {};
for (const student of students) if (wanted.has(student.id)) studentSchools[student.id] = student.school;
for (const id of wanted) if (!(id in studentSchools)) studentSchools[id] = (await api(`students/${id}`)).school;
const schoolRows = [];
const schoolFirst = await api('schools/?page=1');
schoolRows.push(...schoolFirst.school);
for (let n = 2; n <= schoolFirst.max_page; n++) schoolRows.push(...(await api(`schools/?page=${n}`)).school);
const used = new Set(Object.values(studentSchools));
const schools = schoolRows.filter(s => used.has(s.id)).map(s => ({ id: String(s.id), name: s.name, nameCN: s.name_cn }));
if (schools.length !== [...used].filter(id => id != null).length) throw Error('Unknown school ID');
const result = { schemaVersion: 1, source: 'https://api.kivo.wiki/api/v1/data/students/', fetchedAt: new Date().toISOString(), schools, studentSchools };
await fs.writeFile(new URL('assets/student-schools.json', root), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ students: Object.keys(studentSchools).length, schools }));
