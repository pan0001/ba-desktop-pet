import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const runFile = promisify(execFile);

// Resumable import of the available student models. Raw extraction and network
// caches stay outside the packaged assets; IDs of existing companions never change.
const root = fileURLToPath(new URL('../../', import.meta.url));
const exportsDir = path.resolve(process.argv[2] || 'test-results/student-exports');
const read = async file => JSON.parse(await fs.readFile(path.resolve(root, file), 'utf8'));
const exists = async file => { try { await fs.access(file); return true; } catch { return false; } };
const index = await read('test-results/content-import/kivo/index.json');
const mapping = (await read('test-results/content-import/group-mapping.json')).mapped;
const legacy = await read('assets/media/catalog.json');
const overrides = await read('tools/game-assets/student-overrides.json');
const contentDir = path.join(root, 'test-results/content-import/kivo-content');
const repairsDir = path.join(root, 'test-results/content-import/kivo-repairs');
const repairs = await read(path.join(repairsDir, 'manifest.json'));
const normalize = value => value.toLowerCase().replace(/^cafe_/, '').replace(/_(body|mesh)$/, '').replace(/_default$/, '_original');
const baseGroup = value => normalize(value).replace(/_(?:0[12]|carrier)$/, '');
// The global catalogue contains bodies that are missing from student pages.
for (const student of index.students) for (const model of overrides.additionalModels?.[student.id] || []) {
  if (!student.characters.some(character => baseGroup(character.devName) === baseGroup(model.name))) throw Error(`Mismatched supplemental model ${model.id}`);
  if (!student.models.some(existing => existing.id === model.id)) student.models.push(model);
}
const englishCostumes = { '一年级': 'First Year', '临战': 'Armed', '泳装': 'Swimsuit', '骑行服': 'Cycling', '正月': 'New Year', '乐队': 'Band', '魔法': 'Magical', '偶像': 'Idol', '体操服': 'Track', '圣诞节': 'Christmas', '礼服': 'Dress', '温泉': 'Hot Spring', '打工': 'Part-time', '私服': 'Casual', '西装': 'Suit', '睡衣': 'Pajamas', '露营': 'Camp', '应援团': 'Cheer Squad', '兔女郎': 'Bunny', '制服': 'Uniform', '女仆': 'Maid', '旗袍': 'Qipao', '幼女': 'Young', '导游': 'Guide', '和服': 'Kimono', '度假': 'Vacation' };
const japaneseCostumes = { '一年级': '1年生', '临战': '臨戦', '泳装': '水着', '骑行服': 'サイクリング', '正月': '正月', '乐队': 'バンド', '魔法': 'マジカル', '偶像': 'アイドル', '体操服': '体操服', '圣诞节': 'クリスマス', '礼服': 'ドレス', '温泉': '温泉', '打工': 'アルバイト', '私服': '私服', '西装': 'スーツ', '睡衣': 'パジャマ', '露营': 'キャンプ', '应援团': '応援団', '兔女郎': 'バニーガール', '制服': '制服', '女仆': 'メイド', '旗袍': 'チャイナドレス', '幼女': '幼少期', '导游': 'ガイド', '和服': '着物', '度假': 'バカンス' };
function names(student) {
  const costume = student.names.zh.costume;
  return Object.fromEntries(['zh', 'ja', 'en'].map(locale => {
    const name = student.names[locale].given || student.names[locale].full || student.names.zh.given;
    const skin = locale === 'en' ? englishCostumes[costume] : locale === 'ja' ? student.names.ja.costume || japaneseCostumes[costume] : costume;
    if (costume && !skin) throw Error(`Untranslated costume ${costume}`);
    return [locale, name + (skin ? `（${skin}）` : '')];
  }));
}
function inspect(bytes, modelId) {
  if (bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(8) !== bytes.length) throw Error('Invalid GLB');
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  const animations = (gltf.animations || []).map(a => a.name);
  const unboundBody = (gltf.nodes || []).find(node => node.mesh != null && node.skin == null &&
    gltf.meshes[node.mesh].primitives.some(p => /_body$/i.test(gltf.materials?.[p.material]?.name)) &&
    gltf.meshes[node.mesh].primitives.some(p => /_(face|eyemouth|hair)$/i.test(gltf.materials?.[p.material]?.name)));
  if (unboundBody) throw Error(`Unskinned character body: ${unboundBody.name}`);
  const missing = (gltf.meshes || []).filter(m => m.primitives.some(p => p.material == null)).map(m => m.name);
  if (missing.length) throw Error(`Missing materials: ${missing.join(', ')}`);
  const untextured = (gltf.materials || []).filter(material => /_(body|hair)$/i.test(material.name) && material.pbrMetallicRoughness?.baseColorTexture == null);
  if (untextured.length) throw Error(`Missing body textures: ${untextured.map(m => m.name).join(', ')}`);
  const cafeIdle = animations.find(name => /_(?:Cafe|Coffee)_Idle$/i.test(name));
  const idle = cafeIdle || animations.find(name => /_(?:Formation|Normal)_Idle$/i.test(name));
  if (!idle) throw Error('No usable standing idle');
  // Miku's light is part of her hair accessory, not a separate floating ring.
  const haloMode = modelId === 372 ? 'embedded-hair-accessory' : modelId === 308 ? 'supplemental-kivo-75' : 'separate';
  if (haloMode === 'separate' && !(gltf.materials || []).some(m => /halo/i.test(m.name))) throw Error('No halo material');
  if ((gltf.buffers || []).some(b => b.uri) || (gltf.images || []).some(i => i.uri && !i.uri.startsWith('data:'))) throw Error('External GLB resource');
  return { animations, idle, cafeIdle: Boolean(cafeIdle), haloMode, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
async function publicBytes(model) {
  if (!Number.isSafeInteger(model.id) || model.id < 1) throw Error('Invalid public model ID');
  const cacheFile = path.join(contentDir, `models/${model.id}/model.glb`);
  if (await exists(cacheFile)) return fs.readFile(cacheFile);
  for (const record of repairs.records) for (const entry of record.models) if (entry.id === model.id) {
    const file = entry.files.find(f => /\.glb$/i.test(f.file));
    if (file) return fs.readFile(path.join(repairsDir, file.file));
  }
  const url = new URL(model.model_file, 'https://kivo.wiki');
  if (url.protocol !== 'https:' || url.hostname !== 'static.kivo.wiki') throw Error('Unexpected model host');
  await fs.mkdir(path.dirname(cacheFile), { recursive: true });
  // The system HTTP client also honours the user's configured network route;
  // Node's direct CDN connections can time out on otherwise reachable edges.
  const temporary = cacheFile + '.download';
  try {
    await runFile(process.platform === 'win32' ? 'curl.exe' : 'curl', [
      '--location', '--retry', '2', '--retry-all-errors', '--connect-timeout', '15',
      '--max-time', '90', '--fail', '--silent', '--show-error', '--output', temporary, '--url', url.href
    ], { windowsHide: true, timeout: 300000 });
  } catch (error) {
    console.warn(`Model ${model.id} download failed:`, error.stderr || error.code);
    throw Error('Public model download failed; retry the import to resume');
  }
  const bytes = await fs.readFile(temporary);
  inspect(bytes, model.id);
  await fs.rename(temporary, cacheFile);
  return bytes;
}
const local = [];
for (const group of overrides.modelSource === 'kivo' ? [] : await fs.readdir(exportsDir)) {
  try {
    const result = await read(path.join(exportsDir, group, 'result.json'));
    if (result.status === 'converted') local.push({ group, result, file: path.join(exportsDir, group, 'model.glb') });
  } catch {}
}
const modelOwners = new Map();
for (const s of index.students) for (const m of s.models) {
  const owners = modelOwners.get(m.id) || []; owners.push(s); modelOwners.set(m.id, owners);
}
const output = { schemaVersion: 1, source: index.source, modelSource: overrides.modelSource || 'game-with-kivo-fallback', students: {}, coverage: [] };
let added = 0;
for (const student of index.students) {
  if (student.npc) continue;
  const old = Object.values(legacy.students).find(s => s.kivoId === student.id);
  const displayNames = names(student);
  const devNames = student.characters.map(c => baseGroup(c.devName));
  const groups = local.filter(item => (mapping[item.group] || []).includes(student.id) &&
    // Shared body links for new costumes must not silently install the base skin.
    ((mapping[item.group] || []).length === 1 || devNames.includes(baseGroup(item.group))));
  const models = student.models.filter(m => m.type === 'body' && /\.glb$/i.test(m.model_file));
  const candidates = models.length ? models : groups.map(g => ({ id: `game-${g.group}`, name: g.group, localOnly: true }));
  const record = { id: old?.id || 100000 + student.id, kivoId: student.id, name: displayNames.zh,
    displayNames, fullNames: Object.fromEntries(Object.entries(student.names).map(([locale, value]) => [locale, value.full])),
    source: `https://kivo.wiki/student/${student.id}`, models: [], portrait: null };
  const issues = [];
  for (const model of candidates) {
    const retained = old?.models.find(m => m.type === 'body' && m.ready && m.id === model.id);
    if (retained) { record.models.push({ ...retained, origin: 'existing' }); continue; }
    if ((modelOwners.get(model.id) || []).length > 1 && !devNames.includes(baseGroup(model.name))) {
      issues.push({ model: model.id, reason: 'Shared model belongs to a different costume' }); continue;
    }
    const match = groups.find(g => normalize(g.group) === normalize(model.name)) || (candidates.length === 1 ? groups[0] : null);
    let bytes, metadata, origin, localError;
    if (match && !overrides.forceKivoModels[model.id]) {
      try { bytes = await fs.readFile(match.file); metadata = inspect(bytes, model.id); origin = { kind: 'game', group: match.group, prefab: match.result.prefab, revision: match.result.sourceRevision }; }
      catch (error) { localError = error.code ? 'Local model could not be read' : error.message; bytes = null; }
    }
    if (!bytes && !model.localOnly) {
      try { bytes = await publicBytes(model); metadata = inspect(bytes, model.id); origin = { kind: 'kivo', modelId: model.id, url: new URL(model.model_file, 'https://kivo.wiki').href }; }
      catch (error) { issues.push({ model: model.id, reason: error.message, localError }); continue; }
    }
    if (!bytes) { issues.push({ model: model.id, reason: localError || 'No usable model' }); continue; }
    const file = `assets/media/imported-models/${model.id}/model.glb`;
    const target = path.join(root, file);
    await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, bytes);
    const supplementalHalo = overrides.supplementalHalos?.[model.id];
    for (const supplement of supplementalHalo?.files || []) {
      const contents = await fs.readFile(path.join(root, supplement.file));
      if (createHash('sha256').update(contents).digest('hex') !== supplement.sha256) throw Error(`Invalid supplemental halo ${model.id}`);
    }
    record.models.push({ id: model.id, name: model.name, type: 'body', ready: true, file, origin, ...metadata, ...(supplementalHalo ? { supplementalHalo } : {}) });
    added++;
  }
  // Retain both pre-existing forms, even if upstream changes its listing later.
  for (const model of old?.models || []) if (model.type === 'body' && model.ready && !record.models.some(m => m.id === model.id)) record.models.push({ ...model, origin: 'existing' });
  if (record.models.length) {
    const avatar = path.join(contentDir, `avatars/${student.id}.png`);
    if (await exists(avatar)) {
      record.portrait = `assets/media/student-avatars/${student.id}.png`;
      await fs.mkdir(path.dirname(path.join(root, record.portrait)), { recursive: true });
      await fs.copyFile(avatar, path.join(root, record.portrait));
    } else record.portrait = old?.portrait || null;
    output.students[record.id] = record;
  }
  output.coverage.push({ kivoId: student.id, name: displayNames.zh, installedInGame: student.installed,
    status: record.models.length ? 'included' : 'unavailable', models: record.models.map(m => String(m.id)),
    issues: issues.length ? issues : record.models.length ? [] : [{ reason: 'No student body model in extracted game or Kivo catalogue' }] });
  if (output.coverage.length % 20 === 0) console.log(`Students ${output.coverage.length}; new models ${added}`);
}
await fs.writeFile(path.join(root, 'assets/media/student-imports.json'), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ students: Object.keys(output.students).length, newModels: added, unavailable: output.coverage.filter(s => s.status === 'unavailable' && s.installedInGame) }, null, 2));
