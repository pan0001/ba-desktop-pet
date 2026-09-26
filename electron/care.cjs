const LEVELS = [0, 30, 75, 135, 210, 300, 405, 525, 660, 810];
const TITLES = ['初识', '相识', '熟悉', '亲近', '信赖', '默契', '依赖', '珍重', '知己', '形影不离'];
const COOLDOWNS = Object.freeze({ tap: 30, pet: 20, assist: 60, snack: 45, gift: 0, play: 60, rest: 0, claim: 0 });
const INTERACTION_CAP = 40, COMPANION_CAP = 12;
const MAX_CLOCK = 4102444800000, MAX_SECONDS = 3153600000;
const ACHIEVEMENTS = [
  { id: 'first-talk', title: '初次交流', description: '第一次打招呼、摸头或帮助她。' },
  { id: 'first-gift', title: '小小心意', description: '第一次送出礼物。' },
  { id: 'one-hour', title: '相伴一小时', description: '累计有效陪伴一小时。' },
  { id: 'bond-three', title: '逐渐熟悉', description: '羁绊达到三级。' }
];
const ACHIEVEMENT_IDS = new Set(ACHIEVEMENTS.map(item => item.id));
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const own = (value, key) => Object.hasOwn(object(value), key) ? value[key] : undefined;
const number = (value, fallback, low = 0, high = 100) => Number.isFinite(value) ? clamp(value, low, high) : fallback;
const integer = (value, fallback = 0, high = Number.MAX_SAFE_INTEGER) => Math.floor(number(value, fallback, 0, high));
const timestamp = value => Number.isFinite(value) && value >= 0 && value <= MAX_CLOCK;
const studentKey = value => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (!/^\d+$/.test(String(value))) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? String(id) : null;
};
const modelKey = value => (typeof value === 'string' && value.length > 0 && value.length <= 128) ||
  (typeof value === 'number' && Number.isFinite(value)) ? String(value) : null;
