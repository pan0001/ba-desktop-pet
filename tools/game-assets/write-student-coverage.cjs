const fs = require('node:fs'), path = require('node:path'), { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file)));
const imported = read('assets/media/student-imports.json'), characters = read('assets/characters.json');
const voices = read('assets/voices/catalog.json'), invitations = read('assets/voices/initiatives.json');
const auditRoot = 'test-results/content-import/halo-audit/';
const checked = new Map(read(auditRoot + 'installed-report.json').map(record => [record.group, record]));
const selected = new Map(read(auditRoot + 'installed-selected-report.json').map(record => [record.group, record]));
const faces = new Map(read('test-results/face-regression.json').map(record => [record.id, record]));
const models = characters.map(character => {
  const sha256 = createHash('sha256').update(fs.readFileSync(path.join(root, character.file))).digest('hex');
  const group = 'installed-' + character.id, face = faces.get(character.id);
  const record = selected.get(group)?.sha256 === sha256 ? selected.get(group) : checked.get(group);
  if (!record || record.status !== 'passed' || record.sha256 !== sha256 || !face || face.errors.length) throw Error(`Unverified current model: ${character.id}`);
  return { id: character.id, sha256, animationSamples: record.samples.length, faceSamples: face.samples,
    mouth: face.mouth ? 'animated-atlas' : 'authored-face', halo: character.haloMode, passed: true };
});
const summary = { schemaVersion: 1, students: Object.keys(imported.students).length, models,
  voiceFiles: voices.files.length, voicedStudents: Object.values(voices.students).filter(b => b.languages.jp.length).length,
  invitationStudents: Object.values(invitations.students).filter(events => events.length).length };
fs.writeFileSync(path.join(root, 'assets/media/student-validation.json'), JSON.stringify(summary, null, 2) + '\n');
const missing = imported.coverage.filter(student => student.status === 'unavailable' && student.installedInGame);
const silent = Object.values(voices.students).filter(bank => !bank.languages.jp.length);
const rows = Object.values(imported.students).map(student => `| ${student.name} | ${student.displayNames.ja} | ${student.displayNames.en} | ${student.models.map(m => m.id).join(', ')} | [古书馆](${student.source}) |`);
const text = `# 学生适配清单\n\n当前接入 **${summary.students} 个角色／换装、${models.length} 个模型**。原有 40 个模型的选择 ID 和 38 个学生存档 ID 均保留；新角色使用独立存档 ID。\n\n` +
  `全部学生身体模型采用古书馆处理过的版本，不再使用本地游戏转换的身体模型。模型按原文件下载，桌宠运行时适配面部材质、嘴型及光环跟随。原始游戏包和中间文件不随程序打包。优先使用 Cafe／Coffee 待机；源模型没有咖啡厅动作时使用其 Formation／Normal 待机，不假造咖啡厅动作。\n\n` +
  `已逐个通过实际渲染器的加载、光环跟随和可用待机／行走／抱起／倒地动作检查，共 ${models.reduce((n,m)=>n+m.animationSamples,0)} 个动作采样。面部回归检查 ${models.reduce((n,m)=>n+m.faceSamples,0)} 帧：${models.filter(m=>m.mouth==='animated-atlas').length} 个模型驱动嘴型；面具和没有可安全分离嘴部的特殊面部保留原材质。逐模型 SHA-256 和结果见 assets/media/student-validation.json。\n\n` +
  `语音采用原始日语／中文录音与对应台词，共 ${voices.files.length} 条（含 3 条原始 WAV，其余为 Ogg）。${summary.voicedStudents} 个角色／换装有日常语音及主动邀约；其余显示暂无可用日常语音。${silent.length} 个暂无语音的角色：${silent.map(b=>b.name).join('、')}。一条礼服亚子 Relationship_Up_3 的上游 Ogg 文件截断，经重复下载确认后排除，保留该角色其余完整录音；证据记录在语音目录 excluded 字段。\n\n` +
  `## 当前素材缺口\n\n以下 ${missing.length} 个已实装角色／换装尚无可用的对应模型，因此未混入其他换装冒充。\n\n| 角色／换装 | 原因 | 来源 |\n| --- | --- | --- |\n` +
  missing.map(s => `| ${s.name} | ${s.issues.some(i=>/different costume/.test(i.reason)) ? '网页模型链接实际属于原版换装' : '古书馆暂无可用身体模型'} | [角色页](https://kivo.wiki/student/${s.kivoId}) |`).join('\n') +
  `\n\n剧情占位条目、敌人及没有身体模型的未实装服装不计作已适配学生。完整来源覆盖记录保存在 assets/media/student-imports.json。\n\n## 已接入角色\n\n| 中文 | 日文 | 英文 | 模型 ID | 来源 |\n| --- | --- | --- | --- | --- |\n${rows.join('\n')}\n`;
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs/student-adaptation.md'), text);
console.log(JSON.stringify({ students: summary.students, models: models.length, unavailableInstalled: missing.length, voices: summary.voiceFiles }));
