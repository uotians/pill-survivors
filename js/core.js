'use strict';

/* =========================================================================
   CORE — canvas, helpers, audio, input state, save data, spatial grid
   ========================================================================= */

const canvas = document.getElementById('game');
let ctx = canvas.getContext('2d'); // `let` so encyclopedia portraits can borrow the draw functions

let W = 800;
let H = 600;
let DPR = 1;

const STEP = 1000 / 60; // fixed logic step; all durations are in frames
const TAU = Math.PI * 2;
const FONT = 'ui-monospace, "Cascadia Mono", Consolas, "Courier New", monospace';

// ---------------------------------------------------------------- Helpers --
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const rand = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

function weightedPick(items) {
  let total = 0;
  for (const it of items) total += it.weight;
  let r = Math.random() * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

function fmtTime(frames) {
  const s = Math.floor(frames / 60);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

function rgba(hex, a) {
  return `rgba(${hexToRgb(hex)},${a})`;
}

// --------------------------------------------------------------- Resizing --
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
}

// ----------------------------------------------------------------- Audio --
const Sfx = {
  ctx: null,
  master: null,
  noiseBuf: null,
  muted: false,
  last: {},
  gemPitch: 0,
  lastGemAt: 0,

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { return; }
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.2;
    this.master.connect(this.ctx.destination);
    const len = Math.floor(this.ctx.sampleRate * 0.6);
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  },

  // Throttle per sound name so 30 simultaneous hits don't clip.
  ok(name, gapMs) {
    if (!this.ctx || this.muted) return false;
    const now = performance.now();
    if (this.last[name] && now - this.last[name] < gapMs) return false;
    this.last[name] = now;
    return true;
  },

  tone(freq, dur, type, vol, slideTo, delay = 0) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  },

  noise(dur, vol, freq, delay = 0, type = 'lowpass') {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (type === 'lowpass') filter.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.15), t + dur);
    const gain = c.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  },

  shoot()   { if (this.ok('shoot', 60)) this.tone(880, 0.05, 'square', 0.06, 440); },
  throwS()  { if (this.ok('throw', 80)) this.noise(0.08, 0.15, 2500, 0, 'highpass'); },
  hit()     { if (this.ok('hit', 40)) this.tone(300, 0.04, 'square', 0.05, 150); },
  kill()    { if (this.ok('kill', 45)) this.tone(520, 0.08, 'triangle', 0.1, 120); },
  explode() { if (this.ok('explode', 90)) { this.noise(0.4, 0.5, 1500); this.tone(90, 0.25, 'sine', 0.25, 40); } },
  zap()     { if (this.ok('zap', 80)) { this.noise(0.12, 0.25, 4000, 0, 'highpass'); this.tone(1400, 0.1, 'sawtooth', 0.08, 300); } },
  wave()    { if (this.ok('wave', 120)) this.tone(240, 0.35, 'sine', 0.14, 90); },
  whip()    { if (this.ok('whip', 60)) { this.noise(0.1, 0.25, 5000, 0, 'highpass'); this.tone(900, 0.06, 'triangle', 0.05, 300); } },
  splash()  { if (this.ok('splash', 90)) this.noise(0.18, 0.18, 1200); },
  hurt()    { if (this.ok('hurt', 120)) { this.tone(190, 0.22, 'sawtooth', 0.25, 55); this.noise(0.12, 0.25, 900); } },
  burn()    { if (this.ok('burn', 220)) this.noise(0.1, 0.15, 700); },
  coin()    { if (this.ok('coin', 50)) { this.tone(1320, 0.06, 'square', 0.06); this.tone(1760, 0.1, 'square', 0.06, null, 0.05); } },
  heal()    { if (this.ok('heal', 150)) this.tone(440, 0.3, 'sine', 0.15, 880); },
  expire()  { if (this.ok('expire', 80)) this.tone(620, 0.18, 'triangle', 0.1, 200); },
  alarm()   { if (this.ok('alarm', 400)) { this.tone(740, 0.14, 'square', 0.1); this.tone(740, 0.14, 'square', 0.1, null, 0.2); } },
  boss()    { if (this.ok('boss', 800)) { this.tone(110, 0.9, 'sawtooth', 0.3, 40); this.noise(0.8, 0.3, 500); } },
  gem() {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    if (now - this.lastGemAt < 30) return;
    if (now - this.lastGemAt > 700) this.gemPitch = 0;
    this.lastGemAt = now;
    this.gemPitch = Math.min(this.gemPitch + 1, 28);
    this.tone(700 * Math.pow(1.035, this.gemPitch), 0.05, 'sine', 0.07);
  },
  pickup() {
    if (!this.ok('pickup', 80)) return;
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.12, 'square', 0.09, null, i * 0.055));
  },
  levelUp() {
    if (!this.ok('levelup', 200)) return;
    [392, 523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.14, 'square', 0.08, null, i * 0.05));
  },
  chest() {
    if (!this.ok('chest', 300)) return;
    [784, 988, 1175, 1568, 1976].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.12, null, i * 0.08));
  },
  revive() {
    if (!this.ok('revive', 500)) return;
    this.tone(200, 0.6, 'sine', 0.3, 1200);
    this.noise(0.5, 0.3, 3000);
  },
  gameOver() {
    if (!this.ok('gameover', 500)) return;
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.32, 'square', 0.12, null, i * 0.18));
  },
  overdose() {
    if (!this.ok('overdose', 1000)) return;
    this.tone(620, 1.7, 'sawtooth', 0.16, 55);
    this.tone(628, 1.7, 'sawtooth', 0.11, 52); // detuned twin = woozy beating
    this.noise(1.3, 0.22, 2600);
  },
  victory() {
    if (!this.ok('victory', 500)) return;
    [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.22, 'square', 0.1, null, i * 0.12));
  }
};

