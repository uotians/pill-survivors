'use strict';

// Enemy types, stage gating, elite mutations, minibosses.

// Spawns one enemy of `type` right next to the player and returns it (inside game scope).
const SETUP = `
  globalThis.__near = (type, dx = 40, opts) => {
    const e = makeEnemy(type, player.x + dx, player.y, opts);
    enemies.push(e);
    Grid.rebuild(enemies);
    return e;
  };
`;

module.exports = [
  {
    name: 'new enemy types only appear from their stage onwards',
    fn(t) {
      const g = t.game({ seed: 3 });
      const r = g.run(() => {
        const out = {};
        for (const st of STAGES) {
          Save.data.stagesCleared = { ward: true, lab: true, morgue: true };
          startRun('nurse', st.id);
          const seen = new Set();
          for (let i = 0; i < 4000; i++) seen.add(pickSpawnType(8));
          out[st.id] = [...seen].sort();
        }
        return out;
      });
      t.log(Object.entries(r).map(([k, v]) => `${k}: ${v.join(',')}`).join(' | '));
      t.ok(!r.ward.includes('parasite') && !r.ward.includes('fungus') && !r.ward.includes('bloater'), 'ward has only the classic enemies');
      t.ok(r.lab.includes('parasite') && !r.lab.includes('fungus'), 'lab adds parasites');
      t.ok(r.morgue.includes('fungus') && !r.morgue.includes('bloater'), 'morgue adds spore pods');
      t.ok(r.quarantine.includes('bloater'), 'quarantine adds bloaters');
    }
  },
  {
    name: 'parasite latches, drains XP, slows, and falls off when hit',
    fn(t) {
      const g = t.game();
      g.run(new Function(SETUP));
      const r = g.run(() => {
        startRun('nurse');
        player.weapons = [];
        game.xp = 3;
        const baseSpeed = stats.speed;
        const p = __near('parasite', 5);
        update();
        const latched = p.latched;
        for (let i = 0; i < 30; i++) update();
        const out = { latched, xpAfter: game.xp, slowed: stats.speed / baseSpeed, onPlayer: Math.hypot(p.x - player.x, p.y - player.y) < player.radius + 2 };
        damageEnemy(p, 1, 0, 0);
        out.knockedOff = !p.latched;
        const p2 = __near('parasite', 5);
        update();
        for (let i = 0; i < 400; i++) { player.hp = stats.maxHp; update(); }
        out.expired = p2.dead;
        return out;
      });
      t.ok(r.latched, 'latched on contact');
      t.ok(r.onPlayer, 'rides on the player');
      t.ok(r.xpAfter < 3, `drains XP (3 -> ${r.xpAfter.toFixed(2)})`);
      t.between(r.slowed, 0.91, 0.93, 'one parasite slows by 8%');
      t.ok(r.knockedOff, 'a hit knocks it off');
      t.ok(r.expired, 'falls off by itself after ~6 s');
    }
  },
  {
    name: 'spore pod clouds hurt and slow the player',
    fn(t) {
      const g = t.game();
      const r = g.run(() => {
        startRun('nurse');
        player.weapons = [];
        const s0 = stats.speed;
        const hp0 = player.hp;
        spawnSpores(player.x, player.y);
        for (let i = 0; i < 60; i++) update();
        return { hpLoss: hp0 - player.hp, slow: stats.speed / s0, debuff: player.tempEffects.some((e) => e.def.id === 'spored') };
      });
      t.ok(r.hpLoss > 1, `cloud damages (${r.hpLoss.toFixed(1)} HP/s)`);
      t.ok(r.debuff, 'Spored debuff applied');
      t.between(r.slow, 0.74, 0.76, '-25% speed');
    }
  },
  {
    name: 'bloater bursts on contact after a warning',
    fn(t) {
      const g = t.game();
      g.run(new Function(SETUP));
      const r = g.run(() => {
        startRun('nurse');
        player.weapons = [];
        const hp0 = player.hp;
        __near('bloater', 10);
        update();
        const pending = bombs.length;
        const hpRightAway = player.hp;
        for (let i = 0; i < 40; i++) update();
        return { pending, warned: hpRightAway === hp0, hit: player.hp < hp0, after: bombs.length };
      });
      t.eq(r.pending, 1, 'burst queued');
      t.ok(r.warned, 'no damage before the warning ends');
      t.ok(r.hit, 'blast hurts a player who stayed');
      t.eq(r.after, 0, 'bomb resolved');
    }
  },
  {
    name: 'elite mutations: shield, immunity, volatile, regen, swift',
    fn(t) {
      const g = t.game();
      g.run(new Function(SETUP));
      const r = g.run(() => {
        startRun('nurse');
        player.weapons = [];
        game.damageBy = { pistol: 500, aura: 20 };
        const out = {};
        const sh = __near('germ', 300, { elite: true, mods: ['shielded'] });
        const hp0 = sh.hp;
        damageEnemy(sh, sh.shieldMax * 0.5, 0, 0, true);
        out.shieldAbsorbs = sh.hp === hp0 && sh.shield > 0;
        const vac = __near('germ', 320, { elite: true, mods: ['vaccinated'] });
        out.immuneTo = vac.immune;
        const v0 = vac.hp;
        damageEnemy(vac, 50, 0, 0, true, 'pistol');
        out.immune = vac.hp === v0;
        damageEnemy(vac, 50, 0, 0, true, 'aura');
        out.otherWorks = vac.hp < v0;
        const vol = __near('germ', 340, { elite: true, mods: ['volatile'] });
        killEnemy(vol);
        out.volatileBomb = bombs.length === 1;
        const reg = __near('germ', -500, { elite: true, mods: ['regenerating'] });
        reg.hp = reg.maxHp * 0.5;
        for (let i = 0; i < 60; i++) update();
        out.regen = reg.hp > reg.maxHp * 0.51;
        const normal = makeEnemy('germ', 0, 0, { elite: true, mods: [] });
        const swift = makeEnemy('germ', 0, 0, { elite: true, mods: ['swift'] });
        out.swiftRatio = swift.speed / normal.speed;
        // random rolls: 1 mod on early stages, 2 from the morgue
        out.modsWard = makeEnemy('germ', 0, 0, { elite: true }).mods.length;
        game.stageIndex = 2;
        out.modsMorgue = makeEnemy('germ', 0, 0, { elite: true }).mods.length;
        return out;
      });
      t.ok(r.shieldAbsorbs, 'shield absorbs damage first');
      t.eq(r.immuneTo, 'pistol', 'vaccinated against the most damaging weapon');
      t.ok(r.immune, 'immune weapon does nothing');
      t.ok(r.otherWorks, 'other weapons still work');
      t.ok(r.volatileBomb, 'volatile elite leaves a bomb');
      t.ok(r.regen, 'regenerating elite heals');
      t.ok(r.swiftRatio > 1.5, 'swift elite is faster');
      t.eq(r.modsWard, 1, 'one mutation in the ward');
      t.eq(r.modsMorgue, 2, 'two mutations from the morgue on');
    }
  },
  {
    name: 'Mother Culture breeds parasites and drops a care package',
    fn(t) {
      const g = t.game();
      g.run(new Function(SETUP));
      const r = g.run(() => {
        Save.data.stagesCleared.ward = true;
        startRun('nurse', 'lab');
        player.weapons = [];
        const mc = __near('motherCulture', 300);
        for (let i = 0; i < 360; i++) { player.hp = stats.maxHp; update(); }
        const parasites = enemies.filter((e) => e.type === 'parasite').length;
        damageEnemy(mc, 1e9, 0, 0);
        return { parasites, chest: pickups.some((p) => p.type === 'chest') };
      });
      t.ok(r.parasites >= 5, `spawned parasites (${r.parasites})`);
      t.ok(r.chest, 'dropped a chest');
    }
  },
  {
    name: 'miniboss schedule follows the stage',
    fn(t) {
      const g = t.game();
      const r = g.run(() => {
        Save.data.stagesCleared = { ward: true, lab: true, morgue: true };
        const out = {};
        for (const st of STAGES) {
          startRun('nurse', st.id);
          const seen = [];
          for (const ev of EVENTS.filter((e) => e.type === 'boss')) {
            runEvent('boss', ev.t / 60);
            seen.push(enemies[enemies.length - 1].type);
          }
          out[st.id] = seen.join(',');
        }
        return out;
      });
      t.eq(r.ward, 'superbug,superbug', 'ward');
      t.eq(r.lab, 'superbug,motherCulture', 'lab');
    }
  },
  {
    name: 'all enemy types survive 30 s of combat on the hardest stage',
    fn(t) {
      const g = t.game({ seed: 8 });
      const r = g.run(() => {
        Save.data.stagesCleared = { ward: true, lab: true, morgue: true };
        Save.data.settings.autoTarget = true;
        startRun('nurse', 'quarantine');
        for (const type of Object.keys(ENEMIES)) {
          if (ENEMIES[type].final) continue;
          enemies.push(makeEnemy(type, player.x + rand(-300, 300), player.y + rand(-300, 300), { elite: Math.random() < 0.3 }));
        }
        const b = __bot({ frames: 60 * 30, keepAlive: 'full' });
        return { kills: b.kills, types: Object.keys(Save.data.codex.enemy).sort().join(',') };
      });
      t.log(`kills ${r.kills}, codex: ${r.types}`);
      t.ok(r.kills > 20, 'combat works');
    }
  }
];
