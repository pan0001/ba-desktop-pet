const { test } = require('node:test');
const assert = require('node:assert/strict');

function canvasHarness() {
  let time = 0, sequence = 0, clears = 0, strokes = 0, resizes = 0;
  const images = [];
  const callbacks = new Map();
  const context = new Proxy({}, { get: (_, name) => (...args) => {
    if (name === 'clearRect') clears++;
    if (name === 'stroke') strokes++;
    if (name === 'drawImage') images.push(args);
    for (const argument of args) if (typeof argument === 'number') assert.ok(Number.isFinite(argument), `${name}: ${argument}`);
  } });
  const view = { performance: { now: () => time }, devicePixelRatio: 3,
    requestAnimationFrame(callback) { callbacks.set(++sequence, callback); return sequence; },
    cancelAnimationFrame(id) { callbacks.delete(id); } };
  const canvas = { getContext: () => context, clientWidth: 700, clientHeight: 700, ownerDocument: { defaultView: view },
    set width(value) { resizes++; }, set height(value) { resizes++; } };
  return { canvas, view, images, get resizes() { return resizes; }, get strokes() { return strokes; }, get clears() { return clears; }, get scheduled() { return callbacks.size; },
    advance(ms, step = 1000 / 120) {
      const end = time + ms;
      while (time < end) { time = Math.min(end, time + step); const pending = [...callbacks.values()]; callbacks.clear(); for (const callback of pending) callback(time); }
    } };
}

test('interaction effects stay bounded under bursts, throttle drawing, and release all frame work when finished', async () => {
  const { createInteractionEffects } = await import('../scripts/interaction-effects.js');
  const harness = canvasHarness(), effects = createInteractionEffects(harness.canvas);
  assert.equal(harness.scheduled, 0);
  assert.equal(effects.burst('pet', { x: 300, y: 300 }), true);
  assert.equal(effects.burst('pet', { x: 300, y: 300 }), false);
  harness.advance(100); effects.burst('tap', { x: 300, y: 300 });
  harness.advance(100); effects.burst('pickup', { x: 300, y: 300 });
  harness.advance(100); effects.burst('assist', { x: 300, y: 300 });
  assert.equal(effects.diagnostics().active, 40);
  assert.equal(effects.diagnostics().dpr, 1.5);
  assert.equal(harness.resizes, 2, 'Canvas is not resized per frame');
  assert.ok(harness.strokes > 0);
  assert.ok(effects.diagnostics().frames <= 10, 'Draw rate remains at most 30 fps plus initial frame');
  harness.advance(1800);
  assert.equal(effects.diagnostics().active, 0);
  assert.equal(effects.diagnostics().running, false);
  assert.equal(harness.scheduled, 0);
  const finishedFrames = effects.diagnostics().frames;
  harness.advance(1000); assert.equal(effects.diagnostics().frames, finishedFrames);
});

const settleImages = () => new Promise(resolve => setImmediate(resolve));
const emotionCatalog = { icons: Object.fromEntries(['heart', 'tear_1', 'note', 'exclamation'].map(id => [id, { file: `assets/emotions/${id}.png` }])) };

test('local emotions share the on-demand draw loop, follow the head, preserve aspect ratio and cache decoding', async () => {
  const { createInteractionEffects } = await import('../scripts/interaction-effects.js');
  const harness = canvasHarness();
  let catalogLoads = 0, imageLoads = 0;
  const effects = createInteractionEffects(harness.canvas, {
    loadCatalog: async () => { catalogLoads++; return emotionCatalog; },
    loadImage: async url => { imageLoads++; assert.match(url, /\/assets\/emotions\/heart\.png$/); return { width: 80, height: 120 }; }
  });
  effects.setAnchor({ x: 300, y: 300 });
  assert.equal(effects.emotion('heart', { scale: 320 / 360, duration: 1000 }), true);
  assert.equal(effects.diagnostics().emotion.loading, true);
  assert.equal(harness.scheduled, 0, 'Loading does not animate an empty canvas');
  await settleImages(); harness.advance(220);
  assert.equal(effects.diagnostics().emotion.kind, 'heart');
  assert.equal(effects.diagnostics().emotions, 1);
  const initial = effects.diagnostics().emotion.bounds;
  assert.ok(initial.width < initial.height);
  assert.ok(initial.height > 45 && initial.height < 47, 'About 46px at size 320');
  effects.setAnchor({ x: 340, y: 330 }); harness.advance(50);
  const moved = effects.diagnostics().emotion.bounds;
  assert.ok(Math.abs(moved.x - initial.x - 40) < .01);
  assert.ok(Math.abs(moved.y - initial.y - 30) < 2);
  assert.ok(harness.images.length > 0);
  assert.ok(effects.diagnostics().frames <= 9, 'Shared loop stays at 30fps');
  harness.advance(1200);
  assert.equal(harness.scheduled, 0); assert.equal(effects.diagnostics().emotion.active, false);
  assert.equal(effects.diagnostics().lastEmotion.kind, 'heart');
  assert.deepEqual(effects.diagnostics().lastEmotion.anchor, { x: 340, y: 330 });
  assert.equal(effects.emotion('heart', { duration: 500 }), true);
  await settleImages(); harness.advance(700);
  assert.equal(catalogLoads, 1); assert.equal(imageLoads, 1);
  assert.equal(effects.diagnostics().emotions, 2); assert.equal(harness.scheduled, 0);
});

