const { test } = require('node:test');
const assert = require('node:assert/strict');
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
const allowed = { enabled: true, available: true, eligible: true };

test('initiative delays count only eligible online time, skip long gaps, and use the longer interval after an event', async () => {
  const { createProactiveEvents } = await import('../scripts/proactive-events.js');
  let time = 0; const starts = [], finishes = [];
  const events = createProactiveEvents({ now: () => time, random: () => .5, onStart: item => { starts.push(item); return true; }, onFinish: item => finishes.push(item) });
  const step = (duration, state = allowed) => { time += duration; events.tick(state); };
  events.tick(allowed);
  for (let i = 0; i < 40; i++) step(1000);
  step(100000, { ...allowed, eligible: false });
  step(1000, allowed);
  assert.equal(events.diagnostics().quietSeconds, 40);
  step(60000); assert.equal(events.diagnostics().quietSeconds, 40, 'A blocked or suspended owner does not backfill elapsed time');
  for (let i = 0; i < 49; i++) step(1000);
  assert.equal(starts.length, 0); step(1000); await flush();
  assert.equal(starts.length, 1); assert.equal(events.diagnostics().phase, 'waiting');
  assert.equal(events.finish(starts[0].id), false, 'An invitation finishing cannot finish a waiting event');
  events.cancel('dragging');
  assert.equal(finishes[0].reason, 'dragging'); assert.equal(starts[0].signal.aborted, true);
  assert.equal(events.diagnostics().targetDelay, 450); assert.equal(events.diagnostics().quietSeconds, 0);
});

test('waiting survives its own activity, expires after 45 seconds, and preview still obeys availability and eligibility', async () => {
  const { createProactiveEvents } = await import('../scripts/proactive-events.js');
  let time = 0; const finishes = [];
  const events = createProactiveEvents({ now: () => time, onFinish: item => finishes.push(item), random: () => 0 });
  assert.equal(await events.preview(), false);
  events.tick({ ...allowed, eligible: false }); assert.equal(await events.preview(), false);
  events.tick(allowed); assert.equal(await events.preview(), true);
  time = 44000; events.tick({ ...allowed, eligible: false });
  assert.equal(events.diagnostics().phase, 'waiting', 'Its invitation speech does not cancel the event');
  time = 45000; events.tick({ ...allowed, eligible: false });
  assert.equal(events.diagnostics().phase, 'idle'); assert.equal(finishes[0].reason, 'wait-timeout');
  events.tick(allowed); assert.equal(await events.preview(), true);
  events.tick({ ...allowed, available: false }); assert.equal(finishes.at(-1).reason, 'unavailable');
  events.tick(allowed); assert.equal(await events.preview(), true);
  events.tick({ ...allowed, enabled: false }); assert.equal(finishes.at(-1).reason, 'disabled');
});

test('reply waits for the real media end, rejects duplicate clicks, and has a bounded watchdog', async () => {
  const { createProactiveEvents } = await import('../scripts/proactive-events.js');
  let time = 0, responses = 0; const finishes = [];
  const events = createProactiveEvents({ now: () => time, onRespond: () => { responses++; }, onFinish: item => finishes.push(item) });
  events.tick(allowed); await events.preview(); const id = events.diagnostics().id;
  assert.equal(await events.respond(), true); assert.equal(await events.respond(), false); assert.equal(responses, 1);
  assert.equal(events.diagnostics().phase, 'responding', 'onRespond resolution indicates media start, not media end');
  assert.equal(events.finish('some-old-id'), false);
  time += 20000; events.tick({ ...allowed, eligible: false }); assert.equal(events.diagnostics().phase, 'responding');
  assert.equal(events.finish(id, 'voice-ended'), true); assert.equal(finishes.at(-1).reason, 'voice-ended');
  events.tick(allowed); await events.preview(); await events.respond();
  time += 30000; events.tick({ ...allowed, eligible: false });
  assert.equal(events.diagnostics().phase, 'idle'); assert.equal(finishes.at(-1).reason, 'response-timeout');
});

