'use strict';

// Achievements, unlocks and stages.

module.exports = [
  {
    name: 'achievements unlock content and gold',
    fn(t) {
      const g = t.game();
      const r = g.run(() => {
        const out = {};
        startRun('nurse'); player.hp = -1; for (let i = 0; i < 200; i++) update();
        out.firstDose = !!Save.data.achievements.firstDose;
        out.goldAfterFirst = Save.data.gold;
        for (let i = 0; i < 4; i++) { startRun('nurse'); player.hp = -1; for (let j = 0; j < 200; j++) update(); }
        out.revive = !!Save.data.shopUnlocked.revive;
        startRun('nurse');
        for (const p of PASSIVES.slice(0, 6)) { player.passives[p.id] = 1; player.passiveOrder.push(p.id); }
        recomputeStats(); for (let i = 0; i < 31; i++) update();
        out.hypo = !!Save.data.chars.hypochondriac;
        startRun('nurse'); for (let i = 0; i < 25; i++) applyTempPill(TEMP_PILLS[i % 5]); for (let i = 0; i < 31; i++) update();
        out.addict = !!Save.data.chars.addict;
        out.cocktail = !!Save.data.achievements.cocktail;
        return out;
      });
      t.ok(r.firstDose, 'First Dose after first run');
      t.ok(r.goldAfterFirst >= 50, 'gold reward paid');
      t.ok(r.revive, '5 deaths unlock revive in the pharmacy');
      t.ok(r.hypo, 'Polypharmacy unlocks the Hypochondriac');
      t.ok(r.addict, '25 pills unlock the Addict');
      t.ok(r.cocktail, '4 pills at once unlocks Cocktail');
    }
  },
  {
    name: 'killing a boss after game over does not count as a win',
    fn(t) {
      const g = t.game();
      const r = g.run(() => {
        startRun('nurse');
        const boss = makeEnemy(game.stage.final, player.x + 300, player.y);
        enemies.push(boss);
        player.hp = -1;
        for (let i = 0; i < 200; i++) update();
        damageEnemy(boss, 1e9, 0, 0);
        return { victory: game.victory, cured: !!Save.data.achievements.cured, cleared: !!Save.data.stagesCleared.ward };
      });
      t.ok(!r.victory && !r.cured && !r.cleared, 'no victory, achievement or stage clear');
    }
  },
  {
    name: 'stages unlock in order',
    fn(t) {
      const g = t.game();
      const r = g.run(() => {
        const open = () => STAGES.filter((s, i) => UI.stageUnlocked(i)).map((s) => s.id).join();
        const out = [open()];
        for (const st of STAGES) { Save.data.stagesCleared[st.id] = true; out.push(open()); }
        return out;
      });
      t.eq(r[0], 'ward', 'only the ward at start');
      t.eq(r[1], 'ward,lab', 'ward clear unlocks lab');
      t.eq(r[3], 'ward,lab,morgue,quarantine', 'all unlocked in the end');
    }
  },
  {
    name: 'final boss spawns even when the enemy cap is full (regression)',
    fn(t) {
      const g = t.game();
      const r = g.run(() => {
        const out = {};
        for (const st of STAGES) {
          startRun('nurse', st.id);
          for (let i = 0; i < MAX_ENEMIES + 20; i++) enemies.push(makeEnemy('germ', player.x + 2000 + i, player.y));
          game.eventIdx = EVENTS.findIndex((e) => e.type === 'final');
          game.time = RUN_SECONDS * 60 - 1;
          update();
          out[st.id] = enemies.some((e) => e.type === st.final);
        }
        return out;
      });
      for (const [id, ok] of Object.entries(r)) t.ok(ok, `${id}: final boss spawned at full cap`);
    }
  },
  {
    name: 'later stages are harder and pay more',
    fn(t) {
      const g = t.game();
      const r = g.run(() => STAGES.map((st) => {
        startRun('nurse', st.id);
        const e = makeEnemy('germ', 0, 0);
        return { id: st.id, hp: e.hp, dmg: e.dmg, gold: st.goldMult };
      }));
      for (let i = 1; i < r.length; i++) {
        t.ok(r[i].hp > r[i - 1].hp, `${r[i].id} enemies tougher than ${r[i - 1].id}`);
        t.ok(r[i].dmg > r[i - 1].dmg, `${r[i].id} enemies hit harder`);
        t.ok(r[i].gold > r[i - 1].gold, `${r[i].id} pays more gold`);
      }
    }
  },
  {
    name: 'full 10-minute run on every stage: final boss, victory, unlock chain',
    slow: true,
    fn(t) {
      const g = t.game({ seed: 11 });
      const res = g.run(() => {
        const out = [];
        Save.data.settings.autoTarget = true;
        for (const st of STAGES) {
          startRun('nurse', st.id);
          const b = __bot({ untilTime: RUN_SECONDS + 5, frames: 60 * 1000, keepAlive: 'full', render: 8 });
          const boss = enemies.find((e) => e.def.final);
          const bossHp = boss ? Math.round(boss.maxHp) : 0;
          if (boss) damageEnemy(boss, 1e9, 0, 0);
          for (let i = 0; i < 400 && game.state !== State.GAMEOVER; i++) {
            if (game.state === State.LEVELUP) chooseOption(0);
            player.hp = stats.maxHp;
            update();
          }
          out.push({ id: st.id, bossFound: !!boss, bossHp, victory: game.victory, state: game.state,
            unlocked: game.unlockedStage && game.unlockedStage.id, maxEnemies: b.maxEnemies, level: game.level });
        }
        return out;
      });
      t.log(res.map((r) => `${r.id}: boss HP ${r.bossHp}, LV ${r.level}, max enemies ${r.maxEnemies}`).join(' | '));
      const next = ['lab', 'morgue', 'quarantine', null];
      res.forEach((r, i) => {
        t.ok(r.bossFound, `${r.id}: final boss appeared`);
        t.ok(r.victory && r.state === 'GAMEOVER', `${r.id}: victory`);
        t.eq(r.unlocked || null, next[i], `${r.id}: unlocks next stage`);
        t.ok(r.maxEnemies <= 440, `${r.id}: enemy count stays capped (${r.maxEnemies})`);
      });
    }
  }
];
