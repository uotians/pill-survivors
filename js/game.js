'use strict';

/* =========================================================================
   GAME — run state, player, weapons, enemies, pickups, director
   ========================================================================= */

const State = {
  MENU: 'MENU',
  PLAYING: 'PLAYING',
  LEVELUP: 'LEVELUP',
  PAUSED: 'PAUSED',
  GAMEOVER: 'GAMEOVER'
};

const MAX_ENEMIES = 380;
const MAX_GEMS = 350;
const MAX_PARTICLES = 800;
const MAX_FLOATERS = 140;

let game = { state: State.MENU, time: 0, screenshake: 0, shakeX: 0, shakeY: 0 };
let player = null;
let stats = Object.assign({}, BASE_STATS);

let enemies = [];
let projectiles = [];
let enemyShots = [];
let lobs = [];
let pools = [];
let fires = [];
let bolts = [];
let gems = [];
let pickups = [];
let particles = [];
let floaters = [];
let shockwaves = [];
let spores = [];   // Spore Pod clouds
let bombs = [];    // delayed explosions (Bloaters, Volatile elites)
let slashes = [];  // Bandage Whip lashes (visual)
let waves = [];    // Ultrasound rings

// ---------------------------------------------------- Encyclopedia & aim --
// Records a find; the first one unlocks the encyclopedia entry.
function discover(category, id) {
  const book = Save.data.codex[category];
  const isNew = !book[id];
  book[id] = (book[id] || 0) + 1;
  if (isNew) {
    Save.save();
    UI.toastDiscovery(category, id);
  }
}

const settings = () => Save.data.settings;
const AUTO_TARGET_RANGE = 650;

function mouseWorld() {
  return { x: mouse.x - W / 2 + player.x, y: mouse.y - H / 2 + player.y };
}

// --------------------------------------------------------------- Run setup --
function xpFor(level) {
  return Math.floor(5 + (level - 1) * 8 + Math.pow(level - 1, 1.85));
}

function startRun(charId, stageId) {
  Sfx.init();
  canvas.style.filter = '';
  const ch = CHAR_BY_ID[charId] || CHARACTERS[0];
  const stage = STAGE_BY_ID[stageId || Save.data.selectedStage] || STAGES[0];
  Save.data.selectedChar = ch.id;
  Save.data.selectedStage = stage.id;
  Save.save();

  World.reset(Math.floor(Math.random() * 2147483647), stage.furniture);
  buildFloorPattern(stage.floor);
  enemies = []; projectiles = []; enemyShots = []; lobs = []; pools = [];
  fires = []; bolts = []; gems = []; pickups = []; particles = [];
  floaters = []; shockwaves = []; spores = []; bombs = []; slashes = []; waves = [];

  game = {
    state: State.PLAYING,
    time: 0,
    kills: 0,
    gold: 0,
    level: 1,
    xp: 0,
    xpNext: xpFor(1),
    pendingLevels: 0,
    screenshake: 0,
    shakeX: 0,
    shakeY: 0,
    hurtFlash: 0,
    banner: null,
    eventIdx: 0,
    char: ch,
    stage,
    stageIndex: STAGES.indexOf(stage),
    unlockedStage: null,
    damageBy: {},    // weapon family -> damage dealt (Vaccinated elites use this)
    latched: 0,      // parasites currently attached
    bossEvents: 0,
    revives: 0,
    rerolls: 0,
    banishes: 0,
    banished: [],    // banishKey()s never offered again this run
    chestTier: 'big', // tier of the chest being opened ('small' | 'big')
    cartKeyUsed: false,
    finalSpawned: false,
    victory: false,
    endTimer: 0,
    damageDealt: 0,
    buildVersion: 0,
    levelUpSource: null,
    choices: [],
    nextId: 1,
    goldEarned: null,
    nextFloorPill: 1200,
    damageTaken: 0,
    evolutions: 0,
    newAchievements: [],
    hitstop: 0,      // frames the simulation freezes for impact
    xpPulse: 0,      // HUD XP bar glow
    levelFlash: 0,   // screen flash on level up
    dying: 0,        // overdose death animation frames left
    dyingMax: 150
  };

  player = {
    x: 0, y: 0, vx: 0, vy: 0,
    radius: BASE_RADIUS,
    hp: 100,
    facing: { x: 1, y: 0 },
    aim: 0,
    target: null,
    iframes: 0,
    weapons: [],
    passives: {},
    passiveOrder: [],
    gear: {},        // slot -> gear id
    cured: [],       // prescription ids whose side effect an Antidote removed
    tempEffects: [],
    trail: [],
    fireDropTimer: 0,
    prevMaxHp: 0
  };

  addWeapon(ch.weapon);
  if (ch.startPassives) {
    const pool = PASSIVES.slice();
    for (let i = 0; i < ch.startPassives && pool.length; i++) {
      const def = pool.splice(randInt(0, pool.length - 1), 1)[0];
      player.passives[def.id] = 1;
      player.passiveOrder.push(def.id);
      discover('passive', def.id);
    }
  }
  recomputeStats();
  player.hp = stats.maxHp;
  game.revives = stats.revives;
  game.rerolls = stats.rerolls;
  game.banishes = stats.banishes;
  game.banner = { text: stage.name.toUpperCase(), sub: 'survive 10:00 · every prescription has a side effect', life: 200, maxLife: 200 };
  UI.onRunStart();
}

function recomputeStats() {
  const s = Object.assign({}, BASE_STATS);
  game.char.apply(s);
  for (const item of SHOP) {
    const L = Save.data.shop[item.id] || 0;
    if (L > 0) item.apply(s, L);
  }
  for (const slot in player.gear) GEAR_BY_ID[player.gear[slot]].apply(s);
  for (const id of player.passiveOrder) PASSIVE_BY_ID[id].apply(s, player.passives[id], player.cured.includes(id) ? 0 : s.sideMult);
  for (const w of player.weapons) if (w.def.applySide) w.def.applySide(s, s.sideMult || 1);
  for (const eff of player.tempEffects) eff.def.onTick(s);
  if (game.latched) s.speed *= Math.max(0.6, 1 - 0.08 * game.latched);

  s.cooldown = Math.max(0.35, s.cooldown);
  s.might = Math.max(0.2, s.might);
  s.growth = Math.max(0.2, s.growth);
  s.friction = Math.min(0.985, s.friction);
  s.maxHp = Math.max(10, s.maxHp);
  stats = s;

  player.radius = BASE_RADIUS * s.size;
  if (player.prevMaxHp && s.maxHp > player.prevMaxHp) player.hp += s.maxHp - player.prevMaxHp;
  player.prevMaxHp = s.maxHp;
  player.hp = Math.min(player.hp, s.maxHp);
}

// ----------------------------------------------------------- Build / items --
function getWeapon(id) {
  return player.weapons.find((w) => w.id === id);
}

function weaponByFamily(family) {
  return player.weapons.find((w) => w.def.family === family);
}

function eligibleEvolutions() {
  return EVOLUTIONS.filter((ev) => {
    const w = getWeapon(ev.from);
    return w && w.level >= w.def.max && (player.passives[ev.requires] || 0) > 0;
  });
}

function evolveWeapon(ev) {
  const w = getWeapon(ev.from);
  if (!w) return;
  Object.assign(w, { id: ev.id, def: ev, level: 1, timer: 20, burst: 0, burstTimer: 0, active: 0, points: [] });
  game.evolutions++;
  Save.data.stats.evolutions++;
  discover('evolution', ev.id);
  setBanner('SYNTHESIS!', `${WEAPON_BY_ID[ev.from].name} + ${PASSIVE_BY_ID[ev.requires].name} = ${ev.name}`, 200);
  shockwaves.push({ x: player.x, y: player.y, r: 10, maxR: 220, life: 34, maxLife: 34, color: hexToRgb(ev.color) });
  spawnParticles(player.x, player.y, 50, ev.color, 7, 50, 4);
  addShake(10);
  game.hitstop = Math.max(game.hitstop, 12);
  Sfx.chest();
  Achievements.check('evolve');
}

function addWeapon(id) {
  player.weapons.push({
    id,
    def: WEAPON_BY_ID[id],
    level: 1,
    timer: 30,
    burst: 0,
    burstTimer: 0,
    burstTotal: 0,
    active: 0,
    angle: 0,
    points: [],
    pulse: 0,
    radius: 0
  });
  game.buildVersion++;
  discover('weapon', id);
}

// Banished cards are never offered again this run ('weapon:pistol', 'passive:steroids').
const banishKey = (c) => c.kind + ':' + c.def.id;

// Every weapon / prescription that could be offered right now (no evolutions).
function choicePool() {
  const pool = [];
  for (const def of WEAPONS) {
    if (game.banished.includes('weapon:' + def.id)) continue;
    const w = player.weapons.find((x) => x.id === def.id || x.def.from === def.id);
    if (w) {
      if (!w.def.evo && w.level < def.max) pool.push({ kind: 'weapon', def, level: w.level + 1, weight: 1.3 });
    } else if (player.weapons.length < MAX_WEAPON_SLOTS) {
      pool.push({ kind: 'weapon', def, level: 1, weight: 0.9 });
    }
  }
  for (const def of PASSIVES) {
    if (game.banished.includes('passive:' + def.id)) continue;
    const L = player.passives[def.id] || 0;
    if (L > 0) {
      if (L < def.max) pool.push({ kind: 'passive', def, level: L + 1, weight: 1 });
    } else if (player.passiveOrder.length < MAX_PASSIVE_SLOTS) {
      pool.push({ kind: 'passive', def, level: 1, weight: 0.85 });
    }
  }
  return pool;
}