test('cancel invalidates asynchronous starts and replies, including an old promise completing during a new event', async () => {
  const { createProactiveEvents } = await import('../scripts/proactive-events.js');
  let resolveStart, startContext, responseContext, rejectReply;
  const finishes = []; let first = true;
  const events = createProactiveEvents({
    onStart: context => { if (!first) return true; first = false; startContext = context; return new Promise(resolve => { resolveStart = resolve; }); },
    onRespond: context => { responseContext = context; return new Promise((_, reject) => { rejectReply = reject; }); },
    onFinish: value => finishes.push(value),
  });
  events.tick(allowed); const oldStart = events.preview();
  assert.equal(events.diagnostics().phase, 'starting'); events.cancel('character-changed');
  assert.equal(startContext.isCurrent(), false); assert.equal(startContext.signal.aborted, true);
  events.tick(allowed); await events.preview(); const freshId = events.diagnostics().id;
  resolveStart(true); assert.equal(await oldStart, false);
  assert.equal(events.diagnostics().id, freshId); assert.equal(events.diagnostics().phase, 'waiting');
  const oldResponse = events.respond(); events.cancel('hidden');
  assert.equal(responseContext.isCurrent(), false); rejectReply(new Error('late playback rejection'));
  assert.equal(await oldResponse, false); assert.equal(finishes.length, 2);
  assert.equal(events.diagnostics().phase, 'idle');
});

test('failed or hanging lease acquisition cannot leave an event waiting forever', async () => {
  const { createProactiveEvents } = await import('../scripts/proactive-events.js');
  let time = 0, mode = 'false'; const reasons = [];
  const events = createProactiveEvents({ now: () => time, onStart: () => mode === 'false' ? false : new Promise(() => {}), onFinish: value => reasons.push(value.reason) });
  events.tick(allowed); assert.equal(await events.preview(), false); assert.equal(reasons[0], 'start-failed');
  mode = 'hang'; events.tick(allowed); void events.preview();
  time += 10000; events.tick(allowed);
  assert.equal(events.diagnostics().phase, 'idle'); assert.equal(reasons[1], 'start-timeout');
  const failedReply = createProactiveEvents({ onRespond: async () => false, onFinish: value => reasons.push(value.reason) });
  failedReply.tick(allowed); await failedReply.preview(); assert.equal(await failedReply.respond(), false);
  assert.equal(reasons.at(-1), 'response-failed');
});

async function voiceHarness({ broken = false, pending = false } = {}) {
  const { createPetVoice } = await import('../scripts/pet-voice.js');
  let time = 0, sequence = 0, resolvePlay;
  const players = [], lines = [], ends = [], errors = [], timers = new Map();
  const bank = { languages: {
    jp: [
      { id: 'invite-jp', key: 'Student_Cafe_Act_1', text: '老师，一起休息一下吧。', file: 'invite-jp.ogg', events: ['idle'] },
      { id: 'reply-jp', key: 'Student_Lobby_1', text: '能和老师待在一起真开心。', file: 'reply-jp.ogg', events: ['interact'] },
      { id: 'long-jp', key: 'Student_Lobby_2', text: '很长的原始台词。'.repeat(40), file: 'long-jp.ogg', events: ['interact'] },
    ],
    cn: [{ id: 'reply-cn', key: 'Student_Lobby_1', text: '中文原声对应字幕。', file: 'reply-cn.ogg', events: ['interact'] }],
  } };
  const voice = createPetVoice({
    now: () => time, random: () => 0, onLine: line => lines.push(line), onEnd: meta => ends.push(meta), onError: event => errors.push(event),
    setTimer: (callback, ms) => { timers.set(++sequence, { callback, at: time + ms }); return sequence; }, clearTimer: id => timers.delete(id),
    makeAudio: () => {
      const player = { handlers: {}, pause() { this.paused = true; }, removeAttribute() {}, load() {}, addEventListener(event, callback) { this.handlers[event] = callback; },
        play: () => pending ? new Promise(resolve => { resolvePlay = resolve; }) : broken ? Promise.reject(new Error('decode failed')) : Promise.resolve() };
      players.push(player); return player;
    },
  });
  voice.setCharacter(bank);
  return { voice, bank, players, lines, ends, errors, timers, resolvePlay: () => resolvePlay(),
    advance(ms) { time += ms; for (const [id, timer] of timers) if (timer.at <= time) { timers.delete(id); timer.callback(); } } };
}

