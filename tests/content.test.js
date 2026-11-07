'use strict';

// Weapons, evolutions, prescriptions, pills and characters.

module.exports = [
  {
    name: 'every weapon works and levels to max',
    fn(t) {
      const g = t.game({ seed: 2 });
      const r = g.run(() => {
        const out = {};
        Save.data.settings.autoTarget = true;
        for (const def of WEAPONS) {
          startRun('nurse');
          player.weapons = [];
          addWeapon(def.id);
          getWeapon(def.id).level = def.max;
          const k0 = game.kills;
          __bot({ frames: 60 * 25, keepAlive: 'full' });
          out[def.id] = game.kills - k0;
        }
        return out;
      });
      t.log(Object.entries(r).map(([k, v]) => `${k}: ${v}`).join(', '));
      for (const [id, kills] of Object.entries(r)) t.ok(kills > 10, `${id} kills enemies (got ${kills})`);
    }
  },
  {
    name: 'every evolution: offered, guaranteed by chest, works, not re-offered',
    fn(t) {
      const g = t.game({ seed: 4 });
      const res = g.run(() => {
        const out = [];
        Save.data.settings.autoTarget = true;
        for (const ev of EVOLUTIONS) {
          startRun('nurse');
          if (!getWeapon(ev.from)) addWeapon(ev.from);
          getWeapon(ev.from).level = WEAPON_BY_ID[ev.from].max;
          player.passives[ev.requires] = 1;
          player.passiveOrder.push(ev.requires);
          recomputeStats();
          game.levelUpSource = 'chest';
          const chest = buildChoices();
          game.levelUpSource = 'level';
          let offered = 0;
          for (let i = 0; i < 100; i++) if (buildChoices().some((c) => c.kind === 'evolution')) offered++;
          applyChoice(chest[0]);
          const w = getWeapon(ev.id);
          __bot({ frames: 60 * 5, keepAlive: 'full' });
          const k0 = game.kills;
          __bot({ frames: 60 * 30, keepAlive: 'full', pick: 99 });
          game.levelUpSource = 'level';
          const reoffered = buildChoices().some((c) => c.kind === 'evolution' || (c.kind === 'weapon' && c.def.id === ev.from));
          out.push({ id: ev.id, chestFirst: chest[0].kind === 'evolution' && chest[0].def.id === ev.id, offered, evolved: !!w,
            kills: game.kills - k0, reoffered, codex: !!Save.data.codex.evolution[ev.id] });
        }
        return out;
      });
      t.log(res.map((r) => `${r.id}: ${r.kills} kills, offered ${r.offered}%`).join(' | '));
      for (const r of res) {
        t.ok(r.chestFirst, `${r.id}: chest guarantees evolution`);
        t.ok(r.offered > 30, `${r.id}: offered in level-ups (${r.offered}%)`);
        t.ok(r.evolved, `${r.id}: weapon evolved`);
        t.ok(r.kills > 20, `${r.id}: kills enemies (${r.kills})`);
        t.ok(!r.reoffered, `${r.id}: not offered again`);
        t.ok(r.codex, `${r.id}: encyclopedia entry unlocked`);
      }
      // Balance guard: no evolution should massively outclass the median.
      const kills = res.map((r) => r.kills).sort((a, b) => a - b);
      const median = kills[Math.floor(kills.length / 2)];
      for (const r of res) t.ok(r.kills < median * 3, `${r.id} balance: ${r.kills} kills vs median ${median}`);
    }
  },
  {
    name: 'evolution side effects apply',
    fn(t) {
      const g = t.game();
      const r = g.run(() => {
        const evolve = (id) => {
          startRun('nurse');
          const ev = EVOLUTION_BY_ID[id];
          if (!getWeapon(ev.from)) addWeapon(ev.from);
          getWeapon(ev.from).level = 5;
          player.passives[ev.requires] = 1; player.passiveOrder.push(ev.requires);
          evolveWeapon(ev); recomputeStats();
        };
        const out = {};
        evolve('hyperthermia'); out.selfBurn = stats.selfBurn;
        evolve('planetary'); out.gravity = stats.gravity;
        startRun('nurse'); const baseSpeed = stats.speed; player.passives.steroids = 1; player.passiveOrder.push('steroids'); recomputeStats(); const withSteroids = stats.speed;
        evolve('bonesaw'); out.sawSlow = stats.speed / withSteroids;
        out.baseSpeed = baseSpeed;
        evolve('pillstorm');
        let placebo = 0; let total = 0;
        for (let f = 0; f < 600; f++) {
          const n = projectiles.length; player.hp = stats.maxHp;
          if (game.state === State.LEVELUP) chooseOption(0);
          update();
          for (let i = n; i < projectiles.length; i++) { total++; if (projectiles[i].placebo) placebo++; }
        }
        out.placeboRatio = placebo / total;
        return out;
      });
      t.eq(r.selfBurn, 1, 'Hyperthermia burns 1 HP/s');
      t.eq(r.gravity, 0.5, 'Planetary Dose gravity');
      t.between(r.sawSlow, 0.89, 0.91, 'Bone Saw -10% speed');
      t.between(r.placeboRatio, 0.12, 0.22, 'Pill Storm: about 1 in 6 capsules is a placebo');
    }
  },
  {
    name: 'temporary pills apply, stack and expire',
    fn(t) {
      const g = t.game();
      const r = g.run(() => {
        startRun('nurse');
        const s0 = stats.speed;
        applyTempPill(PILL_BY_ID.speed);
        const fast = stats.speed;
        applyTempPill(PILL_BY_ID.focus);
        const both = player.tempEffects.length;
        for (const e of player.tempEffects) e.duration = 1;
        update();
        return { s0, fast, both, after: player.tempEffects.length, ts: stats.enemyTimeScale };
      });
      t.eq(r.fast, r.s0 * 2, 'Hyper-Speed doubles speed');
      t.eq(r.both, 2, 'pills stack');
      t.eq(r.after, 0, 'pills expire');
      t.eq(r.ts, 1, 'bullet time ends');
    }
  },
  {
    name: 'Hypochondriac: 3 starting prescriptions, doubled side effects',
    fn(t) {
      const g = t.game();
      const r = g.run(() => {
        Save.data.chars.hypochondriac = true;
        const measure = (charId) => {
          startRun(charId);
          player.passives = { steroids: 2 }; player.passiveOrder = ['steroids']; recomputeStats();
          return { size: stats.size, might: stats.might };
        };
        startRun('hypochondriac');
        const start = player.passiveOrder.length;
        return { start, nurse: measure('nurse'), hypo: measure('hypochondriac') };
      });
      t.eq(r.start, 3, 'starts with 3 prescriptions');
      t.between(r.nurse.size, 1.119, 1.121, 'nurse size with Steroids 2');
      t.between(r.hypo.size, 1.239, 1.241, 'hypochondriac size doubled side effect');
      t.eq(r.hypo.might, r.nurse.might, 'buff is not doubled');
    }
  },
  {
    name: 'Addict: longer pills and withdrawal when the last one ends',
    fn(t) {
      const g = t.game();
      const r = g.run(() => {
        Save.data.chars.addict = true;
        startRun('addict');
        applyTempPill(PILL_BY_ID.speed);
        const dur = player.tempEffects[0].maxDuration;
        player.tempEffects[0].duration = 1;
        update();
        const afterExpire = player.tempEffects.map((e) => e.def.id).join();
        const slowed = stats.speed;
        applyTempPill(PILL_BY_ID.focus);
        const cured = player.tempEffects.map((e) => e.def.id).join();
        startRun('nurse');
        applyTempPill(PILL_BY_ID.speed);
        player.tempEffects[0].duration = 1;
        update();
        return { dur, afterExpire, slowed, cured, nurse: player.tempEffects.length };
      });
      t.eq(r.dur, 900, 'pills last 50% longer');
      t.eq(r.afterExpire, 'withdrawal', 'withdrawal after last pill');
      t.eq(r.cured, 'focus', 'new pill cures withdrawal');
      t.eq(r.nurse, 0, 'other characters get no withdrawal');
    }
  },
  {
    name: 'every character can play 60 seconds',
    fn(t) {
      const g = t.game({ seed: 9 });
      const r = g.run(() => {
        const out = {};
        Save.data.settings.autoTarget = true;
        for (const ch of CHARACTERS) {
          Save.data.chars[ch.id] = true;
          startRun(ch.id);
          // Stand still: enemies come to us, so short-range weapons (aura) get their chance too.
          const b = __bot({ untilTime: 60, frames: 60 * 120, keepAlive: true, move: 'none' });
          out[ch.id] = { weapon: player.weapons[0].def.family, kills: b.kills };
        }
        return out;
      });
      t.log(Object.entries(r).map(([k, v]) => `${k}: ${v.kills}`).join(', '));
      for (const [id, v] of Object.entries(r)) t.ok(v.kills > 5, `${id} kills enemies`);
    }
  }
  ,
  {
    name: 'precision weapons deal x1.5 to elites and bosses, AoE does not',
    fn(t) {
      const g = t.game();
      const r = g.run(() => {
        startRun('nurse');
        const hit = (src, elite) => {
          const e = spawnEnemy('virus', elite ? { elite: true } : undefined);
          e.shield = 0; e.immune = null; // strip random elite mutations
          const hp = e.hp;
          damageEnemy(e, 10, 0, 0, true, src);
          e.dead = true;
          return hp - e.hp;
        };
        return { pistolElite: hit('pistol', true), pistolNormal: hit('pistol', false), rifleElite: hit('rifle', true), waveElite: hit('wave', true) };
      });
      t.eq(r.pistolNormal, 10, 'normal enemy: no bonus');
      t.eq(r.pistolElite, 15, 'pistol vs elite: x1.5');
      t.eq(r.rifleElite, 15, 'rifle vs elite: x1.5');
      t.eq(r.waveElite, 10, 'AoE vs elite: no bonus');
    }
  },
  {
    name: 'Tranquilizer Rifle targets the toughest enemy and stuns',
    fn(t) {
      const g = t.game();
      const r = g.run(() => {
        startRun('nurse');
        player.weapons = []; addWeapon('rifle'); recomputeStats();
        game.eventIdx = EVENTS.length;
        enemies.length = 0;
        const weak = makeEnemy('germ', player.x + 120, player.y); enemies.push(weak);
        const elite = makeEnemy('virus', player.x - 200, player.y, { elite: true }); enemies.push(elite);
        let firstAngle = null, stunned = false;
        for (let f = 0; f < 240; f++) {
          update();
          const d = projectiles.find((p) => p.kind === 'dart');
          if (d && firstAngle === null) firstAngle = Math.cos(d.angle);
          if (!weak.dead && weak.stunUntil > game.time) stunned = true;
          if (elite.stunUntil > game.time) stunned = true;
        }
        return { firstAngle, stunned, eliteHurt: elite.hp < elite.maxHp };
      });
      t.ok(r.firstAngle !== null && r.firstAngle < 0, 'first dart flies toward the elite (left), not the closer germ');
      t.ok(r.eliteHurt, 'elite took damage');
      t.ok(r.stunned, 'darts stun');
    }
  }
];