// --------------------------------------------------------------- Chests --
// Small chest (elites): common gear + supplies. Big chest (mini-bosses):
// rare gear, an Antidote for one prescription, and an evolution when ready.
function gearOptions(rarity) {
  return GEAR.filter((g) => g.rarity === rarity && player.gear[g.slot] !== g.id &&
    !(g.revive && game.cartKeyUsed));
}

function buildChestChoices(tier) {
  const picks = [];
  const used = new Set();
  const add = (c) => { if (c && !used.has(c.kind + ':' + c.def.id)) { used.add(c.kind + ':' + c.def.id); picks.push(c); return true; } return false; };
  const gear = (rarity) => {
    const opts = gearOptions(rarity).filter((g) => !used.has('gear:' + g.id));
    return opts.length ? { kind: 'gear', def: choice(opts) } : null;
  };
  const supply = () => {
    const opts = SUPPLIES.filter((x) => !used.has('supply:' + x.id));
    return { kind: 'supply', def: choice(opts) };
  };
  if (tier === 'small') {
    add(gear('common'));
    add(supply());
    add(Math.random() < 0.5 ? gear('common') : supply()) || add(supply());
  } else {
    const evo = eligibleEvolutions();
    if (evo.length) add({ kind: 'evolution', def: choice(evo), level: 1 });
    const curable = player.passiveOrder.filter((id) => !player.cured.includes(id));
    if (curable.length) add({ kind: 'antidote', def: PASSIVE_BY_ID[choice(curable)] });
    while (picks.length < 3 && add(gear('rare')));
    while (picks.length < 3 && add(gear('common')));
    while (picks.length < 3) add(supply());
  }
  if (picks[0] && picks[0].kind === 'evolution') return picks; // evolution stays first
  for (let i = picks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [picks[i], picks[j]] = [picks[j], picks[i]];
  }
  return picks;
}

function equipGear(def) {
  const old = player.gear[def.slot];
  player.gear[def.slot] = def.id;
  if (def.revive && !game.cartKeyUsed) { game.cartKeyUsed = true; game.revives++; }
  discover('gear', def.id);
  return old ? GEAR_BY_ID[old] : null;
}

function buildChoices() {
  if (game.levelUpSource === 'chest') return buildChestChoices(game.chestTier);
  const pool = choicePool();
  const count = stats.choices + (Math.random() < (stats.luck - 1) * 0.6 ? 1 : 0);
  const picks = [];
  const evos = eligibleEvolutions().map((def) => ({ kind: 'evolution', def, level: 1, weight: 5 }));
  pool.push(...evos);
  const take = (from) => {
    const it = weightedPick(from);
    picks.push(it);
    pool.splice(pool.indexOf(it), 1);
  };
  // Always offer at least one weapon (new, upgrade or evolution) and one
  // prescription when any are available, then fill the rest at random.
  const isWeapon = (c) => c.kind === 'weapon' || c.kind === 'evolution';
  const weaponOpts = pool.filter(isWeapon);
  const passiveOpts = pool.filter((c) => c.kind === 'passive');
  if (picks.length < count && weaponOpts.length && !picks.some(isWeapon)) take(weaponOpts);
  if (picks.length < count && passiveOpts.length) take(passiveOpts);
  while (picks.length < count && pool.length) take(pool);
  // Shuffle so the guaranteed picks are not always in the same slot.
  for (let i = picks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [picks[i], picks[j]] = [picks[j], picks[i]];
  }
  if (!picks.length) {
    picks.push({ kind: 'gold', amount: 25 });
    picks.push({ kind: 'heal', amount: 30 });
  }
  return picks;
}

function applyChoice(c) {
  if (c.kind === 'weapon') {
    const w = getWeapon(c.def.id);
    if (w) w.level++;
    else addWeapon(c.def.id);
  } else if (c.kind === 'passive') {
    if (!player.passives[c.def.id]) player.passiveOrder.push(c.def.id);
    player.passives[c.def.id] = (player.passives[c.def.id] || 0) + 1;
    discover('passive', c.def.id);
  } else if (c.kind === 'evolution') {
    evolveWeapon(c.def);
  } else if (c.kind === 'gear') {
    equipGear(c.def);
  } else if (c.kind === 'antidote') {
    if (!player.cured.includes(c.def.id)) player.cured.push(c.def.id);
  } else if (c.kind === 'supply') {
    const id = c.def.id;
    if (id === 'medkit') player.hp = stats.maxHp;
    else if (id === 'reroll') game.rerolls++;
    else if (id === 'banish') game.banishes++;
    else if (id === 'goldbag') game.gold += Math.round(40 * stats.greed * game.stage.goldMult);
  } else if (c.kind === 'gold') {
    game.gold += c.amount;
  } else if (c.kind === 'heal') {
    player.hp = Math.min(stats.maxHp, player.hp + c.amount);
  }
  game.buildVersion++;
  recomputeStats();
}

function openLevelUp(source) {
  game.state = State.LEVELUP;
  game.levelUpSource = source;
  game.choices = buildChoices();
  UI.showLevelUp();
  if (source === 'chest') Sfx.chest(); else Sfx.levelUp();
}

function chooseOption(index) {
  if (game.state !== State.LEVELUP) return;
  const c = game.choices[index];
  if (!c) return;
  applyChoice(c);
  if (game.levelUpSource === 'level') game.pendingLevels--;
  if (game.pendingLevels > 0) {
    game.levelUpSource = 'level';
    game.choices = buildChoices();
    UI.showLevelUp();
    Sfx.levelUp();
  } else {
    game.state = State.PLAYING;
    UI.hideLevelUp();
  }
}

// Removes a weapon / prescription card for the rest of the run and refills
// that slot with something not already on offer (same kind if possible).
function banishChoice(index) {
  if (game.state !== State.LEVELUP || game.banishes <= 0) return false;
  const c = game.choices[index];
  if (!c || (c.kind !== 'weapon' && c.kind !== 'passive')) return false;
  game.banishes--;
  game.banished.push(banishKey(c));
  const shown = new Set(game.choices.filter((x) => x.def).map(banishKey));
  const pool = choicePool().filter((x) => !shown.has(banishKey(x)));
  const same = pool.filter((x) => x.kind === c.kind);
  const pick = same.length ? weightedPick(same) : pool.length ? weightedPick(pool) : null;
  if (pick) game.choices[index] = pick;
  else game.choices.splice(index, 1);
  if (!game.choices.length) game.choices = buildChoices(); // gold / heal fallback
  return true;
}

function rerollChoices() {
  if (game.state !== State.LEVELUP || game.rerolls <= 0) return;
  game.rerolls--;
  game.choices = buildChoices();
  UI.showLevelUp();
}

function addXp(value) {
  game.xp += value * stats.growth;
  while (game.xp >= game.xpNext) {
    game.xp -= game.xpNext;
    game.level++;
    game.xpNext = xpFor(game.level);
    game.pendingLevels++;
    game.levelFlash = 1;
    shockwaves.push({ x: player.x, y: player.y, r: 10, maxR: 160, life: 26, maxLife: 26, color: '94,200,255' });
  }
}

function applyTempPill(def) {
  // A real pill cures withdrawal instantly.
  player.tempEffects = player.tempEffects.filter((e) => !e.def.hidden);
  const dur = Math.round(def.duration * stats.pillDuration);
  const existing = player.tempEffects.find((e) => e.def.id === def.id);
  if (existing) {
    existing.duration = existing.maxDuration = dur;
  } else {
    player.tempEffects.push({ def, duration: dur, maxDuration: dur });
  }
  if (def.onApply) def.onApply(player);
  recomputeStats();
  discover('pill', def.id);
  Save.data.stats.pills++;
  addFloater(player.x, player.y - 46, def.buffShort, '#5dff9a', 20, 90);
  addFloater(player.x, player.y - 24, def.sideShort, '#ff5d6c', 20, 90);
  shockwaves.push({ x: player.x, y: player.y, r: 10, maxR: 90, life: 22, maxLife: 22, color: hexToRgb(def.color) });
  addShake(4);
  Sfx.pickup();
}

function tickTempEffects() {
  for (const eff of player.tempEffects) eff.duration--;
  const expired = player.tempEffects.filter((e) => e.duration <= 0);
  if (!expired.length) return;
  player.tempEffects = player.tempEffects.filter((e) => e.duration > 0);
  for (const eff of expired) {
    if (eff.def.hidden) continue;
    addFloater(player.x, player.y - 30, `${eff.def.name} wore off`, '#a7aed0', 14);
    Sfx.expire();
  }
  // The Addict crashes when the last real pill runs out.
  const crashed = expired.some((e) => !e.def.hidden) && !player.tempEffects.some((e) => !e.def.hidden);
  if (stats.withdrawal && crashed) {
    player.tempEffects.push({ def: WITHDRAWAL, duration: WITHDRAWAL.duration, maxDuration: WITHDRAWAL.duration });
    addFloater(player.x, player.y - 46, WITHDRAWAL.sideShort, '#a7aed0', 20, 80);
    addShake(3);
  }
}

// ------------------------------------------------------------------ FX --
function addShake(amount) {
  if (!settings().shake) return;
  game.screenshake = Math.min(game.screenshake + amount, 24);
}

function spawnParticles(x, y, count, color, speed, life, size) {
  for (let i = 0; i < count; i++) {
    if (particles.length >= MAX_PARTICLES) particles.shift();
    const a = Math.random() * TAU;
    const s = Math.random() * speed;
    particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: life * rand(0.5, 1),
      maxLife: life,
      color,
      size: size * rand(0.6, 1.2)
    });
  }
}

