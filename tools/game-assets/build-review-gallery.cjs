const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../..');
const source = path.join(root, 'test-results/student-review/actual');
const target = path.resolve(process.argv[2] || path.join(root, 'test-results/student-preview'));
for (const dir of ['cards', 'frames', 'records']) fs.mkdirSync(path.join(target, dir), { recursive: true });
const catalogue = require('../../assets/characters.json');
const records = catalogue.map(character => {
  const file = path.join(source, 'records', character.id + '.json');
  const record = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : null;
  if (record) {
    for (const dir of ['cards', 'frames', 'records']) {
      const names = dir === 'frames' ? ['idle','walk','held','down','rise'].map(kind => character.id + '-' + kind + '.png') : [character.id + (dir === 'cards' ? '.png' : '.json')];
      for (const name of names) fs.copyFileSync(path.join(source, dir, name), path.join(target, dir, name));
    }
  }
  const errors = (record?.errors || []).map(error => error.replace(/^(idle|walk|held|down|rise): clipped at actual viewport$/, (_, kind) =>
    `${({ idle: '待机', walk: '行走', held: '抱起', down: '倒地', rise: '起身' })[kind]}：角色或道具超出实际画布`));
  return { id: character.id, name: character.name, ready: Boolean(record), errors, search: [character.id, character.name, ...Object.values(character.displayNames || {}), ...Object.values(character.fullNames || {})].join(' ') };
});
records.sort((a,b) => a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id));
const html = fs.readFileSync(path.join(__dirname, 'student-review.html'), 'utf8').replace('/*REVIEW_DATA*/[]', JSON.stringify(records).replace(/</g, '\\u003c')).replace('/*GENERATED_AT*/0', JSON.stringify(Date.now()));
fs.writeFileSync(path.join(target, 'index.html'), html);
console.log(JSON.stringify({ models: records.length, ready: records.filter(x => x.ready).length, target }));
