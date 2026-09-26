const priorities = { welcome: 0, idle: 0, furniture: 1, interact: 2, pet: 3, pickup: 4, preview: 5, bond: 6, 'initiative-invite': 1, 'initiative-reply': 5 };
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
export function createPetVoice({ makeAudio = () => new Audio(), now = () => performance.now(), random = Math.random,
  onLine = () => {}, onEnd = () => {}, onError = () => {}, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let bank = null, settings = { voiceEnabled: true, volume: .45, voiceLanguage: 'jp', idleVoice: true, idleInterval: 120 };
  let audio = null, token = 0, active = null, previousId = null, lastStart = -Infinity, nextIdle = Infinity;
  let completed = 0, lastError = '', lastLine = null, playbackSequence = 0, captionTimer = null, silenceCurrent = null;
  let audioContext = null, sourceNode = null, analyser = null, samples = null;
  async function meter(player) {
    if (typeof AudioContext === 'undefined' || !(player instanceof HTMLMediaElement)) return;
    try {
      audioContext ||= new AudioContext();
      if (audioContext.state === 'suspended') await audioContext.resume();
      if (audio !== player || audioContext.state !== 'running') return;
      analyser = audioContext.createAnalyser(); analyser.fftSize = 512;
      samples = new Float32Array(analyser.fftSize);
      sourceNode = audioContext.createMediaElementSource(player);
      sourceNode.connect(analyser); analyser.connect(audioContext.destination);
    } catch { /* Unsupported output keeps ordinary audio and a timed mouth fallback. */ }
  }
  function sampleSpeech() {
    if (!audio || !active || active.silent || audio.paused || audio.ended || audio.readyState < 2 || settings.paused || !settings.voiceEnabled || settings.volume <= 0) return { speaking: false, level: 0 };
    if (analyser && samples) {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0; for (const value of samples) sum += value * value;
      return { speaking: true, level: Math.min(1, Math.max(0, Math.sqrt(sum / samples.length) - .008) * 9) };
    }
    // Only when Web Audio is unavailable: follow media time, never wall-clock time.
    const time = audio.currentTime || 0;
    return { speaking: true, level: Math.max(0, Math.sin(time * 23) * .55 + Math.sin(time * 11) * .25) };
  }
  const idleInterval = () => settings.idleInterval * (Number.isFinite(settings.care?.energy) && settings.care.energy < 30 ? 2 : 1);
  const schedule = () => { nextIdle = now() + idleInterval() * 1000 * (1 + random()); };
  const metadata = (item, reason) => ({ reason, event: item.event, lineId: item.id, playbackId: item.playbackId, language: item.language });
  function releaseAudio() {
    sourceNode?.disconnect(); analyser?.disconnect(); sourceNode = analyser = samples = null;
    if (audio) { const player = audio; audio = null; player.pause(); player.removeAttribute('src'); player.load(); }
  }
  function stop(reason = 'interrupted') {
    const previous = active;
    token++;
    if (captionTimer !== null) clearTimer(captionTimer);
    captionTimer = null; silenceCurrent = null; active = null; releaseAudio(); schedule();
    if (previous) onEnd(metadata(previous, reason));
  }
  async function playLine(line, language, event, { force = false, silent = false, exact = false } = {}) {
    if ((!settings.voiceEnabled && !exact) || settings.paused || !bank) return false;
    if (settings.care?.resting && ['idle', 'welcome'].includes(event)) return false;
    const priority = priorities[event] ?? 2;
    if (!force && (now() - lastStart < 2500 || (active && priority <= active.priority))) return false;
    stop(); const ownToken = token;
    const ownActive = { priority, event, id: line.id, playbackId: ++playbackSequence, language, exact, silent: false };
    active = ownActive; lastStart = now(); previousId = line.id; lastError = '';
    const current = () => ownToken === token && active === ownActive;
    let captionMode = false;
    const finish = reason => {
      if (!current()) return;
      if (reason !== 'error') completed++;
      stop(reason);
    };
    const showLine = silent => {
      lastLine = { ...line, language, event, playbackId: ownActive.playbackId, silent };
      onLine(lastLine);
    };
    const showCaption = reason => {
      if (!current()) return false;
      if (captionMode) return true;
      captionMode = true; ownActive.silent = true; releaseAudio();
      showLine(true);
      if (!current()) return false;
      const duration = Math.max(3000, Math.min(8000, 2200 + (line.text || '').length * 90));
      captionTimer = setTimer(() => finish(reason), duration);
      return true;
    };
    silenceCurrent = showCaption;
    const fail = message => {
      if (!current() || captionMode) return captionMode;
      lastError = message;
      if (exact) { showCaption('error'); onError(event); return true; }
      finish('error'); onError(event); return false;
    };
    if (silent || (exact && (!settings.voiceEnabled || settings.volume <= 0))) return showCaption('silent');
    try {
      const player = makeAudio(); audio = player; player.volume = settings.volume; player.preload = 'auto'; player.src = line.file;
      player.addEventListener('ended', () => { if (!captionMode) finish('ended'); }, { once: true });
      player.addEventListener('error', () => fail('audio-load'), { once: true });
      await player.play();
      if (!current()) return false;
      if (!captionMode) void meter(player);
      if (!captionMode) showLine(false);
      return true;
    } catch (error) {
      return current() ? fail(error.name || 'audio-play') : false;
    }
  }
  async function speak(event, { force = false } = {}) {
    if (!settings.voiceEnabled || settings.paused || !bank) return false;
    const pool = voicePool(bank, settings.voiceLanguage, event);
    let choices = pool.lines.filter(line => line.id !== previousId);
    if (!choices.length) choices = pool.lines;
    if (!choices.length) { schedule(); return false; }
    const line = choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
    return playLine(line, pool.language, event, { force });
  }
  function speakLine(lineOrId, { event = 'initiative-reply', force = false, silent = false, language: requestedLanguage } = {}) {
    if (!['initiative-invite', 'initiative-reply'].includes(event)) return Promise.resolve(false);
    if (requestedLanguage !== undefined && !['jp', 'cn'].includes(requestedLanguage)) return Promise.resolve(false);
    const language = requestedLanguage || (bank?.languages?.[settings.voiceLanguage]?.length ? settings.voiceLanguage : 'jp');
    const id = typeof lineOrId === 'string' ? lineOrId : lineOrId?.id;
    // Resolve the full trusted catalogue record; callers cannot supply a new
    // file URL, subtitle or another student. An explicit language lets one
    // initiative's invite/reply pair fall back together without changing prefs.
    const line = bank?.languages?.[language]?.find(candidate => candidate.id === id);
    if (!line) return Promise.resolve(false);
    return playLine(line, language, event, { force, silent, exact: true });
  }
  return {
    setCharacter(value) { stop(); bank = value; previousId = null; lastStart = -Infinity; lastLine = null; },
    configure(value) {
      const before = settings, beforeInterval = idleInterval(); settings = { ...settings, ...value };
      if (settings.paused || before.voiceLanguage !== settings.voiceLanguage
        || (settings.care?.resting && ['idle', 'welcome'].includes(active?.event))) stop();
      else if (!settings.voiceEnabled || (active?.exact && settings.volume <= 0)) {
        if (active?.exact) silenceCurrent?.('silent'); else stop();
      }
      if (audio) audio.volume = settings.volume;
      if (beforeInterval !== idleInterval() || before.idleVoice !== settings.idleVoice || before.care?.resting !== settings.care?.resting) schedule();
    },
    speak, speakLine, stop, sampleSpeech,
    tick(allowed) {
      if (!allowed || !settings.voiceEnabled || settings.paused || !settings.idleVoice || settings.care?.resting) { schedule(); return; }
      if (!active && now() >= nextIdle) { schedule(); void speak('idle'); }
    },
    diagnostics: () => ({ playing: Boolean(active), metered: Boolean(sourceNode && analyser), active, lastLine, completed, lastError, nextIdle, language: settings.voiceLanguage, enabled: settings.voiceEnabled, paused: settings.paused, currentTime: audio?.currentTime || 0, duration: Number.isFinite(audio?.duration) ? audio.duration : null, volume: audio?.volume ?? settings.volume,
      idleVoice: settings.idleVoice, idleInterval: idleInterval(), userIdleInterval: settings.idleInterval, resting: Boolean(settings.care?.resting) }),
    dispose() { stop(); const context = audioContext; audioContext = null; void context?.close().catch(() => {}); }
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