function addFloater(x, y, text, color, size = 18, life = 70, small = false) {
  if (small && floaters.length >= MAX_FLOATERS) return;
  floaters.push({ x, y, text, color, size, life, maxLife: life, vy: small ? -1.1 : -0.8, small });
}

function setBanner(text, sub, life = 160) {
  game.banner = { text, sub, life, maxLife: life };
}

// -------------------------------------------------------------- Player --
function updatePlayer() {
  let ix = 0;
  let iy = 0;
  if (keys.KeyA || keys.ArrowLeft) ix -= 1;
  if (keys.KeyD || keys.ArrowRight) ix += 1;
  if (keys.KeyW || keys.ArrowUp) iy -= 1;
  if (keys.KeyS || keys.ArrowDown) iy += 1;
  if (ix !== 0 || iy !== 0) {
    const len = Math.hypot(ix, iy);
    ix /= len;
    iy /= len;
  }
  if (touchStick.active && (touchStick.x || touchStick.y)) { ix = touchStick.x; iy = touchStick.y; } // analog, |v| <= 1
  if (stats.inverted) { ix = -ix; iy = -iy; }

  // Melatonin: periodic naps where you can't move.
  if (stats.drowsy) {
    if (player.napCd === undefined) player.napCd = 900;
    player.napCd--;
    if (player.napCd <= 0) {
      player.napLeft = Math.round(25 + 10 * stats.drowsy);
      player.napCd = Math.max(500, Math.round(1800 - 120 * stats.drowsy));
      addFloater(player.x, player.y - 34, 'Zzz...', '#7a8cff', 16, 50);
    }
  }
  if (player.napLeft > 0) {
    player.napLeft--;
    ix = 0;
    iy = 0;
    if (player.napLeft % 20 === 0) addFloater(player.x + rand(-8, 8), player.y - 28, 'z', '#7a8cff', 13, 40);
  }
  if (ix !== 0 || iy !== 0) { player.facing.x = ix; player.facing.y = iy; }

  // Acceleration chosen so terminal velocity == stats.speed for any friction.
  const f = stats.friction;
  const accel = Math.max((stats.speed * (1 - f)) / f, 0.16);
  player.vx = (player.vx + ix * accel) * f;
  player.vy = (player.vy + iy * accel) * f;
  player.x += player.vx;
  player.y += player.vy;
  const wall = stats.ghost ? null : World.collide(player, player.radius);
  if (wall) {
    const vn = player.vx * wall.x + player.vy * wall.y;
    if (vn < 0) { player.vx -= vn * wall.x; player.vy -= vn * wall.y; }
  }

  updateAim();

  if (player.iframes > 0) player.iframes--;
  player.hp = Math.min(stats.maxHp, player.hp + stats.regen / 60);
  if (stats.selfBurn && player.hp > 1) player.hp = Math.max(1, player.hp - stats.selfBurn / 60);

  if (stats.afterimage) {
    player.trail.push({ x: player.x, y: player.y });
    if (player.trail.length > 8) player.trail.shift();
  } else if (player.trail.length) {
    player.trail.shift();
  }
}

// Aim priority: nearest enemy (if auto-target) > cursor (if mouse aim) > movement direction.
function updateAim() {
  const s = settings();
  player.target = s.autoTarget ? findNearest(player.x, player.y, AUTO_TARGET_RANGE) : null;
  if (player.target) {
    player.aim = Math.atan2(player.target.y - player.y, player.target.x - player.x);
  } else if (s.mouseAim) {
    const m = mouseWorld();
    if (dist2(m.x, m.y, player.x, player.y) > 16) player.aim = Math.atan2(m.y - player.y, m.x - player.x);
  } else {
    player.aim = Math.atan2(player.facing.y, player.facing.x);
  }
}

function hurtPlayer(dmg, fromX, fromY) {
  if (player.iframes > 0 || game.victory) return;
  const amount = Math.max(1, Math.round(dmg * stats.dmgTaken - stats.armor));
  player.hp -= amount;
  game.damageTaken += amount;
  game.hitstop = Math.max(game.hitstop, 3);
  player.iframes = 30;
  const d = Math.sqrt(dist2(player.x, player.y, fromX, fromY)) || 1;
  player.vx += ((player.x - fromX) / d) * 3;
  player.vy += ((player.y - fromY) / d) * 3;
  game.hurtFlash = 0.45;
  addShake(6);
  addFloater(player.x, player.y - 26, `-${amount}`, '#ff5d6c', 18, 45);
  spawnParticles(player.x, player.y, 10, '#ff5d6c', 4, 28, 3);
  Sfx.hurt();
}

function applyRecoil(angle) {
  if (!stats.recoil) return;
  player.vx -= Math.cos(angle) * stats.recoil;
  player.vy -= Math.sin(angle) * stats.recoil;
  addShake(4);
}

function checkDeath() {
  if (player.hp > 0) return;
  if (game.revives > 0) {
    game.revives--;
    player.hp = stats.maxHp;
    player.iframes = 150;
    for (const e of enemies) {
      if (e.dead) continue;
      const d = Math.sqrt(dist2(e.x, e.y, player.x, player.y)) || 1;
      if (d < 380) {
        if (e.boss) { e.vx += ((e.x - player.x) / d) * 20; e.vy += ((e.y - player.y) / d) * 20; }
        else killEnemy(e, true);
      }
    }
    shockwaves.push({ x: player.x, y: player.y, r: 20, maxR: 380, life: 40, maxLife: 40, color: '94,242,255' });
    spawnParticles(player.x, player.y, 60, '#5ef2ff', 9, 50, 4);
    addShake(18);
    setBanner('DEFIBRILLATED!', 'second chance — don\'t waste it', 140);
    Sfx.revive();
    return;
  }
  startDying();
}

// ---------------------------------------------------- Overdose death --
function startDying() {
  game.dying = game.dyingMax;
  player.hp = 0;
  game.hitstop = 0;
  enemyShots = [];
  setBanner('OVERDOSE', `${game.char.name} took one pill too many`, game.dyingMax);
  addShake(14);
  Sfx.overdose();
}

function updateDying() {
  game.dying--;
  const k = 1 - game.dying / game.dyingMax;
  if (game.dying % 2 === 0) {
    spawnParticles(player.x, player.y, 3, `hsl(${(game.dying * 17) % 360}, 100%, 62%)`, 2 + k * 6, 50, 4);
  }
  if (game.dying % 20 === 0) {
    shockwaves.push({ x: player.x, y: player.y, r: 8, maxR: 60 + k * 160, life: 24, maxLife: 24, color: '255,92,240' });
  }
  addShake(0.6);
  updateFx();
  // Whole-screen colour distortion (GPU CSS filter, only for these ~2.5 s).
  canvas.style.filter = `hue-rotate(${Math.round(k * 300)}deg) saturate(${(1 + k * 2).toFixed(2)}) contrast(${(1 + k * 0.25).toFixed(2)})`;
  if (game.dying <= 0) {
    canvas.style.filter = '';
    endRun(false);
  }
}

// -------------------------------------------------------------- Weapons --
function weaponStats(w) {
  const b = w.def.base(w.level);
  return Object.assign({}, b, {
    dmg: b.dmg * stats.might,
    amount: (b.amount || 1) + stats.amount,
    cd: Math.max(8, (b.cd || 0) * stats.cooldown),
    pierce: b.pierce || 1,
    speed: (b.speed || 0) * stats.projSpeed,
    radius: (b.radius || 0) * stats.area,
    dur: (b.dur || 0) * stats.duration,
    tick: b.tick || 0,
    knock: b.knock || 0,
    rot: b.rot || 0,
    chains: b.chains || 0,
    range: b.range || 0,
    family: w.def.family
  });
}

const tremor = () => (Math.random() * 2 - 1) * stats.tremor;

