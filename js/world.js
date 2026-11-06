'use strict';

/* =========================================================================
   WORLD — procedural furniture, generated per chunk from a run seed and the
   stage's furniture theme. Player and regular enemies collide with it;
   projectiles fly over it and bosses smash straight through.
   ========================================================================= */

// Footprint of each furniture type (w, h) in its default orientation.
const FURNITURE_SIZE = {
  bed: [96, 48], cabinet: [46, 40], pillar: [42, 42], desk: [100, 50], plant: [30, 30],
  bench: [110, 44], vat: [52, 52], crate: [44, 44],
  gurney: [100, 46], locker: [124, 46],
  barrier: [112, 26], barrel: [34, 34]
};
const ROTATABLE = new Set(['bed', 'desk', 'bench', 'gurney', 'locker', 'barrier']);
const BLANKETS = ['#5ec8ff', '#3dff8a', '#b45cff', '#ff9ad5'];

const World = {
  CHUNK: 640,
  PAD: 92,          // minimum gap between obstacles, so swarms can flow through
  seed: 1,
  theme: null,      // stage.furniture: { row, scatter[], empty }
  chunks: new Map(),

  reset(seed, theme) {
    this.seed = seed | 0;
    this.theme = theme || { row: 'bed', scatter: ['cabinet', 'pillar', 'desk', 'plant', 'bed', 'cabinet'], empty: 0.15 };
    this.chunks.clear();
  },

  // Deterministic per-chunk RNG (hash -> mulberry32).
  rng(cx, cy) {
    let h = Math.imul(cx | 0, 0x27d4eb2d) ^ Math.imul(cy | 0, 0x165667b1) ^ this.seed;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h ^= h >>> 13;
    let a = h >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },

  chunk(cx, cy) {
    const key = cx * 131072 + cy;
    let list = this.chunks.get(key);
    if (!list) {
      list = this.generate(cx, cy);
      this.chunks.set(key, list);
    }
    return list;
  },

  make(type, x, y, vertical, r) {
    let [w, h] = FURNITURE_SIZE[type];
    if (vertical) [w, h] = [h, w];
    return { type, x, y, w, h, vertical, blanket: BLANKETS[Math.floor(r() * BLANKETS.length)], seed: r() * 1000 };
  },

  generate(cx, cy) {
    const r = this.rng(cx, cy);
    const S = this.CHUNK;
    const ox = cx * S;
    const oy = cy * S;
    const list = [];
    const theme = this.theme;

    const fits = (o) => {
      if (Math.hypot(o.x + o.w / 2, o.y + o.h / 2) < 260) return false; // keep spawn clear
      if (o.x < ox + 30 || o.y < oy + 30 || o.x + o.w > ox + S - 30 || o.y + o.h > oy + S - 30) return false;
      for (const b of list) {
        if (o.x < b.x + b.w + this.PAD && o.x + o.w + this.PAD > b.x && o.y < b.y + b.h + this.PAD && o.y + o.h + this.PAD > b.y) return false;
      }
      return true;
    };
    const add = (o) => { if (fits(o)) { list.push(o); return true; } return false; };

    const roll = r();
    if (roll < theme.empty) return list;

    if (roll < theme.empty + 0.3) {
      // A row of the stage's signature furniture (ward beds, lab benches, ...)
      const vertical = r() < 0.5;
      const n = 3 + Math.floor(r() * 2);
      const [w0, h0] = FURNITURE_SIZE[theme.row];
      const bw = vertical ? h0 : w0;
      const bh = vertical ? w0 : h0;
      const across = vertical ? bw : bh;
      const step = across + this.PAD + 4;
      const span = step * n;
      const sx = ox + 60 + r() * Math.max(0, S - 120 - (vertical ? span : bw));
      const sy = oy + 60 + r() * Math.max(0, S - 120 - (vertical ? bh : span));
      for (let i = 0; i < n; i++) {
        add(this.make(theme.row, vertical ? sx + i * step : sx, vertical ? sy : sy + i * step, vertical, r));
      }
      if (r() < 0.6) add(this.randomItem(r, ox, oy, S));
    } else {
      const n = 2 + Math.floor(r() * 4);
      for (let i = 0; i < n * 3 && list.length < n; i++) add(this.randomItem(r, ox, oy, S));
    }
    return list;
  },

  randomItem(r, ox, oy, S) {
    const type = this.theme.scatter[Math.floor(r() * this.theme.scatter.length)];
    const vertical = ROTATABLE.has(type) && r() < 0.5;
    const o = this.make(type, 0, 0, vertical, r);
    o.x = ox + 40 + r() * (S - 80 - o.w);
    o.y = oy + 40 + r() * (S - 80 - o.h);
    return o;
  },

  // All obstacles overlapping an axis-aligned box.
  query(x0, y0, x1, y1) {
    const S = this.CHUNK;
    const out = [];
    const cx0 = Math.floor(x0 / S);
    const cx1 = Math.floor(x1 / S);
    const cy0 = Math.floor(y0 / S);
    const cy1 = Math.floor(y1 / S);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        for (const o of this.chunk(cx, cy)) {
          if (o.x < x1 && o.x + o.w > x0 && o.y < y1 && o.y + o.h > y0) out.push(o);
        }
      }
    }
    return out;
  },

  // Pushes a circle out of any obstacle. Returns the last contact normal or null.
  collide(ent, r) {
    let normal = null;
    for (const o of this.query(ent.x - r, ent.y - r, ent.x + r, ent.y + r)) {
      const px = clamp(ent.x, o.x, o.x + o.w);
      const py = clamp(ent.y, o.y, o.y + o.h);
      let dx = ent.x - px;
      let dy = ent.y - py;
      const d = Math.hypot(dx, dy);
      if (d >= r) continue;
      if (d < 0.001) {
        // Center inside the box: leave through the nearest face.
        const left = ent.x - o.x;
        const right = o.x + o.w - ent.x;
        const top = ent.y - o.y;
        const bottom = o.y + o.h - ent.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) { dx = -1; dy = 0; ent.x = o.x - r; }
        else if (m === right) { dx = 1; dy = 0; ent.x = o.x + o.w + r; }
        else if (m === top) { dx = 0; dy = -1; ent.y = o.y - r; }
        else { dx = 0; dy = 1; ent.y = o.y + o.h + r; }
        normal = { x: dx, y: dy };
        continue;
      }
      dx /= d;
      dy /= d;
      ent.x = px + dx * r;
      ent.y = py + dy * r;
      normal = { x: dx, y: dy };
    }
    return normal;
  },

  blocked(x, y, r) {
    for (const o of this.query(x - r, y - r, x + r, y + r)) {
      const px = clamp(x, o.x, o.x + o.w);
      const py = clamp(y, o.y, o.y + o.h);
      if (dist2(x, y, px, py) < r * r) return true;
    }
    return false;
  },

  // Nearest free spot (spiral search) for spawns and drops.
  freeSpot(x, y, r) {
    if (!this.blocked(x, y, r)) return { x, y };
    for (let ring = 1; ring <= 8; ring++) {
      const d = ring * 24;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        const nx = x + Math.cos(a) * d;
        const ny = y + Math.sin(a) * d;
        if (!this.blocked(nx, ny, r)) return { x: nx, y: ny };
      }
    }
    return { x, y };
  },

  // ------------------------------------------------------------ Drawing --
  draw() {
    const list = this.query(camX - 20, camY - 20, camX + W + 20, camY + H + 20);
    for (const o of list) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(o.x + 5, o.y + 7, o.w, o.h);
      this['draw_' + o.type](o);
    }
  },

  box(o, outer, inner, inset = 3) {
    ctx.fillStyle = outer;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.fillStyle = inner;
    ctx.fillRect(o.x + inset, o.y + inset, o.w - inset * 2, o.h - inset * 2);
  },

  // --- General Ward
  draw_bed(o) {
    this.box(o, '#c8cfe6', '#eef2ff');
    ctx.fillStyle = o.blanket;
    ctx.globalAlpha = 0.75;
    if (o.vertical) ctx.fillRect(o.x + 3, o.y + o.h * 0.38, o.w - 6, o.h * 0.62 - 3);
    else ctx.fillRect(o.x + o.w * 0.38, o.y + 3, o.w * 0.62 - 3, o.h - 6);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    if (o.vertical) ctx.fillRect(o.x + 8, o.y + 7, o.w - 16, o.h * 0.2);
    else ctx.fillRect(o.x + 7, o.y + 8, o.w * 0.2, o.h - 16);
    ctx.strokeStyle = '#7a84a8';
    ctx.lineWidth = 2;
    ctx.strokeRect(o.x + 1, o.y + 1, o.w - 2, o.h - 2);
  },

  draw_cabinet(o) {
    this.box(o, '#6f7894', '#8b94b2');
    ctx.strokeStyle = '#4b5270';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(o.x + 3, o.y + o.h / 2);
    ctx.lineTo(o.x + o.w - 3, o.y + o.h / 2);
    ctx.stroke();
    ctx.fillStyle = '#d8deef';
    ctx.fillRect(o.x + o.w / 2 - 5, o.y + o.h / 4 - 1, 10, 3);
    ctx.fillRect(o.x + o.w / 2 - 5, o.y + (o.h * 3) / 4 - 1, 10, 3);
    ctx.fillStyle = '#ff4d5e';
    ctx.fillRect(o.x + o.w - 10, o.y + 5, 5, 5);
  },

  draw_pillar(o) {
    this.box(o, '#3a4060', '#4c5378', 4);
    ctx.fillStyle = 'rgba(255, 225, 77, 0.5)';
    for (let i = 0; i < 3; i++) ctx.fillRect(o.x + 4, o.y + 8 + i * 11, o.w - 8, 4);
  },

  draw_desk(o) {
    this.box(o, '#7a5434', '#946945');
    const mx = o.x + o.w * 0.25;
    const my = o.y + o.h * 0.3;
    ctx.fillStyle = '#1a1d2e';
    ctx.fillRect(mx - 9, my - 7, 18, 14);
    ctx.fillStyle = '#3dff8a';
    ctx.fillRect(mx - 6, my - 4, 12, 8);
    ctx.fillStyle = '#eef2ff';
    ctx.fillRect(o.x + o.w * 0.6, o.y + o.h * 0.45, 14, 10);
  },

  draw_plant(o) {
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    ctx.fillStyle = '#8a4b1f';
    ctx.fillRect(o.x + 5, o.y + 5, o.w - 10, o.h - 10);
    ctx.fillStyle = '#2f9e4f';
    for (let i = 0; i < 6; i++) {
      const a = o.seed + i * 1.05;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8, 8, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#4fd16f';
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, TAU);
    ctx.fill();
  },

  // --- Research Lab
  draw_bench(o) {
    this.box(o, '#2b3a44', '#dfe6ee');
    // beakers & flasks along the counter
    const n = Math.floor(Math.max(o.w, o.h) / 26);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = o.vertical ? o.x + o.w / 2 : o.x + o.w * t;
      const y = o.vertical ? o.y + o.h * t : o.y + o.h / 2;
      ctx.fillStyle = ['#9dff3d', '#5ec8ff', '#ff5cf0', '#ffe14d'][(i + Math.floor(o.seed)) % 4];
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(x - 1.5, y - 10, 3, 6);
    }
  },

  draw_vat(o) {
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    ctx.fillStyle = '#3a4a52';
    ctx.fillRect(o.x, o.y, o.w, o.h);
    const bub = (Math.sin(game.time * 0.05 + o.seed) + 1) * 0.5;
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, o.w * 0.45);
    g.addColorStop(0, '#d4ffb0');
    g.addColorStop(1, '#3aa62a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, o.w * 0.4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(cx - 6, cy + 6 - bub * 12, 3, 0, TAU);
    ctx.arc(cx + 7, cy - 2 - bub * 8, 2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#8fa3ad';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, o.w * 0.4, 0, TAU);
    ctx.stroke();
  },

  draw_crate(o) {
    this.box(o, '#5a4a2a', '#8a7444');
    ctx.strokeStyle = '#5a4a2a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(o.x + 4, o.y + 4);
    ctx.lineTo(o.x + o.w - 4, o.y + o.h - 4);
    ctx.moveTo(o.x + o.w - 4, o.y + 4);
    ctx.lineTo(o.x + 4, o.y + o.h - 4);
    ctx.stroke();
  },

  // --- Morgue
  draw_gurney(o) {
    this.box(o, '#7d8796', '#aeb8c8');
    // sheet-covered shape
    ctx.fillStyle = '#e8ecf6';
    const pad = 6;
    if (o.vertical) {
      ctx.fillRect(o.x + pad, o.y + pad + 8, o.w - pad * 2, o.h - pad * 2 - 8);
      ctx.beginPath();
      ctx.arc(o.x + o.w / 2, o.y + pad + 9, (o.w - pad * 2) / 2.4, 0, TAU);
      ctx.fill();
    } else {
      ctx.fillRect(o.x + pad + 8, o.y + pad, o.w - pad * 2 - 8, o.h - pad * 2);
      ctx.beginPath();
      ctx.arc(o.x + pad + 9, o.y + o.h / 2, (o.h - pad * 2) / 2.4, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#ffd23d'; // toe tag
    if (o.vertical) ctx.fillRect(o.x + o.w / 2 - 3, o.y + o.h - 9, 6, 5);
    else ctx.fillRect(o.x + o.w - 9, o.y + o.h / 2 - 3, 5, 6);
  },

  draw_locker(o) {
    this.box(o, '#4a5263', '#8994a8');
    const cells = Math.round(Math.max(o.w, o.h) / 31);
    ctx.strokeStyle = '#4a5263';
    ctx.lineWidth = 2;
    for (let i = 1; i < cells; i++) {
      ctx.beginPath();
      if (o.vertical) { ctx.moveTo(o.x + 3, o.y + (o.h * i) / cells); ctx.lineTo(o.x + o.w - 3, o.y + (o.h * i) / cells); }
      else { ctx.moveTo(o.x + (o.w * i) / cells, o.y + 3); ctx.lineTo(o.x + (o.w * i) / cells, o.y + o.h - 3); }
      ctx.stroke();
    }
    ctx.fillStyle = '#d8deef';
    for (let i = 0; i < cells; i++) {
      const t = (i + 0.5) / cells;
      if (o.vertical) ctx.fillRect(o.x + o.w / 2 - 6, o.y + o.h * t - 1.5, 12, 3);
      else ctx.fillRect(o.x + o.w * t - 6, o.y + o.h / 2 - 1.5, 12, 3);
    }
  },

  // --- Quarantine Zone
  draw_barrier(o) {
    ctx.fillStyle = '#ffd23d';
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(o.x, o.y, o.w, o.h);
    ctx.clip();
    ctx.fillStyle = '#1a1d2e';
    for (let i = -o.h; i < o.w + o.h; i += 18) {
      ctx.beginPath();
      if (o.vertical) {
        ctx.moveTo(o.x, o.y + i);
        ctx.lineTo(o.x + o.w, o.y + i - o.w);
        ctx.lineTo(o.x + o.w, o.y + i - o.w + 9);
        ctx.lineTo(o.x, o.y + i + 9);
      } else {
        ctx.moveTo(o.x + i, o.y);
        ctx.lineTo(o.x + i + 9, o.y);
        ctx.lineTo(o.x + i + 9 - o.h, o.y + o.h);
        ctx.lineTo(o.x + i - o.h, o.y + o.h);
      }
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = '#7a5a00';
    ctx.lineWidth = 2;
    ctx.strokeRect(o.x + 1, o.y + 1, o.w - 2, o.h - 2);
  },

  draw_barrel(o) {
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    ctx.fillStyle = '#c45cff';
    ctx.beginPath();
    ctx.arc(cx, cy, o.w / 2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#5a1f80';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#ffe14d';
    ctx.beginPath(); // trefoil-ish hazard mark
    for (let i = 0; i < 3; i++) {
      const a = o.seed + (i / 3) * TAU;
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, o.w * 0.32, a, a + 0.7);
    }
    ctx.fill();
    ctx.fillStyle = '#c45cff';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, TAU);
    ctx.fill();
  }
};
