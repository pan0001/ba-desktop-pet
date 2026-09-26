const priorities = { welcome: 0, idle: 0, furniture: 1, interact: 2, pet: 3, pickup: 4, preview: 5, bond: 6 };
export function voicePool(bank, language, event) {
  const effective = bank?.languages?.[language]?.length ? language : 'jp';
  const all = bank?.languages?.[effective] || [];
  const kind = event === 'preview' ? 'interact' : event;
  let lines = kind === 'bond' ? all.filter(line => /(?:^|_)Relationship_Up(?:_|$)/i.test(line.key || ''))
    : all.filter(line => line.events.includes(kind));
  if (!lines.length && kind === 'bond') lines = all.filter(line => line.events.includes('pet'));
  if (!lines.length && ['pet', 'bond', 'furniture'].includes(kind)) lines = all.filter(line => line.events.includes(kind === 'furniture' ? 'idle' : 'interact'));
  return { language: effective, lines };
}

// One speaker, no accumulating queue. Every subtitle travels with its own audio
// record; never pair another language/character's text by array position.
export function createPetVoice({ makeAudio = () => new Audio(), now = () => performance.now(), random = Math.random, onLine = () => {}, onEnd = () => {}, onError = () => {} } = {}) {
  let bank = null, settings = { voiceEnabled: true, volume: .45, voiceLanguage: 'jp', idleVoice: true, idleInterval: 120 };
  let audio = null, token = 0, active = null, previousId = null, lastStart = -Infinity, nextIdle = Infinity;
  let completed = 0, lastError = '', lastLine = null;
  const idleInterval = () => settings.idleInterval * (Number.isFinite(settings.care?.energy) && settings.care.energy < 30 ? 2 : 1);
  const schedule = () => { nextIdle = now() + idleInterval() * 1000 * (1 + random()); };
  function stop() {
    token++;
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    audio = null; active = null; onEnd(); schedule();
  }
  async function speak(event, { force = false } = {}) {
    if (!settings.voiceEnabled || settings.paused || !bank) return false;
    if (settings.care?.resting && ['idle', 'welcome'].includes(event)) return false;
    const priority = priorities[event] ?? 2;
    if (!force && (now() - lastStart < 2500 || (active && priority <= active.priority))) return false;
    const pool = voicePool(bank, settings.voiceLanguage, event);
    let choices = pool.lines.filter(line => line.id !== previousId);
    if (!choices.length) choices = pool.lines;
    if (!choices.length) { schedule(); return false; }
    const line = choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
    stop(); const ownToken = token;
    const player = makeAudio(); audio = player; player.volume = settings.volume; player.preload = 'auto'; player.src = line.file;
    active = { priority, event, id: line.id }; lastStart = now(); previousId = line.id; lastError = '';
    const finish = () => { if (ownToken !== token) return; completed++; audio = null; active = null; onEnd(); schedule(); };
    player.addEventListener('ended', finish, { once: true });
    player.addEventListener('error', () => { if (ownToken !== token) return; lastError = 'audio-load'; stop(); onError(event); }, { once: true });
    try {
      await player.play();
      if (ownToken !== token) return false;
      lastLine = { ...line, language: pool.language, event };
      onLine(lastLine); return true;
    } catch (error) {
      if (ownToken === token) { lastError = error.name || 'audio-play'; stop(); onError(event); }
      return false;
    }
  }
  return {
    setCharacter(value) { stop(); bank = value; previousId = null; lastStart = -Infinity; lastLine = null; },
    configure(value) {
      const before = settings, beforeInterval = idleInterval(); settings = { ...settings, ...value };
      if (!settings.voiceEnabled || settings.paused || before.voiceLanguage !== settings.voiceLanguage
        || (settings.care?.resting && ['idle', 'welcome'].includes(active?.event))) stop();
      if (audio) audio.volume = settings.volume;
      if (beforeInterval !== idleInterval() || before.idleVoice !== settings.idleVoice || before.care?.resting !== settings.care?.resting) schedule();
    },
    speak, stop,
    tick(allowed) {
      if (!allowed || !settings.voiceEnabled || settings.paused || !settings.idleVoice || settings.care?.resting) { schedule(); return; }
      if (!active && now() >= nextIdle) { schedule(); void speak('idle'); }
    },
    diagnostics: () => ({ playing: Boolean(active), active, lastLine, completed, lastError, nextIdle, language: settings.voiceLanguage, enabled: settings.voiceEnabled, paused: settings.paused, currentTime: audio?.currentTime || 0, duration: Number.isFinite(audio?.duration) ? audio.duration : null, volume: audio?.volume ?? settings.volume,
      idleVoice: settings.idleVoice, idleInterval: idleInterval(), userIdleInterval: settings.idleInterval, resting: Boolean(settings.care?.resting) }),
    dispose: stop
  };
}

// Hover strokes leave the established press-and-drag gesture untouched.
export function createHeadStroke() {
  let start = 0, last = null, direction = 0, reversals = 0, distance = 0, cooldown = -Infinity;
  function clear() { start = 0; last = null; direction = 0; reversals = distance = 0; }
  return {
    reset: clear,
    sample({ x, y, time, head }) {
      if (!head || time < cooldown) { clear(); return false; }
      if (!last || time - last.time > 300) { clear(); start = time; last = { x, y, time }; return false; }
      const dx = x - last.x, dy = y - last.y; last = { x, y, time };
      if (Math.abs(dx) >= 3 && Math.abs(dy) < 28) {
        const sign = Math.sign(dx); if (direction && sign !== direction) reversals++;
        direction = sign; distance += Math.abs(dx);
      }
      if (reversals >= 2 && distance >= 50 && time - start >= 300) { cooldown = time + 8000; clear(); return true; }
      return false;
    }
  };
}