function findNearest(x, y, maxR) {
  let best = null;
  let bestD = maxR * maxR;
  for (const e of enemies) {
    if (e.dead) continue;
    const d = dist2(x, y, e.x, e.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

function randomEnemyNear(x, y, maxR) {
  const list = [];
  const r2 = maxR * maxR;
  for (const e of enemies) if (!e.dead && dist2(x, y, e.x, e.y) < r2) list.push(e);
  return list.length ? choice(list) : null;
}

function spawnProjectile(kind, angle, ws, color, accent) {
  const p = {
    kind,
    x: player.x + Math.cos(angle) * player.radius,
    y: player.y + Math.sin(angle) * player.radius,
    vx: Math.cos(angle) * ws.speed,
    vy: Math.sin(angle) * ws.speed,
    angle,
    dmg: ws.dmg,
    pierce: ws.pierce,
    life: 95,
    r: kind === 'scalpel' ? 7 : 6,
    color,
    accent,
    hit: new Set(),
    explosive: stats.explosive,
    speed: ws.speed,
    family: ws.family,
    dead: false
  };
  projectiles.push(p);
  return p;
}

const WEAPON_LOGIC = {
  pistol(w, ws) {
    if (w.burst > 0) {
      w.burstTimer--;
      if (w.burstTimer <= 0) {
        const a = player.aim;
        const spread = (w.burstTotal - w.burst) % 2 === 0 ? 0 : rand(-0.12, 0.12);
        w.shots = (w.shots || 0) + 1;
        const placebo = !!w.def.placeboEvery && w.shots % w.def.placeboEvery === 0;
        const p = spawnProjectile('capsule', a + spread + tremor(), ws, placebo ? '#6f7894' : w.def.color, placebo ? '#c8cde8' : w.def.accent);
        p.placebo = placebo;
        if (w.burst === w.burstTotal) applyRecoil(a);
        Sfx.shoot();
        w.burst--;
        w.burstTimer = 5;
      }
      return;
    }
    w.timer--;
    if (w.timer <= 0) {
      // Pure auto-target holds fire until something is in range.
      if (settings().autoTarget && !settings().mouseAim && !player.target) { w.timer = 10; return; }
      w.burst = ws.amount;
      w.burstTotal = ws.amount;
      w.burstTimer = 0;
      w.timer = ws.cd;
    }
  },

  scalpel(w, ws) {
    w.timer--;
    if (w.timer > 0) return;
    w.timer = ws.cd;
    const base = player.aim;
    const n = ws.amount;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.16 + tremor();
      spawnProjectile('scalpel', a, ws, w.def.color, w.def.accent);
    }
    applyRecoil(base);
    Sfx.throwS();
  },

  // Bone Saw: boomerang saws that re-hit enemies on the way out and back.
  saw(w, ws) {
    w.timer--;
    if (w.timer > 0) return;
    w.timer = ws.cd;
    const n = ws.amount;
    for (let i = 0; i < n; i++) {
      const a = player.aim + (i - (n - 1) / 2) * 0.45 + tremor();
      const p = spawnProjectile('saw', a, ws, w.def.color, w.def.accent);
      p.r = 15 * Math.sqrt(stats.area);
      p.life = ws.dur;
      p.maxLife = ws.dur;
      p.boomerang = true;
      p.rehit = 18;
      p.hitAt = new Map();
      p.pierce = Infinity;
      p.spin = 0;
    }
    applyRecoil(player.aim);
    Sfx.throwS();
  },

  // Homing Syringe / Mass Vaccination
  syringe(w, ws) {
    w.timer--;
    if (w.timer > 0) return;
    w.timer = ws.cd;
    const n = ws.amount;
    for (let i = 0; i < n; i++) {
      const a = player.aim + (i - (n - 1) / 2) * 0.35 + tremor();
      const p = spawnProjectile('syringe', a, ws, w.def.color, w.def.accent);
      p.homing = ws.turn;
      p.life = 150;
      p.eliteMult = w.def.eliteMult || 1;
    }
    Sfx.throwS();
  },

  // Bandage Whip / Tourniquet: horizontal lashes, alternating sides.
  whip(w, ws) {
    if (!w.pending) w.pending = [];
    for (const lash of w.pending) {
      if (lash.at > game.time) continue;
      lash.done = true;
      const len = ws.length * stats.area;
      const wid = ws.width * Math.sqrt(stats.area);
      const x0 = lash.side > 0 ? player.x : player.x - len;
      const y0 = player.y - wid / 2;
      let hits = 0;
      for (const e of Grid.query(player.x + (lash.side * len) / 2, player.y, len / 2 + 64)) {
        if (e.dead) continue;
        const px = clamp(e.x, x0, x0 + len);
        const py = clamp(e.y, y0, y0 + wid);
        if (dist2(e.x, e.y, px, py) < e.r * e.r) {
          damageEnemy(e, ws.dmg, lash.side * 3, 0, false, ws.family);
          hits++;
        }
      }
      if (w.def.lifesteal && hits) player.hp = Math.min(stats.maxHp, player.hp + Math.min(hits, 8) * w.def.lifesteal);
      slashes.push({ x: player.x, y: player.y, side: lash.side, len, wid, life: 12, maxLife: 12, color: w.def.color });
      Sfx.whip();
    }
    w.pending = w.pending.filter((l) => !l.done);
    w.timer--;
    if (w.timer > 0) return;
    w.timer = ws.cd;
    const facing = Math.cos(player.aim) >= 0 ? 1 : -1;
    for (let i = 0; i < ws.amount; i++) {
      w.pending.push({ at: game.time + i * 8, side: i % 2 === 0 ? facing : -facing });
    }
  },

  // Tranquilizer Rifle / Elephant Tranquilizer: heavy piercing darts at the
  // toughest enemies in range (elites and bosses first). Holds fire otherwise.
  rifle(w, ws) {
    w.timer--;
    if (w.timer > 0) return;
    const r2 = ws.range * ws.range;
    const targets = enemies
      .filter((e) => !e.dead && dist2(player.x, player.y, e.x, e.y) < r2)
      .sort((a, b) => (b.boss - a.boss) || (b.elite - a.elite) || (b.hp - a.hp))
      .slice(0, ws.amount);
    if (!targets.length) { w.timer = 10; return; }
    w.timer = ws.cd;
    // Spare darts go to the toughest target (slightly spread so they don't overlap).
    for (let i = 0; i < ws.amount; i++) {
      const t = targets[i] || targets[0];
      const spread = targets[i] ? 0 : (i % 2 ? 1 : -1) * 0.06 * Math.ceil(i / 2);
      const a = Math.atan2(t.y - player.y, t.x - player.x) + spread + tremor();
      const p = spawnProjectile('dart', a, ws, w.def.color, w.def.accent);
      p.life = Math.ceil(ws.range / ws.speed) + 10;
      p.stun = ws.stun || w.def.stun || 0;
      if (i === 0) applyRecoil(a);
    }
    Sfx.shoot();
  },

  // Ultrasound / Lullaby: expanding rings that hit each enemy once.
  wave(w, ws) {
    w.timer--;
    if (w.timer > 0) return;
    w.timer = ws.cd;
    waves.push({
      x: player.x, y: player.y, r: 10, maxR: ws.radius, speed: ws.radius / 28,
      dmg: ws.dmg, knock: ws.knock, stun: w.def.stun || 0, family: ws.family,
      color: w.def.color, hit: new Set()
    });
    Sfx.wave();
  },

  aura(w, ws) {
    w.radius = ws.radius;
    w.pulse *= 0.9;
    w.timer--;
    if (w.timer > 0) return;
    w.timer = Math.max(8, ws.tick * stats.cooldown);
    for (const e of Grid.query(player.x, player.y, ws.radius + 64)) {
      if (e.dead) continue;
      const d = Math.sqrt(dist2(e.x, e.y, player.x, player.y)) || 1;
      if (d < ws.radius + e.r) {
        damageEnemy(e, ws.dmg, ((e.x - player.x) / d) * ws.knock, ((e.y - player.y) / d) * ws.knock, false, ws.family);
      }
    }
    w.pulse = 1;
  },

  orbit(w, ws) {
    if (w.active > 0) {
      w.active--;
      w.angle += ws.rot;
      const n = ws.amount;
      w.points.length = 0;
      const hitR = 11 * Math.sqrt(stats.area);
      for (let i = 0; i < n; i++) {
        const a = w.angle + (i / n) * TAU;
        const px = player.x + Math.cos(a) * ws.radius;
        const py = player.y + Math.sin(a) * ws.radius;
        w.points.push({ x: px, y: py, a });
        for (const e of Grid.query(px, py, hitR + 64)) {
          if (e.dead || e.orbitHit > game.time) continue;
          if (dist2(px, py, e.x, e.y) < (hitR + e.r) * (hitR + e.r)) {
            const d = Math.sqrt(dist2(e.x, e.y, player.x, player.y)) || 1;
            damageEnemy(e, ws.dmg, ((e.x - player.x) / d) * 4, ((e.y - player.y) / d) * 4, false, ws.family);
            e.orbitHit = game.time + 20;
          }
        }
      }
    } else {
      w.points.length = 0;
      w.timer--;
      if (w.timer <= 0) {
        w.active = ws.dur;
        w.timer = ws.cd;
      }
    }
  },

  zap(w, ws) {
    w.timer--;
    if (w.timer > 0) return;
    w.timer = ws.cd;
    const viewR = Math.max(W, H) * 0.55;
    let any = false;
    for (let s = 0; s < ws.amount; s++) {
      let cur = randomEnemyNear(player.x, player.y, viewR);
      if (!cur) break;
      any = true;
      const hitSet = new Set();
      const pts = [{ x: cur.x + rand(-30, 30), y: cur.y - 420 }];
      for (let c = 0; c <= ws.chains && cur; c++) {
        pts.push({ x: cur.x, y: cur.y });
        hitSet.add(cur);
        damageEnemy(cur, ws.dmg, 0, 0, false, ws.family);
        let next = null;
        let bestD = ws.range * ws.range;
        for (const e of Grid.query(cur.x, cur.y, ws.range)) {
          if (e.dead || hitSet.has(e)) continue;
          const d = dist2(cur.x, cur.y, e.x, e.y);
          if (d < bestD) { bestD = d; next = e; }
        }
        cur = next;
      }
      bolts.push({ pts, life: 14, maxLife: 14 });
      if (w.def.selfZap && Math.random() < w.def.selfZap) {
        bolts.push({ pts: [{ x: player.x + rand(-30, 30), y: player.y - 420 }, { x: player.x, y: player.y }], life: 14, maxLife: 14 });
        hurtPlayer(6, player.x, player.y - 1);
      }
    }
    if (any) { Sfx.zap(); addShake(1.5); }
    else w.timer = 15;
  },

  flask(w, ws) {
    w.timer--;
    if (w.timer > 0) return;
    w.timer = ws.cd;
    const s = settings();
    // Fallback aim point: cursor (clamped to throw range) or ahead of the player.
    let point;
    if (s.mouseAim) {
      const m = mouseWorld();
      const d = Math.sqrt(dist2(m.x, m.y, player.x, player.y)) || 1;
      const k = Math.min(1, 400 / d);
      point = { x: player.x + (m.x - player.x) * k, y: player.y + (m.y - player.y) * k };
    } else {
      point = { x: player.x + Math.cos(player.aim) * 220, y: player.y + Math.sin(player.aim) * 220 };
    }
    for (let i = 0; i < ws.amount; i++) {
      let tx;
      let ty;
      const t = s.autoTarget ? randomEnemyNear(player.x, player.y, 380) : null;
      if (t) {
        tx = t.x + rand(-20, 20);
        ty = t.y + rand(-20, 20);
      } else {
        const spread = i === 0 ? 0 : 30 + i * 15;
        tx = point.x + rand(-spread, spread);
        ty = point.y + rand(-spread, spread);
      }
      lobs.push({ sx: player.x, sy: player.y, tx, ty, t: 0, dur: 34 + i * 4, ws, color: w.def.color, def: w.def });
    }
    Sfx.throwS();
  }
};

function updateWeapons() {
  for (const w of player.weapons) WEAPON_LOGIC[w.def.family](w, weaponStats(w));
}

function updateProjectiles() {
  for (const p of projectiles) {
    if (p.boomerang) {
      p.spin += 0.45;
      if (p.life < p.maxLife * 0.55) {
        // Fly back to the player.
        const dx = player.x - p.x;
        const dy = player.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        p.vx += ((dx / d) * p.speed * 1.3 - p.vx) * 0.12;
        p.vy += ((dy / d) * p.speed * 1.3 - p.vy) * 0.12;
        if (d < player.radius + p.r) { p.dead = true; continue; }
      }
    }
    if (p.homing) {
      if (!p.target || p.target.dead || p.hit.has(p.target) || game.time % 10 === 0) p.target = findNearest(p.x, p.y, 450);
      if (p.target) {
        const cur = Math.atan2(p.vy, p.vx);
        let diff = Math.atan2(p.target.y - p.y, p.target.x - p.x) - cur;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        const a = cur + clamp(diff, -p.homing, p.homing);
        p.vx = Math.cos(a) * p.speed;
        p.vy = Math.sin(a) * p.speed;
        p.angle = a;
      }
    }
    p.x += p.vx;
    p.y += p.vy;
    p.life--;
    if (p.life <= 0) { p.dead = true; continue; }
    for (const e of Grid.query(p.x, p.y, p.r + 64)) {
      if (e.dead) continue;
      if (p.rehit ? (p.hitAt.get(e) || -1e9) > game.time : p.hit.has(e)) continue;
      if (dist2(p.x, p.y, e.x, e.y) < (p.r + e.r) * (p.r + e.r)) {
        if (p.placebo) {
          // Side effect of Pill Storm: it fizzles harmlessly.
          spawnParticles(p.x, p.y, 4, '#8a93b8', 2, 14, 2);
          if (Math.random() < 0.15) addFloater(p.x, p.y - 10, 'placebo', '#8a93b8', 11, 30, true);
          p.dead = true;
          break;
        }
        if (p.rehit) p.hitAt.set(e, game.time + p.rehit);
        else p.hit.add(e);
        damageEnemy(e, p.dmg * (p.eliteMult && (e.elite || e.boss) ? p.eliteMult : 1), p.vx * 0.3, p.vy * 0.3, false, p.family);
        if (p.stun && !e.boss) e.stunUntil = Math.max(e.stunUntil || 0, game.time + p.stun);
        spawnParticles(p.x, p.y, 3, '#fff3b0', 3, 12, 2);
        Sfx.hit();
        if (p.explosive) explode(p.x, p.y, p.dmg * 0.6);
        p.pierce--;
        if (p.pierce <= 0) { p.dead = true; break; }
      }
    }
  }

  for (const l of lobs) {
    l.t++;
    if (l.t >= l.dur) {
      l.dead = true;
      pools.push({
        x: l.tx, y: l.ty, r: l.ws.radius, life: l.ws.dur, maxLife: l.ws.dur, dmg: l.ws.dmg,
        tick: 0, tickRate: l.ws.tick, seed: Math.random() * 100,
        color: l.color, slow: !!l.def.poolSlow, selfHarm: !!l.def.poolSelfHarm, family: l.def.family
      });
      spawnParticles(l.tx, l.ty, 10, l.color, 3, 25, 3);
      Sfx.splash();
    }
  }

  let fumes = false;
  for (const pool of pools) {
    pool.life--;
    if (pool.life <= 0) { pool.dead = true; continue; }
    if (pool.selfHarm && dist2(pool.x, pool.y, player.x, player.y) < (pool.r * 0.85) ** 2) fumes = true;
    pool.tick--;
    if (pool.tick <= 0) {
      pool.tick = pool.tickRate;
      for (const e of Grid.query(pool.x, pool.y, pool.r + 64)) {
        if (!e.dead && dist2(pool.x, pool.y, e.x, e.y) < (pool.r + e.r * 0.5) ** 2) {
          if (pool.slow) e.slowUntil = game.time + pool.tickRate + 2;
          damageEnemy(e, pool.dmg, 0, 0, false, pool.family);
        }
      }
    }
  }
  if (fumes && !game.victory) {
    player.hp -= 0.12;
    game.damageTaken += 0.12;
    game.hurtFlash = Math.max(game.hurtFlash, 0.15);
    Sfx.burn();
  }

  for (const b of bolts) {
    b.life--;
    if (b.life <= 0) b.dead = true;
  }

  for (const wv of waves) {
    wv.r += wv.speed;
    if (wv.r >= wv.maxR) { wv.dead = true; continue; }
    for (const e of Grid.query(wv.x, wv.y, wv.r + 64)) {
      if (e.dead || wv.hit.has(e)) continue;
      const d = Math.sqrt(dist2(wv.x, wv.y, e.x, e.y)) || 1;
      if (d < wv.r + e.r && d > wv.r - 24 - e.r) {
        wv.hit.add(e);
        damageEnemy(e, wv.dmg, ((e.x - wv.x) / d) * wv.knock, ((e.y - wv.y) / d) * wv.knock, false, wv.family);
        if (wv.stun && !e.boss) e.stunUntil = game.time + wv.stun;
      }
    }
  }
  for (const s of slashes) s.life--;
}

function explode(x, y, dmg) {
  const radius = 55 * stats.area;
  shockwaves.push({ x, y, r: 6, maxR: radius, life: 16, maxLife: 16, color: '255,138,31' });
  for (const e of Grid.query(x, y, radius + 64)) {
    if (e.dead) continue;
    const d = Math.sqrt(dist2(x, y, e.x, e.y)) || 1;
    if (d < radius + e.r) damageEnemy(e, dmg, ((e.x - x) / d) * 4, ((e.y - y) / d) * 4, false, 'explosion');
  }
  spawnParticles(x, y, 12, '#ff8a1f', 4.5, 30, 4);
  spawnParticles(x, y, 6, '#ffe14d', 3, 22, 3);
  addShake(2);
  Sfx.explode();
}

function updateFires() {
  if (stats.fireTrail) {
    player.fireDropTimer--;
    if (player.fireDropTimer <= 0) {
      fires.push({ x: player.x + rand(-4, 4), y: player.y + rand(-4, 4), r: rand(14, 18), life: 170, maxLife: 170, age: 0, seed: Math.random() * 100 });
      player.fireDropTimer = 4;
    }
  }

  let burning = false;
  for (const f of fires) {
    f.age++;
    f.life--;
    if (f.life <= 0) { f.dead = true; continue; }
    for (const e of Grid.query(f.x, f.y, f.r + 64)) {
      if (!e.dead && dist2(f.x, f.y, e.x, e.y) < (f.r + e.r * 0.7) ** 2) {
        damageEnemy(e, 0.25 * stats.might, 0, 0, true, 'fire');
        e.burning = 6;
      }
    }
    // Fresh flames are safe; older trail burns you (stand still or loop back).
    if (f.age > 40 && dist2(f.x, f.y, player.x, player.y) < (f.r + player.radius * 0.5) ** 2) burning = true;
    if (Math.random() < 0.1) {
      particles.push({
        x: f.x + rand(-f.r, f.r) * 0.6, y: f.y + rand(-f.r, f.r) * 0.6,
        vx: rand(-0.3, 0.3), vy: rand(-1.4, -0.5),
        life: 26, maxLife: 26,
        color: Math.random() < 0.5 ? '#ff8a1f' : '#ffe14d',
        size: rand(2, 4)
      });
    }
  }
  if (burning && !game.victory) {
    player.hp -= 0.22;
    game.damageTaken += 0.22;
    game.hurtFlash = Math.max(game.hurtFlash, 0.2);
    Sfx.burn();
    if (game.time % 24 === 0) addFloater(player.x + rand(-10, 10), player.y - 24, 'BURN!', '#ff8a1f', 14, 35);
  }
}

// -------------------------------------------------------------- Enemies --
function makeEnemy(type, x, y, opts = {}) {
  const def = ENEMIES[type];
  const m = game.time / 3600;
  const elite = !!opts.elite;
  const hpMult = def.boss ? (1 + m * 0.15) * stats.enemyHp : (1 + m * 0.25 + m * m * 0.025) * stats.enemyHp;
  const hp = def.hp * hpMult * game.stage.hpMult * (elite ? 10 : 1) * (opts.hpScale || 1);
  const e = {
    id: game.nextId++,
    type, def, x, y,
    vx: 0, vy: 0,
    r: def.r * (elite ? 1.6 : 1) * (opts.sizeScale || 1),
    hp, maxHp: hp,
    speed: def.speed * rand(0.9, 1.1) * (elite ? 0.9 : 1) * game.stage.speedMult,
    dmg: def.dmg * (elite ? 1.5 : 1) * (1 + m * 0.06) * game.stage.dmgMult,
    xp: def.xp * (elite ? 12 : 1),
    elite,
    boss: !!def.boss,
    kb: def.boss ? 0.05 : elite ? 0.3 : 1,
    flash: 0,
    burning: 0,
    spin: rand(0, TAU),
    shootTimer: rand(60, 150),
    ai: { phase: 'chase', timer: rand(200, 300), dx: 0, dy: 0 },
    orbitHit: 0,
    noSplit: !!opts.noSplit,
    mods: [],
    dead: false
  };
  if (elite) applyEliteMods(e, opts.mods);
  return e;
}

// Elites roll 1 mutation (2 from the Morgue on).
function applyEliteMods(e, forced) {
  const count = game.stageIndex >= 2 ? 2 : 1;
  const pool = Object.keys(ELITE_MODS);
  e.mods = forced ? forced.slice() : [];
  while (!forced && e.mods.length < count) {
    const m = pool.splice(randInt(0, pool.length - 1), 1)[0];
    e.mods.push(m);
  }
  for (const m of e.mods) {
    if (m === 'swift') e.speed *= 1.6;
    if (m === 'shielded') { e.shieldMax = e.maxHp * 0.4; e.shield = e.shieldMax; e.shieldHitAt = 0; }
    if (m === 'volatile') e.volatile = true;
    if (m === 'vaccinated') e.immune = topDamageFamily();
    if (m === 'regenerating') e.regen = (e.maxHp * 0.02) / 60;
  }
}

function topDamageFamily() {
  let best = null;
  let bestDmg = -1;
  for (const [fam, dmg] of Object.entries(game.damageBy)) {
    if (fam === 'fire' || fam === 'explosion') continue;
    if (dmg > bestDmg) { bestDmg = dmg; best = fam; }
  }
  return best || (player.weapons[0] && player.weapons[0].def.family);
}

function familyName(fam) {
  const w = player && player.weapons.find((x) => x.def.family === fam);
  if (w) return w.def.name;
  return (WEAPON_BY_ID[fam] && WEAPON_BY_ID[fam].name) || fam;
}

function spawnRingPos(extra = 50) {
  let a = Math.random() * TAU;
  const moving = Math.hypot(player.vx, player.vy) > 0.5;
  if (moving && Math.random() < 0.5) a = Math.atan2(player.vy, player.vx) + rand(-1.1, 1.1);
  const d = Math.hypot(W, H) / 2 + extra;
  return World.freeSpot(player.x + Math.cos(a) * d, player.y + Math.sin(a) * d, 30);
}

function pickSpawnType(m) {
  const sm = m + game.stage.shift; // later stages unlock nastier enemies sooner
  const items = SPAWN_TABLE.filter((s) => sm >= s.from && m >= (s.minTime || 0) && (s.minStage || 0) <= game.stageIndex).map((s) => ({ type: s.type, weight: s.w(sm) }));
  return weightedPick(items).type;
}

function spawnEnemy(type, opts) {
  // Bosses and elites always spawn; regular enemies respect the cap.
  if (enemies.length >= MAX_ENEMIES && !ENEMIES[type].boss && !(opts && opts.elite)) return null;
  const pos = spawnRingPos(ENEMIES[type].r + 30);
  const e = makeEnemy(type, pos.x, pos.y, opts);
  enemies.push(e);
  return e;
}

function damageEnemy(e, dmg, kx, ky, quiet = false, src = null) {
  if (e.dead) return;
  if (src && e.immune === src) {
    if (!quiet && Math.random() < 0.08) addFloater(e.x, e.y - e.r - 6, 'IMMUNE', '#3dff8a', 12, 30, true);
    return;
  }
  if (e.latched) { // any hit knocks a parasite off
    e.latched = false;
    e.vx = rand(-3, 3);
    e.vy = rand(-3, 3);
  }
  let amount = dmg;
  let crit = false;
  if (e.elite || e.boss) {
    amount *= stats.bossDmg;
    if (src && PRECISION_FAMILIES.includes(src)) amount *= PRECISION_MULT;
  }
  if (!quiet && Math.random() < 0.04 * stats.luck + stats.crit) { amount *= 2; crit = true; }
  if (e.shield > 0) {
    const absorbed = Math.min(e.shield, amount);
    e.shield -= absorbed;
    amount -= absorbed;
    e.shieldHitAt = game.time;
    if (amount <= 0) { if (!quiet) e.flash = 3; return; }
  }
  if (src) game.damageBy[src] = (game.damageBy[src] || 0) + amount;
  e.hp -= amount;
  e.vx += kx * e.kb;
  e.vy += ky * e.kb;
  game.damageDealt += amount;
  if (!quiet) {
    e.flash = 5;
    addFloater(e.x + rand(-8, 8), e.y - e.r, String(Math.round(amount)), crit ? '#ffe14d' : '#ffffff', crit ? 17 : 12, 32, true);
  }
  // Bosses give a crunchy beat every 10% of their health.
  if (e.boss && e.hp > 0 && Math.floor((e.hp / e.maxHp) * 10) < Math.floor(((e.hp + amount) / e.maxHp) * 10)) {
    game.hitstop = Math.max(game.hitstop, 4);
    e.flash = 10;
    addShake(5);
    shockwaves.push({ x: e.x, y: e.y, r: e.r, maxR: e.r + 50, life: 16, maxLife: 16, color: hexToRgb(e.def.color) });
  }
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e, noDrops = false) {
  if (e.dead) return;
  e.dead = true;
  game.kills++;
  discover('enemy', e.type);
  const big = e.boss || e.elite;
  spawnParticles(e.x, e.y, big ? 40 : 10, e.def.color, big ? 7 : 3.5, 36, big ? 5 : 3);
  if (big) {
    addShake(e.boss ? 16 : 6);
    game.hitstop = Math.max(game.hitstop, e.boss ? 14 : 5);
    shockwaves.push({ x: e.x, y: e.y, r: e.r, maxR: e.r * 3 + 40, life: 22, maxLife: 22, color: '255,255,255' });
  }
  Sfx.kill();

  if (e.def.burst) queueBomb(e.x, e.y, 80, e.dmg * 1.6, 36, e.def.color);
  if (e.volatile) queueBomb(e.x, e.y, 110, e.dmg * 1.5, 45, '#ff8a1f');
  if (e.def.spores) spawnSpores(e.x, e.y);
  if (e.def.splits && !e.noSplit && enemies.length < MAX_ENEMIES + 40) {
    for (let i = 0; i < 2; i++) {
      const c = makeEnemy(e.def.splits, e.x + rand(-10, 10), e.y + rand(-10, 10), { noSplit: true, sizeScale: 0.85 });
      c.vx = rand(-3, 3);
      c.vy = rand(-3, 3);
      enemies.push(c);
    }
  }
  if (noDrops) return;

  if (e.xp > 0) spawnGem(e.x, e.y, e.xp);
  if (Math.random() < 0.025 * stats.luck) spawnPickup('gold', e.x, e.y, { value: randInt(1, 3) });
  if (Math.random() < 0.004 * stats.luck) spawnPickup('heal', e.x, e.y);
  if (Math.random() < 0.0015 * stats.luck) spawnPickup('magnet', e.x, e.y);

  if (e.elite) {
    spawnPickup('pill', e.x, e.y, { def: choice(TEMP_PILLS) });
    spawnPickup('chest', e.x + 26, e.y, { tier: 'small' });
    for (let i = 0; i < 3; i++) spawnPickup('gold', e.x + rand(-20, 20), e.y + rand(-20, 20), { value: 5 });
  }
  if (e.boss && !e.def.final) {
    spawnPickup('chest', e.x, e.y, { tier: 'big' });
    for (let i = 0; i < 6; i++) spawnPickup('gold', e.x + rand(-40, 40), e.y + rand(-40, 40), { value: 10 });
    setBanner(`${e.def.name} ERADICATED`, 'grab the care package!', 140);
    Achievements.check('bossKill');
  }
  if (e.def.final) winRun(e);
}

function updateEnemies() {
  const ts = stats.enemyTimeScale;
  const relocate2 = (Math.hypot(W, H) * 0.6 + 250) ** 2;

  game.latched = 0;
  for (const e of enemies) {
    if (e.dead) continue;
    if (e.latched) {
      // Riding the player: drain XP, then fall off after a while.
      e.x = player.x + e.latchOx;
      e.y = player.y + e.latchOy;
      e.latchTime--;
      game.latched++;
      game.xp = Math.max(0, game.xp - 0.035);
      if (e.flash > 0) e.flash--;
      if (e.latchTime <= 0) { e.dead = true; spawnParticles(e.x, e.y, 6, e.def.color, 2, 20, 2); }
      continue;
    }
    if (e.regen) e.hp = Math.min(e.maxHp, e.hp + e.regen);
    if (e.shieldMax && e.shield < e.shieldMax && game.time - e.shieldHitAt > 180) e.shield = Math.min(e.shieldMax, e.shield + e.shieldMax * 0.01);
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d;
    const ny = dy / d;
    const spd = e.speed * stats.enemySpeed * (e.slowUntil > game.time ? 0.5 : 1);
    let desX = nx * spd;
    let desY = ny * spd;

    if (e.boss) {
      const ai = e.ai;
      ai.timer -= ts;
      if (e.def.noCharge) {
        if (ai.timer <= 0) { ai.timer = e.def.summonEvery || 240; bossSummon(e); }
      } else if (ai.phase === 'windup') {
        desX = 0; desY = 0;
        if (ai.timer <= 0) { ai.phase = 'charge'; ai.timer = 50; }
      } else if (ai.phase === 'charge') {
        const cs = e.def.chargeSpeed || 5.5;
        desX = ai.dx * cs; desY = ai.dy * cs;
        if (Math.random() < 0.5) spawnParticles(e.x, e.y, 1, e.def.color, 1, 30, 5);
        if (ai.timer <= 0) {
          ai.phase = 'chase';
          ai.timer = rand(220, 320);
          bossSummon(e);
        }
      } else if (ai.timer <= 0) {
        ai.phase = 'windup';
        ai.timer = 45;
        ai.dx = nx; ai.dy = ny;
      }
      const rad = e.def.radial;
      if (rad) {
        e.shootTimer -= ts;
        if (e.shootTimer <= 0) {
          e.shootTimer = rad.every;
          const off = Math.random() * TAU;
          for (let i = 0; i < rad.n; i++) shootGlob(e, off + (i / rad.n) * TAU, rad.speed, 10 * game.stage.dmgMult);
        }
      }
      const sp = e.def.spiral;
      if (sp && ai.phase !== 'windup') {
        e.spiralTimer = (e.spiralTimer || 0) - ts;
        if (e.spiralTimer <= 0) {
          e.spiralTimer = sp.every;
          e.spiralA = (e.spiralA || 0) + 0.37;
          for (let i = 0; i < sp.n; i++) shootGlob(e, e.spiralA + (i / sp.n) * TAU, sp.speed, 8 * game.stage.dmgMult);
        }
      }
    } else if (e.def.ranged) {
      if (d < 220) { desX = -nx * spd * 0.8; desY = -ny * spd * 0.8; }
      else if (d < 330) { desX = -ny * spd * 0.6; desY = nx * spd * 0.6; }
      e.shootTimer -= ts;
      if (e.shootTimer <= 0 && d < 480) {
        e.shootTimer = 170;
        shootGlob(e, Math.atan2(dy, dx), 3.2, e.dmg);
      }
    }

    if (e.stunUntil > game.time && !e.boss) { desX = 0; desY = 0; }
    const steer = e.boss && e.ai.phase === 'charge' ? 0.3 : 0.1;
    e.vx += (desX - e.vx) * steer * ts;
    e.vy += (desY - e.vy) * steer * ts;
    if (stats.gravity && !e.boss && d < 280) {
      e.x += nx * stats.gravity * ts;
      e.y += ny * stats.gravity * ts;
    }
    e.x += e.vx * ts;
    e.y += e.vy * ts;
    if (!e.boss) {
      const wall = World.collide(e, e.r);
      if (wall) {
        const vn = e.vx * wall.x + e.vy * wall.y;
        if (vn < 0) { e.vx -= vn * wall.x; e.vy -= vn * wall.y; }
        // Slide along the obstacle in whichever direction gets closer to the player.
        let tx = -wall.y;
        let ty = wall.x;
        const dot = tx * nx + ty * ny;
        if (dot < 0 || (Math.abs(dot) < 0.05 && e.id % 2 === 0)) { tx = -tx; ty = -ty; }
        e.x += tx * spd * 0.8 * ts;
        e.y += ty * spd * 0.8 * ts;
      }
    }
    e.spin += 0.03 * ts;
    if (e.flash > 0) e.flash--;
    if (e.burning > 0) e.burning--;

    if (e.def.spores && d < 340) {
      e.sporeTimer = (e.sporeTimer === undefined ? rand(60, 200) : e.sporeTimer) - ts;
      if (e.sporeTimer <= 0) { e.sporeTimer = 260; spawnSpores(e.x, e.y); }
    }
    if (d < e.r + player.radius && !stats.ghost) {
      if (e.def.latch) {
        e.latched = true;
        e.latchTime = 360;
        const a = Math.random() * TAU;
        e.latchOx = Math.cos(a) * player.radius * 0.9;
        e.latchOy = Math.sin(a) * player.radius * 0.9;
        addFloater(player.x, player.y - 30, 'LATCHED!', e.def.color, 14, 40);
        continue;
      }
      if (e.def.burst) { killEnemy(e); continue; }
      hurtPlayer(e.dmg, e.x, e.y);
    }

    // Enemies left far behind wrap back in front of the player.
    if (!e.boss && !e.latched && d * d > relocate2) {
      const pos = spawnRingPos(e.r + 30);
      e.x = pos.x;
      e.y = pos.y;
      e.vx = 0;
      e.vy = 0;
    }
  }

  // Soft separation through the spatial grid; bigger enemies push harder.
  for (const e of enemies) {
    if (e.dead) continue;
    for (const o of Grid.query(e.x, e.y, e.r + 40)) {
      if (o === e || o.dead) continue;
      const dx = e.x - o.x;
      const dy = e.y - o.y;
      const minD = e.r + o.r;
      const dd = dx * dx + dy * dy;
      if (dd > 0.01 && dd < minD * minD) {
        const dist = Math.sqrt(dd);
        const push = (minD - dist) * 0.5 * (o.r / (e.r + o.r)) * (e.boss ? 0.1 : 1);
        e.x += (dx / dist) * push;
        e.y += (dy / dist) * push;
      }
    }
  }
}

// ------------------------------------------------------------ Hazards --
function queueBomb(x, y, r, dmg, timer, color) {
  bombs.push({ x, y, r, dmg, timer, maxTimer: timer, color });
}

function spawnSpores(x, y) {
  spores.push({ x, y, r: 58, life: 240, maxLife: 240, seed: Math.random() * 100 });
}

function updateHazards() {
  for (const b of bombs) {
    b.timer--;
    if (b.timer > 0) continue;
    b.dead = true;
    if (dist2(b.x, b.y, player.x, player.y) < (b.r + player.radius) ** 2) hurtPlayer(b.dmg, b.x, b.y);
    for (const e of Grid.query(b.x, b.y, b.r + 64)) {
      if (!e.dead && dist2(b.x, b.y, e.x, e.y) < (b.r + e.r) ** 2) damageEnemy(e, 30, 0, 0, true, 'explosion');
    }
    shockwaves.push({ x: b.x, y: b.y, r: 10, maxR: b.r, life: 18, maxLife: 18, color: hexToRgb(b.color) });
    spawnParticles(b.x, b.y, 22, b.color, 6, 34, 4);
    addShake(5);
    Sfx.explode();
  }
  let inSpores = false;
  for (const s of spores) {
    s.life--;
    if (s.life <= 0) { s.dead = true; continue; }
    if (dist2(s.x, s.y, player.x, player.y) < (s.r * 0.85) ** 2) inSpores = true;
  }
  if (inSpores && !game.victory) {
    player.hp -= 0.06;
    game.damageTaken += 0.06;
    const ex = player.tempEffects.find((e) => e.def.id === 'spored');
    if (ex) ex.duration = ex.maxDuration;
    else player.tempEffects.push({ def: SPORED, duration: SPORED.duration, maxDuration: SPORED.duration });
  }
}

function bossSummon(e) {
  const n = Math.max(0, Math.min(e.def.summonN || 6, MAX_ENEMIES + 60 - enemies.length));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const c = makeEnemy(e.def.summon || 'germ', e.x + Math.cos(a) * (e.r + 20), e.y + Math.sin(a) * (e.r + 20));
    c.vx = Math.cos(a) * 3;
    c.vy = Math.sin(a) * 3;
    enemies.push(c);
  }
  shockwaves.push({ x: e.x, y: e.y, r: e.r, maxR: e.r + 70, life: 20, maxLife: 20, color: hexToRgb(e.def.color) });
}

function shootGlob(e, angle, speed, dmg) {
  enemyShots.push({
    x: e.x + Math.cos(angle) * e.r,
    y: e.y + Math.sin(angle) * e.r,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r: 6,
    dmg,
    life: 300,
    color: e.def.color
  });
}

function updateEnemyShots() {
  const ts = stats.enemyTimeScale;
  for (const s of enemyShots) {
    s.x += s.vx * ts;
    s.y += s.vy * ts;
    s.life -= ts;
    if (s.life <= 0) { s.dead = true; continue; }
    if (dist2(s.x, s.y, player.x, player.y) < (s.r + player.radius) ** 2) {
      hurtPlayer(s.dmg, s.x, s.y);
      s.dead = true;
      spawnParticles(s.x, s.y, 6, s.color, 2, 18, 3);
    }
  }
}

// -------------------------------------------------------------- Pickups --
function spawnGem(x, y, value) {
  if (gems.length >= MAX_GEMS) {
    gems[randInt(0, gems.length - 1)].value += value;
    return;
  }
  const pos = World.freeSpot(x + rand(-6, 6), y + rand(-6, 6), 6);
  gems.push({ x: pos.x, y: pos.y, value, mag: false, spd: 0, a: rand(0, TAU) });
}

function spawnPickup(type, x, y, opts = {}) {
  ({ x, y } = World.freeSpot(x, y, 20));
  pickups.push({ type, x, y, value: opts.value || 0, def: opts.def || null, tier: opts.tier || null, life: type === 'pill' ? 1500 : Infinity, age: 0, mag: false, spd: 0 });
}

function updateGems() {
  if (stats.ghost) return; // Ghost pill: can't collect anything
  const mr2 = stats.magnet * stats.magnet;
  for (const g of gems) {
    const dx = player.x - g.x;
    const dy = player.y - g.y;
    const dd = dx * dx + dy * dy;
    if (!g.mag && dd < mr2) g.mag = true;
    if (!g.mag) continue;
    const d = Math.sqrt(dd) || 1;
    g.spd = Math.min(g.spd + 0.5, 16);
    g.x += (dx / d) * g.spd;
    g.y += (dy / d) * g.spd;
    if (d < player.radius + 8) {
      g.dead = true;
      addXp(g.value);
      game.xpPulse = 1;
      spawnParticles(player.x, player.y, 2, '#5ec8ff', 2.5, 16, 2);
      Sfx.gem();
    }
  }
}

function updatePickups() {
  const mr2 = stats.magnet * stats.magnet;
  for (const p of pickups) {
    p.age++;
    if (p.age > p.life) { p.dead = true; continue; }
    if (stats.ghost) continue;
    const dx = player.x - p.x;
    const dy = player.y - p.y;
    const dd = dx * dx + dy * dy;
    if (p.type === 'gold' && dd < mr2) p.mag = true;
    if (p.mag) {
      const d = Math.sqrt(dd) || 1;
      p.spd = Math.min(p.spd + 0.5, 14);
      p.x += (dx / d) * p.spd;
      p.y += (dy / d) * p.spd;
    }
    if (dd < (player.radius + 16) ** 2) {
      p.dead = true;
      collectPickup(p);
    }
  }
}

function collectPickup(p) {
  if (p.type === 'gold') {
    game.gold += Math.max(1, Math.round(p.value * stats.greed * game.stage.goldMult));
    Sfx.coin();
  } else if (p.type === 'heal') {
    player.hp = Math.min(stats.maxHp, player.hp + 30);
    addFloater(player.x, player.y - 30, '+30 HP', '#5dff9a', 18);
    spawnParticles(player.x, player.y, 16, '#5dff9a', 3, 30, 3);
    Sfx.heal();
  } else if (p.type === 'magnet') {
    for (const g of gems) g.mag = true;
    addFloater(player.x, player.y - 30, 'VACUUM!', '#5ec8ff', 20);
    Sfx.pickup();
  } else if (p.type === 'chest') {
    const big = p.tier !== 'small';
    game.gold += Math.round((big ? randInt(25, 50) : randInt(8, 16)) * stats.greed * game.stage.goldMult);
    spawnParticles(p.x, p.y, big ? 40 : 20, big ? '#ffe14d' : '#9fd8ff', 6, 40, 4);
    game.chestTier = big ? 'big' : 'small';
    openLevelUp('chest');
  } else if (p.type === 'pill') {
    applyTempPill(p.def);
  }
}

// ------------------------------------------------------------- Director --
function director() {
  const m = game.time / 3600;

  while (game.eventIdx < EVENTS.length && game.time >= EVENTS[game.eventIdx].t * 60) {
    runEvent(EVENTS[game.eventIdx].type, m);
    game.eventIdx++;
  }
  if (game.victory) return;

  // Floor pills every ~45 s (faster for the Addict) keep the side-effect chaos flowing.
  if (game.time >= game.nextFloorPill) {
    game.nextFloorPill += Math.round(2700 / stats.pillRate);
    const a = Math.random() * TAU;
    const d = rand(180, 320);
    spawnPickup('pill', player.x + Math.cos(a) * d, player.y + Math.sin(a) * d, { def: choice(TEMP_PILLS) });
  }
  // During the final fight, keep the pressure on.
  if (game.finalSpawned && game.time % 1800 === 0) runEvent('swarm', m);

  // Crowd size the director tops up to. Starts small so the starting weapon can keep up,
  // then ramps: ~20 at 1 min, ~50 at 3 min, ~95 at 5 min, ~195 at 9 min (General Ward).
  const target = Math.min(MAX_ENEMIES, Math.floor((8 + m * 12 + m * m) * stats.curse * game.stage.spawnMult));
  if (game.time % 6 === 0) {
    const toSpawn = Math.min(target - enemies.length, 2 + Math.floor(m * 0.75));
    for (let i = 0; i < toSpawn; i++) spawnEnemy(pickSpawnType(m));
  }
}

function runEvent(type, m) {
  if (type === 'elite') {
    const pool = SPAWN_TABLE.filter((s) => m + game.stage.shift >= s.from && (s.minStage || 0) <= game.stageIndex && s.type !== 'parasite').map((s) => s.type);
    const el = spawnEnemy(choice(pool), { elite: true });
    const mods = el ? el.mods.map((k) => ELITE_MODS[k].name + (k === 'vaccinated' ? ` vs ${familyName(el.immune)}` : '')).join(' · ') : '';
    setBanner('ELITE INFECTION', mods ? `${mods} — it carries a pill` : 'it carries a pill — take it if you dare', 150);
    Sfx.alarm();
  } else if (type === 'swarm') {
    const n = Math.min(45, 20 + Math.floor(m * 3), Math.max(0, MAX_ENEMIES + 60 - enemies.length));
    const d = Math.hypot(W, H) / 2 + 20;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const e = makeEnemy(m + game.stage.shift > 4 ? 'bacillus' : 'germ', player.x + Math.cos(a) * d, player.y + Math.sin(a) * d);
      enemies.push(e);
    }
    setBanner('OUTBREAK!', 'they\'re surrounding you', 130);
    Sfx.alarm();
  } else if (type === 'boss') {
    const list = game.stage.minibosses || ['superbug'];
    const id = list[game.bossEvents++ % list.length];
    spawnEnemy(id);
    setBanner(`${ENEMIES[id].name} DETECTED`, ENEMIES[id].taunt || '', 170);
    Sfx.boss();
  } else if (type === 'final') {
    game.finalSpawned = true;
    spawnEnemy(game.stage.final);
    setBanner(ENEMIES[game.stage.final].name, 'cure the source of the outbreak', 200);
    Sfx.boss();
  }
}

