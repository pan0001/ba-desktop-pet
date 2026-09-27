const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const catalog = require('../assets/voices/catalog.json');
const file = path.join(root, 'assets/voices/initiatives.json');
const initiatives = JSON.parse(fs.readFileSync(file));
const normalize = key => key.toLowerCase().replace(/\.ogg$/, '').replace(/（[^）]+）$/, '');
const ordinary = line => /^[^_]+_(?:cafe_(?:act|monolog)|lobby|login|relationship_up)_\d+(?:_\d+)?$/i.test(normalize(line.key))
  && !/新年|圣诞|万圣|情人节|生日/.test(line.text);
for (const [id, bank] of Object.entries(catalog.students)) {
  // Keep existing, manually curated multi-line conversations intact.
  if (initiatives.students[id]?.length) continue;
  const eligible = bank.languages.jp.filter(ordinary);
  const reply = eligible.find(line => /_lobby_/i.test(line.key)) || eligible.find(line => /_cafe_/i.test(line.key)) || eligible[0];
  if (!reply) { initiatives.students[id] = []; continue; }
  const languages = { jp: { invite: null, reply: reply.id } };
  const cn = bank.languages.cn.find(line => normalize(line.key) === normalize(reply.key) && ordinary(line));
  if (cn) languages.cn = { invite: null, reply: cn.id };
  // A silent invitation avoids manufacturing dialogue pairs for newly imported
  // characters. Clicking plays a complete original line and its own subtitle.
  initiatives.students[id] = [{ id: 'chat', label: '聊一会儿', prompt: `${bank.name}在等老师，点击听她说话`, languages }];
}
fs.writeFileSync(file, JSON.stringify(initiatives, null, 2) + '\n');
console.log(`${Object.values(initiatives.students).filter(events => events.length).length} students with invitations`);
