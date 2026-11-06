'use strict';

/* =========================================================================
   RENDER — all canvas drawing. World space is translated by the camera.
   ========================================================================= */

let floorPattern = null;
let camX = 0;
let camY = 0;
let menuDrift = 0;

function buildFloorPattern(theme) {
  const th = theme || STAGES[0].floor;
  const size = 192;
  const t = document.createElement('canvas');
  t.width = size;
  t.height = size;
  const f = t.getContext('2d');
  f.fillStyle = th.base;
  f.fillRect(0, 0, size, size);

  const tile = 48;
  for (let x = 0; x < size; x += tile) {
    for (let y = 0; y < size; y += tile) {
      if (((x / tile) + (y / tile)) % 2 === 0) {
        f.fillStyle = th.tint;
        f.fillRect(x, y, tile, tile);
      }
    }
  }
  f.strokeStyle = th.grid;
  f.lineWidth = 1;
  f.beginPath();
  for (let x = 0; x <= size; x += tile) { f.moveTo(x + 0.5, 0); f.lineTo(x + 0.5, size); }
  for (let y = 0; y <= size; y += tile) { f.moveTo(0, y + 0.5); f.lineTo(size, y + 0.5); }
  f.stroke();

  if (th.mark === 'cross') {
    f.fillStyle = 'rgba(255, 77, 94, 0.05)';
    f.fillRect(116, 20, 8, 22);
    f.fillRect(109, 27, 22, 8);
    f.fillStyle = 'rgba(94, 242, 255, 0.04)';
    f.fillRect(20, 116, 6, 18);
    f.fillRect(14, 122, 18, 6);
  } else if (th.mark === 'drain') {
    f.strokeStyle = 'rgba(157, 255, 61, 0.08)';
    f.lineWidth = 2;
    for (const [x, y] of [[48, 48], [144, 144]]) {
      f.beginPath();
      f.arc(x, y, 9, 0, TAU);
      f.stroke();
      f.beginPath();
      f.moveTo(x - 6, y); f.lineTo(x + 6, y);
      f.moveTo(x, y - 6); f.lineTo(x, y + 6);
      f.stroke();
    }
  } else if (th.mark === 'grate') {
    f.fillStyle = 'rgba(200, 210, 240, 0.05)';
    f.fillRect(120, 24, 40, 24);
    f.fillStyle = 'rgba(0, 0, 0, 0.25)';
    for (let i = 0; i < 5; i++) f.fillRect(124 + i * 7, 27, 3, 18);
  } else if (th.mark === 'hazard') {
    f.save();
    f.beginPath();
    f.rect(0, 92, size, 8);
    f.clip();
    f.fillStyle = 'rgba(255, 210, 61, 0.07)';
    for (let x = -16; x < size + 16; x += 16) {
      f.beginPath();
      f.moveTo(x, 92); f.lineTo(x + 8, 92); f.lineTo(x, 100); f.lineTo(x - 8, 100);
      f.fill();
    }
    f.restore();
  }

  floorPattern = ctx.createPattern(t, 'repeat');
}

function inView(x, y, r) {
  return x + r > camX && x - r < camX + W && y + r > camY && y - r < camY + H;
}

// ------------------------------------------------------------ Main render --
function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#05060b';
  ctx.fillRect(0, 0, W, H);

  if (game.state === State.MENU || !player) {
    menuDrift += 0.6;
    camX = menuDrift;
    camY = menuDrift * 0.4;
    ctx.save();
    ctx.translate(-camX, -camY);
    ctx.fillStyle = floorPattern;
    ctx.fillRect(camX, camY, W, H);
    ctx.restore();
    return;
  }

  camX = player.x - W / 2 + game.shakeX;
  camY = player.y - H / 2 + game.shakeY;

  ctx.save();
  ctx.translate(-camX, -camY);
  ctx.fillStyle = floorPattern;
  ctx.fillRect(camX, camY, W, H);

  drawPools();
  drawFires();
  World.draw();
  drawHazards();
  drawAuras();
  drawGems();
  drawPickups();
  drawShockwaves();
  drawEnemies();
  drawProjectiles();
  drawSlashes();
  drawWaves();
  drawLobs();
  drawOrbits();
  if (game.state !== State.GAMEOVER || game.victory) drawPlayer();
  drawTargetMarker();
  drawEnemyShots();
  drawBolts();
  drawParticles();
  drawFloaters();
  ctx.restore();

  drawVignette();
  drawHurtFlash();
  drawLevelFlash();
  drawIndicators();
  drawBossBar();
  drawBanner();
  if (game.state === State.PLAYING && settings().mouseAim) drawCrosshair();
}

