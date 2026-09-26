const api = window.pet;
let state, feedbackTimer, voiceCatalog = {};
const el = id => document.getElementById(id);
function shortName(character) { return character.name.replace(/\s*\([^)]*\)\s*$/, ''); }
function list() {
  const query = el('search').value.trim().toLowerCase();
  const matches = state.characters.filter(c => `${c.name} ${c.variant}`.toLowerCase().includes(query));
  el('characters').replaceChildren(...matches.map(c => {
    const button = document.createElement('button'); button.className = 'character';
    button.dataset.id = c.id; button.setAttribute('aria-pressed', String(state.characterId === c.id));
    button.title = c.name + (c.variant ? ` · ${c.variant}` : '');
    if (c.portrait) { const img = document.createElement('img'); img.src = c.portrait; img.alt = ''; img.loading = 'lazy'; button.append(img); }
    const name = document.createElement('span'); name.className = 'character-name'; name.textContent = shortName(c);
    if (c.variant) { const variant = document.createElement('small'); variant.textContent = c.variant.includes('Carrier') ? '载具形态' : c.variant.includes('_02') ? '形态 2' : '标准形态'; name.append(variant); }
    const check = document.createElement('span'); check.className = 'selection-check'; check.textContent = '✓'; check.setAttribute('aria-hidden', 'true');
    button.append(name, check); button.onclick = () => change({ characterId: c.id }); return button;
  }));
  el('empty').hidden = matches.length > 0;
}
function render(next) {
  const rebuild = !state || state.characterId !== next.characterId;
  state = next;
  const c = state.characters.find(c => c.id === state.characterId);
  el('name').textContent = shortName(c); el('variant').textContent = c.name.match(/\(([^)]*)\)$/)?.[1] || '';
  if (c.portrait) { el('portrait').src = c.portrait; el('portrait').hidden = false; } else el('portrait').hidden = true;
  el('presence').textContent = state.hidden ? '暂时休息中' : state.paused ? '安静陪伴中' : '正在桌面陪伴你';
  el('size').value = state.size; el('size-label').textContent = `${state.size} px`;
  el('top').checked = state.alwaysOnTop; el('paused').checked = state.paused;
  for (const key of ['physics', 'roaming', 'windowWalking', 'effectsEnabled']) el(key).checked = state[key];
  for (const key of ['voiceEnabled', 'idleVoice']) el(key).checked = state[key];
  el('voiceLanguage').value = state.voiceLanguage; el('idleInterval').value = String(state.idleInterval);
  el('volume').value = Math.round(state.volume * 100); el('volume-label').textContent = `${Math.round(state.volume * 100)}%`;
  el('voice-preview').disabled = !state.voiceEnabled || state.paused;
  const bank = voiceCatalog.students?.[c.studentId], language = bank?.languages?.[state.voiceLanguage]?.length ? state.voiceLanguage : 'jp';
  const count = bank?.languages?.[language]?.length || 0;
  el('voice-status').textContent = count ? `${language === 'jp' ? '日语' : '中文'} · ${count} 句日常语音${language !== state.voiceLanguage ? '（暂无中文配音）' : ''}` : '正在读取语音…';
  const canFurniture = c.animations.includes('Aris_Original_Cafe_my_gamedevdept_01_sofa_01_01');
  el('furniture-hint').textContent = canFurniture ? '摆好后她会停下来休息；提起角色会自动收起家具。' : '当前先适配爱丽丝的沙发和游戏机，切换到爱丽丝即可使用。';
  document.querySelectorAll('[data-furniture]').forEach(button => { button.disabled = button.dataset.furniture !== 'none' && !canFurniture; button.setAttribute('aria-pressed', String(state.furniture === button.dataset.furniture)); });
  el('worldstatus').hidden = !state.windowWarning; el('worldstatus').textContent = state.windowWarning || '';
  el('show-label').textContent = state.hidden ? '显示桌宠' : '隐藏桌宠';
  el('count').textContent = state.characters.length;
  if (rebuild) list();
}
async function change(patch) {
  try { const next = await api.update(patch); if (next) render(next); el('feedback').textContent = '已保存'; }
  catch { el('feedback').textContent = '保存失败，请重试'; }
  clearTimeout(feedbackTimer); feedbackTimer = setTimeout(() => { el('feedback').textContent = ''; }, 1800);
}
el('search').addEventListener('input', list);
el('size').addEventListener('input', event => { el('size-label').textContent = `${event.target.value} px`; });
el('size').addEventListener('change', event => change({ size: Number(event.target.value) }));
el('top').onchange = event => change({ alwaysOnTop: event.target.checked });
el('paused').onchange = event => change({ paused: event.target.checked });
for (const key of ['physics', 'roaming', 'windowWalking', 'effectsEnabled']) el(key).onchange = event => change({ [key]: event.target.checked });
for (const key of ['voiceEnabled', 'idleVoice']) el(key).onchange = event => change({ [key]: event.target.checked });
el('voiceLanguage').onchange = event => change({ voiceLanguage: event.target.value });
el('idleInterval').onchange = event => change({ idleInterval: Number(event.target.value) });
el('volume').oninput = event => { el('volume-label').textContent = `${event.target.value}%`; };
el('volume').onchange = event => change({ volume: Number(event.target.value) / 100 });
el('voice-preview').onclick = () => api.command('voice-preview');
document.querySelectorAll('[data-furniture]').forEach(button => { button.onclick = () => change({ furniture: button.dataset.furniture }); });
const sections = ['buddy', 'voice'];
function selectSection(section, focus = false) {
  for (const name of sections) {
    const selected = name === section, tab = el(`tab-${name}`);
    el(`${name}-panel`).hidden = !selected; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
  }
  if (focus) el(`tab-${section}`).focus();
}
for (const section of sections) {
  const tab = el(`tab-${section}`);
  tab.onclick = () => selectSection(section);
  tab.onkeydown = event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1
      : (sections.indexOf(section) + (event.key === 'ArrowRight' ? 1 : -1) + sections.length) % sections.length;
    selectSection(sections[index], true);
  };
}
el('show').onclick = () => api.command(state.hidden ? 'show' : 'hide');
el('interact').onclick = () => api.command('interact');
el('reset').onclick = () => api.command('reset');
el('quit').onclick = () => api.command('quit');
api.onState(render); render(await api.getState());
try { voiceCatalog = await (await fetch('assets/voices/catalog.json')).json(); render(state); } catch (error) { console.warn('Voice catalogue unavailable', error); }
