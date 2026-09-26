const CAPACITY = 40;
const FRAME_MS = 1000 / 30;
const EMOTION_CATALOG = new URL('../assets/emotions/catalog.json', import.meta.url);
const ASSET_ROOT = new URL('../', import.meta.url);
const emotionPriorities = Object.freeze({ note: 0, zzz: 0, question: 1, question_mark: 1,
  heart: 2, shy: 2, twinkle: 2, exclamation: 3, exclamation_mark: 3,
  sweat_1: 4, sweat_2: 4, anxiety: 4, tear_1: 5, tear_2: 5, sad: 5 });
const recipes = Object.freeze({
  pet: { count: 13, cooldown: 550, colors: ['#ff83b5', '#ffb6d4', '#ffe6a1'] },
  tap: { count: 12, cooldown: 350, colors: ['#ffd568', '#8edcff', '#c4b1ff'] },
  pickup: { count: 9, cooldown: 500, colors: ['#fff0a6', '#a5e5ff', '#ffb1d4'] },
  assist: { count: 15, cooldown: 650, colors: ['#ff9eb4', '#ffc993', '#ffe5a3'] },
  landing: { count: 8, cooldown: 650, colors: ['#f5d7b3', '#ffe4a3', '#ffefcf'] },
});

// A fixed particle pool, with no animation work at all between interactions.
// All coordinates are CSS pixels relative to this transparent canvas.
export function createInteractionEffects(canvas, { loadCatalog, loadImage } = {}) {
  const context = canvas.getContext('2d', { alpha: true });
  const view = canvas.ownerDocument?.defaultView ?? globalThis;
  const now = () => view.performance.now();
  const particles = Array.from({ length: CAPACITY }, () => ({ alive: false }));
  const lastBurst = Object.create(null);
  const images = new Map(), lastEmotions = Object.create(null);
  let catalogPromise, anchor = null, emotionRequest = null, currentEmotion = null, generation = 0;
  let lastEmotion = null, emotionError = '', emotionDraws = 0, emotions = 0, emotionBounds = null;
  let enabled = true, paused = false, disposed = false;
  let active = 0, pending = null, width = 0, height = 0, dpr = 1;
  let lastFrame = -Infinity, lastAnyBurst = -Infinity, emitted = 0, bursts = 0, frames = 0;
  let lastType = null;

  // Local assets are decoded only once. Asset loading never starts a frame loop;
  // the request's identity also prevents a late image appearing after a reset.
  function catalogue() {
    return catalogPromise ||= Promise.resolve().then(() => loadCatalog ? loadCatalog() : fetch(EMOTION_CATALOG).then(response => {
      if (!response.ok) throw new Error(`Emotion catalogue: ${response.status}`);
      return response.json();
    }));
  }

  function picture(url) {
    if (!images.has(url)) images.set(url, Promise.resolve().then(() => {
      if (loadImage) return loadImage(url);
      return new Promise((resolve, reject) => {
        const image = new view.Image();
        image.onload = async () => {
          try { if (image.decode) await image.decode(); resolve(image); }
          catch (error) { reject(error); }
        };
        image.onerror = () => reject(new Error('Emotion image unavailable'));
        image.src = url;
      });
    }));
    return images.get(url);
  }

  function resize() {
    const nextWidth = Math.max(1, Math.round(canvas.clientWidth || view.innerWidth || 1));
    const nextHeight = Math.max(1, Math.round(canvas.clientHeight || view.innerHeight || 1));
    const nextDpr = Math.min(1.5, Math.max(1, view.devicePixelRatio || 1));
    if (width === nextWidth && height === nextHeight && dpr === nextDpr) return;
    width = nextWidth; height = nextHeight; dpr = nextDpr;
    canvas.width = Math.ceil(width * dpr); canvas.height = Math.ceil(height * dpr);
    context?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function clear() {
    if (pending !== null) view.cancelAnimationFrame(pending);
    pending = null; active = 0; lastFrame = -Infinity;
    generation++; emotionRequest = currentEmotion = emotionBounds = lastEmotion = anchor = null;
    emotionError = '';
    for (const kind of Object.keys(lastEmotions)) delete lastEmotions[kind];
    for (const particle of particles) particle.alive = false;
    context?.clearRect(0, 0, width, height);
  }

  function outline() {
    context.fill(); context.strokeStyle = 'rgba(255,255,255,.94)';
    context.lineWidth = 1.35; context.lineJoin = 'round'; context.stroke();
  }

  function heart(size) {
    context.beginPath(); context.moveTo(0, size * .86);
    context.bezierCurveTo(-size * 1.36, -.05 * size, -size * .88, -size * 1.06, 0, -size * .39);
    context.bezierCurveTo(size * .88, -size * 1.06, size * 1.36, -.05 * size, 0, size * .86);
    outline();
    context.beginPath(); context.ellipse(-size * .34, -size * .3, size * .12, size * .22, -.7, 0, Math.PI * 2);
    context.fillStyle = 'rgba(255,255,255,.8)'; context.fill();
  }

  function star(size, points) {
    context.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const angle = i * Math.PI / points - Math.PI / 2;
      const radius = size * (i % 2 ? (points === 4 ? .24 : .46) : 1);
      const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
      if (i === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.closePath(); outline();
  }

  function draw(time) {
    pending = null;
    if (disposed || !enabled || paused || (!active && !currentEmotion)) return;
    if (time - lastFrame < FRAME_MS - .5) {
      pending = view.requestAnimationFrame(draw); return;
    }
    lastFrame = time; resize(); frames++;
    context.clearRect(0, 0, width, height);
    for (const particle of particles) {
      if (!particle.alive) continue;
      const age = Math.max(0, (time - particle.born) / 1000);
      const progress = age / particle.life;
      if (progress >= 1) { particle.alive = false; active--; continue; }
      const x = particle.x + particle.vx * age + Math.sin(age * 7) * particle.wiggle;
      const y = particle.y + particle.vy * age + particle.gravity * age * age * .5;
      const appear = Math.min(1, progress * 9);
      const fade = Math.min(1, (1 - progress) * 3.4);
      const size = particle.size * (.58 + .42 * appear);
      context.save();
      context.translate(x, y); context.rotate(particle.rotation + age * particle.spin);
      context.globalAlpha = appear * fade * (particle.shape === 'dust' ? .68 : 1);
      context.fillStyle = particle.color;
      if (particle.shape === 'heart') heart(size);
      else if (particle.shape === 'dust') {
        context.beginPath(); context.ellipse(0, 0, size, size * .63, 0, 0, Math.PI * 2); context.fill();
      } else star(size, particle.shape === 'sparkle' ? 4 : 5);
      context.restore();
    }
    drawEmotion(time);
    if (active || currentEmotion) pending = view.requestAnimationFrame(draw);
    else context.clearRect(0, 0, width, height);
  }

  function drawEmotion(time) {
    const item = currentEmotion;
    if (!item) return;
    const age = Math.max(0, time - item.born);
    if (age >= item.duration) { currentEmotion = emotionBounds = null; return; }
    const origin = anchor || item.point;
    if (!origin) return;
    const entrance = Math.min(1, age / 150), fade = Math.min(1, (item.duration - age) / 240);
    const pop = .7 + .3 * (1 - Math.pow(1 - entrance, 3));
    const imageWidth = item.image.naturalWidth || item.image.width;
    const imageHeight = item.image.naturalHeight || item.image.height;
    const fit = 52 * item.scale * pop / Math.max(imageWidth, imageHeight);
    const drawWidth = imageWidth * fit, drawHeight = imageHeight * fit;
    const x = Math.max(drawWidth / 2 + 4, Math.min(width - drawWidth / 2 - 4, origin.x + 56 * item.scale));
    const y = Math.max(drawHeight / 2 + 4, Math.min(height - drawHeight / 2 - 4, origin.y - 38 * item.scale - Math.sin(age / 220) * 2 * item.scale));
    context.save(); context.globalAlpha = entrance * fade;
    context.drawImage(item.image, x - drawWidth / 2, y - drawHeight / 2, drawWidth, drawHeight);
    context.restore(); emotionDraws++;
    emotionBounds = { x, y, width: drawWidth, height: drawHeight };
    if (lastEmotion) { lastEmotion.bounds = { ...emotionBounds }; lastEmotion.anchor = { ...origin }; }
  }

  function emotion(kind, { scale = 1, duration = 1800, priority = emotionPriorities[kind] ?? 1, x, y } = {}) {
    if (!context || disposed || !enabled || paused || typeof kind !== 'string' || !kind) return false;
    const point = Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    if (!anchor && !point) return false;
    const time = now(), safePriority = Number.isFinite(priority) ? priority : 1;
    if (currentEmotion && time - currentEmotion.born >= currentEmotion.duration) currentEmotion = null;
    if (emotionRequest && time - emotionRequest.requested > 1500) emotionRequest = null;
    const blocker = emotionRequest || currentEmotion;
    if (blocker && blocker.priority > safePriority) return false;
    if (time - (lastEmotions[kind] ?? -Infinity) < 500) return false;
    const request = { kind, point, priority: safePriority, requested: time, generation,
      scale: Number.isFinite(scale) ? Math.max(.5, Math.min(1.8, scale)) : 1,
      duration: Number.isFinite(duration) ? Math.max(400, Math.min(5000, duration)) : 1800 };
    emotionRequest = request; lastEmotions[kind] = time; emotionError = '';
    const valid = () => emotionRequest === request && generation === request.generation && !disposed && enabled && !paused;
    void catalogue().then(async catalog => {
      const entry = catalog.icons?.[kind];
      if (!entry?.file) throw new Error(`Unknown emotion: ${kind}`);
      if (!valid()) return;
      const url = new URL(entry.file, ASSET_ROOT).href;
      const image = await picture(url);
      if (!valid()) return;
      if (now() - request.requested > 1500) { emotionRequest = null; return; }
      const imageWidth = image.naturalWidth || image.width, imageHeight = image.naturalHeight || image.height;
      if (!Number.isFinite(imageWidth) || imageWidth <= 0 || !Number.isFinite(imageHeight) || imageHeight <= 0) throw new Error('Empty emotion image');
      currentEmotion = { ...request, image, file: entry.file, born: now() };
      emotionBounds = null;
      emotionRequest = null; emotions++;
      lastEmotion = { kind, file: entry.file, priority: safePriority, at: now(), generation, bounds: null, anchor: anchor && { ...anchor } };
      if (pending === null) pending = view.requestAnimationFrame(draw);
    }).catch(() => {
      if (!valid()) return;
      emotionRequest = null; emotionError = 'asset-unavailable';
    });
    return true;
  }

  function burst(type, { x, y, scale = 1 } = {}) {
    const recipe = recipes[type];
    if (!context || disposed || !enabled || paused || !recipe || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    const time = now();
    if (time - lastAnyBurst < 90 || time - (lastBurst[type] ?? -Infinity) < recipe.cooldown || active === CAPACITY) return false;
    const safeScale = Number.isFinite(scale) ? Math.max(.5, Math.min(1.8, scale)) : 1;
    resize();
    let count = 0;
    for (const particle of particles) {
      if (particle.alive) continue;
      const fraction = count / Math.max(1, recipe.count - 1);
      const angle = Math.PI * (1.1 + fraction * .8);
      const speed = (36 + Math.random() * 32) * safeScale;
      const landing = type === 'landing';
      particle.alive = true; particle.born = time;
      particle.life = (landing ? .48 : .68) + Math.random() * .3;
      particle.x = x + (Math.random() - .5) * (landing ? 25 : 15) * safeScale;
      particle.y = y + (Math.random() - .5) * 10 * safeScale;
      particle.vx = Math.cos(angle) * speed * (landing ? 1.35 : 1);
      particle.vy = landing ? -(10 + Math.random() * 16) * safeScale : Math.sin(angle) * speed - 12 * safeScale;
      particle.gravity = (landing ? 36 : 12) * safeScale;
      particle.wiggle = landing ? 0 : (Math.random() - .5) * 8 * safeScale;
      particle.rotation = (Math.random() - .5) * .8;
      particle.spin = (Math.random() - .5) * (type === 'tap' ? 2.8 : 1.1);
      particle.shape = landing ? (count % 3 ? 'dust' : 'sparkle')
        : (type === 'pet' || type === 'assist') && count % 3 !== 2 ? 'heart'
          : type === 'tap' && count % 2 === 0 ? 'star' : 'sparkle';
      particle.size = (particle.shape === 'heart' ? 5.5 + Math.random() * 3
        : particle.shape === 'dust' ? 2.5 + Math.random() * 2 : 3.5 + Math.random() * 3.5) * safeScale;
      particle.color = recipe.colors[count % recipe.colors.length];
      active++; count++;
      if (count === recipe.count) break;
    }
    if (!count) return false;
    lastBurst[type] = time; lastAnyBurst = time; lastType = type; emitted += count; bursts++;
    if (pending === null) pending = view.requestAnimationFrame(draw);
    return true;
  }

  return {
    burst, emotion,
    setAnchor(point) {
      anchor = Number.isFinite(point?.x) && Number.isFinite(point?.y) ? { x: point.x, y: point.y } : null;
    },
    configure(settings = {}) {
      if (typeof settings.enabled === 'boolean') enabled = settings.enabled;
      if (typeof settings.paused === 'boolean') paused = settings.paused;
      if (!enabled || paused) clear();
    },
    clear,
    diagnostics: () => ({ active, running: pending !== null, emitted, bursts, frames, lastType, capacity: CAPACITY, width, height, dpr, enabled, paused,
      emotions, lastEmotion, generation,
      emotion: { kind: currentEmotion?.kind || emotionRequest?.kind || null, lastKind: lastEmotion?.kind || null, active: Boolean(currentEmotion), loading: Boolean(emotionRequest),
        file: currentEmotion?.file || null, priority: currentEmotion?.priority ?? emotionRequest?.priority ?? null, bounds: emotionBounds, anchor: anchor && { ...anchor }, draws: emotionDraws, error: emotionError } }),
    dispose() { disposed = true; clear(); },
  };
}
