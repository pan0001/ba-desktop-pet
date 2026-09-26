const api = window.pet;
let state, feedbackTimer, voiceCatalog = {};
let activeSection = 'buddy', careTimer, careMessageTimer, careRefreshPending = false, carePendingAction = null, stateRevision = 0;
const careLists = new Map();
const el = id => document.getElementById(id);
function shortName(character) { return character.name.replace(/\s*\([^)]*\)\s*$/, ''); }
const number = value => Number.isFinite(value) ? Math.max(0, value) : 0;
const integer = value => Math.floor(number(value));
function minutes(value) {
  const total = integer(value), hours = Math.floor(total / 60);
  return hours ? `${hours} 小时 ${total % 60} 分钟` : `${total} 分钟`;
}
function actionStatus(action) {
  if (!action) return '准备中';
  if (!action.available && action.reason) return action.reason;
  if (number(action.cooldownSeconds) > 0) {
    const seconds = Math.ceil(action.cooldownSeconds);
    return seconds >= 60 ? `约 ${Math.ceil(seconds / 60)} 分钟后再来` : `${seconds} 秒后再来`;
  }
  return action.remaining === null || action.remaining === undefined ? (action.reason || '随时都可以') : `今日还可 ${integer(action.remaining)} 次`;
}
function careList(id, items, create) {
  const signature = JSON.stringify(items);
  if (careLists.get(id) === signature) return;
  careLists.set(id, signature);
  el(id).replaceChildren(...items.map(create));
}
function renderCare(care = state?.care) {
  const character = state?.characters.find(character => character.id === state.characterId);
  const ready = Boolean(care && character && String(care.studentId) === String(character.studentId));
  el('care-loading').hidden = ready; el('care-content').hidden = !ready;
  el('care-panel').dataset.state = ready ? 'ready' : 'loading';
  el('care-badge-label').textContent = ready ? `羁绊 Lv.${integer(care.level)} · ${care.title || '相伴的日常'}` : '羁绊 · 准备中';
  if (!ready) {
    document.querySelectorAll('[data-care-action]').forEach(button => { button.disabled = true; });
    return;
  }
  el('care-panel').dataset.student = String(care.studentId);
  el('care-level').textContent = integer(care.level);
  el('care-title').textContent = care.title || '相伴的日常';
  el('care-partner').textContent = `${shortName(character)}，今天也请多关照。`;
  el('care-total').textContent = `累计陪伴 ${minutes(care.totalMinutes)}`;
  el('care-today').textContent = `今天陪伴 ${minutes(care.todayMinutes)}`;
  el('care-resting').hidden = !care.resting;
  el('care-xp').textContent = care.nextLevelXp > 0
    ? `${integer(care.levelXp)} / ${integer(care.nextLevelXp)} · 累计 ${integer(care.xp)}` : `满级纪念 · 累计 ${integer(care.xp)}`;
  el('care-progress').value = Math.min(1, number(care.progress));
  el('care-progress').setAttribute('aria-valuetext', `羁绊 ${integer(care.level)} 级，${Math.round(Math.min(1, number(care.progress)) * 100)}%`);
  for (const metric of ['mood', 'energy', 'fullness']) {
    const value = Math.min(100, number(care[metric]));
    el(`care-${metric}`).value = value;
    el(`care-${metric}`).setAttribute('aria-valuetext', `${care[`${metric}Label`] || ''}，${Math.round(value)} / 100`);
    el(`care-${metric}-label`).textContent = care[`${metric}Label`] || `${Math.round(value)} / 100`;
  }
  el('care-cap').textContent = care.dailyCapRemaining > 0 ? `日常互动与陪伴还可获得 ${integer(care.dailyCapRemaining)} 点羁绊经验。` : '今天的互动与陪伴经验已收好，仍然可以继续陪伴。';
  for (const kind of ['snack', 'gift', 'play', 'rest', 'claim']) {
    const action = care.actions?.[kind], button = el(`care-${kind}`);
    button.disabled = Boolean(carePendingAction) || !action?.available || typeof api.care !== 'function';
    button.setAttribute('aria-busy', String(carePendingAction === kind));
    if (action?.label) el(`care-${kind}-label`).textContent = action.label;
    el(`care-${kind}-status`).textContent = carePendingAction === kind ? '正在照顾…' : actionStatus(action);
  }
  el('care-rest').setAttribute('aria-pressed', String(Boolean(care.resting)));
  const daily = Array.isArray(care.daily) ? care.daily : [];
  careList('care-daily', daily, item => {
    const row = document.createElement('li'); row.dataset.id = item.id;
    row.classList.toggle('is-complete', Boolean(item.complete));
    const marker = document.createElement('span'); marker.className = 'daily-marker'; marker.textContent = item.complete ? '✓' : '·'; marker.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span'); label.className = 'daily-label'; label.textContent = item.label;
    const count = document.createElement('span'); count.className = 'daily-count'; count.textContent = item.complete ? '已完成' : `${integer(item.current)} / ${integer(item.target)}`;
    row.append(marker, label, count); return row;
  });
  const achievements = Array.isArray(care.achievements) ? care.achievements : [];
  el('care-achievement-count').textContent = `${achievements.filter(item => item.unlocked).length} / ${achievements.length}`;
  careList('care-achievements', achievements, item => {
    const row = document.createElement('li'); row.dataset.id = item.id; row.classList.toggle('is-unlocked', Boolean(item.unlocked));
    const marker = document.createElement('span'); marker.className = 'achievement-marker'; marker.textContent = item.unlocked ? '✦' : '◇'; marker.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('div'), title = document.createElement('b'), description = document.createElement('small');
    title.textContent = item.title; description.textContent = item.description;
    row.setAttribute('aria-label', `${item.unlocked ? '已获得' : '未获得'}：${item.title}`);
    copy.append(title, description); row.append(marker, copy); return row;
  });
  const recent = Array.isArray(care.recent) ? care.recent : [];
  el('care-recent-empty').hidden = recent.length > 0;
  careList('care-recent', recent, item => {
    const row = document.createElement('li'), text = document.createElement('span'), time = document.createElement('time');
    text.textContent = item.text;
    const date = new Date(item.at);
    if (Number.isFinite(date.getTime())) {
      time.dateTime = date.toISOString(); time.textContent = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
    }
    row.append(text, time); return row;
  });
}
async function refreshCare() {
  if (activeSection !== 'care' || document.hidden || careRefreshPending || carePendingAction || !state) return;
  const characterId = state.characterId, revision = stateRevision;
  careRefreshPending = true;
  try {
    const next = await api.getState();
    if (revision !== stateRevision || activeSection !== 'care' || document.hidden || state.characterId !== characterId || next?.characterId !== characterId) return;
    state = { ...state, care: next.care }; renderCare();
  } catch { /* The next interval or published state can restore the display. */ }
  finally { careRefreshPending = false; }
}
function syncCareRefresh() {
  clearInterval(careTimer); careTimer = null;
  if (activeSection === 'care' && !document.hidden) { void refreshCare(); careTimer = setInterval(refreshCare, 5000); }
}
async function takeCare(action) {
  if (carePendingAction || typeof api.care !== 'function' || !state?.care?.actions?.[action]?.available) return;
  const characterId = state.characterId;
  carePendingAction = action; stateRevision++; renderCare();
  let message, ok = false;
  try {
    const response = await api.care(action, characterId);
    if (response?.state && response.state.characterId === state.characterId) render(response.state);
    ok = Boolean(response?.ok); message = response?.message || (ok ? '这份心意，她收到了。' : '现在还不可以，稍后再试试吧。');
  } catch { message = '这次没能保存照顾记录，请稍后再试。'; }
  finally { carePendingAction = null; renderCare(); }
  if (state.characterId !== characterId) return;
  clearTimeout(careMessageTimer); el('care-message').textContent = message; el('care-message').dataset.ok = String(ok); el('care-message').hidden = false;
  careMessageTimer = setTimeout(() => { el('care-message').hidden = true; }, 7000);
}
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
  state = next; stateRevision++;
  if (rebuild) { clearTimeout(careMessageTimer); el('care-message').hidden = true; careLists.clear(); }
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
  renderCare();
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
const sections = ['buddy', 'voice', 'care'];
function selectSection(section, focus = false) {
  activeSection = section;
  for (const name of sections) {
    const selected = name === section, tab = el(`tab-${name}`);
    el(`${name}-panel`).hidden = !selected; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
  }
  if (focus) el(`tab-${section}`).focus();
  syncCareRefresh();
}
el('care-badge').onclick = () => selectSection('care', true);
document.querySelectorAll('[data-care-action]').forEach(button => { button.onclick = () => takeCare(button.dataset.careAction); });
document.addEventListener('visibilitychange', syncCareRefresh);
window.addEventListener('pagehide', () => { clearInterval(careTimer); clearTimeout(careMessageTimer); clearTimeout(feedbackTimer); document.removeEventListener('visibilitychange', syncCareRefresh); });
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
