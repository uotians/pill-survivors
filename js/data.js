'use strict';

/* =========================================================================
   DATA — all tunable content lives here: stats, characters, weapons,
   prescriptions (passives), temporary pills, enemies, events, shop.
   ========================================================================= */

const lv = (arr, L) => arr[clamp(L, 1, arr.length) - 1];

const BASE_RADIUS = 15;
const MAX_WEAPON_SLOTS = 6;
const MAX_PASSIVE_SLOTS = 6;
const RUN_SECONDS = 600; // final boss arrives at 10:00

// Every frame the player's stats are rebuilt from scratch in this order:
// BASE -> character -> pharmacy (meta) -> prescriptions -> temporary pills.
const BASE_STATS = {
  maxHp: 100,
  regen: 0,          // HP per second
  armor: 0,          // flat damage reduction
  speed: 3.1,        // px per frame (terminal velocity)
  friction: 0.82,
  might: 1,          // damage multiplier
  area: 1,
  cooldown: 1,       // lower = faster
  amount: 0,         // extra projectiles
  duration: 1,
  projSpeed: 1,
  magnet: 75,        // pickup radius in px
  growth: 1,         // XP multiplier
  luck: 1,
  greed: 1,          // gold multiplier
  size: 1,           // body/hitbox size
  tremor: 0,         // random aim spread (radians)
  curse: 1,          // enemy count multiplier
  enemySpeed: 1,
  enemyHp: 1,
  revives: 0,
  rerolls: 0,
  choices: 3,
  // set by temporary pills
  inverted: false,
  vignette: false,
  fireTrail: false,
  explosive: false,
  recoil: 0,
  enemyTimeScale: 1,
  afterimage: false,
  // set by evolution side effects
  selfBurn: 0,       // HP per second, never lethal
  // set by characters
  sideMult: 1,       // multiplies every prescription/evolution side effect
  pillDuration: 1,   // temporary pill duration multiplier
  pillRate: 1,       // floor pill frequency multiplier
  withdrawal: false, // crash when the last pill wears off
  // set by newer prescriptions / pills
  crit: 0,           // extra crit chance
  dmgTaken: 1,       // incoming damage multiplier
  bossDmg: 1,        // damage multiplier vs elites and bosses
  drowsy: 0,         // Melatonin: nap strength
  ghost: false,      // Ghost pill: pass through enemies and furniture
  gravity: 0         // px per frame pull on nearby enemies
};

// ------------------------------------------------------------ Characters --
const CHARACTERS = [
  {
    id: 'nurse',
    name: 'Nurse Nova',
    color: '#5ef2ff',
    weapon: 'pistol',
    desc: 'Steady hands, steady dosage.',
    bonus: '+20 Max HP',
    cost: 0,
    apply(s) { s.maxHp += 20; }
  },
  {
    id: 'surgeon',
    name: 'Dr. Blade',
    color: '#ff9a5e',
    weapon: 'scalpel',
    desc: 'Cuts first, asks questions never.',
    bonus: '+15% Might, +10% Speed, -20 Max HP',
    cost: 400,
    apply(s) { s.might += 0.15; s.speed *= 1.1; s.maxHp -= 20; }
  },
  {
    id: 'chemist',
    name: 'The Chemist',
    color: '#9dff3d',
    weapon: 'flask',
    desc: 'Mixes things that should not be mixed.',
    bonus: '+15% Area, +15% Duration',
    cost: 700,
    apply(s) { s.area += 0.15; s.duration += 0.15; }
  },
  {
    id: 'hypochondriac',
    name: 'The Hypochondriac',
    color: '#ff9ad5',
    weapon: 'aura',
    desc: 'Has read every pill leaflet. Twice.',
    bonus: 'Starts with 3 random prescriptions. ALL side effects ×2',
    cost: 0,
    achievement: 'polypharmacy',
    startPassives: 3,
    apply(s) { s.sideMult = 2; }
  },
  {
    id: 'addict',
    name: 'The Addict',
    color: '#ffb13d',
    weapon: 'orbit',
    desc: 'Knows every dealer in the ward.',
    bonus: 'Pills last +50% and appear 2.5× as often. Withdrawal when the last one wears off',
    cost: 0,
    achievement: 'frequent',
    apply(s) { s.pillDuration = 1.5; s.pillRate = 2.5; s.withdrawal = true; }
  }
];

