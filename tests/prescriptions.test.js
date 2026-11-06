'use strict';

// Newer prescriptions and temporary pills.

module.exports = [
  {
    name: 'every prescription applies a buff and a side effect at every level',
    fn(t) {
      const g = t.game();
      const r = g.run(() => {
        startRun('nurse');
        const base = Object.assign({}, stats);
        const out = [];
        for (const def of PASSIVES) {
          for (let L = 1; L <= def.max; L++) {
            player.passives = { [def.id]: L };
            player.passiveOrder = [def.id];
            recomputeStats();
            const changed = Object.keys(base).filter((k) => typeof base[k] === 'number' && Math.abs(stats[k] - base[k]) > 1e-9);
            const bad = Object.keys(stats).filter((k) => typeof stats[k] === 'number' && !isFinite(stats[k]));
            out.push({ id: def.id, L, changed: changed.length, bad: bad.join(',') });
          }
        }
        return out;
      });
      for (const row of r) {
        t.ok(row.changed >= 2, `${row.id} L${row.L}: changes at least 2 stats (buff + side), got ${row.changed}`);
        t.eq(row.bad, '', `${row.id} L${row.L}: all stats finite`);
      }
    }
  },
  {
    name: 'Melatonin naps freeze movement for a moment',
    fn(t) {
      const g = t.game();
      const r = g.run(() => {
        startRun('nurse');
        player.weapons = [];
        player.passives = { melatonin: 5 }; player.passiveOrder = ['melatonin'];
        recomputeStats();
        player.napCd = 1;
        keys.KeyD = true;
        update();
        const napLen = player.napLeft;
        const x0 = player.x;
        for (let i = 0; i < 30; i++) { player.vx = 0; update(); }
        const movedDuringNap = Math.abs(player.x - x0);
        for (let i = 0; i < napLen; i++) update();
        const x1 = player.x;
        for (let i = 0; i < 30; i++) update();
        keys.KeyD = false;
        return { napLen, movedDuringNap, movedAfter: player.x - x1, cd: player.napCd, growth: stats.growth };
      });
      t.between(r.napLen, 70, 80, 'nap length at level 5');
      t.ok(r.movedDuringNap < 1, 'no movement while napping');
      t.ok(r.movedAfter > 20, 'can move again after waking');
      t.between(r.growth, 1.59, 1.61, '+60% XP at level 5');
    }
  },
  {
    name: 'Beta Blockers crit, Blood Thinner damage taken, Vaccine Booster vs elites',
    fn(t) {
      const g = t.game();
      const r = g.run(() => {
        const out = {};
        startRun('nurse');
        player.weapons = [];
        // crits: count doubled hits
        player.passives = { betablockers: 5 }; player.passiveOrder = ['betablockers']; recomputeStats();
        let crits = 0;
        for (let i = 0; i < 2000; i++) { const e = makeEnemy('virus', 9999, 9999); e.hp = 1e9; const h = e.hp; damageEnemy(e, 10, 0, 0); if (h - e.hp > 15) crits++; }
        out.critRate = crits / 2000;
        out.cooldown = stats.cooldown;
        // damage taken
        player.passives = { bloodthinner: 5 }; player.passiveOrder = ['bloodthinner']; recomputeStats();
        player.hp = stats.maxHp; player.iframes = 0;
        const hp0 = player.hp; hurtPlayer(10, player.x + 1, player.y); out.bloodHit = hp0 - player.hp;
        startRun('nurse'); player.iframes = 0; const hp1 = player.hp; hurtPlayer(10, player.x + 1, player.y); out.normalHit = hp1 - player.hp;
        // elites
        player.passives = { booster: 5 }; player.passiveOrder = ['booster']; recomputeStats();
        const el = makeEnemy('germ', 9999, 9999, { elite: true, mods: [] }); const e0 = el.hp; damageEnemy(el, 10, 0, 0, true); out.eliteDmg = e0 - el.hp;
        const no = makeEnemy('germ', 9999, 9999); no.hp = 1e9; const n0 = no.hp; damageEnemy(no, 10, 0, 0, true); out.normalDmg = n0 - no.hp;
        out.boosterHp = stats.maxHp;
        return out;
      });
      t.between(r.critRate, 0.28, 0.40, 'about 34% crit with Beta Blockers 5');
      t.between(r.cooldown, 1.24, 1.26, '+25% cooldowns');
      t.ok(r.bloodHit > r.normalHit, `Blood Thinner: ${r.bloodHit} vs ${r.normalHit} damage taken`);
      t.between(r.eliteDmg / r.normalDmg, 1.74, 1.76, 'Vaccine Booster 5: +75% vs elites');
      t.eq(r.boosterHp, 120 - 25, 'Vaccine Booster 5: -25 max HP');
    }
  },
  {
    name: 'Shrink pill halves the hitbox and weakens damage',
    fn(t) {
      const g = t.game();
      const r = g.run(() => {
        startRun('nurse');
        const r0 = player.radius; const m0 = stats.might;
        applyTempPill(PILL_BY_ID.shrink);
        return { ratio: player.radius / r0, might: stats.might / m0 };
      });
      t.eq(r.ratio, 0.5, 'half size');
      t.between(r.might, 0.59, 0.61, '-40% damage');
    }
  },
  {
    name: 'Ghost pill: no contact damage, no furniture, no pickups',
    fn(t) {
      const g = t.game();
      const r = g.run(() => {
        startRun('nurse');
        player.weapons = [];
        applyTempPill(PILL_BY_ID.ghost);
        const hp0 = player.hp;
        enemies.push(makeEnemy('virus', player.x + 5, player.y));
        spawnGem(player.x, player.y, 5);
        const xp0 = game.xp;
        for (let i = 0; i < 60; i++) update();
        const out = { hpLoss: hp0 - player.hp, xpGained: game.xp - xp0, gemsLeft: gems.length };
        // walk through furniture
        World.chunks.clear();
        World.chunks.set(0, [{ type: 'crate', x: player.x + 20, y: player.y - 30, w: 60, h: 60 }]);
        const before = player.x;
        player.vx = 5;
        for (let i = 0; i < 20; i++) { keys.KeyD = true; update(); }
        keys.KeyD = false;
        out.passedThrough = player.x - before > 70;
        return out;
      });
      t.eq(r.hpLoss, 0, 'no contact damage');
      t.eq(r.xpGained, 0, 'cannot collect XP');
      t.ok(r.gemsLeft >= 1, 'gem stays on the ground');
      t.ok(r.passedThrough, 'walks through furniture');
    }
  },
  {
    name: 'Lodestone pulls XP from afar and enemies too',
    fn(t) {
      const g = t.game();
      const r = g.run(() => {
        startRun('nurse');
        player.weapons = [];
        applyTempPill(PILL_BY_ID.lodestone);
        spawnGem(player.x + 900, player.y, 1);
        const e = makeEnemy('virus', player.x + 200, player.y); e.speed = 0; enemies.push(e);
        const d0 = e.x - player.x;
        for (let i = 0; i < 120; i++) update();
        return { gemsLeft: gems.length, pulled: d0 - (e.x - player.x) };
      });
      t.eq(r.gemsLeft, 0, 'far gem collected');
      t.ok(r.pulled > 40, `enemy pulled closer (${r.pulled.toFixed(0)} px)`);
    }
  },
  {
    name: 'new prescriptions and pills appear in level-ups, floor drops and the encyclopedia',
    fn(t) {
      const g = t.game({ seed: 12 });
      const r = g.run(() => {
        startRun('nurse');
        game.levelUpSource = 'level';
        const offered = new Set();
        for (let i = 0; i < 400; i++) for (const c of buildChoices()) if (c.kind === 'passive') offered.add(c.def.id);
        const dropped = new Set();
        for (let i = 0; i < 400; i++) dropped.add(choice(TEMP_PILLS).id);
        UI.openCodex();
        for (const tab of ['passive', 'pill']) { UI.codexTab = tab; for (const it of CODEX_TABS.find((x) => x.id === tab).items()) { UI.codexSel = it.id; UI.renderCodex(); } }
        return { offered: [...offered], dropped: [...dropped] };
      });
      for (const id of ['melatonin', 'betablockers', 'bloodthinner', 'booster']) t.ok(r.offered.includes(id), `${id} offered`);
      for (const id of ['shrink', 'ghost', 'lodestone']) t.ok(r.dropped.includes(id), `${id} can drop`);
    }
  }
];