// ------------------------------------------------------------ Run end --
function winRun(boss) {
  if (game.state !== State.PLAYING || game.dying) return;
  game.victory = true;
  game.endTimer = 200;
  for (const e of enemies) {
    if (e.dead || e === boss) continue;
    e.dead = true;
    spawnParticles(e.x, e.y, 6, e.def.color, 3, 30, 3);
  }
  enemyShots = [];
  for (const g of gems) g.mag = true;
  setBanner('CURED!', 'the outbreak is over', 200);
  Achievements.check('victory');
  addShake(24);
  Sfx.victory();
}

function endRun(victory) {
  game.state = State.GAMEOVER;
  game.victory = victory;
  const secs = Math.floor(game.time / 60);
  const timeBonus = Math.floor((secs / 10) * game.stage.goldMult);
  const winBonus = victory ? Math.round(250 * game.stage.goldMult) : 0;
  const total = game.gold + timeBonus + winBonus;
  game.goldEarned = { pickup: game.gold, time: timeBonus, win: winBonus, total };

  const d = Save.data;
  d.gold += total;
  d.runs++;
  if (victory) {
    d.wins++;
    const next = STAGES[STAGES.indexOf(game.stage) + 1];
    if (next && !d.stagesCleared[game.stage.id]) game.unlockedStage = next;
    d.stagesCleared[game.stage.id] = true;
  }
  d.best.time = Math.max(d.best.time, secs);
  d.best.kills = Math.max(d.best.kills, game.kills);
  d.best.level = Math.max(d.best.level, game.level);
  d.stats.kills += game.kills;
  if (!victory) d.stats.deaths++;
  Save.save();
  Achievements.check('runEnd');

  if (!victory) {
    player.hp = 0;
    spawnParticles(player.x, player.y, 60, game.char.color, 7, 60, 4);
    addShake(22);
    Sfx.gameOver();
  }
  UI.showGameOver();
}