// --------------------------------------------------------------- Weapons --
// base(level) returns raw numbers; game.js scales them by player stats.
const WEAPONS = [
  {
    id: 'pistol',
    name: 'Pill Popper',
    color: '#5ec8ff',
    accent: '#e6f6ff',
    max: 5,
    levelText: [
      'Auto-fires capsules at the nearest enemy.',
      '+1 capsule per volley',
      '+5 damage',
      '+1 capsule per volley',
      '+5 damage, +1 pierce, faster reload'
    ],
    base: (L) => ({
      dmg: lv([10, 10, 15, 15, 20], L),
      amount: lv([1, 2, 2, 3, 3], L),
      cd: lv([55, 55, 50, 50, 42], L),
      pierce: lv([1, 1, 1, 1, 2], L),
      speed: 7.5
    })
  },
  {
    id: 'scalpel',
    name: 'Scalpel Fan',
    color: '#dfe6ff',
    accent: '#8a93b8',
    max: 5,
    levelText: [
      'Throws piercing scalpels where you walk.',
      '+1 scalpel',
      '+4 damage, +1 pierce',
      '+1 scalpel',
      '+4 damage, +1 scalpel, faster'
    ],
    base: (L) => ({
      dmg: lv([8, 8, 12, 12, 16], L),
      amount: lv([2, 3, 3, 4, 5], L),
      cd: lv([70, 70, 64, 64, 54], L),
      pierce: lv([2, 2, 3, 3, 4], L),
      speed: 9
    })
  },
  {
    id: 'aura',
    name: 'Fever Field',
    color: '#ff6b3d',
    accent: '#ffd0b0',
    max: 5,
    levelText: [
      'A feverish aura burns nearby enemies.',
      '+2 damage',
      '+25% radius',
      '+2 damage',
      '+2 damage, +25% radius'
    ],
    base: (L) => ({
      dmg: lv([4, 6, 6, 8, 10], L),
      radius: lv([60, 60, 75, 75, 92], L),
      tick: 22,
      knock: lv([1, 1, 1.5, 1.5, 2], L)
    })
  },
  {
    id: 'orbit',
    name: 'Capsule Orbit',
    color: '#ffe14d',
    accent: '#fff7c9',
    max: 5,
    levelText: [
      'Giant pills orbit you, smashing enemies.',
      '+1 pill',
      '+4 damage, wider orbit',
      '+1 pill',
      '+1 pill, lasts longer, spins faster'
    ],
    base: (L) => ({
      dmg: lv([10, 10, 14, 14, 18], L),
      amount: lv([2, 3, 3, 4, 5], L),
      radius: lv([80, 80, 95, 95, 105], L),
      rot: lv([0.06, 0.06, 0.065, 0.065, 0.08], L),
      dur: lv([180, 180, 200, 200, 260], L),
      cd: lv([150, 150, 140, 140, 120], L)
    })
  },
  {
    id: 'zap',
    name: 'Defibrillator',
    color: '#7af0ff',
    accent: '#ffffff',
    max: 5,
    levelText: [
      'Lightning strikes and chains between enemies.',
      '+1 chain',
      '+8 damage, +1 strike',
      '+1 chain, faster',
      '+8 damage, +1 strike, +1 chain'
    ],
    base: (L) => ({
      dmg: lv([18, 18, 26, 26, 34], L),
      amount: lv([1, 1, 2, 2, 3], L),
      chains: lv([2, 3, 3, 4, 5], L),
      cd: lv([100, 100, 90, 80, 75], L),
      range: 140
    })
  },
  {
    id: 'flask',
    name: 'Acid Flask',
    color: '#9dff3d',
    accent: '#e7ffcc',
    max: 5,
    levelText: [
      'Lobs flasks that leave corrosive pools.',
      '+20% pool size',
      '+1 flask, +2 damage',
      '+20% pool size, lasts longer',
      '+1 flask, +2 damage, faster'
    ],
    base: (L) => ({
      dmg: lv([5, 5, 7, 7, 9], L),
      amount: lv([1, 1, 2, 2, 3], L),
      radius: lv([45, 54, 54, 65, 65], L),
      dur: lv([150, 150, 150, 190, 190], L),
      cd: lv([140, 140, 135, 135, 115], L),
      tick: 15
    })
  },
  {
    id: 'syringe',
    name: 'Homing Syringe',
    color: '#7af0ff',
    accent: '#ffffff',
    max: 5,
    levelText: [
      'Fires needles that home in on enemies.',
      '+1 needle',
      '+4 damage, sharper turns',
      '+1 needle',
      '+1 needle, +4 damage, faster'
    ],
    base: (L) => ({
      dmg: lv([7, 7, 10, 10, 13], L),
      amount: lv([1, 2, 2, 3, 4], L),
      cd: lv([66, 66, 60, 60, 54], L),
      pierce: 1,
      speed: 6.5,
      turn: lv([0.08, 0.08, 0.11, 0.11, 0.13], L)
    })
  },
  {
    id: 'whip',
    name: 'Bandage Whip',
    color: '#f4efe0',
    accent: '#ff4d5e',
    max: 5,
    levelText: [
      'Lashes horizontally in the direction you aim.',
      'Also lashes behind you',
      '+6 damage',
      '+25% length',
      '+6 damage, faster'
    ],
    base: (L) => ({
      dmg: lv([20, 20, 28, 28, 36], L),
      amount: lv([1, 2, 2, 2, 2], L),
      cd: lv([62, 62, 62, 62, 50], L),
      length: lv([150, 150, 150, 188, 188], L),
      width: 42
    })
  },
  {
    id: 'wave',
    name: 'Ultrasound',
    color: '#b8a4ff',
    accent: '#ffffff',
    max: 5,
    levelText: [
      'Emits an expanding sound wave that pushes enemies back.',
      '+20% radius',
      '+5 damage',
      '+20% radius, faster',
      '+5 damage, stronger push'
    ],
    base: (L) => ({
      dmg: lv([10, 10, 15, 15, 20], L),
      radius: lv([150, 180, 180, 215, 215], L),
      cd: lv([130, 130, 130, 110, 110], L),
      knock: lv([5, 5, 5, 5, 8], L)
    })
  }
];

