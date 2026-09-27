export const SUPPORTED_LOCALES = Object.freeze(['zh', 'ja', 'en']);
export function normalizeLocale(value) {
  const language = String(value || '').toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LOCALES.includes(language) ? language : 'en';
}
const escapePattern = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Source strings remain readable in the UI code. Named placeholders also allow
// existing care/status messages to be translated without altering saved data.
export function createTranslator(messages, locale) {
  const language = normalizeLocale(locale);
  const patterns = Object.entries(messages).filter(([source]) => /\{\w+\}/.test(source))
    .map(([source, translations]) => {
      const keys = [];
      const parts = source.split(/(\{\w+\})/).map(part => {
        if (/^\{\w+\}$/.test(part)) { keys.push(part.slice(1, -1)); return '(.+?)'; }
        return escapePattern(part);
      });
      return { expression: new RegExp('^' + parts.join('') + '$', 's'), keys,
        target: translations[language] || source, weight: source.replace(/\{\w+\}/g, '').length };
    }).sort((a, b) => b.weight - a.weight);
  function translate(text, depth = 0) {
    if (typeof text !== 'string' || language === 'zh' || !text) return text;
    const direct = messages[text]?.[language];
    if (direct) return direct;
    const trim = text.trim();
    if (trim !== text) return text.replace(trim, translate(trim, depth));
    if (depth >= 4) return text;
    for (const { expression, keys, target } of patterns) {
      const match = expression.exec(text);
      if (!match) continue;
      const values = Object.fromEntries(keys.map((key, index) => [key, translate(match[index + 1], depth + 1)]));
      return target.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? `{${key}}`);
    }
    return text;
  }
  return translate;
}
