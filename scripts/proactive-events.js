const seconds = (value, fallback, maximum = 86400) => Number.isFinite(value) ? Math.min(maximum, Math.max(0, value)) : fallback;

// No timers or DOM: the owner supplies regular ticks only while it is alive.
// Delay settings use seconds; the injected monotonic clock uses milliseconds.
export function createProactiveEvents({
  now = () => performance.now(), random = Math.random,
  onStart = () => true, onRespond = () => true, onFinish = () => {},
  firstDelay = [60, 120], repeatDelay = [300, 600], waitTimeout = 45,
  responseTimeout = 30, maxTickGap = 5,
} = {}) {
  let phase = 'idle', active = null, sequence = 0, generation = 0;
  let quietSeconds = 0, lastTick = null, previousEligible = false, attempted = false;
  let flags = { eligible: false, enabled: false, available: false };
  let lastReason = null;
  const sample = range => {
    const values = Array.isArray(range) ? range : [range, range];
    const low = seconds(values[0], 60), high = Math.max(low, seconds(values[1], low));
    const draw = random(), fraction = Number.isFinite(draw) ? Math.max(0, Math.min(1, draw)) : .5;
    return low + (high - low) * fraction;
  };
  let targetDelay = sample(firstDelay);
  const clock = () => { const time = now(); return Number.isFinite(time) ? time : (lastTick ?? 0); };
  const isCurrent = item => active === item && generation === item.generation;
  const callbackContext = item => ({ id: item.id, preview: item.preview, signal: item.controller.signal, isCurrent: () => isCurrent(item) });
  function notifyFinish(item, reason) {
    // Cleanup may be asynchronous, but an old cleanup must use its own lease id.
    try { Promise.resolve(onFinish({ id: item.id, preview: item.preview, reason })).catch(() => {}); } catch {}
  }
  function reset(reason) {
    const previous = active;
    active = null; phase = 'idle'; generation++; quietSeconds = 0; previousEligible = false;
    lastTick = clock(); lastReason = reason;
    if (previous) { previous.controller.abort(reason); targetDelay = sample(repeatDelay); notifyFinish(previous, reason); }
    return Boolean(previous);
  }
  async function start(preview = false) {
    if (phase !== 'idle' || !flags.enabled || !flags.available || !flags.eligible) return false;
    attempted = true; quietSeconds = 0; previousEligible = false;
    const item = { id: `initiative-${++sequence}`, preview, generation: ++generation, startedAt: clock(), controller: new AbortController() };
    active = item; phase = 'starting';
    try {
      const result = await onStart(callbackContext(item));
      if (!isCurrent(item)) return false;
      if (result !== true) { reset('start-failed'); return false; }
      phase = 'waiting'; item.startedAt = clock();
      return true;
    } catch {
      if (isCurrent(item)) reset('start-failed');
      return false;
    }
  }
  async function respond() {
    if (phase !== 'waiting' || !active) return false;
    const item = active; phase = 'responding'; item.startedAt = clock();
    try {
      const result = await onRespond(callbackContext(item));
      if (!isCurrent(item)) return false;
      if (result === false || result?.ok === false) { reset('response-failed'); return false; }
      // A successful play() promise is only playback start. The owner calls
      // finish(id) when its actual audio/subtitle lifecycle has completed.
      return true;
    } catch {
      if (isCurrent(item)) reset('response-failed');
      return false;
    }
  }
  function tick(value = {}) {
    flags = { enabled: value.enabled === true, available: value.available === true, eligible: value.eligible === true };
    const time = clock(), elapsed = lastTick === null ? 0 : (time - lastTick) / 1000;
    lastTick = time;
    if (!flags.enabled || !flags.available) {
      if (active) reset(flags.enabled ? 'unavailable' : 'disabled');
      quietSeconds = 0; previousEligible = false; return;
    }
    if (active) {
      const age = (time - active.startedAt) / 1000;
      if (age < 0) active.startedAt = time;
      else if (phase === 'starting' && age >= 10) reset('start-timeout');
      else if (phase === 'waiting' && age >= seconds(waitTimeout, 45, 300)) reset('wait-timeout');
      else if (phase === 'responding' && age >= seconds(responseTimeout, 30, 30)) reset('response-timeout');
      return;
    }
    if (flags.eligible && previousEligible && elapsed >= 0 && elapsed <= seconds(maxTickGap, 5, 60)) quietSeconds += elapsed;
    previousEligible = flags.eligible;
    if (flags.eligible && quietSeconds >= targetDelay) void start();
  }
  return {
    tick, respond,
    preview: () => start(true),
    cancel: (reason = 'cancelled') => reset(reason),
    finish(id, reason = 'completed') {
      if (phase !== 'responding' || active?.id !== id) return false;
      return reset(reason);
    },
    diagnostics: () => ({ phase, id: active?.id ?? null, preview: active?.preview ?? false, quietSeconds, targetDelay,
      remaining: Math.max(0, targetDelay - quietSeconds), enabled: flags.enabled, available: flags.available, eligible: flags.eligible,
      attempted, lastReason }),
  };
}