// --------------------------------------------- Prescriptions (passives) --
// THE THEME: every prescription has a permanent, stacking side effect.
const PASSIVES = [
  {
    id: 'steroids', name: 'Steroids', color: '#ff4d5e', max: 5,
    buff: '+10% Might', side: '+6% body size (bigger hitbox)',
    apply(s, L, k = 1) { s.might += 0.10 * L; s.size += 0.06 * L * k; }
  },
  {
    id: 'caffeine', name: 'Caffeine', color: '#c98a4b', max: 5,
    buff: '+8% Move Speed', side: 'Jittery legs: slipperier footing',
    apply(s, L, k = 1) { s.speed *= 1 + 0.08 * L; s.friction += 0.022 * L * k; }
  },
  {
    id: 'iron', name: 'Iron Supplement', color: '#9aa7c7', max: 5,
    buff: '+25% Pickup Radius', side: 'Magnetic: enemies +4% speed',
    apply(s, L, k = 1) { s.magnet *= 1 + 0.25 * L; s.enemySpeed += 0.04 * L * k; }
  },
  {
    id: 'painkillers', name: 'Painkillers', color: '#ffffff', max: 5,
    buff: '+20 Max HP, +1 Armor', side: 'Numbness: -4% Move Speed',
    apply(s, L, k = 1) { s.maxHp += 20 * L; s.armor += L; s.speed *= Math.max(0.3, 1 - 0.04 * L * k); }
  },
  {
    id: 'amphetamine', name: 'Amphetamines', color: '#ff5cf0', max: 5,
    buff: '-8% Cooldowns', side: 'Hand tremor: shots scatter',
    apply(s, L, k = 1) { s.cooldown *= 1 - 0.08 * L; s.tremor += 0.07 * L * k; }
  },
  {
    id: 'hormone', name: 'Growth Hormone', color: '#ffb13d', max: 5,
    buff: '+12% Area', side: 'Contagious: enemies +8% HP',
    apply(s, L, k = 1) { s.area += 0.12 * L; s.enemyHp += 0.08 * L * k; }
  },
  {
    id: 'cloning', name: 'Cloning Serum', color: '#b45cff', max: 3,
    buff: '+1 Projectile', side: 'Diluted: -10% Might',
    apply(s, L, k = 1) { s.amount += L; s.might -= 0.10 * L * k; }
  },
  {
    id: 'antibiotics', name: 'Antibiotics', color: '#3dff8a', max: 5,
    buff: '+0.5 HP/s Regeneration', side: 'Gut flora wiped: -6% XP gain',
    apply(s, L, k = 1) { s.regen += 0.5 * L; s.growth -= 0.06 * L * k; }
  },
  {
    id: 'melatonin', name: 'Melatonin', color: '#7a8cff', max: 5,
    buff: '+12% XP gain', side: 'Drowsy: you doze off now and then',
    apply(s, L, k = 1) { s.growth += 0.12 * L; s.drowsy += L * k; }
  },
  {
    id: 'betablockers', name: 'Beta Blockers', color: '#5ec8ff', max: 5,
    buff: '+6% Critical hit chance', side: 'Calm heart: +5% cooldowns',
    apply(s, L, k = 1) { s.crit += 0.06 * L; s.cooldown *= 1 + 0.05 * L * k; }
  },
  {
    id: 'bloodthinner', name: 'Blood Thinner', color: '#c4142e', max: 5,
    buff: '+12% Might', side: 'You bleed easily: +12% damage taken',
    apply(s, L, k = 1) { s.might += 0.12 * L; s.dmgTaken += 0.12 * L * k; }
  },
  {
    id: 'booster', name: 'Vaccine Booster', color: '#3dd6c6', max: 5,
    buff: '+15% damage to elites and bosses', side: 'Mild fever: -5 Max HP',
    apply(s, L, k = 1) { s.bossDmg += 0.15 * L; s.maxHp -= 5 * L * k; }
  },
  {
    id: 'placebo', name: 'Lucky Placebo', color: '#ffe14d', max: 5,
    buff: '+15% Luck & Gold', side: 'Attracts trouble: +8% enemies',
    apply(s, L, k = 1) { s.luck += 0.15 * L; s.greed += 0.15 * L; s.curse += 0.08 * L * k; }
  }
];

