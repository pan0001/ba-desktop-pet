import { mount } from '../scripts/model-viewer.js';
import { createPetVoice, createHeadStroke } from '../scripts/pet-voice.js';
import { createInteractionEffects } from '../scripts/interaction-effects.js';
import { createProactiveEvents } from '../scripts/proactive-events.js';
const stage = document.querySelector('#stage'), notice = document.querySelector('#notice'), message = document.querySelector('#message');
const api = window.pet;
const help = document.querySelector('#help');
const speech = document.querySelector('#speech');
const invitation = document.querySelector('#initiative');
const effects = createInteractionEffects(document.querySelector('#effects'));
const reducedEffects = matchMedia('(prefers-reduced-motion: reduce)');
const speechSize = { width: 200, height: 70 };
const invitationSize = { width: 220, height: 60 };
const speechResize = new ResizeObserver(entries => {
  for (const entry of entries) {
    const box = entry.borderBoxSize?.[0], size = entry.target === invitation ? invitationSize : speechSize;
    if (box?.inlineSize) { size.width = box.inlineSize; size.height = box.blockSize; }
  }
});
speechResize.observe(speech);
speechResize.observe(invitation);
const stroke = createHeadStroke();
let voiceCatalog = {}, initiativeCatalog = {}, welcomeTimer;
const voice = createPetVoice({
  onLine(line) {
    speech.textContent = line.text; speech.hidden = false;
    speech.dataset.language = line.language; speech.dataset.event = line.event; speech.dataset.file = line.file;
    stage.dataset.speaking = 'true';
    if (['idle', 'welcome'].includes(line.event)) express('note', 0, 1800);
  },
  onEnd(meta) {
    viewer?.closeMouth();
    speech.hidden = true; stage.dataset.speaking = 'false';
    if (meta?.event === 'initiative-reply' && eventContext?.pair.reply === meta.lineId && meta.reason !== 'interrupted') initiatives.finish(eventContext.id, 'completed');
    else if (meta?.event === 'initiative-reply' && meta.reason === 'interrupted') initiatives.cancel('voice-interrupted');
  },
  onError(event) { if (!['idle', 'welcome', 'initiative-invite', 'initiative-reply'].includes(event)) tell('这句语音暂时无法播放，稍后再试。', 2200); }
});
let viewer, request, serial = 0, selected, current, pointer = null, dragged = false, suspended = false;
let noticeTimer, lastHit = -Infinity, cachedRegion = null, hitX, hitY;
let grabPoint, interactionPoint, headPoint, footPoint, tapCount = 0;
let latestMotion = { vx: 0, mode: 'idle', direction: 1 }, reportedMode = '', lastFrameReport = 0;
let eventContext = null, previousInvitation = null, nativeGrabStarted = false, initiativeClockOffset = 0;
const initiatives = createProactiveEvents({
  now: () => performance.now() + initiativeClockOffset,
  async onStart({ id, isCurrent }) {
    const entries = availableInvitations();
    const choices = entries.filter(item => item.entry.id !== previousInvitation);
    const chosen = (choices.length ? choices : entries)[Math.floor(Math.random() * (choices.length || entries.length))];
    if (!chosen || !initiativeEligible()) return false;
    const characterId = current.characterId;
    const accepted = await api.initiative({ phase: 'waiting', id, characterId });
    if (!isCurrent() || !accepted?.ok || pointer !== null || !initiativeSafe()) {
      if (accepted?.ok) void api.initiative({ phase: 'idle', id, characterId });
      return false;
    }
    eventContext = { ...chosen, id, characterId };
    previousInvitation = chosen.entry.id;
    clearTimeout(welcomeTimer); clearTimeout(noticeTimer); notice.hidden = true; stroke.reset();
    invitation.querySelector('strong').textContent = chosen.entry.prompt;
    invitation.querySelector('span').textContent = '点我或角色回应';
    invitation.disabled = false; invitation.hidden = false;
    stage.dataset.initiative = 'waiting';
    viewer.greet(); express('note', 2, 2200);
    if (chosen.pair.invite) void voice.speakLine(chosen.pair.invite, { event: 'initiative-invite', force: true, language: chosen.language });
    return true;
  },
  async onRespond({ id, isCurrent }) {
    const context = eventContext;
    if (!context || context.id !== id) return false;
    const accepted = await api.initiative({ phase: 'responding', id, characterId: context.characterId });
    if (!isCurrent() || !accepted?.ok) return false;
    invitation.disabled = true; invitation.querySelector('span').textContent = '正在回应老师…';
    stage.dataset.initiative = 'responding';
    viewer.greet(); sparkle('pet'); express('heart', 2, 2400);
    return voice.speakLine(context.pair.reply, { event: 'initiative-reply', force: true, language: context.language });
  },
  onFinish({ id, reason }) {
    const context = eventContext;
    if (!context || context.id !== id) return;
    eventContext = null;
    invitation.hidden = true; invitation.disabled = false; stage.dataset.initiative = 'idle';
    if (voice.diagnostics().active?.event?.startsWith('initiative-')) voice.stop();
    void api.initiative({ phase: 'idle', id, characterId: context.characterId });
    // Credit one ordinary tap only after the reply; normal care caps still apply.
    if (reason === 'completed' && context.characterId === current?.characterId) recordCare('tap');
  }
});
function availableInvitations() {
  const studentId = current?.characters.find(c => c.id === current.characterId)?.studentId;
  const bank = voiceCatalog.students?.[studentId];
  return (initiativeCatalog.students?.[studentId] || []).flatMap(entry => {
    const language = entry.languages[current.voiceLanguage] ? current.voiceLanguage : 'jp';
    const pair = entry.languages[language], lines = bank?.languages?.[language] || [];
    return pair && lines.some(line => line.id === pair.reply) && (!pair.invite || lines.some(line => line.id === pair.invite)) ? [{ entry, pair, language }] : [];
  });
}
function initiativeSafe() {
  return Boolean(viewer && current && !current.paused && !current.hidden && !suspended && !document.hidden
    && !current.care?.resting && (current.care?.energy ?? 100) >= 25 && current.furniture === 'none'
    && !latestMotion.reaction && !latestMotion.dragging && !['held', 'fall'].includes(latestMotion.mode));
}
function initiativeEligible() {
  return initiativeSafe() && pointer === null && ['idle', 'walk'].includes(reportedMode) && !voice.diagnostics().playing;
}
function tickInitiatives() {
  if (!initiativeSafe()) initiatives.cancel('busy');
  initiatives.tick({ enabled: current?.proactiveEvents !== false, available: availableInvitations().length > 0, eligible: initiativeEligible() });
}
async function previewInitiative() {
  tickInitiatives();
  if (!await initiatives.preview() && initiatives.diagnostics().phase === 'idle') tell('等她说完话、站稳或休息结束后，再试试邀约吧。', 2600);
}
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
function visibilityChanged() { syncEffects(); if (document.hidden) initiatives.cancel('hidden'); }
document.addEventListener('visibilitychange', visibilityChanged);
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
    || current.paused || suspended || current.hidden || eventContext) return;
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
  initiatives.cancel('character');
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
    const loaded = await mount(stage, character, { desktop: true, sampleSpeech: voice.sampleSpeech, canvasScale: current.canvasScale, measureBounds: current.measureFrames, fps: 30, reducedMotion: Boolean(current.paused || suspended), signal: request.signal,
      onStatus(status) { if (id === serial && status.state === 'loading' && status.progress) message.textContent = `正在加载… ${Math.round(status.progress * 100)}%`; },
      onAnimationChange(name) { stage.dataset.animation = name; }
      ,onReaction(value) { if (id === serial) api.reaction(value); }
      ,onGeometry(value) { if (id === serial) { footPoint = { x: value.x, y: value.y - 3 }; api.geometry(value); } }
      ,onFrame(value) {
        if (id !== serial) return;
        if (value.headPoint) { headPoint = value.headPoint; effects.setAnchor(headPoint); }
        if (!help.hidden && value.reactionTop !== null && Number.isFinite(value.reactionTop)) help.style.top = `${Math.round(Math.max(42, value.reactionTop - 48))}px`;
        if (!invitation.hidden && value.speechAnchor) {
          const margin = invitationSize.width / 2 + 12;
          const x = Math.max(margin, Math.min(stage.clientWidth - margin, value.speechAnchor.x));
          invitation.style.left = `${Math.round(x)}px`;
          invitation.style.top = `${Math.round(Math.max(invitationSize.height + 12, value.speechAnchor.y))}px`;
          invitation.style.transform = 'translate(-50%,-100%)';
        }
        // Hidden captions need no layout reads or style writes each frame.
        if (!speech.hidden && value.speechAnchor) {
          const margin = Math.max(100, speechSize.width / 2 + 12);
          const x = Math.max(margin, Math.min(stage.clientWidth - margin, value.speechAnchor.x));
          const invitationOffset = invitation.hidden ? 0 : invitationSize.height + 8;
          speech.style.transform = `translate3d(${Math.round(x)}px,${Math.round(Math.max(speechSize.height + 12, value.speechAnchor.y - invitationOffset))}px,0) translate(-50%,-100%)`;
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
    welcomeTimer = setTimeout(() => { if (id === serial && !suspended && !current.hidden && pointer === null && !latestMotion.reaction && !eventContext) void voice.speak('welcome'); }, 1400);
    if (current.measureFrames) window.petCompanionTest = {
      voice: () => voice.diagnostics(), speak: event => voice.speak(event, { force: true }),
      effects: () => effects.diagnostics(),
      initiative: () => ({ ...initiatives.diagnostics(), context: eventContext }), previewInitiative,
      advanceInitiative: seconds => { for (let step = 0; step < Math.min(1200, seconds); step++) { initiativeClockOffset += 1000; tickInitiatives(); } },
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
  if (current && (['characterId', 'size', 'paused', 'furniture', 'voiceEnabled', 'voiceLanguage', 'proactiveEvents', 'hidden'].some(key => current[key] !== state[key]) || state.care?.resting)) initiatives.cancel('settings');
  if (['size', 'physics', 'paused', 'furniture', 'characterId'].some(key => current?.[key] !== state[key])) lastHit = -Infinity;
  current = state;
  document.documentElement.style.setProperty('--pet-size', `${state.size}px`);
  // Native DPI rounding can change the outer window by a pixel during travel.
  // Keep the projection and grabbed point in the requested logical canvas.
  stage.style.width = `${state.canvasWidth || Math.round(state.size * state.canvasScale)}px`;
  stage.style.height = `${state.canvasHeight || Math.round(state.size * state.canvasScale)}px`;
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
  return [notice, help, invitation].some(element => {
    if (element.hidden) return false;
    const r = element.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  });
}
function cursor({ x, y }) {
  if (!current || pointer !== null) return;
  const ui = overNotice(x, y), area = ui ? null : region(x, y);
  const active = ui || Boolean(area);
  api.hit(active); stage.dataset.hover = String(active);
  const head = !eventContext && !current.paused && !suspended && !latestMotion.reaction && area === 'head';
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
  if (initiatives.diagnostics().phase !== 'idle') { void initiatives.respond(); return; }
  if (latestMotion.reaction?.phase === 'help') { api.command('assist'); sparkle('assist'); express('heart', 6, 1800); void voice.speak('pet'); return; }
  sparkle('tap', point || headPoint);
  express(++tapCount % 3 === 0 ? 'question' : 'twinkle', 1);
  if (reportedMode !== 'furniture') viewer.greet();
  void voice.speak('interact');
  recordCare('tap');
}
function beginHold() {
  initiatives.cancel('drag');
  stroke.reset();
  if (current.furniture !== 'none') { viewer?.setFurniture('none'); void api.update({ furniture: 'none' }); }
  viewer?.hold(); sparkle('pickup', interactionPoint || headPoint); express('exclamation', 3); void voice.speak('pickup');
}
function finishPointer(allowThrow = false) {
  if (pointer === null) return;
  const old = pointer; pointer = null;
  if (stage.hasPointerCapture(old)) stage.releasePointerCapture(old);
  if (nativeGrabStarted) api.dragEnd(allowThrow === true && dragged);
  nativeGrabStarted = false; stage.dataset.drag = 'false';
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
  stage.setPointerCapture(pointer); api.hit(true);
  // An invitation click must not grab/release the physical body or lose its platform.
  nativeGrabStarted = initiatives.diagnostics().phase === 'idle';
  if (nativeGrabStarted) api.dragStart(interactionPoint);
});
function movePointer(event) {
  if (event.pointerId !== pointer) return;
  if (!dragged && Math.hypot(event.screenX - grabPoint.x, event.screenY - grabPoint.y) > 4) {
    if (!nativeGrabStarted) { initiatives.cancel('drag'); api.dragStart(interactionPoint); nativeGrabStarted = true; }
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
invitation.onclick = () => { void initiatives.respond(); };
api.onState(update);
api.onCursor(cursor);
api.onCare?.(showCare);
api.onInitiativeCancel(value => { if (initiatives.diagnostics().id === value.id) initiatives.cancel(value.reason); });
api.onMotion(value => {
  if (value.reaction || value.dragging || ['fall', 'held'].includes(value.mode)) initiatives.cancel('motion');
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
  else if (action === 'voice-preview') { initiatives.cancel('voice-preview'); void voice.speak('preview', { force: true }); }
  else if (action === 'initiative-preview') void previewInitiative();
  else if (action === 'recover') { initiatives.cancel('recover'); finishPointer(); viewer?.rest(); }
  else if (action === 'suspend') { initiatives.cancel('suspend'); suspended = true; finishPointer(); syncPause(); }
  else if (action === 'resume') { suspended = false; syncPause(); }
});
try { voiceCatalog = await (await fetch('assets/voices/catalog.json')).json(); }
catch (error) { console.warn('Voice catalogue unavailable', error); }
try { initiativeCatalog = await (await fetch('assets/voices/initiatives.json')).json(); }
catch (error) { console.warn('Invitation catalogue unavailable', error); }
const activityTimer = setInterval(() => {
  tickInitiatives();
  if (initiatives.diagnostics().phase === 'idle') voice.tick(Boolean(viewer && pointer === null && !suspended && !current?.hidden && !latestMotion.reaction && ['idle', 'walk', 'furniture'].includes(reportedMode)));
}, 1000);
window.addEventListener('pagehide', () => { clearInterval(activityTimer); initiatives.cancel('closed'); clearTimeout(welcomeTimer); voice.dispose(); effects.dispose(); speechResize.disconnect(); reducedEffects.removeEventListener('change', syncPause); document.removeEventListener('visibilitychange', visibilityChanged); });
update(await api.getState());
