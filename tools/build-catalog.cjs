const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'assets/media/catalog.json')));
const importFile = path.join(root, 'assets/media/student-imports.json');
const imported = fs.existsSync(importFile) ? JSON.parse(fs.readFileSync(importFile)) : { students: {} };
const students = { ...catalog.students, ...imported.students };
const characters = [];
for (const student of Object.values(students)) {
  const models = student.models.filter(m => m.type === 'body' && m.ready && m.file.endsWith('.glb'));
  for (const model of models) {
    const bytes = fs.readFileSync(path.join(root, model.file));
    if (bytes.toString('ascii', 0, 4) !== 'glTF') throw new Error(`Invalid GLB: ${model.file}`);
    const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)).trim());
    const animations = (gltf.animations || []).map(a => a.name);
    characters.push({ id: String(model.id), studentId: student.id,
      name: catalog.students[student.id]?.name || student.name, kivoId: student.kivoId,
      displayNames: student.displayNames, fullNames: student.fullNames,
      haloMode: model.haloMode || 'separate',
      variant: models.length > 1 ? model.name.replace(/_Body$/, '') : '',
      file: model.file, portrait: fs.existsSync(path.join(root, student.portrait || '-')) ? student.portrait : fs.existsSync(path.join(root, `assets/media/avatars/${student.id}/avatar.png`)) ? `assets/media/avatars/${student.id}/avatar.png` : null,
      animations, canPickUp: animations.some(a => /_(?:Formation_)?Pick_?up$/i.test(a)) });
  }
}
fs.writeFileSync(path.join(root, 'assets/characters.json'), JSON.stringify(characters, null, 2) + '\n');
console.log(`${characters.length} models, ${new Set(characters.map(c => c.studentId)).size} students, ${characters.filter(c => c.canPickUp).length} pickup animations`);