// --------------------------------------------- Temporary pills (pickups) --
// Dropped by elites & found on the floor. Strong for 10 s, chaotic side effect.
const TEMP_PILLS = [
  {
    id: 'speed', name: 'Hyper-Speed', color: '#ffe14d', accent: '#fff7c9',
    buffShort: '+HYPER SPEED', sideShort: '-NO FRICTION!',
    buffDesc: '+100% Move Speed', sideEffectDesc: 'Zero friction (ice floor)',
    duration: 600,
    onTick(s) { s.speed *= 2; s.friction = 0.98; s.afterimage = true; }
  },
  {
    id: 'shotgun', name: 'Shotgun Blast', color: '#ff4d5e', accent: '#ffd0d5',
    buffShort: '+3 PROJECTILES', sideShort: '-MASSIVE RECOIL!',
    buffDesc: '+3 projectiles on all weapons', sideEffectDesc: 'Every volley kicks you back',
    duration: 600,
    onTick(s) { s.amount += 3; s.recoil = 7; }
  },
  {
    id: 'focus', name: 'Tunnel Vision', color: '#b45cff', accent: '#ead6ff',
    buffShort: '+BULLET TIME', sideShort: '-TUNNEL VISION!',
    buffDesc: 'Enemies slowed by 60%', sideEffectDesc: 'Darkness beyond arm\'s reach',
    duration: 600,
    onTick(s) { s.enemyTimeScale = Math.min(s.enemyTimeScale, 0.4); s.vignette = true; }
  },
  {
    id: 'pyro', name: 'Pyromaniac', color: '#ff8a1f', accent: '#ffe0bf',
    buffShort: '+EXPLOSIVE ROUNDS', sideShort: '-FIRE TRAIL!',
    buffDesc: 'Projectiles explode on hit', sideEffectDesc: 'Burning trail hurts you too',
    duration: 600,
    onTick(s) { s.explosive = true; s.fireTrail = true; }
  },
  {
    id: 'mega', name: 'Mega-Dose', color: '#3dff8a', accent: '#d4ffe5',
    buffShort: '+MEGA HEAL', sideShort: '-INVERTED CONTROLS!',
    buffDesc: 'Heal 40% & strong regen', sideEffectDesc: 'Movement controls inverted',
    duration: 420,
    onApply(p) { p.hp = Math.min(stats.maxHp, p.hp + stats.maxHp * 0.4); },
    onTick(s) { s.regen += 3; s.inverted = true; }
  },
  {
    id: 'shrink', name: 'Shrink', color: '#ff9ad5', accent: '#ffe0f0',
    buffShort: '+TINY & FAST', sideShort: '-WEAK!',
    buffDesc: 'Half-size hitbox, +25% speed', sideEffectDesc: '-40% damage',
    duration: 600,
    onTick(s) { s.size *= 0.5; s.speed *= 1.25; s.might *= 0.6; }
  },
  {
    id: 'ghost', name: 'Ghost', color: '#e8ecff', accent: '#8a93b8',
    buffShort: '+INTANGIBLE', sideShort: '-CAN\'T PICK UP!',
    buffDesc: 'Pass through enemies and furniture', sideEffectDesc: 'Cannot collect XP or items',
    duration: 420,
    onTick(s) { s.ghost = true; }
  },
  {
    id: 'lodestone', name: 'Lodestone', color: '#9aa7c7', accent: '#ff4d5e',
    buffShort: '+MEGA MAGNET', sideShort: '-ENEMIES TOO!',
    buffDesc: 'Pulls XP and gold from the whole screen', sideEffectDesc: 'Pulls enemies toward you',
    duration: 420,
    onTick(s) { s.magnet = Math.max(s.magnet, 1100); s.gravity += 0.9; }
  }
];

// Not a pickup: the Addict's crash when their last pill wears off.
const WITHDRAWAL = {
  id: 'withdrawal', name: 'Withdrawal', color: '#7a7f99', accent: '#c8cde8', hidden: true,
  buffShort: '', sideShort: 'WITHDRAWAL!',
  buffDesc: 'None. You need another pill.', sideEffectDesc: '-40% speed, shaking hands',
  duration: 180,
  onTick(s) { s.speed *= 0.6; s.tremor += 0.3; }
};

// --------------------------------------------------------------- Enemies --
const ENEMIES = {
  germ:        { name: 'Germ',        r: 12, speed: 1.25, hp: 10,   dmg: 6,  xp: 1,  color: '#ff3b5c', shape: 'blob' },
  bacillus:    { name: 'Bacillus',    r: 9,  speed: 2.1,  hp: 6,    dmg: 5,  xp: 1,  color: '#ff5cf0', shape: 'capsule' },
  amoeba:      { name: 'Amoeba',      r: 18, speed: 1.0,  hp: 30,   dmg: 8,  xp: 3,  color: '#ffb13d', shape: 'blob', splits: 'germ' },
  spitter:     { name: 'Spitter',     r: 14, speed: 1.05, hp: 24,   dmg: 6,  xp: 3,  color: '#3dd6c6', shape: 'eye', ranged: true },
  virus:       { name: 'Virus',       r: 20, speed: 0.85, hp: 55,   dmg: 12, xp: 5,  color: '#8a5cff', shape: 'spiky' },
  superbug:    { name: 'SUPERBUG',    r: 46, speed: 1.0,  hp: 1800, dmg: 20, xp: 60, color: '#c3ff3d', shape: 'spiky', boss: true,
                 taunt: 'antibiotic resistant. probably.' },
  // Stage-specific pathogens (see SPAWN_TABLE minStage)
  parasite:    { name: 'Parasite',    r: 8,  speed: 2.5,  hp: 8,    dmg: 0,  xp: 2,  color: '#c9ff6b', shape: 'tick', latch: true },
  fungus:      { name: 'Spore Pod',   r: 17, speed: 0.45, hp: 45,   dmg: 8,  xp: 4,  color: '#b98cff', shape: 'mushroom', spores: true },
  bloater:     { name: 'Bloater',     r: 19, speed: 1.15, hp: 34,   dmg: 10, xp: 4,  color: '#9dd94a', shape: 'bloater', burst: true },
  motherCulture: { name: 'MOTHER CULTURE', r: 54, speed: 0.55, hp: 2200, dmg: 18, xp: 60, color: '#ffd06b', shape: 'culture', boss: true,
                 noCharge: true, summon: 'parasite', summonN: 5, summonEvery: 200, radial: { n: 12, speed: 2.0, every: 150 },
                 taunt: 'she is breeding parasites' },
  patientZero: { name: 'PATIENT ZERO', r: 62, speed: 0.95, hp: 5000, dmg: 28, xp: 0,  color: '#ff2d4a', shape: 'boss', boss: true, final: true,
                 summon: 'bacillus', summonN: 10, radial: { n: 16, speed: 2.6, every: 160 } },
  // Stage final bosses
  mutagen:     { name: 'THE MUTAGEN', r: 60, speed: 1.0, hp: 5000, dmg: 26, xp: 0, color: '#9dff3d', shape: 'boss', boss: true, final: true, spikes: 9,
                 summon: 'amoeba', summonN: 6, spiral: { n: 3, speed: 2.4, every: 18 }, chargeSpeed: 5 },
  undertaker:  { name: 'THE UNDERTAKER', r: 64, speed: 0.9, hp: 4800, dmg: 26, xp: 0, color: '#c8d2f0', shape: 'boss', boss: true, final: true, spikes: 6,
                 summon: 'germ', summonN: 16, radial: { n: 22, speed: 2.2, every: 140 }, chargeSpeed: 7 },
  contagion:   { name: 'THE CONTAGION', r: 70, speed: 1.05, hp: 4800, dmg: 26, xp: 0, color: '#ff3df0', shape: 'boss', boss: true, final: true, spikes: 18,
                 summon: 'bacillus', summonN: 12, radial: { n: 18, speed: 2.8, every: 170 }, spiral: { n: 2, speed: 2.2, every: 16 }, chargeSpeed: 6.5 }
};

