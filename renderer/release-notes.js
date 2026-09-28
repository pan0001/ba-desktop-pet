// Display the small Markdown subset used by our GitHub releases with DOM nodes.
// Remote HTML is always text, never executable markup. Keep the original body
// in update state; the GitHub button remains the full source of record.
const rendered = new WeakMap();
export function isReadmeNavigation(line) {
  const links = [...line.matchAll(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g)];
  if (!links.length || line.replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, '').replace(/[\s·|/]/g, '')) return false;
  return links.every(([, label, href]) => /README/i.test(label) && /^https:\/\/github\.com\/pan0001\/ba-desktop-pet\/blob\/[^/]+\/README(?:\.[a-z-]+)?\.md$/i.test(href));
}
function inline(element, text) {
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let end = 0;
  for (const match of text.matchAll(pattern)) {
    element.append(document.createTextNode(text.slice(end, match.index)));
    const code = match[0].startsWith('`'), node = document.createElement(code ? 'code' : 'strong');
    node.textContent = match[0].slice(code ? 1 : 2, code ? -1 : -2); element.append(node);
    end = match.index + match[0].length;
  }
  element.append(document.createTextNode(text.slice(end)));
}
export function renderReleaseNotes(container, body) {
  if (rendered.get(container) === body) return;
  rendered.set(container, body);
  const fragment = document.createDocumentFragment();
  let paragraph = [], list = null, code = null;
  const flush = () => {
    if (!paragraph.length) return;
    const p = document.createElement('p'); inline(p, paragraph.join('\n')); fragment.append(p); paragraph = [];
  };
  for (const line of body.split(/\r?\n/)) {
    if (code) {
      if (/^\s*```/.test(line)) code = null;
      else code.textContent += line + '\n';
      continue;
    }
    if (/^\s*```/.test(line)) { flush(); list = null; const pre = document.createElement('pre'); code = document.createElement('code'); pre.append(code); fragment.append(pre); continue; }
    if (!line.trim() || isReadmeNavigation(line)) { flush(); list = null; continue; }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line), bullet = /^\s*(?:([-*+])|\d+\.)\s+(.+)$/.exec(line);
    if (heading) { flush(); list = null; const h = document.createElement('h' + Math.min(6, heading[1].length + 2)); inline(h, heading[2]); fragment.append(h); }
    else if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) { flush(); list = null; fragment.append(document.createElement('hr')); }
    else if (bullet) { flush(); const tag = bullet[1] ? 'UL' : 'OL'; if (list?.tagName !== tag) { list = document.createElement(tag); fragment.append(list); } const li = document.createElement('li'); inline(li, bullet[2]); list.append(li); }
    else { list = null; paragraph.push(line); }
  }
  flush(); container.replaceChildren(fragment); container.scrollTop = 0;
}
