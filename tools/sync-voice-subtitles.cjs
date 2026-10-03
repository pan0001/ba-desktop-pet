const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { buildVoiceIndex } = require('./build-voice-index.cjs');
const root = path.resolve(__dirname, '..');
const normalize = value => String(value).toLowerCase().split('/').pop().replace(/（[^）]+）$/, '').replace(/\.(mp3|ogg|wav)$/, '');
function uniqueIndex(pairs) {
  const values = new Map();
  for (const [key, text] of pairs) if (text?.trim()) {
    const id = normalize(key), entries = values.get(id) || new Set();
    entries.add(text.trim()); values.set(id, entries);
  }
  return new Map([...values].filter(([, entries]) => entries.size === 1).map(([key, entries]) => [key, [...entries][0]]));
}
function sourceIndex(data, locale) {
  return uniqueIndex(Object.values(data).flatMap(bank => Object.values(bank).flatMap(lines => lines
    .filter(line => line.AudioClip && line.Transcription && (locale !== 'en' || !/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(line.Transcription)))
    .map(line => [line.AudioClip, line.Transcription]))));
}
function applySubtitles(catalog, english, japanese) {
  const en = sourceIndex(english, 'en'), ja = sourceIndex(japanese, 'ja');
  const stats = { total: 0, ja: 0, en: 0, missingEnglish: [] };
  for (const bank of Object.values(catalog.students)) {
    const originals = uniqueIndex((bank.languages.jp || []).map(line => [line.key, line.original]));
    for (const [language, lines] of Object.entries(bank.languages)) for (const line of lines) {
      const key = normalize(line.key), subtitles = {};
      const japaneseText = (language === 'jp' && line.original) || originals.get(key) || ja.get(key);
      // Full audio keys retain the student's identity, costume and line number.
      // Ambiguous keys are omitted; never match by list position or partial name.
      if (japaneseText) subtitles.ja = japaneseText;
      if (en.has(key)) subtitles.en = en.get(key);
      line.subtitles = subtitles;
      stats.total++; if (subtitles.ja) stats.ja++; if (subtitles.en) stats.en++;
      else stats.missingEnglish.push({ studentId: bank.studentId, language, key: line.key });
    }
  }
  return stats;
}
async function main() {
  const cache = path.join(root, 'test-results'), sources = {}, data = {};
  for (const language of ['en', 'jp']) {
    const url = `https://schaledb.com/data/${language}/voice.min.json`, file = path.join(cache, `schale-${language}-voice.json`);
    let bytes;
    if (process.argv.includes('--cached')) bytes = fs.readFileSync(file);
    else {
      const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw Error(`${url}: ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer()); fs.mkdirSync(cache, { recursive: true }); fs.writeFileSync(file, bytes);
    }
    data[language] = JSON.parse(bytes);
    sources[language] = { url, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  }
  const file = path.join(root, 'assets/voices/catalog.json'), catalog = JSON.parse(fs.readFileSync(file));
  const stats = applySubtitles(catalog, data.en, data.jp);
  if (stats.en < stats.total * .8 || stats.ja < stats.total * .8) throw Error('Unexpected subtitle coverage; catalogue retained');
  fs.writeFileSync(file, JSON.stringify(catalog, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'assets/voices/catalog-index.json'), JSON.stringify(buildVoiceIndex(file), null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'assets/voices/subtitle-sources.json'), JSON.stringify({ sources, coverage: stats, fallback: 'Show explicitly labelled source text when a translation is unavailable.' }, null, 2) + '\n');
  console.log(JSON.stringify({ total: stats.total, ja: stats.ja, en: stats.en, missingEnglish: stats.missingEnglish.length }));
}
module.exports = { normalize, uniqueIndex, applySubtitles };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
