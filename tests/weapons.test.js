'use strict';

// Homing Syringe, Bandage Whip, Ultrasound and their evolutions.

const SETUP = `
  globalThis.__solo = (weaponId, level) => {
    startRun('nurse');
    player.weapons = [];
    addWeapon(weaponId);
    getWeapon(weaponId).level = level || 1;
    for (const w of player.weapons) w.timer = 1;
  };
  globalThis.__dummy = (x, y, type) => {
    const e = makeEnemy(type || 'virus', player.x + x, player.y + y);
    e.hp = e.maxHp = 1e6; e.speed = 0;
    enemies.push(e);
    return e;
  };
`;

module.exports = [
  {
    name: 'Homing Syringe curves toward an enemy behind the aim',
    fn(t) {
      const g = t.game();
      g.run(new Function(SETUP));
      const r = g.run(() => {
        Save.data.settings.mouseAim = true;
        __solo('syringe', 1);
        mouse.x = W / 2 + 300; mouse.y = H / 2;   // aim right
        const target = __dummy(0, -250);          // enemy straight up
        let hit = false;
        for (let i = 0; i < 120 && !hit; i++) { player.hp = stats.maxHp; update(); hit = target.hp < target.maxHp; }
        return { hit };
      });
      t.ok(r.hit, 'needle turned and hit an enemy 90° off the aim');
    }
  },
  {
    name: 'Bandage Whip hits the aimed side, then both sides',
    fn(t) {
      const g = t.game();
      g.run(new Function(SETUP));
      const r = g.run(() => {
        Save.data.settings.mouseAim = true;
        const out = {};
        for (const L of [1, 2]) {
          __solo('whip', L);
          mouse.x = W / 2 + 300; mouse.y = H / 2;
          const right = __dummy(90, 0);
          const left = __dummy(-90, 0);
          const far = __dummy(0, 140);
          for (let i = 0; i < 30; i++) { player.hp = stats.maxHp; update(); }
          out['L' + L] = { right: right.hp < right.maxHp, left: left.hp < left.maxHp, far: far.hp < far.maxHp, slashes: slashes.length };
        }
        return out;
      });
      t.ok(r.L1.right && !r.L1.left, 'level 1: only the aimed side');
      t.ok(r.L2.right && r.L2.left, 'level 2: both sides');
      t.ok(!r.L1.far && !r.L2.far, 'does not hit outside the lash');
    }
  },
  {
    name: 'Ultrasound hits each enemy once per wave and pushes it back',
    fn(t) {
      const g = t.game();
      g.run(new Function(SETUP));
      const r = g.run(() => {
        __solo('wave', 1);
        const e = __dummy(100, 0);
        const x0 = e.x;
        for (let i = 0; i < 40; i++) { player.hp = stats.maxHp; update(); }
        return { dmg: e.maxHp - e.hp, single: WEAPON_BY_ID.wave.base(1).dmg, pushed: e.x - x0 };
      });
      t.between(r.dmg, r.single * 0.99, r.single * 2.01, 'hit once (crit allowed)');
      t.ok(r.pushed > 2, `pushed away (${r.pushed.toFixed(1)} px)`);
    }
  },
  {
    name: 'evolutions: Mass Vaccination vs elites, Tourniquet heals, Lullaby stuns',
    fn(t) {
      const g = t.game();
      g.run(new Function(SETUP));
      const r = g.run(() => {
        const evolve = (evId) => {
          const ev = EVOLUTION_BY_ID[evId];
          __solo(ev.from, 5);
          player.passives[ev.requires] = 1; player.passiveOrder.push(ev.requires);
          evolveWeapon(ev); recomputeStats();
          game.hitstop = 0; // evolving freezes the game for a moment
          for (const w of player.weapons) w.timer = 1;
          return ev;
        };
        const out = {};
        Save.data.settings.mouseAim = true;
        // Mass Vaccination: same needle, elite takes double
        evolve('massvax');
        out.maxHp = stats.maxHp;
        const p = { dmg: 10, eliteMult: 2 };
        out.eliteMult = EVOLUTION_BY_ID.massvax.eliteMult;
        // Tourniquet lifesteal
        evolve('tourniquet');
        mouse.x = W / 2 + 300; mouse.y = H / 2;
        for (let i = 0; i < 5; i++) __dummy(80, (i - 2) * 10, 'germ');
        player.hp = 50;
        for (let i = 0; i < 12; i++) update();
        out.healed = player.hp > 50;
        out.dmgTaken = stats.dmgTaken;
        // Lullaby stun
        evolve('lullaby');
        const e = makeEnemy('germ', player.x + 120, player.y); e.hp = e.maxHp = 1e6; enemies.push(e);
        for (let i = 0; i < 20; i++) { player.hp = stats.maxHp; update(); }
        out.stunned = e.stunUntil > game.time;
        // A stunned enemy may drift from knockback, but must not walk toward the player.
        const d0 = Math.hypot(e.x - player.x, e.y - player.y);
        for (let i = 0; i < 20; i++) { player.hp = stats.maxHp; update(); }
        out.stayed = Math.hypot(e.x - player.x, e.y - player.y) >= d0 - 2;
        out.drowsy = stats.drowsy;
        return out;
      });
      t.eq(r.maxHp, 120 - 5 - 10, 'Mass Vaccination: -10 max HP (plus Booster -5)');
      t.eq(r.eliteMult, 2, 'double damage vs elites');
      t.ok(r.healed, 'Tourniquet heals on hit');
      t.between(r.dmgTaken, 1.26, 1.28, 'Tourniquet +15% damage taken (plus Blood Thinner)');
      t.ok(r.stunned, 'Lullaby stuns');
      t.ok(r.stayed, 'stunned enemy does not chase');
      t.eq(r.drowsy, 3, 'Lullaby adds drowsiness on top of Melatonin');
    }
  }
];