test('one priority-controlled emotion coexists with particles and help cannot be displaced by idle', async () => {
  const { createInteractionEffects } = await import('../scripts/interaction-effects.js');
  const harness = canvasHarness(), effects = createInteractionEffects(harness.canvas, {
    loadCatalog: async () => emotionCatalog, loadImage: async () => ({ width: 64, height: 64 })
  });
  effects.setAnchor({ x: 300, y: 300 });
  assert.equal(effects.emotion('tear_1', { priority: 5, duration: 1200 }), true);
  assert.equal(effects.emotion('note', { priority: 0 }), false, 'Pending help is also protected');
  await settleImages();
  assert.equal(effects.emotion('heart', { priority: 2 }), false);
  assert.equal(effects.burst('pet', { x: 300, y: 300 }), true);
  harness.advance(600);
  assert.ok(effects.diagnostics().active > 0);
  assert.equal(effects.diagnostics().emotion.kind, 'tear_1');
  assert.equal(harness.scheduled, 1, 'Particles and icon do not create separate loops');
  assert.equal(effects.emotion('exclamation', { priority: 6, duration: 800 }), true);
  await settleImages(); harness.advance(100);
  assert.equal(effects.diagnostics().emotion.kind, 'exclamation');
  assert.equal(effects.diagnostics().emotions, 2);
  harness.advance(1600);
  assert.equal(effects.emotion('note', { priority: 0 }), true);
  await settleImages(); harness.advance(2200);
  assert.equal(harness.scheduled, 0);
});

test('late image completion cannot restore an emotion after clear, disable, pause or dispose', async () => {
  const { createInteractionEffects } = await import('../scripts/interaction-effects.js');
  for (const stop of ['clear', 'disable', 'pause', 'dispose']) {
    let complete;
    const harness = canvasHarness(), effects = createInteractionEffects(harness.canvas, {
      loadCatalog: async () => emotionCatalog,
      loadImage: () => new Promise(resolve => { complete = resolve; })
    });
    effects.setAnchor({ x: 300, y: 300 }); effects.emotion('heart');
    await settleImages(); assert.equal(typeof complete, 'function');
    if (stop === 'disable') effects.configure({ enabled: false });
    else if (stop === 'pause') effects.configure({ paused: true });
    else effects[stop]();
    complete({ width: 64, height: 64 }); await settleImages(); harness.advance(500);
    assert.equal(effects.diagnostics().emotions, 0, stop);
    assert.equal(effects.diagnostics().emotion.active, false, stop);
    assert.equal(effects.diagnostics().emotion.loading, false, stop);
    assert.equal(effects.diagnostics().lastEmotion, null, stop);
    assert.equal(harness.scheduled, 0, stop);
  }
});

test('a newer emotion wins an asynchronous race; stale and failed assets do not leave background work', async () => {
  const { createInteractionEffects } = await import('../scripts/interaction-effects.js');
  const pendingImages = new Map(), harness = canvasHarness();
  const effects = createInteractionEffects(harness.canvas, {
    loadCatalog: async () => emotionCatalog,
    loadImage: url => new Promise((resolve, reject) => pendingImages.set(url.split('/').at(-1), { resolve, reject }))
  });
  effects.setAnchor({ x: 300, y: 300 }); effects.emotion('heart', { priority: 1 }); await settleImages();
  effects.emotion('tear_1', { priority: 5 }); await settleImages();
  pendingImages.get('tear_1.png').resolve({ width: 64, height: 64 }); await settleImages();
  pendingImages.get('heart.png').resolve({ width: 64, height: 64 }); await settleImages();
  assert.equal(effects.diagnostics().emotion.kind, 'tear_1');
  assert.equal(effects.diagnostics().emotions, 1);
  effects.clear(); effects.setAnchor({ x: 100, y: 100 });
  effects.emotion('note'); await settleImages(); harness.advance(1600);
  pendingImages.get('note.png').resolve({ width: 64, height: 64 }); await settleImages();
  assert.equal(effects.diagnostics().emotion.active, false);
  assert.equal(effects.diagnostics().emotion.loading, false);
  assert.equal(harness.scheduled, 0);
  effects.emotion('exclamation'); await settleImages();
  pendingImages.get('exclamation.png').reject(new Error('Missing asset')); await settleImages();
  assert.equal(effects.diagnostics().emotion.error, 'asset-unavailable');
  assert.equal(effects.diagnostics().emotion.loading, false); assert.equal(harness.scheduled, 0);
  effects.setAnchor({ x: NaN, y: Infinity });
  assert.equal(effects.emotion('heart', { x: Infinity, y: 100 }), false);
  assert.equal(effects.burst('tap', { x: 100, y: 100 }), true, 'Image failure does not disable particles');
  harness.advance(1500); assert.equal(harness.scheduled, 0);
});

test('muting, pausing and disposal immediately clear particles; bad coordinates cannot poison the canvas', async () => {
  const { createInteractionEffects } = await import('../scripts/interaction-effects.js');
  const harness = canvasHarness(), effects = createInteractionEffects(harness.canvas);
  assert.equal(effects.burst('pet', { x: NaN, y: 300 }), false);
  assert.equal(effects.burst('unknown', { x: 100, y: 300 }), false);
  effects.burst('landing', { x: 100, y: 300, scale: Infinity }); harness.advance(50);
  assert.ok(effects.diagnostics().active > 0);
  effects.configure({ paused: true });
  assert.equal(harness.scheduled, 0); assert.equal(effects.diagnostics().active, 0);
  assert.equal(effects.burst('pet', { x: 100, y: 300 }), false);
  effects.configure({ paused: false, enabled: false });
  assert.equal(effects.burst('pet', { x: 100, y: 300 }), false);
  effects.configure({ enabled: true }); harness.advance(1000);
  assert.equal(effects.burst('pet', { x: 100, y: 300 }), true);
  effects.dispose();
  assert.equal(effects.diagnostics().running, false);
  assert.equal(effects.burst('assist', { x: 100, y: 300 }), false);
  assert.ok(harness.clears > 0);
});