function drawTargetMarker() {
  const t = player.target;
  if (!t || t.dead || game.state !== State.PLAYING) return;
  const r = t.r + 7;
  const spin = game.time * 0.05;
  ctx.strokeStyle = 'rgba(255, 225, 77, 0.85)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const a = spin + (i / 4) * TAU;
    ctx.beginPath();
    ctx.arc(t.x, t.y, r, a, a + 0.6);
    ctx.stroke();
  }
}

function drawCrosshair() {
  const x = mouse.x;
  const y = mouse.y;
  const r = 9;
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  crosshairPath(x, y, r);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = stats.recoil ? '#ff4d5e' : '#ffffff';
  crosshairPath(x, y, r);
  ctx.stroke();
}

function crosshairPath(x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.moveTo(x - r - 5, y); ctx.lineTo(x - r + 3, y);
  ctx.moveTo(x + r - 3, y); ctx.lineTo(x + r + 5, y);
  ctx.moveTo(x, y - r - 5); ctx.lineTo(x, y - r + 3);
  ctx.moveTo(x, y + r - 3); ctx.lineTo(x, y + r + 5);
}

// Draws an enemy into a small canvas for the encyclopedia by temporarily
// pointing the shared draw functions at that canvas.
function drawEnemyPortrait(cv, def) {
  const c2 = cv.getContext('2d');
  const size = cv.width;
  const extent = def.shape === 'capsule' ? def.r * 2.7 : def.r * 1.45;
  const scale = (size * 0.44) / extent;
  const saved = ctx;
  ctx = c2;
  try {
    c2.setTransform(1, 0, 0, 1, 0, 0);
    c2.clearRect(0, 0, size, size);
    c2.setTransform(scale, 0, 0, scale, size / 2 + (def.shape === 'capsule' ? def.r * scale : 0), size / 2);
    drawEnemy({
      x: 0, y: 0, r: def.r, def, vx: 1, vy: 0, spin: 0.3, id: 1,
      flash: 0, burning: 0, elite: false, boss: !!def.boss,
      ai: { phase: 'chase' }, hp: 1, maxHp: 1
    }, false);
  } finally {
    ctx = saved;
  }
}