// Weighted regular spawns; `from` is the minute the type unlocks.
const SPAWN_TABLE = [
  { type: 'germ',     from: 0,    w: (m) => Math.max(3, 10 - m) },
  { type: 'bacillus', from: 0.75, w: () => 6 },
  { type: 'amoeba',   from: 2,    w: () => 3 },
  { type: 'spitter',  from: 3,    w: () => 2.5 },
  { type: 'virus',    from: 4,    w: (m) => 2 + m * 0.4 },
  // minStage: first stage index where the type appears (0 ward, 1 lab, 2 morgue, 3 quarantine)
  // minTime: real minutes before it can appear, regardless of the stage shift
  { type: 'parasite', from: 1.5,  minStage: 1, minTime: 0.75, w: () => 4 },
  { type: 'fungus',   from: 2,    minStage: 2, minTime: 1,    w: () => 2.5 },
  { type: 'bloater',  from: 2.5,  minStage: 3, minTime: 1.5,  w: () => 3 }
];

// One or two of these are rolled onto every elite.
const ELITE_MODS = {
  swift:        { name: 'SWIFT',        color: '#5ec8ff', desc: '+60% speed' },
  shielded:     { name: 'SHIELDED',     color: '#7af0ff', desc: 'Regenerating shield worth 40% HP' },
  volatile:     { name: 'VOLATILE',     color: '#ff8a1f', desc: 'Explodes when it dies' },
  vaccinated:   { name: 'VACCINATED',   color: '#3dff8a', desc: 'Immune to your most damaging weapon' },
  regenerating: { name: 'REGENERATING', color: '#ff5cf0', desc: 'Heals 2% HP per second' }
};

// Debuff from Spore Pod clouds (hidden: not a pickup, no withdrawal trigger).
const SPORED = {
  id: 'spored', name: 'Spored', color: '#b98cff', accent: '#e6d6ff', hidden: true,
  buffDesc: 'None.', sideEffectDesc: '-25% speed, coughing fits',
  duration: 45,
  onTick(s) { s.speed *= 0.75; s.tremor += 0.15; }
};

// Scheduled run events, in seconds.
const EVENTS = [
  { t: 45,  type: 'elite' },
  { t: 100, type: 'elite' },
  { t: 150, type: 'swarm' },
  { t: 180, type: 'boss' },
  { t: 225, type: 'elite' },
  { t: 270, type: 'elite' },
  { t: 320, type: 'swarm' },
  { t: 345, type: 'elite' },
  { t: 400, type: 'elite' },
  { t: 420, type: 'boss' },
  { t: 470, type: 'elite' },
  { t: 500, type: 'swarm' },
  { t: 530, type: 'elite' },
  { t: 560, type: 'swarm' },
  { t: 575, type: 'elite' },
  { t: RUN_SECONDS, type: 'final' }
];

// ------------------------------------------------------ Pharmacy (meta) --
// Cost of next level = cost * (currentLevel + 1)
const SHOP = [
  { id: 'vitality', name: 'Vitality',       desc: '+10 Max HP',             max: 5, cost: 60,  apply(s, L) { s.maxHp += 10 * L; } },
  { id: 'potency',  name: 'Potency',        desc: '+5% Might',              max: 5, cost: 80,  apply(s, L) { s.might += 0.05 * L; } },
  { id: 'agility',  name: 'Agility',        desc: '+5% Move Speed',         max: 3, cost: 90,  apply(s, L) { s.speed *= 1 + 0.05 * L; } },
  { id: 'armor',    name: 'Thick Skin',     desc: '+1 Armor',               max: 3, cost: 120, apply(s, L) { s.armor += L; } },
  { id: 'recovery', name: 'Recovery',       desc: '+0.2 HP/s Regen',        max: 3, cost: 90,  apply(s, L) { s.regen += 0.2 * L; } },
  { id: 'haste',    name: 'Haste',          desc: '-3% Cooldowns',          max: 3, cost: 120, apply(s, L) { s.cooldown *= 1 - 0.03 * L; } },
  { id: 'magnet',   name: 'Attraction',     desc: '+15% Pickup Radius',     max: 3, cost: 50,  apply(s, L) { s.magnet *= 1 + 0.15 * L; } },
  { id: 'growth',   name: 'Fast Learner',   desc: '+5% XP gain',            max: 3, cost: 100, apply(s, L) { s.growth += 0.05 * L; } },
  { id: 'fortune',  name: 'Fortune',        desc: '+10% Gold & Luck',       max: 3, cost: 100, apply(s, L) { s.greed += 0.1 * L; s.luck += 0.1 * L; } },
  { id: 'reroll',   name: 'Second Opinion', desc: '+1 Reroll per run',      max: 3, cost: 150, apply(s, L) { s.rerolls += L; } },
  { id: 'revive',   name: 'Defibrillation', desc: 'Revive once per run',    max: 1, cost: 600, requires: 'frequentPatient', apply(s, L) { s.revives += L; } }
];

