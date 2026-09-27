import { FURNITURE, furnitureInteraction } from '../scripts/furniture-catalog.js';
import seatLayouts from '../assets/furniture/seats.json' with {type:'json'};
import { localizeDocument, locale, tr } from './localization.js';
const api = window.pet;
let state, feedbackTimer, voiceCatalog = {};
let furniturePage = 0, furnitureRenderKey = null;
let reloading = false;
function reloadForLanguage() {
  if (reloading) return;
  reloading = true;
  location.reload();
}
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
  const matches = state.characters.filter(c => (!el('resource-only-installed').checked||!state.resources||state.resources.characters[c.id]?.available) && [c.name, c.variant, ...Object.values(c.displayNames || {}), ...Object.values(c.fullNames || {})].join(' ').toLowerCase().includes(query));
  el('characters').replaceChildren(...matches.map(c => {
    const button = document.createElement('button'); button.className = 'character';
    button.dataset.id = c.id; button.setAttribute('aria-pressed', String(state.characterId === c.id));
    button.title = c.name + (c.variant ? ` · ${c.variant}` : '');
    if (c.portrait) { const img = document.createElement('img'); img.src = c.portrait; img.alt = ''; img.loading = 'lazy'; button.append(img); }
    const name = document.createElement('span'); name.className = 'character-name'; name.textContent = shortName(c);
    if (c.variant) { const variant = document.createElement('small'); variant.textContent = c.variant.includes('Carrier') ? '载具形态' : c.variant.includes('_02') ? '形态 2' : '标准形态'; name.append(variant); }
    const check = document.createElement('span'); check.className = 'selection-check'; check.textContent = '✓'; check.setAttribute('aria-hidden', 'true');
    const resource=state.resources?.characters[c.id];
    if(resource){const status=document.createElement('small');status.className='resource-badge';status.textContent=tr(resource.update?'更新资源':resource.available?'已下载':'下载')+(resource.size?' · '+resourceSize(resource.size):'');name.append(status);button.dataset.installed=String(resource.available);}
    button.append(name, check); button.onclick = async() => {if(await ensureResource('characters',c.id))change({ characterId: c.id });}; return button;
  }));
  el('empty').hidden = matches.length > 0;
}
let resourceRevision=-1;
const resourceSize=bytes=>(bytes/1000000).toFixed(1)+' MB';
async function ensureResource(section,id){
  const value=state.resources?.[section]?.[id];if(!value||(value.available&&!value.update))return true;
  const result=await api.resources('download',{section,id});if(!result?.ok)el('resource-status').textContent=result?.message||tr('下载失败，请重试');return !!result?.ok;
}
function renderResources(value){
  el('resource-panel').hidden=!value;if(!value)return;
  state.resources=value;const busy=['downloading','installing'].includes(value.status)||value.queued>0;
  el('resource-check').disabled=busy||value.status==='checking';el('resource-cancel').hidden=!busy;
  el('resource-progress').hidden=!busy;el('resource-progress').value=value.progress;
  const names={downloading:'下载中',installing:'安装中',checking:'检查中'};
  el('resource-status').textContent=names[value.status]?tr(names[value.status])+' · '+Math.round(value.progress||0)+'%'+(value.total?' · '+resourceSize(value.transferred)+' / '+resourceSize(value.total):'')+(value.queued?' · '+tr('排队')+' '+value.queued:''):tr(value.message||'在角色目录点击下载；已下载的角色可离线使用。');
  if(resourceRevision!==value.revision){resourceRevision=value.revision;const choice=el('resource-installed').value;
    el('resource-installed').replaceChildren(...state.characters.filter(c=>value.characters[c.id]?.available&&!value.characters[c.id]?.bundled).map(c=>new Option(c.name,c.id)));
    if([...el('resource-installed').options].some(o=>o.value===choice))el('resource-installed').value=choice;
    el('resource-remove').disabled=!el('resource-installed').options.length;list();renderFurniture();
  }
}
el('resource-check').onclick=()=>api.resources('check');el('resource-cancel').onclick=()=>api.resources('cancel');
el('resource-only-installed').onchange=list;
el('resource-remove').onclick=async()=>{const result=await api.resources('remove',{section:'characters',id:el('resource-installed').value});if(!result?.ok)el('resource-status').textContent=result?.message||tr('资源暂时无法移除，请稍后重试');};
api.onResources(value=>{if(state)renderResources(value);});
function render(next) {
  if (reloading) return;
  if (state && next.uiLocale !== state.uiLocale) { reloadForLanguage(); return; }
  const keys = document.querySelectorAll('.shortcut kbd');
  if (keys.length >= 2) { keys[0].textContent = next.platform === 'darwin' ? '⌘' : 'Ctrl'; keys[1].textContent = next.platform === 'darwin' ? '⌥' : 'Alt'; }
  const rebuild = !state || state.characterId !== next.characterId;
  state = next; stateRevision++;
  renderResources(state.resources);
  document.querySelector('.version').textContent = `v${state.version}`;
  el('checkUpdatesAutomatically').checked = state.checkUpdatesAutomatically;
  renderUpdates(state.updates);
  if (rebuild) { clearTimeout(careMessageTimer); el('care-message').hidden = true; careLists.clear(); }
  const c = state.characters.find(c => c.id === state.characterId);
  el('name').textContent = shortName(c); el('variant').textContent = c.name.match(/\(([^)]*)\)$/)?.[1] || '';
  if (c.portrait) { el('portrait').src = c.portrait; el('portrait').hidden = false; } else el('portrait').hidden = true;
  el('presence').textContent = state.resources?.characters[state.characterId]?.available===false ? '请先在角色目录下载伙伴' : state.hidden ? '暂时休息中' : state.paused ? '安静陪伴中' : '正在桌面陪伴你';
  el('size').value = state.size; el('size-label').textContent = `${state.size} px`;
  el('top').checked = state.alwaysOnTop; el('paused').checked = state.paused;
  for (const key of ['physics', 'roaming', 'windowWalking', 'effectsEnabled']) el(key).checked = state[key];
  for (const key of ['voiceEnabled', 'idleVoice', 'proactiveEvents']) el(key).checked = state[key];
  el('voiceLanguage').value = state.voiceLanguage; el('idleInterval').value = String(state.idleInterval);
  el('volume').value = Math.round(state.volume * 100); el('volume-label').textContent = `${Math.round(state.volume * 100)}%`;
  el('voice-preview').disabled = !state.voiceEnabled || state.paused;
  el('initiative-preview').disabled = !state.proactiveEvents || state.paused || state.hidden;
  el('initiative-status').textContent = !state.proactiveEvents ? '开启「主动找老师」后可试试。'
    : state.hidden ? '显示桌宠后可试试。' : state.paused ? '继续动画后可试试。' : '在桌面上等她的小邀约。';
  const bank = voiceCatalog.students?.[c.studentId], language = bank?.languages?.[state.voiceLanguage]?.length ? state.voiceLanguage : 'jp';
  const count = bank?.languages?.[language]?.length || 0;
  el('voice-status').textContent = count ? `${language === 'jp' ? '日语' : '中文'} · ${count} 句日常语音${language !== state.voiceLanguage ? '（暂无中文配音）' : ''}` : bank ? '暂无可用的日常语音' : '正在读取语音…';
  el('voice-preview').disabled ||= !count;
  if (bank && !count) {
    el('initiative-preview').disabled = true;
    el('initiative-status').textContent = '暂无可用的日常语音';
  }
  const furnitureKey = [state.characterId, state.furniture, state.uiLocale].join(':');
  renderScene();
  if (furnitureKey !== furnitureRenderKey) { if (rebuild) furniturePage = 0; furnitureRenderKey = furnitureKey; renderFurniture(); }
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
for (const key of ['voiceEnabled', 'idleVoice', 'proactiveEvents']) el(key).onchange = event => change({ [key]: event.target.checked });
el('voiceLanguage').onchange = event => change({ voiceLanguage: event.target.value });
el('idleInterval').onchange = event => change({ idleInterval: Number(event.target.value) });
el('volume').oninput = event => { el('volume-label').textContent = `${event.target.value}%`; };
el('volume').onchange = event => change({ volume: Number(event.target.value) / 100 });
el('voice-preview').onclick = () => api.command('voice-preview');
el('initiative-preview').onclick = () => api.command('initiative-preview');
async function sceneAction(action,value){const result=await api.scene(action,value);el('scene-message').textContent=result?.message||'';}
el('scene-add-student').onclick=async()=>{const id=el('scene-student').value;if(await ensureResource('characters',id))sceneAction('addStudent',{characterId:id});};
document.querySelector('.furniture-preferences').addEventListener('click', event => {
  const button = event.target.closest('[data-furniture]');
  if(button){if(button.dataset.furniture==='none'){void sceneAction('clearFurniture');if(state.furniture!=='none')change({furniture:'none'});}else void ensureResource('furniture',button.dataset.furniture).then(ok=>{if(ok)sceneAction('placeFurniture',{kind:button.dataset.furniture});});}
});
let sceneRenderKey='';
function renderScene(){
  const scene=state.desktopScene;if(!scene)return;
  const key=JSON.stringify([scene,state.uiLocale]);if(key===sceneRenderKey)return;sceneRenderKey=key;
  const selected=el('scene-student').value;
  const active=new Set(scene.students.map(a=>a.characterId));
  el('scene-student').replaceChildren(...state.characters.filter(c=>!active.has(c.id)).map(c=>new Option(c.name,c.id)));
  if([...el('scene-student').options].some(o=>o.value===selected))el('scene-student').value=selected;
  el('scene-add-student').disabled=scene.students.length>=6;
  const name=id=>state.characters.find(c=>c.id===id)?.name||id;
  function button(label,action){const b=document.createElement('button');b.textContent=label;b.onclick=action;return b;}
  el('scene-students').replaceChildren(...scene.students.map(a=>{
    const row=document.createElement('div'),text=document.createElement('span');text.dataset.noTranslate='';text.textContent=name(a.characterId);row.append(text);
    if(a.seated)row.append(button('离开家具',()=>sceneAction('leave',{actorId:a.id})));
    if(a.id!=='primary')row.append(button('收起学生',()=>sceneAction('remove',{id:a.id})));return row;
  }));
  el('scene-furniture').replaceChildren(...scene.furniture.map(f=>{
    const row=document.createElement('div'),text=document.createElement('span');text.dataset.noTranslate='';text.textContent=(FURNITURE[f.kind]?.names[locale]||f.kind)+` · ${f.occupants.length}/${f.capacity}`;
    row.append(text,button('收起',()=>sceneAction('remove',{id:f.id})));return row;
  }));
  if(scene.error)el('scene-message').textContent=scene.error;
  document.querySelector('[data-furniture="none"]').disabled=!scene.furniture.length&&state.furniture==='none';
  el('furniture-current').textContent=scene.furniture.length?({zh:'已摆放',ja:'配置済み',en:'Placed'}[locale]+` ${scene.furniture.length} / 6`):'未摆放家具';
}
el('furniture-search').oninput = el('furniture-filter').onchange = () => { furniturePage = 0; renderFurniture(); };
el('furniture-prev').onclick = () => { furniturePage--; renderFurniture(); };
el('furniture-next').onclick = () => { furniturePage++; renderFurniture(); };
function renderFurniture() {
  if (!state) return;
  const q = el('furniture-search').value.trim().toLowerCase(), interactionOnly = el('furniture-filter').value === 'interaction';
  const matched = item => Boolean(furnitureInteraction(item, state.characterId));
  const categories = ['Seats','Games','Tables','Beds','Decor','Plants','Lights','Floor','Walls'];
  const items = Object.values(FURNITURE).filter(item => (!interactionOnly || matched(item)) && [item.id, ...Object.values(item.names)].join(' ').toLowerCase().includes(q)).sort((a,b) => Number(matched(b))-Number(matched(a)) || categories.indexOf(a.category)-categories.indexOf(b.category) || a.names[locale].localeCompare(b.names[locale]));
  const pageSize = 18, totalPages = Math.max(1, Math.ceil(items.length/pageSize)); furniturePage = Math.max(0,Math.min(totalPages-1,furniturePage));
  el('furniture-list').replaceChildren(...items.slice(furniturePage*pageSize,(furniturePage+1)*pageSize).map(item => {
    const button = document.createElement('button'); button.dataset.furniture = item.id;
    const img = document.createElement('img'); img.src=item.thumbnail; img.alt='';img.loading='lazy';img.onerror=()=>{img.hidden=true;};
    const title=document.createElement('b');title.dataset.noTranslate='';title.textContent=item.names[locale]||item.names.zh;
    const hint=document.createElement('small'),capacity=seatLayouts.items[item.id]?.capacity||0;
    hint.textContent=capacity>1?({zh:`${capacity} 人互动`,ja:`${capacity} 人用`,en:`${capacity} students`}[locale]):matched(item)?'专用互动':'摆放陪伴';
    const resource=state.resources?.furniture[item.id];if(resource&&(!resource.available||resource.update))hint.textContent+=' · '+tr(resource.update?'更新资源':'下载')+' '+resourceSize(resource.size);
    const compatible=Object.keys(item.candidates).filter(id=>furnitureInteraction(item,id)).map(id=>state.characters.find(c=>c.id===id)?.name||id);button.title=compatible.join(' · ');button.append(img,title,hint);return button;
  }));
  el('furniture-hint').textContent='家具可单独拖动。支持的学生靠近空位后会自动互动；双击入座学生可离开，家具会留在原地。';
  el('furniture-count').textContent=items.length+' · '+(furniturePage+1)+' / '+totalPages;
  el('furniture-prev').disabled=furniturePage===0;el('furniture-next').disabled=furniturePage+1>=totalPages;
}
const sections = ['buddy', 'voice', 'care', 'updates'];
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
let updateState;
function renderUpdates(value) {
  if (!value) return;
  updateState = value;
  if (state) state.updates = value;
  const busy = ['checking', 'downloading', 'installing'].includes(value.status);
  const titles = { idle: '随时检查新版本', checking: '正在检查 GitHub…', current: '已是最新正式版', available: '有新的陪伴版本', downloading: '正在下载更新…', downloaded: '新版准备好了', installing: '正在重启安装…', error: '更新暂未完成' };
  el('update-current').textContent = '当前 v' + value.currentVersion;
  el('update-status').textContent = titles[value.status] || titles.idle;
  el('tab-updates').textContent = value.version ? '更新 ·' : '更新';
  const progress = value.status === 'downloading';
  el('update-detail').textContent = value.message || (progress ? (value.downloadKind === 'full' ? '正在下载完整安装包' : '优先增量下载，必要时下载完整包') + ' · ' + Math.round(value.progress) + '%' : value.version ? 'v' + value.version + (value.status === 'downloaded' ? ' 已校验，点击后保存状态并重启。' : ' 已发布') : '从 pan0001/ba-desktop-pet 的 GitHub 正式发布获取更新。');
  el('update-progress').hidden = !progress; el('update-progress').value = value.progress;
  el('update-checked').textContent = value.checkedAt ? '上次检查：' + new Date(value.checkedAt).toLocaleString('zh-CN') : '';
  el('update-check').disabled = busy || value.status === 'downloaded';
  el('update-download').hidden = value.status !== 'available';
  el('update-download').textContent = value.automatic ? '下载更新' : '下载新版';
  el('update-install').hidden = value.status !== 'downloaded';
  el('update-release').disabled = value.status === 'installing';
  el('update-mode').textContent = value.mode === 'installed' ? '安装版优先复用旧文件，只下载发生变化的部分。旧缓存缺失或增量下载失败时会自动下载完整包。退出桌宠不会自行安装。' : value.mode === 'mac' ? 'Mac 版会打开对应芯片的下载包，请下载后手动替换应用。当前版本尚未接入自动安装。' : value.mode === 'portable' ? '便携版请下载后手动替换程序。安装版支持应用内增量更新。' : '当前为开发版或未安装版本。安装 Windows 安装版后可使用应用内增量更新。';
  el('update-notes-card').hidden = !value.notes;
  el('update-notes').textContent = value.notes;
}
async function updateAction(action) {
  try { renderUpdates(await api.updater(action)); }
  catch { el('update-detail').textContent = '更新请求失败，请稍后重试。'; }
}
el('update-check').onclick = () => updateAction('check');
el('update-download').onclick = () => updateAction(updateState?.automatic ? 'download' : 'manual-download');
el('update-install').onclick = () => updateAction('install');
el('update-release').onclick = () => updateAction('release');
el('checkUpdatesAutomatically').onchange = event => change({ checkUpdatesAutomatically: event.target.checked });
api.onUpdater(renderUpdates);
api.onSection(section => { if (sections.includes(section)) selectSection(section, true); });
const initialState = await api.getState();
await localizeDocument(initialState.uiLocale);
el('uiLocale').value = initialState.uiLocale;
el('uiLocale').onchange = async event => { await api.update({ uiLocale: event.target.value, languageConfigured: true }); reloadForLanguage(); };
el('welcome-language').value = initialState.uiLocale;
el('language-welcome').addEventListener('cancel', event => event.preventDefault());
el('language-welcome-form').onsubmit = async event => {
  event.preventDefault(); el('language-start').disabled = true; el('language-error').hidden = true;
  try { await api.update({ uiLocale: el('welcome-language').value, languageConfigured: true }); reloadForLanguage(); }
  catch { el('language-error').textContent = '保存失败，请重试。'; el('language-error').hidden = false; el('language-start').disabled = false; }
};
api.onState(render); render(initialState);
if (!initialState.languageConfigured) el('language-welcome').showModal();
if (location.hash === '#updates') selectSection('updates');
try { voiceCatalog = await (await fetch('assets/voices/catalog.json')).json(); render(state); } catch (error) { console.warn('Voice catalogue unavailable', error); }