test('exact voice lookup trusts only the current bank and supports an explicit whole-event language fallback', async () => {
  const h = await voiceHarness();
  h.voice.configure({ voiceLanguage: 'cn' });
  assert.equal(await h.voice.speakLine('reply-jp'), false);
  assert.equal(await h.voice.speakLine('unknown-line', { language: 'jp' }), false);
  assert.equal(await h.voice.speakLine({ id: 'reply-jp', file: 'https://untrusted.invalid/other.ogg', text: '伪造字幕' }, { language: 'jp' }), true);
  assert.equal(h.players[0].src, 'reply-jp.ogg'); assert.equal(h.lines[0].text, h.bank.languages.jp[1].text);
  assert.equal(h.voice.diagnostics().language, 'cn', 'Explicit fallback does not alter the user preference');
  h.players[0].handlers.ended();
  assert.equal(h.ends[0].language, 'jp'); assert.equal(h.ends[0].reason, 'ended');
  h.voice.setCharacter({ languages: { jp: [] } });
  assert.equal(await h.voice.speakLine('reply-jp', { language: 'jp', force: true }), false);
});

test('voice lifecycle metadata identifies the old invite interruption and the real reply end exactly once', async () => {
  const h = await voiceHarness();
  await h.voice.speakLine('invite-jp', { event: 'initiative-invite' });
  const inviteId = h.voice.diagnostics().active.playbackId;
  await h.voice.speakLine('reply-jp', { event: 'initiative-reply', force: true });
  const replyId = h.voice.diagnostics().active.playbackId;
  assert.deepEqual(h.ends[0], { reason: 'interrupted', event: 'initiative-invite', lineId: 'invite-jp', playbackId: inviteId, language: 'jp' });
  h.players[0].handlers.ended(); h.players[0].handlers.error();
  assert.equal(h.ends.length, 1); assert.equal(h.voice.diagnostics().active.playbackId, replyId);
  h.players[1].handlers.ended(); h.players[1].handlers.ended();
  assert.equal(h.ends.length, 2);
  assert.deepEqual(h.ends[1], { reason: 'ended', event: 'initiative-reply', lineId: 'reply-jp', playbackId: replyId, language: 'jp' });
});

test('muted precise lines show the exact subtitle for a bounded reading time, and pausing cancels its timer', async () => {
  const h = await voiceHarness(); h.voice.configure({ voiceEnabled: false });
  assert.equal(await h.voice.speak('interact', { force: true }), false, 'Ordinary muted interactions retain their behavior');
  assert.equal(await h.voice.speakLine('reply-jp'), true);
  assert.equal(h.players.length, 0); assert.equal(h.lines[0].text, h.bank.languages.jp[1].text); assert.equal(h.lines[0].silent, true);
  h.advance(2999); assert.equal(h.voice.diagnostics().playing, true);
  h.advance(2000); assert.equal(h.voice.diagnostics().playing, false); assert.equal(h.ends[0].reason, 'silent');
  await h.voice.speakLine('long-jp', { force: true }); h.advance(7999); assert.equal(h.voice.diagnostics().playing, true);
  h.advance(1); assert.equal(h.voice.diagnostics().playing, false, 'Long text never holds the response beyond eight seconds');
  await h.voice.speakLine('reply-jp', { force: true }); h.voice.configure({ paused: true });
  assert.equal(h.timers.size, 0); assert.equal(h.ends.at(-1).reason, 'interrupted');
  const ends = h.ends.length; h.advance(10000); assert.equal(h.ends.length, ends);
});

test('failed audio falls back to a readable subtitle before ending; late play promises cannot resurrect a cancelled line', async () => {
  const h = await voiceHarness({ broken: true });
  assert.equal(await h.voice.speakLine('reply-jp'), true);
  assert.equal(h.lines[0].silent, true); assert.equal(h.ends.length, 0); assert.equal(h.errors.length, 1);
  h.players[0].handlers.error(); assert.equal(h.errors.length, 1);
  h.advance(8000); assert.equal(h.ends[0].reason, 'error'); assert.equal(h.ends[0].event, 'initiative-reply');
  const late = await voiceHarness({ pending: true });
  const started = late.voice.speakLine('reply-jp'); late.voice.setCharacter({ languages: { jp: [] } });
  late.resolvePlay(); assert.equal(await started, false); assert.equal(late.lines.length, 0); assert.equal(late.voice.diagnostics().playing, false);
});