// ----------------------------------------------------------- Input state --
const keys = {};
const mouse = { x: 0, y: 0, active: false }; // screen-space cursor

// ------------------------------------------------------------- Save data --
const Save = {
  key: 'pillSurvivorsSave_v1',
  data: null,

  defaults() {
    return {
      gold: 0,
      shop: {},
      chars: { nurse: true },
      selectedChar: 'nurse',
      best: { time: 0, kills: 0, level: 0 },
      runs: 0,
      wins: 0,
      settings: { mouseAim: true, autoTarget: false, sound: true, music: true, shake: true },
      // Encyclopedia: id -> times found/killed. Presence == discovered.
      codex: { weapon: {}, evolution: {}, passive: {}, gear: {}, pill: {}, enemy: {} },
      codexSeen: {},
      achievements: {},   // id -> unlock timestamp
      shopUnlocked: {},   // pharmacy items unlocked by achievements
      stagesCleared: {},  // stage id -> true once its final boss is beaten
      selectedStage: 'ward',
      stats: { kills: 0, pills: 0, deaths: 0, evolutions: 0 }
    };
  },

  load() {
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(this.key)); } catch (e) { stored = null; }
    const d = this.defaults();
    this.data = Object.assign(d, stored || {});
    this.data.shop = Object.assign({}, this.data.shop);
    this.data.chars = Object.assign({ nurse: true }, this.data.chars);
    this.data.best = Object.assign(this.defaults().best, this.data.best);
    const oldSettings = this.data.settings || {};
    this.data.settings = Object.assign(this.defaults().settings, oldSettings);
    if (oldSettings.aim === 'auto') { // migrate the earlier single aim toggle
      this.data.settings.mouseAim = false;
      this.data.settings.autoTarget = true;
    }
    delete this.data.settings.aim;
    Sfx.muted = !this.data.settings.sound;
    const codex = this.data.codex || {};
    this.data.codex = {
      weapon: Object.assign({}, codex.weapon),
      passive: Object.assign({}, codex.passive),
      gear: Object.assign({}, codex.gear),
      pill: Object.assign({}, codex.pill),
      enemy: Object.assign({}, codex.enemy),
      evolution: Object.assign({}, codex.evolution)
    };
    this.data.codexSeen = Object.assign({}, this.data.codexSeen);
    this.data.achievements = Object.assign({}, this.data.achievements);
    this.data.shopUnlocked = Object.assign({}, this.data.shopUnlocked);
    this.data.stagesCleared = Object.assign({}, this.data.stagesCleared);
    this.data.stats = Object.assign(this.defaults().stats, this.data.stats);
  },

  save() {
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { /* storage blocked */ }
  },

  reset() {
    this.data = this.defaults();
    this.save();
  }
};

// --------------------------------------------------------- Spatial grid --
// Rebuilt every frame from the enemy list; query() returns a fresh array so
// nested queries (e.g. an explosion triggered inside a projectile hit) are safe.
const Grid = {
  size: 64,
  cells: new Map(),

  key(cx, cy) { return cx * 131072 + cy; },

  rebuild(list) {
    this.cells.clear();
    const s = this.size;
    for (const e of list) {
      if (e.dead) continue;
      const k = this.key(Math.floor(e.x / s), Math.floor(e.y / s));
      let cell = this.cells.get(k);
      if (!cell) { cell = []; this.cells.set(k, cell); }
      cell.push(e);
    }
  },

  query(x, y, r) {
    const out = [];
    const s = this.size;
    const x0 = Math.floor((x - r) / s);
    const x1 = Math.floor((x + r) / s);
    const y0 = Math.floor((y - r) / s);
    const y1 = Math.floor((y + r) / s);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const cell = this.cells.get(this.key(cx, cy));
        if (cell) for (const e of cell) out.push(e);
      }
    }
    return out;
  }
};
