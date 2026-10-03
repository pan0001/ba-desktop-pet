import { normalizeLocale } from './localization-core.js';

// UI language chooses captions; voiceLanguage only chooses the recording.
export function voiceSubtitle(line, locale = 'zh', audioLanguage = 'jp') {
  const requested = normalizeLocale(locale);
  const captions = { zh: line.text, ...line.subtitles };
  if (audioLanguage === 'jp' && line.original?.trim()) captions.ja = line.original;
  if (captions[requested]?.trim()) return { text: captions[requested], subtitleLanguage: requested, subtitleFallback: false };
  // Never borrow a different line or pretend an untranslated source is English.
  const language = captions.ja?.trim() ? 'ja' : 'zh';
  const label = requested === 'en' ? '[Translation unavailable · original text]' : '［翻訳未収録・原文］';
  return { text: `${label}\n${captions[language] || ''}`, subtitleLanguage: language, subtitleFallback: true };
}