// ----------------------------------------------------------- Lookups --
const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
const CHAR_BY_ID = byId(CHARACTERS);
const WEAPON_BY_ID = byId(WEAPONS);
const PASSIVE_BY_ID = byId(PASSIVES);
const PILL_BY_ID = byId(TEMP_PILLS);
for (const w of WEAPONS) w.family = w.id;

// ------------------------------------------------------------ Evolutions --
// Max-level weapon + the listed prescription => evolution card / chest.
// Every evolution keeps the theme: a big upgrade with its own side effect.
const EVOLUTIONS = [
  {
    id: 'pillstorm', name: 'Pill Storm', from: 'pistol', requires: 'cloning', family: 'pistol',
    color: '#3d7bff', accent: '#ffffff', evo: true, max: 1,
    desc: 'A relentless barrage of piercing capsules.',
    side: 'Every 6th capsule is a placebo and does nothing.',
    placeboEvery: 6,
    base: () => ({ dmg: 24, amount: 6, cd: 34, pierce: 3, speed: 9 })
  },
  {
    id: 'bonesaw', name: 'Bone Saw', from: 'scalpel', requires: 'steroids', family: 'saw',
    color: '#ff9a5e', accent: '#ffe0cc', evo: true, max: 1,
    desc: 'Spinning saws fly out and return, shredding everything twice.',
    side: 'Heavy: -10% move speed.',
    applySide(s, k) { s.speed *= 1 - 0.10 * k; },
    base: () => ({ dmg: 22, amount: 3, cd: 70, pierce: 999, speed: 8, dur: 110 })
  },
  {
    id: 'hyperthermia', name: 'Hyperthermia', from: 'aura', requires: 'hormone', family: 'aura',
    color: '#ff3d3d', accent: '#ffc0a0', evo: true, max: 1,
    desc: 'A raging fever field that melts the whole crowd.',
    side: 'Burns you for 1 HP/s (never lethal).',
    applySide(s, k) { s.selfBurn += 1 * k; },
    base: () => ({ dmg: 16, radius: 150, tick: 18, knock: 2.5 })
  },
  {
    id: 'planetary', name: 'Planetary Dose', from: 'orbit', requires: 'painkillers', family: 'orbit',
    color: '#ffb13d', accent: '#fff2c9', evo: true, max: 1,
    desc: 'Six giant pills orbit you permanently.',
    side: 'Gravity well: pulls nearby enemies toward you.',
    applySide(s, k) { s.gravity += 0.5 * k; },
    base: () => ({ dmg: 24, amount: 6, radius: 115, rot: 0.07, dur: 1e9, cd: 1 })
  },
  {
    id: 'tesla', name: 'Tesla Heart', from: 'zap', requires: 'iron', family: 'zap',
    color: '#b8f7ff', accent: '#ffffff', evo: true, max: 1,
    desc: 'Twin lightning strikes that chain through swarms.',
    side: 'Ungrounded: 12% of strikes arc into you.',
    selfZap: 0.12,
    base: () => ({ dmg: 28, amount: 2, chains: 5, cd: 75, range: 170 })
  },
  {
    id: 'biohazard', name: 'Biohazard', from: 'flask', requires: 'antibiotics', family: 'flask',
    color: '#c45cff', accent: '#f0d6ff', evo: true, max: 1,
    desc: 'Huge corrosive pools that slow and dissolve enemies.',
    side: 'Toxic fumes: the pools hurt you too.',
    poolSlow: true, poolSelfHarm: true,
    base: () => ({ dmg: 14, amount: 3, radius: 95, dur: 260, cd: 100, tick: 12 })
  }
];
EVOLUTIONS.push(
  {
    id: 'massvax', name: 'Mass Vaccination', from: 'syringe', requires: 'booster', family: 'syringe',
    color: '#3dd6c6', accent: '#ffffff', evo: true, max: 1,
    desc: 'Volleys of homing vaccine darts. Double damage to elites and bosses.',
    side: 'Immune overload: -10 Max HP.',
    eliteMult: 2,
    applySide(s, k) { s.maxHp -= 10 * k; },
    base: () => ({ dmg: 13, amount: 4, cd: 50, pierce: 1, speed: 7.5, turn: 0.15 })
  },
  {
    id: 'tourniquet', name: 'Tourniquet', from: 'whip', requires: 'bloodthinner', family: 'whip',
    color: '#ff4d5e', accent: '#f4efe0', evo: true, max: 1,
    desc: 'Massive lashes on both sides. Every enemy hit heals you.',
    side: 'The bleeding never stops: +15% damage taken.',
    lifesteal: 1,
    applySide(s, k) { s.dmgTaken += 0.15 * k; },
    base: () => ({ dmg: 42, amount: 2, cd: 44, length: 240, width: 60 })
  },
  {
    id: 'lullaby', name: 'Lullaby', from: 'wave', requires: 'melatonin', family: 'wave',
    color: '#7a8cff', accent: '#ffffff', evo: true, max: 1,
    desc: 'Soothing waves that knock enemies out cold for a second.',
    side: 'It works on you too: longer, more frequent naps.',
    stun: 60,
    applySide(s, k) { s.drowsy += 2 * k; },
    base: () => ({ dmg: 20, radius: 250, cd: 80, knock: 4 })
  }
);
const EVOLUTION_BY_ID = byId(EVOLUTIONS);