// --------------------------------------------------------------- Update --
function update() {
  if (game.state === State.PLAYING) {
    updatePlaying();
  } else if (game.state === State.GAMEOVER) {
    updateFx();
  }
}

function updatePlaying() {
  if (game.dying > 0) { updateDying(); return; }
  if (game.hitstop > 0) { game.hitstop--; return; }
  game.time++;
  tickTempEffects();
  recomputeStats();
  Grid.rebuild(enemies);

  updatePlayer();
  updateWeapons();
  updateProjectiles();
  updateEnemies();
  updateEnemyShots();
  updateHazards();
  updateFires();
  updateGems();
  updatePickups();
  director();
  if (game.time % 30 === 0) Achievements.check('tick');
  updateFx();
  cleanup();

  if (game.victory) {
    game.endTimer--;
    if (game.endTimer <= 0) { endRun(true); return; }
  } else {
    checkDeath();
  }
  if (game.state === State.PLAYING && game.pendingLevels > 0) openLevelUp('level');
}

function updateFx() {
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.93;
    p.vy *= 0.93;
    p.life--;
  }
  for (const f of floaters) {
    f.y += f.vy;
    f.vy *= 0.96;
    f.life--;
  }
  for (const s of shockwaves) {
    s.life--;
    s.r += (s.maxR - s.r) * 0.25;
  }
  particles = particles.filter((p) => p.life > 0);
  floaters = floaters.filter((f) => f.life > 0);
  shockwaves = shockwaves.filter((s) => s.life > 0);

  if (game.banner) {
    game.banner.life--;
    if (game.banner.life <= 0) game.banner = null;
  }

  game.screenshake *= 0.87;
  if (game.screenshake < 0.15) game.screenshake = 0;
  game.shakeX = (Math.random() * 2 - 1) * game.screenshake;
  game.shakeY = (Math.random() * 2 - 1) * game.screenshake;
  game.hurtFlash = Math.max(0, game.hurtFlash - 0.03);
  game.xpPulse *= 0.88;
}

function cleanup() {
  enemies = enemies.filter((e) => !e.dead);
  projectiles = projectiles.filter((p) => !p.dead);
  enemyShots = enemyShots.filter((s) => !s.dead);
  lobs = lobs.filter((l) => !l.dead);
  pools = pools.filter((p) => !p.dead);
  fires = fires.filter((f) => !f.dead);
  bolts = bolts.filter((b) => !b.dead);
  gems = gems.filter((g) => !g.dead);
  pickups = pickups.filter((p) => !p.dead);
  spores = spores.filter((s) => !s.dead);
  slashes = slashes.filter((s) => s.life > 0);
  waves = waves.filter((w) => !w.dead);
  bombs = bombs.filter((b) => !b.dead);
}
