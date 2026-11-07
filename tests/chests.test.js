'use strict';

// Chests: elites drop small ones, mini-bosses big ones, the final boss none.
// Chests hold gear, supplies, antidotes and evolutions, never weapons or prescriptions.

module.exports = [
  {
    name: 'elites drop small chests, mini-bosses big chests, the final boss nothing',
    fn(t) {
      const g = t.game();
      const r = g.run(() => {
        startRun('nurse');
        const tiers = (type, opts) => {
          pickups = [];
          const e = spawnEnemy(type, opts);
          damageEnemy(e, 1e9, 0, 0);
          return pickups.filter((p) => p.type === 'chest').map((p) => p.tier);
        };
        return { elite: tiers('germ', { elite: true }), boss: tiers('superbug'), final: tiers('patientZero') };
      });
      t.eq(r.elite.join(), 'small', 'elite: one small chest');
      t.eq(r.boss.join(), 'big', 'mini-boss: one big chest');
      t.eq(r.final.length, 0, 'final boss: no chest');
    }
  },
  {
    name: 'chest contents: gear, supplies, antidote, evolution; no weapons or prescriptions',
    fn(t) {
      const g = t.game({ seed: 2 });
      const r = g.run(() => {
        startRun('nurse');
        applyChoice({ kind: 'passive', def: PASSIVE_BY_ID.steroids, level: 1 });
        game.levelUpSource = 'chest';
        const kinds = { small: {}, big: {} };
        let bad = 0, dup = 0, commonInBig = 0, rareInSmall = 0, noAntidote = 0;
        for (const tier of ['small', 'big']) {
          game.chestTier = tier;
          for (let i = 0; i < 300; i++) {
            const c = buildChoices();
            const keys = c.map((x) => x.kind + ':' + x.def.id);
            if (new Set(keys).size !== keys.length) dup++;
            if (c.length !== 3) bad++;
            for (const x of c) {
              kinds[tier][x.kind] = (kinds[tier][x.kind] || 0) + 1;
              if (x.kind === 'weapon' || x.kind === 'passive') bad++;
              if (tier === 'big' && x.kind === 'gear' && x.def.rarity !== 'rare') commonInBig++;
              if (tier === 'small' && x.kind === 'gear' && x.def.rarity !== 'common') rareInSmall++;
            }
            if (tier === 'big' && !c.some((x) => x.kind === 'antidote')) noAntidote++;
          }
        }
        // evolution ready -> big chest leads with it
        const w = getWeapon('pistol'); w.level = w.def.max;
        applyChoice({ kind: 'passive', def: PASSIVE_BY_ID.cloning, level: 1 });
        game.chestTier = 'big';
        const evoFirst = buildChoices()[0];
        return { kinds, bad, dup, commonInBig, rareInSmall, noAntidote, evo: evoFirst.kind + ':' + evoFirst.def.id };
      });
      t.log('small: ' + JSON.stringify(r.kinds.small) + ' big: ' + JSON.stringify(r.kinds.big));
      t.eq(r.bad, 0, 'always 3 cards, never weapons or prescriptions');
      t.eq(r.dup, 0, 'no duplicate cards');
      t.ok(r.kinds.small.gear > 0 && r.kinds.small.supply > 0, 'small chest: gear and supplies');
      t.eq(r.rareInSmall, 0, 'small chest: only common gear');
      t.ok(r.kinds.big.gear > 0 && r.kinds.big.antidote > 0, 'big chest: rare gear and antidotes');
      t.eq(r.commonInBig, 0, 'big chest: rare gear only (while rares are left)');
      t.eq(r.noAntidote, 0, 'big chest always offers an antidote when a prescription can be cured');
      t.eq(r.evo, 'evolution:pillstorm', 'big chest leads with a ready evolution');
    }
  },
  {
    name: 'gear applies stats and replaces the item in its slot; Crash Cart Key revives once',
    fn(t) {
      const g = t.game();
      const r = g.run(() => {
        startRun('nurse');
        const hp0 = stats.maxHp;
        applyChoice({ kind: 'gear', def: GEAR_BY_ID.labcoat });
        const hp1 = stats.maxHp;
        applyChoice({ kind: 'gear', def: GEAR_BY_ID.hazmatsuit }); // same slot
        const hp2 = stats.maxHp;
        const bodyItem = player.gear.body;
        const rev0 = game.revives;
        applyChoice({ kind: 'gear', def: GEAR_BY_ID.cartkey });
        const rev1 = game.revives;
        applyChoice({ kind: 'gear', def: GEAR_BY_ID.pager });
        applyChoice({ kind: 'gear', def: GEAR_BY_ID.cartkey });
        const rev2 = game.revives;
        const keyOffered = gearOptions('rare').some((x) => x.id === 'cartkey');
        return { hp0, hp1, hp2, bodyItem, rev0, rev1, rev2, keyOffered };
      });
      t.eq(r.hp1 - r.hp0, 20, 'Lab Coat +20 max HP');
      t.eq(r.hp2 - r.hp0, 40, 'Hazmat Suit replaced Lab Coat (+40, not +60)');
      t.eq(r.bodyItem, 'hazmatsuit', 'body slot holds the new item');
      t.eq(r.rev1 - r.rev0, 1, 'Crash Cart Key gives a revive');
      t.eq(r.rev2, r.rev1, 'and only once per run');
      t.ok(!r.keyOffered, 'used key is not offered again');
    }
  },
  {
    name: 'antidote removes a prescription side effect but keeps the buff',
    fn(t) {
      const g = t.game();
      const r = g.run(() => {
        startRun('nurse');
        const base = { might: stats.might, size: stats.size };
        applyChoice({ kind: 'passive', def: PASSIVE_BY_ID.steroids, level: 1 });
        const before = { might: stats.might, size: stats.size };
        applyChoice({ kind: 'antidote', def: PASSIVE_BY_ID.steroids });
        const after = { might: stats.might, size: stats.size };
        game.levelUpSource = 'chest'; game.chestTier = 'big';
        let reoffered = 0;
        for (let i = 0; i < 100; i++) if (buildChoices().some((c) => c.kind === 'antidote')) reoffered++;
        return { base, before, after, reoffered };
      });
      t.ok(r.before.size > r.base.size, 'steroids made you bigger');
      t.eq(r.after.size, r.base.size, 'antidote: back to normal size');
      t.eq(r.after.might, r.before.might, 'antidote: might buff kept');
      t.eq(r.reoffered, 0, 'cured prescription is not offered again');
    }
  }
];