for (const [id, def] of Object.entries(ENEMIES)) def.id = id;
const ENEMY_LIST = Object.values(ENEMIES);

// ------------------------------------------------------ Encyclopedia --
// Flavor text, keyed "category:id". Shown once an entry is discovered.
const LORE = {
  'weapon:pistol': 'Standard-issue capsule launcher. Each round contains 200 mg of pure "go away".',
  'weapon:scalpel': 'Sterilized, perfectly balanced and thrown with deeply questionable bedside manner.',
  'weapon:aura': 'Weaponized fever. You feel terrible, but so does everything standing near you.',
  'weapon:orbit': 'Oversized placebo capsules held in orbit by sheer confidence.',
  'weapon:zap': 'CLEAR! The defibrillator was never meant to be fired at range. It is now.',
  'weapon:flask': 'An unlabeled flask from the back of the lab. Melts germs, floors and warranties.',

  'weapon:syringe': 'Self-guided needles. They always find a vein. Or a germ.',
  'weapon:whip': 'A roll of bandages, swung with confidence and very little training.',
  'weapon:wave': 'Medical imaging at a volume that is no longer strictly diagnostic.',
  'evolution:massvax': 'Everyone gets a shot. Everyone. Whether they want one or not.',
  'evolution:tourniquet': 'Stops your bleeding by making everyone else bleed instead.',
  'evolution:lullaby': 'Hush now. Everybody sleeps. Including, occasionally, you.',
  'evolution:pillstorm': 'Mass-produced, mass-prescribed, mass-fired. Quality control was optional.',
  'evolution:bonesaw': 'What goes around comes around. Usually through a germ.',
  'evolution:hyperthermia': 'A fever so high the thermometer filed a complaint.',
  'evolution:planetary': 'The pills have their own gravity now. So do the patients.',
  'evolution:tesla': 'Your heartbeat is now measured in kilovolts.',
  'evolution:biohazard': 'Do not inhale. Do not touch. Do not stand there. Seriously.',

  'passive:steroids': 'Gains are guaranteed. Fitting through doorways is not.',
  'passive:caffeine': 'Twelve espressos, distilled. Your legs start moving before you decide to.',
  'passive:iron': 'Your blood is basically a magnet now. Coins love it. So do germs.',
  'passive:painkillers': 'You can\'t feel the bites anymore. You also can\'t feel your feet.',
  'passive:amphetamine': 'Everything is faster — including the trembling of your hands.',
  'passive:hormone': 'Everything grows: your aura, your splash zones... and the bacteria feeding on you.',
  'passive:cloning': 'Two of everything! Each copy is slightly worse than the last. Science.',
  'passive:antibiotics': 'Kills the bad bacteria. And the good ones. And your ability to learn from them.',
  'passive:melatonin': 'Sweet dreams are made of this. So are fatal ambushes.',
  'passive:betablockers': 'Your pulse never rises. Neither does your trigger finger.',
  'passive:bloodthinner': 'Hits harder, bleeds harder. A fair trade, the leaflet says.',
  'passive:booster': 'Trains your immune system against the big ones. Side effects may include feeling awful.',
  'pill:shrink': 'Side effects include fitting through keyholes and losing arguments.',
  'pill:ghost': 'You are technically here. Your pockets, unfortunately, are not.',
  'pill:lodestone': 'Everything is attracted to you. Everything.',
  'passive:placebo': 'It does absolutely nothing, which is exactly why it works. Trouble finds the lucky.',

  'pill:speed': 'Pharmaceutical-grade adrenaline. Side effects include loss of friction and involuntary screaming.',
  'pill:shotgun': 'Turns every weapon into a scattergun. Newton\'s third law sends the invoice.',
  'pill:focus': 'Time crawls to a halt. So does your peripheral vision.',
  'pill:pyro': 'Your rounds explode on impact. Your shoes, unfortunately, also ignite.',
  'pill:mega': 'A horse-sized dose of everything good. Left is right now. Deal with it.',

  'enemy:germ': 'The common germ. Alone it is harmless. It is never alone.',
  'enemy:bacillus': 'Rod-shaped, flagellated and extremely rude.',
  'enemy:amoeba': 'Kill one, get two. The math is not in your favor.',
  'enemy:spitter': 'Prefers to infect you from a safe, cowardly distance.',
  'enemy:virus': 'A spiky protein shell that asks no questions and accepts no antibiotics.',
  'enemy:superbug': 'Resistant to everything we had. Hopefully not to what you have.',
  'enemy:patientZero': 'Where it all started. Cure it, and the outbreak ends.'
};

