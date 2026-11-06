'use strict';

/* =========================================================================
   Test harness: loads the real game scripts (in index.html order) into an
   isolated VM context with mocked browser APIs, and exposes helpers to run
   code inside the game's scope.

   Usage:
     const g = createGame({ seed: 1 });
     const result = g.run(() => { startRun('nurse'); return __bot({ frames: 600 }); });
   Functions passed to g.run() are serialized and evaluated INSIDE the game
   scope, so they can use game globals (game, player, startRun, ...), but
   they cannot capture variables from the test file. Pass data as extra args.
   ========================================================================= */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function scriptFiles() {
  return [...INDEX_HTML.matchAll(/<script\s+src="([^"]+)"/g)].map((m) => m[1]);
}

function htmlIds() {
  return new Set([...INDEX_HTML.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
}

// Seeded PRNG so every test run is reproducible.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------ DOM mocks --
function makeCtx2d() {
  const grad = { addColorStop() {} };
  return new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      if (typeof key === 'string' && key.startsWith('create')) return () => grad;
      if (key === 'measureText') return () => ({ width: 10 });
      return () => {};
    },
    set(target, key, value) { target[key] = value; return true; }
  });
}

class FakeClassList {
  constructor() { this.set = new Set(); }
  add(...c) { c.forEach((x) => this.set.add(x)); }
  remove(...c) { c.forEach((x) => this.set.delete(x)); }
  toggle(c, force) {
    const on = force === undefined ? !this.set.has(c) : !!force;
    if (on) this.set.add(c); else this.set.delete(c);
    return on;
  }
  contains(c) { return this.set.has(c); }
}

function makeEl(tag = 'div', id = '') {
  return {
    id,
    tagName: tag.toUpperCase(),
    style: { setProperty() {}, filter: '' },
    classList: new FakeClassList(),
    children: [],
    innerHTML: '',
    textContent: '',
    width: 56,
    height: 56,
    offsetWidth: 0,
    disabled: false,
    onclick: null,
    appendChild(c) { this.children.push(c); return c; },
    remove() {},
    addEventListener() {},
    querySelector() { return makeEl('canvas'); },
    getContext() { return makeCtx2d(); },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    closest() { return null; },
    blur() {}
  };
}

// ---------------------------------------------------------- Audio mocks --
function makeAudio(clock) {
  const counts = {};
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime(v) { if (!(v > 0)) throw new Error('exponentialRamp to non-positive value ' + v); },
    setTargetAtTime(v) { this.value = v; },
    cancelScheduledValues() {}
  });
  const node = (kind) => ({
    kind, type: '', buffer: null,
    frequency: param(), gain: param(),
    connect() {},
    start() { const k = kind + ':' + this.type; counts[k] = (counts[k] || 0) + 1; },
    stop() {}
  });
  function AudioContext() {
    return {
      get currentTime() { return clock.now; },
      destination: {},
      sampleRate: 44100,
      state: 'running',
      resume() {},
      createGain: () => node('gain'),
      createOscillator: () => node('osc'),
      createBiquadFilter: () => node('filter'),
      createBufferSource: () => node('noise'),
      createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) })
    };
  }
  return { AudioContext, counts };
}

