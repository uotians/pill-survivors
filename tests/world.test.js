'use strict';

// Procedural furniture and collisions; music system.

module.exports = [
  {
    name: 'furniture generation is deterministic and keeps the spawn clear',
    fn(t) {
      const g = t.game();
      const r = g.run(() => {
        const out = {};
        for (const st of STAGES) {
          World.reset(42, st.furniture);
          const a = JSON.stringify(World.chunk(3, -2));
          World.reset(42, st.furniture);
          const b = JSON.stringify(World.chunk(3, -2));
          const types = new Set();
          for (let cx = -3; cx <= 3; cx++) for (let cy = -3; cy <= 3; cy++) for (const o of World.chunk(cx, cy)) types.add(o.type);
          out[st.id] = { same: a === b, clear: !World.blocked(0, 0, 200), hasRow: types.has(st.furniture.row), types: [...types] };
        }
        return out;
      });
      for (const [id, v] of Object.entries(r)) {
        t.ok(v.same, `${id}: same seed -> same layout`);
        t.ok(v.clear, `${id}: start area clear`);
        t.ok(v.hasRow, `${id}: signature furniture present (${v.types.join(', ')})`);
      }
    }
  },
  {
    name: 'player and enemies never get stuck inside furniture',
    fn(t) {
      const g = t.game({ seed: 6 });
      const r = g.run(() => {
        Save.data.settings.autoTarget = true;
        startRun('nurse', 'morgue');
        let inside = 0; let samples = 0; let enemyInside = 0; let stuck = 0;
        const last = new Map();
        for (let f = 0; f < 60 * 120; f++) {
          const a = f * 0.004;
          keys.KeyD = Math.cos(a) > 0.3; keys.KeyA = Math.cos(a) < -0.3; keys.KeyS = Math.sin(a) > 0.3; keys.KeyW = Math.sin(a) < -0.3;
          if (game.state === State.LEVELUP) chooseOption(0);
          player.hp = stats.maxHp;
          update();
          if (World.blocked(player.x, player.y, player.radius * 0.8)) inside++;
          if (f % 30 === 0) {
            for (const e of enemies) {
              if (e.boss) continue;
              samples++;
              if (World.blocked(e.x, e.y, e.r * 0.7)) enemyInside++;
              const p = last.get(e.id);
              if (p && Math.hypot(e.x - p.x, e.y - p.y) < 1 && Math.hypot(e.x - player.x, e.y - player.y) > 60) stuck++;
              last.set(e.id, { x: e.x, y: e.y });
            }
          }
        }
        return { inside, enemyInside: enemyInside / samples, stuck: stuck / samples };
      });
      t.log(`enemies inside ${(r.enemyInside * 100).toFixed(2)}%, stuck ${(r.stuck * 100).toFixed(2)}%`);
      t.eq(r.inside, 0, 'player never inside furniture');
      t.ok(r.enemyInside < 0.01, 'enemies almost never inside furniture');
      t.ok(r.stuck < 0.01, 'enemies almost never stuck');
    }
  },
  {
    name: 'music changes with game state and stage',
    fn(t) {
      const g = t.game({ audio: true });
      const sample = (label, fn) => {
        g.run(fn || (() => {}));
        g.resetAudioCounts();
        for (let i = 0; i < 4 * 60; i++) {
          g.run(() => { if (game.state === State.PLAYING) update(); Music.update(); });
          if (i % 15 === 0) g.advanceAudio(0.25);
        }
        const m = g.run(() => ({ mode: Music.mode, bpm: Music.bpm, key: Music.keyMult, vol: Music.lastVol, cutoff: Music.lastCutoff }));
        const notes = Object.values(g.audioCounts).reduce((a, b) => a + b, 0);
        t.log(`${label}: mode ${m.mode}, ${m.bpm} bpm, ${notes} notes`);
        return Object.assign(m, { notes, saw: g.audioCounts['osc:sawtooth'] || 0 });
      };
      g.run(() => Sfx.init());
      const menu = sample('menu');
      const run = sample('run', () => { startRun('nurse'); });
      const paused = sample('paused', () => UI.pause());
      g.run(() => UI.resume());
      const boss = sample('boss', () => { spawnEnemy('superbug'); });
      const lab = sample('lab', () => { Save.data.stagesCleared.ward = true; startRun('nurse', 'lab'); });
      const off = sample('off', () => UI.toggleSetting('music'));
      t.eq(menu.mode, 'menu', 'menu music');
      t.eq(run.mode, 'run', 'run music');
      t.ok(run.bpm > menu.bpm, 'run faster than menu');
      t.ok(paused.vol < run.vol && paused.cutoff < run.cutoff, 'pause ducks and muffles');
      t.eq(boss.mode, 'boss', 'boss music');
      t.ok(boss.saw > 0, 'boss lead melody plays');
      t.ok(lab.key > 1, 'lab is in a different key');
      t.eq(off.mode, 'off', 'music can be switched off');
      t.ok(menu.notes > 0 && run.notes > menu.notes, 'notes are scheduled');
    }
  }
];