const ENEMY_BEHAVIOR = {
  germ: 'Chases you relentlessly.',
  bacillus: 'Fast and fragile. Darts in from every side.',
  amoeba: 'Splits into two germs when killed.',
  spitter: 'Keeps its distance and spits slow acid globs.',
  virus: 'Slow, tanky and hits hard.',
  superbug: 'BOSS. Telegraphs a charge, then summons germs. Drops a care package.',
  patientZero: 'FINAL BOSS. Charges, summons swarms and fires radial acid bursts.'
};


// ---------------------------------------------------------------- Stages --
// Unlocked in order by beating the previous stage's final boss.
// shift: enemy types unlock this many minutes earlier. key: music transpose.
const STAGES = [
  {
    id: 'ward', name: 'General Ward', color: '#5ec8ff',
    desc: 'Where it all begins. Beds, cabinets and a lot of coughing.',
    hpMult: 1, dmgMult: 1, speedMult: 1, spawnMult: 1, goldMult: 1, shift: 0,
    final: 'patientZero', minibosses: ['superbug', 'superbug'], key: 0, bpmAdd: 0,
    floor: { base: '#0c0e19', tint: 'rgba(120, 140, 220, 0.03)', grid: 'rgba(110, 140, 230, 0.08)', mark: 'cross' },
    furniture: { row: 'bed', scatter: ['cabinet', 'pillar', 'desk', 'plant', 'bed', 'cabinet'], empty: 0.15 }
  },
  {
    id: 'lab', name: 'Research Lab', color: '#9dff3d',
    desc: 'Something escaped containment. Several somethings.',
    hpMult: 1.35, dmgMult: 1.15, speedMult: 1.06, spawnMult: 1.15, goldMult: 1.4, shift: 1,
    final: 'mutagen', minibosses: ['superbug', 'motherCulture'], key: 2, bpmAdd: 4,
    floor: { base: '#08130f', tint: 'rgba(80, 220, 160, 0.035)', grid: 'rgba(80, 220, 160, 0.09)', mark: 'drain' },
    furniture: { row: 'bench', scatter: ['vat', 'crate', 'bench', 'pillar', 'vat', 'cabinet'], empty: 0.15 }
  },
  {
    id: 'morgue', name: 'Morgue', color: '#c8d2f0',
    desc: 'Cold, quiet and full of patients who refuse to stay dead.',
    hpMult: 1.8, dmgMult: 1.3, speedMult: 1.12, spawnMult: 1.3, goldMult: 1.9, shift: 2,
    final: 'undertaker', minibosses: ['motherCulture', 'superbug'], key: -2, bpmAdd: -4,
    floor: { base: '#0b0d12', tint: 'rgba(170, 190, 220, 0.03)', grid: 'rgba(170, 190, 220, 0.07)', mark: 'grate' },
    furniture: { row: 'gurney', scatter: ['locker', 'gurney', 'pillar', 'cabinet', 'locker', 'crate'], empty: 0.12 }
  },
  {
    id: 'quarantine', name: 'Quarantine Zone', color: '#ff3df0',
    desc: 'Ground zero. Nobody was supposed to come back in here.',
    hpMult: 2.4, dmgMult: 1.5, speedMult: 1.18, spawnMult: 1.45, goldMult: 2.5, shift: 3,
    final: 'contagion', minibosses: ['motherCulture', 'motherCulture'], key: 5, bpmAdd: 8,
    floor: { base: '#140a0c', tint: 'rgba(255, 80, 80, 0.03)', grid: 'rgba(255, 90, 90, 0.08)', mark: 'hazard' },
    furniture: { row: 'barrier', scatter: ['barrel', 'crate', 'barrier', 'barrel', 'pillar', 'crate'], empty: 0.12 }
  }
];
const STAGE_BY_ID = byId(STAGES);

Object.assign(LORE, {
  'enemy:parasite': 'Hitches a ride, eats what you learn. Rude, but efficient.',
  'enemy:fungus': 'Grew in a forgotten drawer. Shares its spores generously.',
  'enemy:bloater': 'Swollen with something you really, really do not want on you.',
  'enemy:motherCulture': 'A petri dish that never stopped growing. Everything here is her child.',
  'enemy:mutagen': 'It was a cure once. Then it was rewritten. Then it rewrote itself.',
  'enemy:undertaker': 'Collects the fallen and sends them back to work.',
  'enemy:contagion': 'Every infection in the hospital, wearing one body.'
});
Object.assign(ENEMY_BEHAVIOR, {
  parasite: 'Latches onto you: drains XP and slows you. Drops off when hit or after 6 s. (Research Lab and later)',
  fungus: 'Barely moves, but puffs spore clouds that slow you and shake your aim. (Morgue and later)',
  bloater: 'Bursts on contact or death after a short warning. The blast hurts everything nearby. (Quarantine Zone)',
  motherCulture: 'MINIBOSS. Never charges, constantly breeds parasites and fires acid rings. Drops a care package.',
  patientZero: ENEMY_BEHAVIOR.patientZero,
  mutagen: 'FINAL BOSS (Research Lab). Sprays rotating acid spirals and spawns amoebas.',
  undertaker: 'FINAL BOSS (Morgue). Brutal fast charges, raises huge hordes, wide acid rings.',
  contagion: 'FINAL BOSS (Quarantine Zone). Spirals, acid rings and endless bacillus swarms.'
});
