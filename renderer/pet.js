import { mount } from '../scripts/model-viewer.js';
import { createPetVoice, createHeadStroke } from '../scripts/pet-voice.js';
import { createInteractionEffects } from '../scripts/interaction-effects.js';
const stage = document.querySelector('#stage'), notice = document.querySelector('#notice'), message = document.querySelector('#message');
const api = window.pet;
const help = document.querySelector('#help');
const speech = document.querySelector('#speech');
const effects = createInteractionEffects(document.querySelector('#effects'));
const reducedEffects = matchMedia('(prefers-reduced-motion: reduce)');
const speechSize = { width: 200, height: 70 };
const speechResize = new ResizeObserver(entries => {
  const box = entries[0]?.borderBoxSize?.[0];
  if (box?.inlineSize) { speechSize.width = box.inlineSize; speechSize.height = box.blockSize; }
});
speechResize.observe(speech);
const stroke = createHeadStroke();
let voiceCatalog = {}, welcomeTimer;
const voice = createPetVoice({
  onLine(line) {
    speech.textContent = line.text; speech.hidden = false;
    speech.dataset.language = line.language; speech.dataset.event = line.event; speech.dataset.file = line.file;
    stage.dataset.speaking = 'true';
    if (['idle', 'welcome'].includes(line.event)) express('note', 0, 1800);
  },
  onEnd() { speech.hidden = true; stage.dataset.speaking = 'false'; },
  onError(event) { if (!['idle', 'welcome'].includes(event)) tell('这句语音暂时无法播放，稍后再试。', 2200); }
});
let viewer, request, serial = 0, selected, current, pointer = null, dragged = false, suspended = false;
let noticeTimer, lastHit = -Infinity, cachedRegion = null, hitX, hitY;
let grabPoint, interactionPoint, headPoint, footPoint, tapCount = 0;
let latestMotion = { vx: 0, mode: 'idle', direction: 1 }, reportedMode = '', lastFrameReport = 0;
function tell(text, duration = 0) {
  clearTimeout(noticeTimer); message.textContent = text; notice.hidden = false;
  if (duration) noticeTimer = setTimeout(() => { notice.hidden = true; }, duration);
}
function syncPause() {
  viewer?.setPaused(Boolean(current?.paused || suspended));
  if (current) voice.configure({ ...current, paused: Boolean(current.paused || suspended || current.hidden) });
  syncEffects();
}
function syncEffects() {
  effects.configure({ enabled: current?.effectsEnabled !== false && !reducedEffects.matches, paused: Boolean(current?.paused || suspended || current?.hidden || document.hidden) });
}
reducedEffects.addEventListener('change', syncPause);
document.addEventListener('visibilitychange', syncEffects);
function sparkle(type, point = headPoint) {
  if (!point || !current || current.paused || suspended || current.hidden) return;
  effects.burst(type, { ...point, scale: current.size / 360 });
}
function express(kind, priority = 1, duration = 1600) {
  if (!headPoint || !current || current.paused || suspended || current.hidden) return;
  effects.setAnchor(headPoint);
  effects.emotion(kind, { scale: current.size / 360, priority, duration });
}
function recordCare(action) {
  // The result is presented by onCare, never both the invoke response and event.
  if (current && api.care) void api.care(action, current.characterId).catch(error => console.warn('Care interaction unavailable', error));
}
function showCare(result) {
  if (!current || String(result.characterId) !== String(current.characterId)) return;
  if (result.care) { current = { ...current, care: result.care }; voice.configure({ care: result.care }); }
  const companionEvent = result.action === 'companionship';
  if ((!result.ok && !companionEvent) || (!result.changed && !result.levelUp && !companionEvent)) return;
  stage.dataset.careAction = result.action;
  if (result.care) { stage.dataset.bondLevel = String(result.care.level); stage.dataset.resting = String(Boolean(result.care.resting)); }
  // Care rewards may arrive from settings while a physical reaction is active.
  // Keep that reaction intact and let the care panel show the saved result.
  if (!viewer || pointer !== null || latestMotion.dragging || latestMotion.reaction
    || ['held', 'fall'].includes(latestMotion.mode) || ['held', 'fall'].includes(reportedMode)
    || current.paused || suspended || current.hidden) return;
  if (result.levelUp) {
    sparkle('pet'); express('heart', 6, 2400);
    if (reportedMode !== 'furniture' && !current.care?.resting) viewer.greet();
    void voice.speak('bond', { force: true });
    tell(`羁绊提升至 Lv.${result.care?.level ?? current.care?.level ?? 1}${result.care?.title ? ` · ${result.care.title}` : ''}`, 3500);
    return;
  }
  // Direct petting/taps and assistance already have immediate local feedback.
  if (['pet', 'tap', 'assist'].includes(result.action)) return;
  if (companionEvent) {
    if (result.emote === 'assist' && result.message) tell(result.message, 3000);
    return;
  }
  if (['rest', 'wake'].includes(result.action)) {
    if (result.message) tell(result.message, 3000);
    return;
  }
  if (result.message) tell(result.message, 3000);
  if (current.care?.resting) return;
  if (reportedMode !== 'furniture') viewer.greet();
  if (['pet', 'tap', 'assist'].includes(result.emote)) sparkle(result.emote);
  express(({ pet: 'heart', tap: 'twinkle', assist: 'heart', idle: 'note' })[result.emote] || 'note', 2, 1900);
  if (['pet', 'interact', 'idle'].includes(result.voice)) void voice.speak(result.voice);
}
async function load(character) {
  const id = ++serial;
  selected = character.id;
  clearTimeout(welcomeTimer); stroke.reset(); effects.clear(); headPoint = footPoint = null; lastHit = -Infinity; tapCount = 0;
  voice.setCharacter(voiceCatalog.students?.[character.studentId]);
  request?.abort(); viewer?.dispose(); viewer = null;
  help.hidden = true; reportedMode = '';
  stage.replaceChildren(); stage.dataset.state = 'loading';
  request = new AbortController();
  document.querySelector('#retry').hidden = true;
  document.querySelector('#settings').hidden = true;
  tell(`正在唤醒 ${character.name.split(' (')[0]}…`);
  // Show recoverable loading/error state even if the model never finishes loading.
  api.ready();
  try {
    const loaded = await mount(stage, character, { desktop: true, canvasScale: current.canvasScale, measureBounds: current.measureFrames, fps: 30, reducedMotion: Boolean(current.paused || suspended), signal: request.signal,
      onStatus(status) { if (id === serial && status.state === 'loading' && status.progress) message.textContent = `正在加载… ${Math.round(status.progress * 100)}%`; },
      onAnimationChange(name) { stage.dataset.animation = name; }
      ,onReaction(value) { if (id === serial) api.reaction(value); }
      ,onGeometry(value) { if (id === serial) { footPoint = { x: value.x, y: value.y - 3 }; api.geometry(value); } }
      ,onFrame(value) {
        if (id !== serial) return;
        if (value.headPoint) { headPoint = value.headPoint; effects.setAnchor(headPoint); }
        if (!help.hidden && value.reactionTop !== null && Number.isFinite(value.reactionTop)) help.style.top = `${Math.round(Math.max(42, value.reactionTop - 48))}px`;
        // Hidden captions need no layout reads or style writes each frame.
        if (!speech.hidden && value.speechAnchor) {
          const margin = Math.max(100, speechSize.width / 2 + 12);
          const x = Math.max(margin, Math.min(stage.clientWidth - margin, value.speechAnchor.x));
          speech.style.transform = `translate3d(${Math.round(x)}px,${Math.round(Math.max(speechSize.height + 12, value.speechAnchor.y))}px,0) translate(-50%,-100%)`;
        }
        stage.dataset.furniture = value.furniture;
        if (current.measureFrames) {
          const frames = window.petFrames ||= [];
          frames.push({ ...value, at: performance.now() });
          if (frames.length > 600) frames.shift();
        }
        if (value.mode !== reportedMode) { reportedMode = value.mode; api.animation(value.mode); }
        if (performance.now() - lastFrameReport > 150) {
          lastFrameReport = performance.now(); stage.dataset.time = value.time?.toFixed(3);
          stage.dataset.tilt = value.tilt?.toFixed(4); stage.dataset.hair = value.hair?.toFixed(4); stage.dataset.hairBones = value.hairBones;
          stage.dataset.mode = value.mode; stage.dataset.yaw = value.yaw?.toFixed(3);
          stage.dataset.grabError = value.grabError?.toFixed(4) ?? '';
          stage.dataset.grabSurface = value.grabbedSurface || '';
        }
      }
    });
    if (id !== serial) { loaded.dispose(); return; }
    viewer = loaded; viewer.setPhysics(current.physics); viewer.setMotion(latestMotion); viewer.setFurniture(current.furniture); syncPause();
    stage.dataset.state = 'ready'; stage.dataset.character = character.id;
    tell('头部来回轻拂可摸头 · 按住拖动', 4500);
    welcomeTimer = setTimeout(() => { if (id === serial && !suspended && !current.hidden && pointer === null && !latestMotion.reaction) void voice.speak('welcome'); }, 1400);
    if (current.measureFrames) window.petCompanionTest = {
      voice: () => voice.diagnostics(), speak: event => voice.speak(event, { force: true }),
      effects: () => effects.diagnostics(),
      hitRegion: (x, y) => viewer?.hitRegion(x, y), viewer: () => viewer?.diagnostics()
    };
  } catch (error) {
    if (id !== serial || error.name === 'AbortError') return;
    console.error(error); stage.dataset.state = 'error';
    tell('角色加载失败，请重试或换一个角色。');
    document.querySelector('#retry').hidden = false;
    document.querySelector('#settings').hidden = false;
    api.hit(true);
  }
}
function update(state) {
  if (['size', 'physics', 'paused', 'furniture', 'characterId'].some(key => current?.[key] !== state[key])) lastHit = -Infinity;
  current = state;
  document.documentElement.style.setProperty('--pet-size', `${state.size}px`);
  const character = state.characters.find(c => c.id === state.characterId);
  if (character && selected !== character.id) { finishPointer(); load(character); }
  else { viewer?.setPhysics(state.physics); viewer?.setFurniture(state.furniture); syncPause(); }
  voice.configure({ ...state, paused: Boolean(state.paused || suspended || state.hidden) });
  syncEffects();
}
function region(x, y, force = false) {
  if (force || lastHit === -Infinity || x !== hitX || y !== hitY || (!current?.paused && performance.now() - lastHit > 75)) {
    cachedRegion = viewer?.hitRegion(x, y) || null; lastHit = performance.now(); hitX = x; hitY = y;
  }
  return cachedRegion;
}
function overNotice(x, y) {
  return [notice, help].some(element => {
    if (element.hidden) return false;
    const r = element.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  });
}
function cursor({ x, y }) {
  if (pointer !== null) return;
  const ui = overNotice(x, y), area = ui ? null : region(x, y);
  const active = ui || Boolean(area);
  api.hit(active); stage.dataset.hover = String(active);
  const head = !current.paused && !suspended && !latestMotion.reaction && area === 'head';
  if (stroke.sample({ x, y, head, time: performance.now() })) {
    stage.dataset.pets = String(Number(stage.dataset.pets || 0) + 1);
    sparkle('pet', { x, y: y - 12 });
    express(Number(stage.dataset.pets) % 3 === 0 ? 'shy' : 'heart', 2, 1800);
    if (reportedMode !== 'furniture') viewer?.greet();
    void voice.speak('pet');
    recordCare('pet');
  }
}
function interact(point) {
  if (!viewer) return;
  if (current.paused) { tell('动画已暂停，可在右键菜单中继续。', 2000); return; }
  if (latestMotion.reaction?.phase === 'help') { api.command('assist'); sparkle('assist'); express('heart', 6, 1800); void voice.speak('pet'); return; }
  sparkle('tap', point || headPoint);
  express(++tapCount % 3 === 0 ? 'question' : 'twinkle', 1);
  if (reportedMode !== 'furniture') viewer.greet();
  void voice.speak('interact');
  recordCare('tap');
}
function beginHold() {
  stroke.reset();
  if (current.furniture !== 'none') { viewer?.setFurniture('none'); void api.update({ furniture: 'none' }); }
  viewer?.hold(); sparkle('pickup', interactionPoint || headPoint); express('exclamation', 3); void voice.speak('pickup');
}
function finishPointer(allowThrow = false) {
  if (pointer === null) return;
  const old = pointer; pointer = null;
  if (stage.hasPointerCapture(old)) stage.releasePointerCapture(old);
  api.dragEnd(allowThrow === true && dragged); stage.dataset.drag = 'false';
  viewer?.releaseGrab();
  if (dragged) viewer?.rest();
  else if (viewer) api.animation(viewer.diagnostics().mode);
}
stage.addEventListener('pointerdown', event => {
  if (event.button !== 0 || !region(event.clientX, event.clientY, true)) return;
  if (latestMotion.reaction?.phase === 'help') { interact(); return; }
  if (!viewer?.prepareGrab(event.clientX, event.clientY)) return;
  pointer = event.pointerId; dragged = false;
  grabPoint = { x: event.screenX, y: event.screenY };
  interactionPoint = { x: event.clientX, y: event.clientY };
  stage.setPointerCapture(pointer); api.hit(true); api.dragStart({ x: event.clientX, y: event.clientY });
});
function movePointer(event) {
  if (event.pointerId !== pointer) return;
  if (!dragged && Math.hypot(event.screenX - grabPoint.x, event.screenY - grabPoint.y) > 4) {
    dragged = true; stage.dataset.drag = 'true'; beginHold();
  }
  if (dragged) api.dragMove();
}
stage.addEventListener('pointermove', movePointer);
stage.addEventListener('pointerup', event => {
  if (event.pointerId !== pointer) return;
  movePointer(event);
  const wasDragged = dragged;
  finishPointer(true);
  if (!wasDragged) interact({ x: event.clientX, y: event.clientY });
});
stage.addEventListener('pointercancel', finishPointer);
stage.addEventListener('lostpointercapture', finishPointer);
window.addEventListener('blur', finishPointer);
window.addEventListener('contextmenu', event => { event.preventDefault(); finishPointer(); api.command('menu'); });
stage.addEventListener('keydown', event => {
  if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); interact(); }
  if (event.key === 'Escape') api.command('settings');
});
document.querySelector('#retry').onclick = () => load(current.characters.find(c => c.id === selected));
document.querySelector('#settings').onclick = () => api.command('settings');
help.onclick = () => interact();
api.onState(update);
api.onCursor(cursor);
api.onCare?.(showCare);
api.onMotion(value => {
  if (latestMotion.mode === 'fall' && value.platform) sparkle('landing', footPoint);
  if (value.thrown && !latestMotion.thrown) express('sweat_2', 4, 2000);
  if (value.reaction?.phase === 'help' && latestMotion.reaction?.phase !== 'help') { voice.stop(); express('anxiety', 5, 2400); }
  if (value.mode === 'fall' && stage.dataset.furniture && stage.dataset.furniture !== 'none') { viewer?.setFurniture('none'); void api.update({ furniture: 'none' }); }
  latestMotion = value; viewer?.setMotion(value);
  stage.dataset.platform = value.platform || ''; stage.dataset.movement = value.mode;
  stage.dataset.thrown = String(Boolean(value.thrown));
  stage.dataset.outcome = value.reaction?.outcome || '';
  help.hidden = value.reaction?.phase !== 'help';
  if (!help.hidden) { clearTimeout(noticeTimer); notice.hidden = true; }
});
api.onDrag(value => {
  if (value) { if (pointer !== null && !dragged) { dragged = true; stage.dataset.drag = 'true'; beginHold(); } }
  else { if (pointer !== null) finishPointer(); else if (stage.dataset.mode === 'held') viewer?.rest(); }
});
api.onAction(action => {
  if (action === 'interact') interact();
  else if (action === 'voice-preview') void voice.speak('preview', { force: true });
  else if (action === 'recover') { finishPointer(); viewer?.rest(); }
  else if (action === 'suspend') { suspended = true; finishPointer(); syncPause(); }
  else if (action === 'resume') { suspended = false; syncPause(); }
});
try { voiceCatalog = await (await fetch('assets/voices/catalog.json')).json(); }
catch (error) { console.warn('Voice catalogue unavailable', error); }
setInterval(() => voice.tick(Boolean(viewer && pointer === null && !suspended && !current?.hidden && !latestMotion.reaction && ['idle', 'walk', 'furniture'].includes(reportedMode))), 1000);
window.addEventListener('pagehide', () => { clearTimeout(welcomeTimer); voice.dispose(); effects.dispose(); speechResize.disconnect(); reducedEffects.removeEventListener('change', syncPause); document.removeEventListener('visibilitychange', syncEffects); });
update(await api.getState());