// ----------------------------------------------------------- Primitives --
function drawMiniPill(x, y, a, len, thick, c1, c2) {
  const dx = Math.cos(a) * len / 2;
  const dy = Math.sin(a) * len / 2;
  ctx.lineCap = 'round';
  ctx.lineWidth = thick;
  ctx.strokeStyle = c1;
  ctx.beginPath();
  ctx.moveTo(x - dx, y - dy);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.strokeStyle = c2;
  ctx.beginPath();
  ctx.moveTo(x + dx * 0.15, y + dy * 0.15);
  ctx.lineTo(x + dx, y + dy);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

function drawCapsule(x, y, angle, color, accent, scale = 1) {
  const w = 28 * scale;
  const h = 12 * scale;
  const r = h / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(-w / 2 + r, -r);
  ctx.arc(-w / 2 + r, 0, r, -Math.PI / 2, Math.PI / 2, true);
  ctx.lineTo(0, r);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(w / 2 - r, -r);
  ctx.arc(w / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2, false);
  ctx.lineTo(0, r);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.moveTo(-w / 2 + r, -r * 0.45);
  ctx.lineTo(w / 2 - r, -r * 0.45);
  ctx.stroke();
  ctx.restore();
}

function drawGlow(x, y, r, hex, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(hex, a));
  g.addColorStop(1, rgba(hex, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

// --------------------------------------------------------------- Ground --
function drawPools() {
  for (const p of pools) {
    if (!inView(p.x, p.y, p.r)) continue;
    const k = Math.min(1, p.life / 30, (p.maxLife - p.life) / 8);
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
    const pc = hexToRgb(p.color || '#9dff3d');
    g.addColorStop(0, `rgba(${pc}, ${0.35 * k})`);
    g.addColorStop(0.75, `rgba(${pc}, ${0.24 * k})`);
    g.addColorStop(1, `rgba(${pc}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(220, 255, 180, ${0.5 * k})`;
    for (let i = 0; i < 3; i++) {
      const a = p.seed + i * 2.1 + game.time * 0.01;
      const br = (Math.sin(game.time * 0.1 + i * 3 + p.seed) + 1) * 2 + 1;
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(a) * p.r * 0.5, p.y + Math.sin(a) * p.r * 0.5, br, 0, TAU);
      ctx.fill();
    }
  }
}

function drawFires() {
  for (const f of fires) {
    if (!inView(f.x, f.y, f.r)) continue;
    const k = f.life / f.maxLife;
    const flicker = 0.85 + Math.sin(game.time * 0.4 + f.seed) * 0.15;
    const r = f.r * (0.6 + k * 0.5) * flicker;
    const hot = f.age > 40 ? 1 : 0.55;
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
    g.addColorStop(0, `rgba(255, 240, 160, ${0.75 * k * hot})`);
    g.addColorStop(0.45, `rgba(255, 138, 31, ${0.55 * k})`);
    g.addColorStop(1, 'rgba(255, 60, 20, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(f.x, f.y, r, 0, TAU);
    ctx.fill();
  }
}

function drawHazards() {
  for (const s of spores) {
    if (!inView(s.x, s.y, s.r)) continue;
    const k = Math.min(1, s.life / 40, (s.maxLife - s.life) / 15);
    for (let i = 0; i < 5; i++) {
      const a = s.seed + i * 1.26 + game.time * 0.01;
      const px = s.x + Math.cos(a) * s.r * 0.4;
      const py = s.y + Math.sin(a) * s.r * 0.4;
      drawGlow(px, py, s.r * 0.65, '#b98cff', 0.22 * k);
    }
  }
  for (const b of bombs) {
    const k = 1 - b.timer / b.maxTimer;
    ctx.strokeStyle = rgba(b.color, 0.4 + k * 0.5);
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = rgba(b.color, 0.12 + k * 0.25);
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * k, 0, TAU);
    ctx.fill();
  }
}

function drawAuras() {
  const w = weaponByFamily('aura');
  if (!w || !w.radius) return;
  const r = w.radius;
  const ac = hexToRgb(w.def.color);
  const g = ctx.createRadialGradient(player.x, player.y, r * 0.2, player.x, player.y, r);
  g.addColorStop(0, `rgba(${ac}, 0.02)`);
  g.addColorStop(1, `rgba(${ac}, ${0.13 + w.pulse * 0.12})`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(player.x, player.y, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = `rgba(${ac}, ${0.3 + w.pulse * 0.4})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 8]);
  ctx.lineDashOffset = -game.time * 0.5;
  ctx.beginPath();
  ctx.arc(player.x, player.y, r, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
}

// -------------------------------------------------------------- Pickups --
function gemColors(v) {
  if (v >= 25) return ['#ff4d5e', '#ffd0d5'];
  if (v >= 5) return ['#3dff8a', '#d4ffe5'];
  return ['#5ec8ff', '#e6f6ff'];
}

function drawGems() {
  for (const g of gems) {
    if (!inView(g.x, g.y, 10)) continue;
    const [c1, c2] = gemColors(g.value);
    const len = g.value >= 25 ? 14 : g.value >= 5 ? 12 : 9;
    drawMiniPill(g.x, g.y, g.a, len, len * 0.55, c1, c2);
  }
}

function drawPickups() {
  for (const p of pickups) {
    if (!inView(p.x, p.y, 40)) continue;
    const bob = Math.sin(p.age * 0.08) * 3;
    if (p.type === 'gold') {
      ctx.fillStyle = '#ffd23d';
      ctx.strokeStyle = '#a87a00';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y + bob, 6, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff2b0';
      ctx.fillRect(p.x - 1, p.y + bob - 3, 2, 6);
    } else if (p.type === 'heal') {
      drawGlow(p.x, p.y, 24, '#5dff9a', 0.35);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(p.x - 10, p.y - 8 + bob, 20, 16);
      ctx.fillStyle = '#ff3b5c';
      ctx.fillRect(p.x - 2, p.y - 6 + bob, 4, 12);
      ctx.fillRect(p.x - 6, p.y - 2 + bob, 12, 4);
    } else if (p.type === 'magnet') {
      drawGlow(p.x, p.y, 24, '#5ec8ff', 0.35);
      ctx.strokeStyle = '#ff4d5e';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(p.x, p.y + bob, 8, Math.PI, 0, true);
      ctx.stroke();
      ctx.fillStyle = '#dfe6ff';
      ctx.fillRect(p.x - 10.5, p.y + bob - 4, 5, 5);
      ctx.fillRect(p.x + 5.5, p.y + bob - 4, 5, 5);
    } else if (p.type === 'chest') {
      drawGlow(p.x, p.y, 44, '#ffe14d', 0.3 + Math.sin(p.age * 0.1) * 0.1);
      ctx.fillStyle = '#8a4b1f';
      ctx.fillRect(p.x - 16, p.y - 10 + bob, 32, 22);
      ctx.fillStyle = '#ffd23d';
      ctx.fillRect(p.x - 16, p.y - 3 + bob, 32, 4);
      ctx.fillRect(p.x - 3, p.y - 6 + bob, 6, 10);
      ctx.strokeStyle = '#ffd23d';
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x - 16, p.y - 10 + bob, 32, 22);
    } else if (p.type === 'pill') {
      const remaining = p.life - p.age;
      if (remaining < 240 && Math.floor(remaining / 8) % 2 === 0) continue;
      drawGlow(p.x, p.y, 36, p.def.color, 0.45);
      drawCapsule(p.x, p.y + bob, p.age * 0.03, p.def.color, p.def.accent, 1);
      ctx.font = `bold 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = rgba(p.def.color, 0.9);
      ctx.fillText(p.def.name.toUpperCase(), p.x, p.y - 22 + bob);
    }
  }
}

function drawShockwaves() {
  for (const s of shockwaves) {
    const k = s.life / s.maxLife;
    ctx.strokeStyle = `rgba(${s.color},${k})`;
    ctx.lineWidth = 4 * k + 1;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, TAU);
    ctx.stroke();
  }
}

// -------------------------------------------------------------- Enemies --
function drawEnemies() {
  const slowed = stats.enemyTimeScale < 1;
  for (const e of enemies) {
    if (!inView(e.x, e.y, e.r + 10)) continue;
    drawEnemy(e, slowed);
  }
}

function drawEnemy(e, slowed) {
  const def = e.def;
  let fill = def.color;
  if (e.burning > 0) fill = '#ff8a1f';
  if (e.flash > 0) fill = '#ffffff';
  const r = e.r;

  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(e.x, e.y + r * 0.85, r * 0.9, r * 0.32, 0, 0, TAU);
  ctx.fill();

  if (e.elite || e.boss) {
    drawGlow(e.x, e.y, r * 1.8, e.boss ? def.color : '#ffe14d', 0.28);
  }

  ctx.fillStyle = fill;
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 2;

  if (def.shape === 'capsule') {
    const a = Math.atan2(e.vy, e.vx);
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(a);
    ctx.lineCap = 'round';
    ctx.lineWidth = r * 1.5;
    ctx.strokeStyle = fill;
    ctx.beginPath();
    ctx.moveTo(-r * 0.7, 0);
    ctx.lineTo(r * 0.7, 0);
    ctx.stroke();
    ctx.lineCap = 'butt';
    // little flagella
    ctx.strokeStyle = rgba(def.color, 0.7);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const wig = Math.sin(game.time * 0.5 + e.id) * 3;
    ctx.moveTo(-r * 1.4, 0);
    ctx.quadraticCurveTo(-r * 2, wig, -r * 2.6, 0);
    ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(r * 0.6, -r * 0.25, r * 0.22, 0, TAU);
    ctx.arc(r * 0.6, r * 0.25, r * 0.22, 0, TAU);
    ctx.fill();
    ctx.restore();
  } else if (def.shape === 'spiky' || def.shape === 'boss') {
    const spikes = def.spikes || (def.shape === 'boss' ? 14 : 10);
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const a = e.spin + (i / (spikes * 2)) * TAU;
      const rr = i % 2 === 0 ? r * 1.25 : r * 0.88;
      const px = e.x + Math.cos(a) * rr;
      const py = e.y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.arc(e.x, e.y, r * 0.55, 0, TAU);
    ctx.fill();
    if (def.shape === 'boss') {
      drawEyes(e, r * 0.2, 0.45);
      ctx.fillStyle = '#1a0006';
      ctx.beginPath();
      ctx.arc(e.x, e.y + r * 0.35, r * 0.3, 0, Math.PI);
      ctx.fill();
    } else {
      drawEyes(e, Math.max(3, r * 0.25), 0.35);
    }
    if (e.boss && e.ai.phase === 'windup' && Math.floor(game.time / 4) % 2 === 0) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r * 1.4, 0, TAU);
      ctx.stroke();
    }
  } else if (def.shape === 'tick') {
    // parasite: round body with wiggling legs
    const a = e.latched ? lookAngle(e) + Math.PI : Math.atan2(e.vy, e.vx);
    ctx.strokeStyle = fill;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      for (const side of [-1, 1]) {
        const la = a + side * (0.9 + i * 0.5) + Math.sin(game.time * 0.6 + i + e.id) * 0.25;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x + Math.cos(la) * r * 1.7, e.y + Math.sin(la) * r * 1.7);
        ctx.stroke();
      }
    }
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ff3b5c';
    ctx.beginPath();
    ctx.arc(e.x + Math.cos(a) * r * 0.6, e.y + Math.sin(a) * r * 0.6, r * 0.35, 0, TAU);
    ctx.fill();
  } else if (def.shape === 'mushroom') {
    // spore pod: stalk + spotted cap that puffs
    const puff = 1 + Math.sin(game.time * 0.08 + e.id) * 0.06;
    ctx.fillStyle = '#e6d6ff';
    ctx.fillRect(e.x - r * 0.3, e.y, r * 0.6, r * 0.9);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, r * puff, r * 0.75 * puff, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(e.x + (i - 1.5) * r * 0.45, e.y - r * (0.35 + (i % 2) * 0.2), r * 0.13, 0, TAU);
      ctx.fill();
    }
    drawEyes(e, Math.max(3, r * 0.22), 0.1);
  } else if (def.shape === 'bloater') {
    // swells and flashes as it gets close to bursting
    const hpK = clamp(e.hp / e.maxHp, 0, 1);
    const near = player && game.state !== State.MENU && Math.hypot(player.x - e.x, player.y - e.y) < 120;
    const swell = 1 + (1 - hpK) * 0.25 + (near ? Math.sin(game.time * 0.5) * 0.08 : 0);
    ctx.beginPath();
    ctx.arc(e.x, e.y, r * swell, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(80, 120, 20, 0.6)';
    for (let i = 0; i < 5; i++) {
      const a = e.id + i * 1.3;
      ctx.beginPath();
      ctx.arc(e.x + Math.cos(a) * r * 0.55, e.y + Math.sin(a) * r * 0.55, r * 0.16, 0, TAU);
      ctx.fill();
    }
    drawEyes(e, Math.max(3, r * 0.22), 0.3);
  } else if (def.shape === 'culture') {
    // Mother Culture: a petri dish crawling with colonies
    ctx.fillStyle = 'rgba(255, 240, 200, 0.25)';
    ctx.beginPath();
    ctx.arc(e.x, e.y, r * 1.15, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r * 0.9, 0, TAU);
    ctx.fill();
    for (let i = 0; i < 9; i++) {
      const a = e.spin * 0.5 + i * 0.7;
      const rr = r * (0.25 + (i % 3) * 0.2);
      ctx.fillStyle = ['#c9ff6b', '#ff9ad5', '#ffb13d'][i % 3];
      ctx.beginPath();
      ctx.arc(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr, r * (0.1 + (i % 2) * 0.06), 0, TAU);
      ctx.fill();
    }
    drawEyes(e, r * 0.18, 0.2);
  } else if (def.shape === 'eye') {
    ctx.beginPath();
    ctx.arc(e.x, e.y, r, 0, TAU);
    ctx.fill();
    ctx.stroke();
    const a = lookAngle(e);
    ctx.fillStyle = '#f4fffd';
    ctx.beginPath();
    ctx.arc(e.x, e.y, r * 0.62, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#0b3b37';
    ctx.beginPath();
    ctx.arc(e.x + Math.cos(a) * r * 0.25, e.y + Math.sin(a) * r * 0.25, r * 0.32, 0, TAU);
    ctx.fill();
  } else {
    // blob — slightly wobbly circle
    const wob = Math.sin(game.time * 0.15 + e.id) * 0.06;
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, r * (1 + wob), r * (1 - wob), 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    drawEyes(e, Math.max(3, r * 0.3), 0.35);
  }

  if (e.elite) {
    ctx.strokeStyle = '#ffe14d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r + 5, 0, TAU);
    ctx.stroke();
  }
  if (e.shield > 0) {
    ctx.strokeStyle = `rgba(122, 240, 255, ${0.35 + 0.5 * (e.shield / e.shieldMax)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r + 9, 0, TAU);
    ctx.stroke();
  }
  if (e.mods && e.mods.length && e.def) {
    ctx.font = `bold 9px ${FONT}`;
    ctx.textAlign = 'center';
    e.mods.forEach((m, i) => {
      ctx.fillStyle = ELITE_MODS[m].color;
      ctx.fillText(ELITE_MODS[m].name, e.x, e.y - r - 20 - i * 10);
    });
  }
  if (e.stunUntil > game.time) {
    ctx.font = `bold 12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#b8c4ff';
    ctx.fillText('z', e.x + r * 0.7 + Math.sin(game.time * 0.1) * 2, e.y - r - 2);
  }
  if (slowed) {
    ctx.strokeStyle = 'rgba(180, 92, 255, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r + 3, 0, TAU);
    ctx.stroke();
  }
  if ((e.elite) && e.hp < e.maxHp) {
    const bw = r * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(e.x - bw / 2, e.y - r - 14, bw, 4);
    ctx.fillStyle = '#ffe14d';
    ctx.fillRect(e.x - bw / 2, e.y - r - 14, bw * clamp(e.hp / e.maxHp, 0, 1), 4);
  }
}

function lookAngle(e) {
  return player && game.state !== State.MENU ? Math.atan2(player.y - e.y, player.x - e.x) : 0.4;
}

function drawEyes(e, size, offset) {
  const a = lookAngle(e);
  const ox = Math.cos(a) * e.r * offset;
  const oy = Math.sin(a) * e.r * offset;
  const px = Math.cos(a + Math.PI / 2) * size * 0.95;
  const py = Math.sin(a + Math.PI / 2) * size * 0.95;
  for (let side = -1; side <= 1; side += 2) {
    const ex = e.x + ox + px * side;
    const ey = e.y + oy + py * side;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ex, ey, size * 0.7, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(ex + Math.cos(a) * size * 0.3, ey + Math.sin(a) * size * 0.3, size * 0.35, 0, TAU);
    ctx.fill();
  }
}

// ---------------------------------------------------------- Projectiles --
function drawProjectiles() {
  for (const p of projectiles) {
    if (!inView(p.x, p.y, 20)) continue;
    if (p.kind === 'scalpel') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = '#eef2ff';
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-2, -4);
      ctx.lineTo(-2, 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#5a6286';
      ctx.fillRect(-10, -2, 8, 4);
      ctx.restore();
    } else if (p.kind === 'syringe') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.fillRect(-9, -3, 12, 6);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-12, -4, 3, 8);
      ctx.strokeStyle = '#dfe6ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(3, 0);
      ctx.lineTo(11, 0);
      ctx.stroke();
      ctx.restore();
    } else if (p.kind === 'saw') {
      drawSaw(p);
    } else {
      if (p.explosive) drawGlow(p.x, p.y, 14, '#ff8a1f', 0.5);
      drawMiniPill(p.x, p.y, p.angle, 12, 7, p.color, p.accent);
    }
  }
}