// ------------------------------------------------------------ The game --
function createGame(opts = {}) {
  const seed = opts.seed === undefined ? 1 : opts.seed;
  const ids = htmlIds();
  const missingIds = new Set();
  const elements = new Map();
  const listeners = {};
  const intervals = [];
  const clock = { now: 0 };
  const audio = makeAudio(clock);
  const storage = Object.assign({}, opts.storage || {});

  const math = Object.create(Math);
  math.random = mulberry32(seed);

  const document = {
    getElementById(id) {
      if (!ids.has(id)) missingIds.add(id);
      if (!elements.has(id)) elements.set(id, makeEl(id === 'game' ? 'canvas' : 'div', id));
      return elements.get(id);
    },
    createElement: (tag) => makeEl(tag),
    addEventListener() {},
    activeElement: null,
    body: makeEl('body')
  };

  const window = {
    innerWidth: opts.width || 1280,
    innerHeight: opts.height || 720,
    devicePixelRatio: 1,
    addEventListener(name, fn) { (listeners[name] = listeners[name] || []).push(fn); }
  };
  if (opts.audio) window.AudioContext = audio.AudioContext;

  const context = vm.createContext({
    console,
    Math: math,
    window,
    document,
    localStorage: {
      getItem: (k) => (k in storage ? storage[k] : null),
      setItem: (k, v) => { storage[k] = String(v); }
    },
    performance: { now: () => clock.now * 1000 },
    requestAnimationFrame: () => 0,
    setTimeout: () => 0,
    setInterval: (fn) => { intervals.push(fn); return intervals.length; },
    clearInterval: () => {}
  });

  const source = scriptFiles()
    .map((src) => `// ---- ${src}\n` + fs.readFileSync(path.join(ROOT, src), 'utf8'))
    .join('\n;\n');
  vm.runInContext(source + '\n;\n' + BOT_SOURCE + '\nglobalThis.__eval = (src) => eval(src);\n', context, { filename: 'game-bundle.js' });

  return {
    context,
    storage,
    listeners,
    missingIds,
    elements,
    audioCounts: audio.counts,

    // Run a function inside the game scope. Extra args are JSON-serialized.
    run(fn, ...args) {
      return context.__eval(`(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(',')})`);
    },

    // Simulated keyboard / mouse input through the real listeners.
    key(code) {
      for (const fn of listeners.keydown || []) fn({ code, repeat: false, preventDefault() {} });
      for (const fn of listeners.keyup || []) fn({ code });
    },
    mouse(x, y) {
      for (const fn of listeners.mousemove || []) fn({ clientX: x, clientY: y });
    },

    // Advance audio time and fire scheduler intervals (for music tests).
    advanceAudio(seconds) {
      for (let t = 0; t < seconds; t += 0.025) {
        clock.now += 0.025;
        intervals.forEach((fn) => fn());
      }
    },
    resetAudioCounts() { for (const k in audio.counts) delete audio.counts[k]; },

    el(id) { return elements.get(id); }
  };
}

// Bot that plays inside the game scope. Options:
//   frames, untilTime (seconds), keepAlive ('half' | 'full' | false),
//   pick (level-up card index), render (render every N frames, 0 = never)
const BOT_SOURCE = `
globalThis.__bot = function (opts) {
  const o = Object.assign({ frames: 600, untilTime: 0, keepAlive: false, pick: 0, render: 4, move: 'square' }, opts || {});
  let f = 0;
  let maxEnemies = 0;
  for (; f < o.frames; f++) {
    if (o.untilTime && game.time >= o.untilTime * 60) break;
    if (game.state === State.LEVELUP) chooseOption(Math.min(o.pick, game.choices.length - 1));
    if (game.state === State.GAMEOVER || game.state === State.MENU) break;
    if (o.move === 'square') {
      const ph = Math.floor(f / 90) % 4;
      keys.KeyD = ph === 0; keys.KeyS = ph === 1; keys.KeyA = ph === 2; keys.KeyW = ph === 3;
    } else if (o.move === 'loop') {
      const a = f * 0.004;
      keys.KeyD = Math.cos(a) > 0.3; keys.KeyA = Math.cos(a) < -0.3; keys.KeyS = Math.sin(a) > 0.3; keys.KeyW = Math.sin(a) < -0.3;
    }
    if (o.keepAlive === 'full') player.hp = stats.maxHp;
    else if (o.keepAlive) player.hp = Math.max(player.hp, stats.maxHp * 0.6);
    update();
    if (o.render && f % o.render === 0) { render(); UI.updateHud(); }
    maxEnemies = Math.max(maxEnemies, enemies.length);
    if (!isFinite(player.x) || !isFinite(player.y) || !isFinite(player.hp)) throw new Error('NaN in player state at frame ' + f);
  }
  for (const k in keys) keys[k] = false;
  return { frames: f, time: game.time, kills: game.kills, level: game.level, state: game.state, maxEnemies };
};
`;

module.exports = { createGame, ROOT };
