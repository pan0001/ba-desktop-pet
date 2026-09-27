import { createTranslator, normalizeLocale } from '../scripts/localization-core.js';
let translate = text => text;
export const tr = text => translate(text);
export let locale = 'zh';
const ignore = 'script,style,pre,code,[data-no-translate]';

export async function localizeDocument(language) {
  locale = normalizeLocale(language);
  const response = await fetch('assets/locales/ui.json');
  if (!response.ok) throw new Error('Language resources unavailable');
  translate = createTranslator(await response.json(), locale);
  document.documentElement.lang = { zh: 'zh-CN', ja: 'ja', en: 'en' }[locale];
  function text(node) {
    if (node.parentElement?.closest(ignore)) return;
    const translated = translate(node.data);
    if (translated !== node.data) node.data = translated;
  }
  function attributes(element) {
    if (element.closest(ignore)) return;
    for (const name of ['aria-label', 'title', 'placeholder', 'alt']) {
      if (!element.hasAttribute(name)) continue;
      const old = element.getAttribute(name), value = translate(old);
      if (old !== value) element.setAttribute(name, value);
    }
  }
  function subtree(root) {
    if (root.nodeType === Node.TEXT_NODE) return text(root);
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    attributes(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      if (walker.currentNode.nodeType === Node.TEXT_NODE) text(walker.currentNode);
      else attributes(walker.currentNode);
    }
  }
  subtree(document.documentElement);
  // Care and update status change asynchronously. Translate only changed nodes;
  // never rewrite HTML, inputs, catalogue IDs, release notes, or saved state.
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') text(record.target);
      else if (record.type === 'attributes') attributes(record.target);
      else for (const node of record.addedNodes) subtree(node);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ['aria-label', 'title', 'placeholder', 'alt'] });
  return () => observer.disconnect();
}