const dayOf = time => {
  const date = new Date(time);
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T12:00:00`)) && dayOf(Date.parse(`${value}T12:00:00`)) === value;
const levelOf = xp => {
  let level = 1;
  while (level < LEVELS.length && xp >= LEVELS[level]) level++;
  return level;
};
const freshDaily = date => ({ date, seconds: 0, interactionXp: 0, companionXp: 0, snacks: 0, gifts: 0, greeted: false, petted: false, claimed: false });
const completedDaily = daily => daily.greeted && daily.petted && daily.seconds >= 300;

class CareSystem {
  constructor({ characters = [], stored = {}, now = () => Date.now() } = {}) {
    this.now = typeof now === 'function' ? now : () => Date.now();
    this.lastObserved = 0;
    this.lastObserved = this.readNow();
    const today = dayOf(this.lastObserved);
    this.maxDay = validDay(own(stored, 'maxDay')) ? own(stored, 'maxDay') : today;
    if (today > this.maxDay) this.maxDay = today;
    this.models = new Map();
    this.students = new Map();
    for (const character of Array.isArray(characters) ? characters : []) {
      const id = modelKey(own(character, 'id')), student = studentKey(own(character, 'studentId'));
      if (id != null && student != null) this.models.set(id, student);
    }
    const savedStudents = object(own(stored, 'students'));
    const legacyModels = object(own(stored, 'characters'));
    for (const student of new Set(this.models.values())) {
      const candidates = [];
      if (own(savedStudents, student) != null) candidates.push(this.normalize(own(savedStudents, student), today));
      // Version 0 stored care by model id. Shared students keep their strongest
      // progress and consumed allowances; duplicate models never multiply XP.
      for (const [model, linkedStudent] of this.models) {
        if (student === linkedStudent && own(legacyModels, model) != null) candidates.push(this.normalize(own(legacyModels, model), today));
      }
      const record = candidates.length ? this.merge(candidates) : this.normalize({}, today);
      if (record.daily.date > this.maxDay) this.maxDay = record.daily.date;
      this.students.set(student, record);
    }
  }

  readNow() {
    try { const value = this.now(); return timestamp(value) ? value : this.lastObserved; }
    catch { return this.lastObserved; }
  }

  normalize(raw, today) {
    const daily = object(own(raw, 'daily')), cooldowns = object(own(raw, 'cooldowns'));
    const record = {
      xp: integer(own(raw, 'xp'), 0, LEVELS.at(-1)),
      mood: number(own(raw, 'mood'), 75), energy: number(own(raw, 'energy'), 80), fullness: number(own(raw, 'fullness'), 70),
      resting: own(raw, 'resting') === true,
      totalSeconds: number(own(raw, 'totalSeconds'), 0, 0, MAX_SECONDS),
      interactions: integer(own(raw, 'interactions'), 0, MAX_SECONDS), giftsTotal: integer(own(raw, 'giftsTotal'), 0, MAX_SECONDS),
      daily: {
        date: validDay(own(daily, 'date')) ? own(daily, 'date') : today,
        seconds: number(own(daily, 'seconds'), 0, 0, 86400),
        interactionXp: integer(own(daily, 'interactionXp'), 0, INTERACTION_CAP),
        companionXp: integer(own(daily, 'companionXp'), 0, COMPANION_CAP),
        snacks: integer(own(daily, 'snacks'), 0, 3), gifts: integer(own(daily, 'gifts'), 0, 1),
        greeted: own(daily, 'greeted') === true, petted: own(daily, 'petted') === true, claimed: own(daily, 'claimed') === true
      },
      cooldowns: {}, achievements: [], recent: []
    };
    record.totalSeconds = Math.max(record.totalSeconds, record.daily.seconds);
    if (record.energy >= 100) record.resting = false;
    for (const [action, seconds] of Object.entries(COOLDOWNS)) {
      const readyAt = own(cooldowns, action);
      if (seconds && timestamp(readyAt) && readyAt > this.lastObserved) {
        // A damaged future timestamp cannot lock an action for years. The
        // complete cooldown still survives restart and backwards wall clocks.
        record.cooldowns[action] = Math.min(readyAt, this.lastObserved + seconds * 1000);
      }
    }
    const savedAchievements = own(raw, 'achievements');
    if (Array.isArray(savedAchievements)) record.achievements = [...new Set(savedAchievements.filter(id => ACHIEVEMENT_IDS.has(id)))];
    const recent = own(raw, 'recent');
    if (Array.isArray(recent)) {
      record.recent = recent.slice(-32).filter(item => typeof own(item, 'text') === 'string' && timestamp(own(item, 'at'))).map(item => ({
        text: item.text.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 160), at: Math.min(item.at, this.lastObserved)
      })).filter(item => item.text.trim()).sort((a, b) => b.at - a.at).slice(0, 8);
    }
    this.unlock(record, this.lastObserved, false);
    return record;
  }

  merge(records) {
    records.sort((a, b) => b.xp - a.xp || b.totalSeconds - a.totalSeconds);
    const record = records[0];
    for (const other of records.slice(1)) {
      record.totalSeconds = Math.max(record.totalSeconds, other.totalSeconds);
      record.interactions = Math.max(record.interactions, other.interactions);
      record.giftsTotal = Math.max(record.giftsTotal, other.giftsTotal);
      if (other.daily.date > record.daily.date) record.daily = { ...other.daily };
      else if (other.daily.date === record.daily.date) {
        for (const key of ['seconds', 'interactionXp', 'companionXp', 'snacks', 'gifts']) record.daily[key] = Math.max(record.daily[key], other.daily[key]);
        for (const key of ['greeted', 'petted', 'claimed']) record.daily[key] ||= other.daily[key];
      }
      for (const action of Object.keys(COOLDOWNS)) {
        if (other.cooldowns[action]) record.cooldowns[action] = Math.max(record.cooldowns[action] || 0, other.cooldowns[action]);
      }
      record.achievements = [...new Set([...record.achievements, ...other.achievements])];
      record.recent = [...record.recent, ...other.recent].sort((a, b) => b.at - a.at).filter((item, index, list) =>
        list.findIndex(prior => prior.at === item.at && prior.text === item.text) === index).slice(0, 8);
    }
    this.unlock(record, this.lastObserved, false);
    return record;
  }

  record(characterId) {
    const student = this.models.get(modelKey(characterId));
    return student == null ? null : { student, value: this.students.get(student) };
  }

  advance(record, time) {
    let changed = false;
    if (time < this.lastObserved) {
      // Preserve the remaining wait while rebasing a backwards wall clock.
      for (const value of this.students.values()) for (const [action, readyAt] of Object.entries(value.cooldowns)) {
        const remaining = clamp(readyAt - this.lastObserved, 0, COOLDOWNS[action] * 1000);
        value.cooldowns[action] = time + remaining;
        changed = true;
      }
    }
    this.lastObserved = time;
    const date = dayOf(time);
    if (date > this.maxDay) { this.maxDay = date; changed = true; }
    // A local date already visited is never refreshed a second time. Future
    // saved dates are only a no-refresh watermark, never elapsed-time credit.
    if (record.daily.date < this.maxDay) { record.daily = freshDaily(this.maxDay); changed = true; }
    return changed;
  }

  remaining(record, action, time) {
    const observed = time < this.lastObserved ? this.lastObserved : time;
    return Math.ceil(clamp(((record.cooldowns[action] || 0) - observed) / 1000, 0, COOLDOWNS[action]));
  }

  actionState(record, action, time) {
    let label = { snack: '给点心', gift: '送礼物', play: '一起玩', rest: record.resting ? '结束休息' : '休息一下', claim: '领取今日奖励' }[action] || action;
    const remaining = action === 'snack' ? 3 - record.daily.snacks : action === 'gift' ? 1 - record.daily.gifts : action === 'claim' ? Number(!record.daily.claimed) : null;
    const cooldownSeconds = this.remaining(record, action, time);
    let reason = '';
    if (remaining === 0) reason = action === 'claim' ? '今天的奖励已经领取啦' : '今天的次数用完啦，明天再来吧';
    else if (action === 'snack' && record.fullness >= 90) reason = '肚子已经饱饱的啦';
    else if (action === 'play' && record.resting) reason = '正在休息，先结束休息吧';
    else if (action === 'play' && record.energy < 20) reason = '精力不足，先休息一下吧';
    else if (action === 'rest' && !record.resting && record.energy >= 100) reason = '精力已经很充足啦';
    else if (action === 'claim' && !completedDaily(record.daily)) reason = '完成今天的三个小约定后就能领取';
    else if (cooldownSeconds > 0) reason = `再等 ${cooldownSeconds} 秒吧`;
    if (action === 'claim' && record.daily.claimed) label = '今天已领取';
    return { available: !reason, remaining, cooldownSeconds, reason, label };
  }

  snapshot(characterId) {
    const entry = this.record(characterId);
    if (!entry) return null;
    const record = entry.value, level = levelOf(record.xp), max = level === LEVELS.length;
    const levelXp = max ? 0 : record.xp - LEVELS[level - 1], nextLevelXp = max ? 0 : LEVELS[level] - LEVELS[level - 1];
    const time = this.readNow();
    return {
      studentId: Number(entry.student), level, title: TITLES[level - 1], xp: record.xp, levelXp, nextLevelXp,
      progress: max ? 1 : clamp(levelXp / nextLevelXp, 0, 1),
      mood: Math.round(record.mood), moodLabel: record.mood >= 85 ? '元气满满' : record.mood >= 65 ? '心情不错' : record.mood >= 40 ? '有点安静' : '想被陪伴',
      energy: Math.round(record.energy), energyLabel: record.energy >= 70 ? '精神饱满' : record.energy >= 30 ? '精神尚可' : record.energy >= 15 ? '有点累了' : '想休息',
      fullness: Math.round(record.fullness), fullnessLabel: record.fullness >= 85 ? '肚子饱饱' : record.fullness >= 45 ? '刚刚好' : record.fullness >= 20 ? '有点饿啦' : '想吃点心',
      resting: record.resting, totalMinutes: Math.floor(record.totalSeconds / 60), todayMinutes: Math.floor(record.daily.seconds / 60),
      dailyCapRemaining: INTERACTION_CAP + COMPANION_CAP - record.daily.interactionXp - record.daily.companionXp,
      actions: Object.fromEntries(['snack', 'gift', 'play', 'rest', 'claim'].map(action => [action, this.actionState(record, action, time)])),
      daily: [
        { id: 'greet', label: '打个招呼', current: Number(record.daily.greeted), target: 1, complete: record.daily.greeted },
        { id: 'pet', label: '摸摸头', current: Number(record.daily.petted), target: 1, complete: record.daily.petted },
        { id: 'company', label: '陪伴五分钟', current: Math.min(5, Math.floor(record.daily.seconds / 60)), target: 5, complete: record.daily.seconds >= 300 }
      ],
      achievements: ACHIEVEMENTS.map(item => ({ ...item, unlocked: record.achievements.includes(item.id) })),
      recent: record.recent.map(item => ({ ...item }))
    };
  }

  log(record, text, time) { record.recent.unshift({ text, at: time }); record.recent.length = Math.min(8, record.recent.length); }

  unlock(record, time, log = true) {
    const eligible = [record.interactions > 0, record.giftsTotal > 0, record.totalSeconds >= 3600, record.xp >= LEVELS[2]];
    let changed = false;
    ACHIEVEMENTS.forEach((item, index) => {
      if (eligible[index] && !record.achievements.includes(item.id)) {
        record.achievements.push(item.id);
        if (log) this.log(record, `成就达成：${item.title}`, time);
        changed = true;
      }
    });
    return changed;
  }

  grant(record, amount, bucket = null) {
    const cap = bucket === 'interactionXp' ? INTERACTION_CAP : COMPANION_CAP;
    const granted = Math.max(0, Math.min(amount, LEVELS.at(-1) - record.xp, bucket ? cap - record.daily[bucket] : Infinity));
    record.xp += granted;
    if (bucket) record.daily[bucket] += granted;
    return granted;
  }

  act(characterId, action) {
    const fail = (message, changed = false) => ({ ok: false, message, emote: null, voice: null, levelUp: false, changed });
    const entry = this.record(characterId);
    if (!entry) return fail('找不到这个学生');
    if (typeof action !== 'string' || !Object.hasOwn(COOLDOWNS, action)) return fail('不认识这个互动动作');
    const record = entry.value, time = this.readNow();
    const changed = this.advance(record, time);
    const state = this.actionState(record, action, time);
    if (!state.available) return fail(state.reason, changed);
    const previousLevel = levelOf(record.xp);
    let amount = 0, bucket = null, message = '', emote = 'tap', voice = 'interact';
    if (['tap', 'pet', 'assist'].includes(action)) {
      amount = action === 'tap' ? 2 : 3; bucket = 'interactionXp';
      record.interactions = Math.min(MAX_SECONDS, record.interactions + 1);
      record.mood = Math.min(100, record.mood + (action === 'pet' ? 3 : 2));
      if (action === 'tap') record.daily.greeted = true;
      if (action === 'pet') record.daily.petted = true;
      message = { tap: '今天也请多关照，老师！', pet: '被摸摸头，心情变好啦。', assist: '谢谢老师帮我！' }[action];
      emote = action; voice = action === 'pet' ? 'pet' : 'interact';
    } else if (action === 'snack') {
      record.daily.snacks++; record.fullness = Math.min(100, record.fullness + 30); record.energy = Math.min(100, record.energy + 10); record.mood = Math.min(100, record.mood + 8);
      amount = 5; message = '点心很好吃，谢谢老师！'; emote = 'pet';
    } else if (action === 'gift') {
      record.daily.gifts++; record.giftsTotal = Math.min(MAX_SECONDS, record.giftsTotal + 1); record.mood = Math.min(100, record.mood + 15);
      amount = 15; message = '收到老师的小礼物了！'; emote = 'pet';
    } else if (action === 'play') {
      record.energy -= 10; record.mood = Math.min(100, record.mood + 12);
      amount = 5; bucket = 'interactionXp'; message = '和老师一起玩，好开心！'; emote = 'pet';
    } else if (action === 'rest') {
      record.resting = !record.resting;
      message = record.resting ? '休息一会儿，老师也要注意休息哦。' : '休息结束，可以继续活动啦。';
      emote = record.resting ? 'idle' : 'assist'; voice = null;
    } else if (action === 'claim') {
      record.daily.claimed = true; amount = 10; message = '今天的小约定都完成啦！'; emote = 'assist';
    }
    const gained = this.grant(record, amount, bucket);
    if (COOLDOWNS[action]) record.cooldowns[action] = time + COOLDOWNS[action] * 1000;
    if (record.resting && record.energy >= 100) record.resting = false;
    const levelUp = levelOf(record.xp) > previousLevel;
    if (gained) message += ` 羁绊 +${gained}`;
    if (levelUp) message += `，升到 ${levelOf(record.xp)} 级啦！`;
    this.log(record, message, time);
    this.unlock(record, time);
    return { ok: true, message, emote, voice, levelUp, changed: true };
  }

  tick(characterId, { active = false, seconds = 0 } = {}) {
    const entry = this.record(characterId);
    if (!entry) return { changed: false };
    const record = entry.value, time = this.readNow();
    let changed = this.advance(record, time);
    const elapsed = active === true ? number(seconds, 0, 0, 60) : 0;
    if (elapsed <= 0) return { changed };
    const minutes = elapsed / 60, previousLevel = levelOf(record.xp), beforeBlocks = Math.floor(record.daily.seconds / 300);
    record.totalSeconds = Math.min(MAX_SECONDS, record.totalSeconds + elapsed);
    record.daily.seconds = Math.min(86400, record.daily.seconds + elapsed);
    const wasResting = record.resting;
    if (wasResting) {
      record.energy = Math.min(100, record.energy + 8 * minutes);
      if (record.mood < 85) record.mood = Math.min(85, record.mood + .4 * minutes);
      if (record.energy >= 100) record.resting = false;
    } else {
      record.energy = Math.max(0, record.energy - .4 * minutes);
      const drift = .2 * minutes;
      record.mood += clamp(70 - record.mood, -drift, drift);
    }
    record.fullness = Math.max(0, record.fullness - (wasResting ? .2 : .3) * minutes);
    const blocks = Math.floor(record.daily.seconds / 300) - beforeBlocks;
    const gained = this.grant(record, blocks * 2, 'companionXp');
    let event;
    if (wasResting && !record.resting) {
      event = { message: '休息好啦，精力满满！', emote: 'assist', voice: null, levelUp: false };
      this.log(record, event.message, time);
    }
    if (gained) {
      const levelUp = levelOf(record.xp) > previousLevel;
      const message = `又一起度过了五分钟，羁绊 +${gained}${levelUp ? `，升到 ${levelOf(record.xp)} 级啦！` : '。'}`;
      this.log(record, message, time);
      event = { message, emote: levelUp ? 'assist' : 'idle', voice: null, levelUp };
    }
    this.unlock(record, time);
    changed = true;
    return event ? { changed, event } : { changed };
  }

  serialize() {
    return {
      schemaVersion: 1, maxDay: this.maxDay,
      students: Object.fromEntries([...this.students].map(([student, record]) => [student, {
        ...record, daily: { ...record.daily }, cooldowns: { ...record.cooldowns }, achievements: [...record.achievements], recent: record.recent.map(item => ({ ...item }))
      }]))
    };
  }
}

module.exports = { CareSystem };