function drawSaw(p) {
  const teeth = 10;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.spin);
  ctx.fillStyle = '#dfe6ff';
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * TAU;
    const rr = i % 2 === 0 ? p.r : p.r * 0.72;
    if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(0, 0, p.r * 0.45, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#1a1d2e';
  ctx.beginPath();
  ctx.arc(0, 0, p.r * 0.15, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawSlashes() {
  for (const s of slashes) {
    const k = s.life / s.maxLife;
    const x0 = s.side > 0 ? s.x : s.x - s.len;
    const g = ctx.createLinearGradient(s.x, 0, s.x + s.side * s.len, 0);
    g.addColorStop(0, rgba(s.color, 0.1 * k));
    g.addColorStop(0.7, rgba(s.color, 0.55 * k));
    g.addColorStop(1, rgba(s.color, 0));
    ctx.fillStyle = g;
    const h = s.wid * (0.4 + 0.6 * k);
    ctx.fillRect(x0, s.y - h / 2, s.len, h);
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.8 * k})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.quadraticCurveTo(s.x + s.side * s.len * 0.5, s.y - h * 0.6, s.x + s.side * s.len, s.y);
    ctx.stroke();
  }
}

function drawWaves() {
  for (const w of waves) {
    const k = 1 - w.r / w.maxR;
    ctx.strokeStyle = rgba(w.color, 0.25 + 0.55 * k);
    ctx.lineWidth = 4 + 6 * k;
    ctx.beginPath();
    ctx.arc(w.x, w.y, w.r, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = rgba(w.color, 0.2 * k);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(w.x, w.y, w.r * 0.8, 0, TAU);
    ctx.stroke();
  }
}

function drawLobs() {
  for (const l of lobs) {
    const k = l.t / l.dur;
    const x = l.sx + (l.tx - l.sx) * k;
    const y = l.sy + (l.ty - l.sy) * k;
    const h = Math.sin(k * Math.PI) * 70;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y, 6, 3, 0, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.translate(x, y - h);
    ctx.rotate(l.t * 0.3);
    ctx.fillStyle = l.color;
    ctx.beginPath();
    ctx.arc(0, 2, 6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#dfe6ff';
    ctx.fillRect(-2, -8, 4, 6);
    ctx.restore();
  }
}

function drawOrbits() {
  const w = weaponByFamily('orbit');
  if (!w) return;
  const scale = 1.1 * Math.sqrt(stats.area);
  for (const p of w.points) {
    drawGlow(p.x, p.y, 20 * scale, w.def.color, 0.3);
    drawCapsule(p.x, p.y, p.a + Math.PI / 2, w.def.color, w.def.accent, scale);
  }
}

function drawEnemyShots() {
  for (const s of enemyShots) {
    if (!inView(s.x, s.y, 10)) continue;
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(s.x - 2, s.y - 2, s.r * 0.35, 0, TAU);
    ctx.fill();
  }
}

function drawBolts() {
  for (const b of bolts) {
    const k = b.life / b.maxLife;
    for (const pass of [{ w: 6, c: `rgba(122, 240, 255, ${0.35 * k})` }, { w: 2, c: `rgba(255, 255, 255, ${k})` }]) {
      ctx.strokeStyle = pass.c;
      ctx.lineWidth = pass.w;
      ctx.beginPath();
      for (let i = 0; i < b.pts.length; i++) {
        const p = b.pts[i];
        if (i === 0) { ctx.moveTo(p.x, p.y); continue; }
        const prev = b.pts[i - 1];
        const mx = (prev.x + p.x) / 2 + rand(-10, 10);
        const my = (prev.y + p.y) / 2 + rand(-10, 10);
        ctx.lineTo(mx, my);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
  }
}

// --------------------------------------------------------------- Player --
function drawPlayer() {
  if (game.dying > 0) { drawDyingPlayer(); return; }
  const p = player;
  const color = game.char.color;

  for (let i = 0; i < p.trail.length; i++) {
    const t = p.trail[i];
    ctx.fillStyle = `rgba(255, 225, 77, ${(i / p.trail.length) * 0.25})`;
    ctx.beginPath();
    ctx.arc(t.x, t.y, p.radius, 0, TAU);
    ctx.fill();
  }

  const blink = p.iframes > 0 && Math.floor(p.iframes / 4) % 2 === 0;
  ctx.globalAlpha = (blink ? 0.45 : 1) * (stats.ghost ? 0.4 : 1);

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + p.radius * 0.85, p.radius, p.radius * 0.38, 0, 0, TAU);
  ctx.fill();

  // tremor jitter is visible on the body
  const jx = stats.tremor ? rand(-1, 1) * stats.tremor * 6 : 0;
  const jy = stats.tremor ? rand(-1, 1) * stats.tremor * 6 : 0;
  const x = p.x + jx;
  const y = p.y + jy;

  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, p.radius, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // medical cross badge
  const c = p.radius * 0.42;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - c * 0.3, y - c, c * 0.6, c * 2);
  ctx.fillRect(x - c, y - c * 0.3, c * 2, c * 0.6);

  // facing indicator
  const fa = p.aim;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(fa) * (p.radius + 8), y + Math.sin(fa) * (p.radius + 8));
  ctx.lineTo(x + Math.cos(fa + 0.35) * (p.radius + 2), y + Math.sin(fa + 0.35) * (p.radius + 2));
  ctx.lineTo(x + Math.cos(fa - 0.35) * (p.radius + 2), y + Math.sin(fa - 0.35) * (p.radius + 2));
  ctx.closePath();
  ctx.fill();

  // orbiting dots for each temp pill
  const n = p.tempEffects.length;
  for (let i = 0; i < n; i++) {
    const a = game.time * 0.06 + (i / n) * TAU;
    ctx.fillStyle = p.tempEffects[i].def.color;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * (p.radius + 12), y + Math.sin(a) * (p.radius + 12), 3.5, 0, TAU);
    ctx.fill();
  }

  if (stats.inverted) {
    ctx.strokeStyle = '#3dff8a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 24; i++) {
      const a = i * 0.5 - game.time * 0.15;
      const rr = i * 0.45;
      const sx = x + Math.cos(a) * rr;
      const sy = y - p.radius - 16 + Math.sin(a) * rr * 0.5;
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // HP bar under player
  const bw = 36;
  const hpK = clamp(p.hp / stats.maxHp, 0, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(p.x - bw / 2 - 1, p.y + p.radius + 7, bw + 2, 6);
  ctx.fillStyle = hpK < 0.3 ? '#ff4d5e' : '#3dff8a';
  ctx.fillRect(p.x - bw / 2, p.y + p.radius + 8, bw * hpK, 4);
}

// Overdose: chromatic split, pulsing and shrinking, pills spiralling away.
function drawDyingPlayer() {
  const p = player;
  const k = 1 - game.dying / game.dyingMax;
  const r = p.radius * (1 + Math.sin(game.dying * 0.5) * 0.25) * (1 - k * 0.6);
  const off = 3 + k * 12;
  const wob = Math.sin(game.dying * 0.3) * off * 0.5;
  ctx.globalCompositeOperation = 'lighter';
  for (const [dx, col] of [[-off, 'rgba(255, 40, 80, 0.6)'], [off, 'rgba(40, 220, 255, 0.6)'], [0, 'rgba(255, 255, 255, 0.4)']]) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(p.x + dx, p.y + (dx ? wob : 0), r, 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 6; i++) {
    const a = game.dying * 0.15 + (i / 6) * TAU;
    const d = 12 + k * 80;
    const t = TEMP_PILLS[i % TEMP_PILLS.length];
    drawMiniPill(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, a * 2, 12, 6, t.color, t.accent);
  }
}

function drawParticles() {
  for (const p of particles) {
    if (!inView(p.x, p.y, 6)) continue;
    ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function drawFloaters() {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of floaters) {
    if (!inView(f.x, f.y, 120)) continue;
    const k = f.life / f.maxLife;
    const pop = k > 0.85 ? 1 + (k - 0.85) * 3 : 1;
    ctx.globalAlpha = clamp(k * 1.6, 0, 1);
    ctx.font = `bold ${Math.round(f.size * pop)}px ${FONT}`;
    ctx.lineWidth = f.small ? 3 : 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.textBaseline = 'alphabetic';
}

// ------------------------------------------------------- Screen overlays --
function drawVignette() {
  const focus = player.tempEffects.find((e) => e.def.id === 'focus');
  if (!focus || game.state === State.GAMEOVER) return;
  const k = clamp(Math.min(focus.duration / 30, (focus.maxDuration - focus.duration) / 20), 0, 1);
  const onCursor = settings().mouseAim;
  const sx = onCursor ? mouse.x : player.x - camX;
  const sy = onCursor ? mouse.y : player.y - camY;
  const inner = 70 + (1 - k) * 400;
  const outer = 190 + (1 - k) * 600;
  const g = ctx.createRadialGradient(sx, sy, inner, sx, sy, outer);
  g.addColorStop(0, 'rgba(6, 0, 16, 0)');
  g.addColorStop(1, `rgba(6, 0, 16, ${0.97 * k})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawLevelFlash() {
  if (!game.levelFlash) return;
  ctx.fillStyle = `rgba(94, 200, 255, ${(game.levelFlash * 0.3).toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);
  game.levelFlash = Math.max(0, game.levelFlash - 0.06);
}

function drawHurtFlash() {
  if (game.hurtFlash <= 0) return;
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, 'rgba(255, 30, 60, 0)');
  g.addColorStop(1, `rgba(255, 30, 60, ${game.hurtFlash})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// Arrows at the screen edge pointing to off-screen bosses and chests.
function drawIndicators() {
  if (game.state === State.GAMEOVER) return;
  const targets = [];
  for (const e of enemies) if (e.boss || e.elite) targets.push({ x: e.x, y: e.y, color: e.boss ? e.def.color : '#ffe14d' });
  for (const p of pickups) {
    if (p.type === 'chest') targets.push({ x: p.x, y: p.y, color: '#ffd23d' });
    if (p.type === 'pill') targets.push({ x: p.x, y: p.y, color: p.def.color });
  }
  const margin = 26;
  for (const t of targets) {
    const sx = t.x - camX;
    const sy = t.y - camY;
    if (sx > 0 && sx < W && sy > 0 && sy < H) continue;
    const cx = W / 2;
    const cy = H / 2;
    const a = Math.atan2(sy - cy, sx - cx);
    const scale = Math.min((W / 2 - margin) / Math.abs(Math.cos(a) || 1e-6), (H / 2 - margin) / Math.abs(Math.sin(a) || 1e-6));
    const ax = cx + Math.cos(a) * scale;
    const ay = cy + Math.sin(a) * scale;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(a);
    ctx.fillStyle = t.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-8, -9);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function drawBossBar() {
  const boss = enemies.find((e) => e.boss && !e.dead);
  if (!boss || game.state === State.GAMEOVER) return;
  const bw = Math.min(520, W - 40);
  const x = (W - bw) / 2;
  const y = 92;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(x - 2, y - 2, bw + 4, 14);
  ctx.fillStyle = boss.def.color;
  ctx.fillRect(x, y, bw * clamp(boss.hp / boss.maxHp, 0, 1), 10);
  ctx.font = `bold 13px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(boss.def.name, W / 2, y - 7);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(boss.def.name, W / 2, y - 7);
}

function drawBanner() {
  const b = game.banner;
  if (!b || game.state === State.GAMEOVER) return;
  const k = b.life / b.maxLife;
  const alpha = clamp(Math.min(k * 4, (1 - k) * 8), 0, 1);
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(Math.min(W / 14, 54))}px ${FONT}`;
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.strokeText(b.text, W / 2, H * 0.3);
  ctx.fillStyle = '#ffe14d';
  ctx.fillText(b.text, W / 2, H * 0.3);
  ctx.font = `bold 16px ${FONT}`;
  ctx.lineWidth = 4;
  ctx.strokeText(b.sub, W / 2, H * 0.3 + 42);
  ctx.fillStyle = '#ff8a9a';
  ctx.fillText(b.sub, W / 2, H * 0.3 + 42);
  ctx.globalAlpha = 1;
  ctx.textBaseline = 'alphabetic';
}
