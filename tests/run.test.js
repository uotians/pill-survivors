'use strict';

// Core run loop: playing, dying, reviving, pausing, aiming.

module.exports = [
  {
    name: '3-minute run plays without errors and progresses',
    fn(t) {
      const g = t.game({ seed: 3 });
      const r = g.run(() => {
        Save.data.settings.autoTarget = true;
        startRun('nurse');
        return __bot({ untilTime: 180, frames: 60 * 300, keepAlive: true });
      });
      t.log(`time ${r.time / 60 | 0}s, level ${r.level}, kills ${r.kills}, max enemies ${r.maxEnemies}`);
      t.ok(r.time >= 180 * 60, 'reached 3:00');
      t.ok(r.level >= 4, 'levelled up a few times');
      t.ok(r.kills > 100, 'killed enemies');
    }
  },
  {
    name: 'death plays the overdose animation, then game over',
    fn(t) {
      const g = t.game();
      const r = g.run(() => {
        startRun('nurse');
        __bot({ frames: 60 });
        player.hp = -1;
        update();
        const dyingStart = game.dying;
        const banner = game.banner && game.banner.text;
        let frames = 0;
        let midFilter = '';
        while (game.state === State.PLAYING && frames < 400) {
          update(); render(); frames++;
          if (frames === 75) midFilter = canvas.style.filter;
        }
        return { dyingStart, banner, frames, state: game.state, midFilter, endFilter: canvas.style.filter, deaths: Save.data.stats.deaths };
      });
      t.eq(r.dyingStart, 150, 'dying timer started');
      t.eq(r.banner, 'OVERDOSE', 'overdose banner');
      t.eq(r.frames, 150, 'animation length');
      t.eq(r.state, 'GAMEOVER', 'ends in game over');
      t.ok(r.midFilter.includes('hue-rotate'), 'colour distortion during animation');
      t.eq(r.endFilter, '', 'filter cleared afterwards');
      t.eq(r.deaths, 1, 'death counted');
    }
  },
  {
    name: 'revive skips death and uses up the charge',
    fn(t) {
      const g = t.game();
      const r = g.run(() => {
        Save.data.shop.revive = 1;
        Save.data.shopUnlocked.revive = true;
        startRun('nurse');
        const before = game.revives;
        update();
        player.hp = -1;
        update();
        return { before, after: game.revives, state: game.state, dying: game.dying, hp: player.hp };
      });
      t.eq(r.before, 1, 'revive available');
      t.eq(r.after, 0, 'revive consumed');
      t.eq(r.state, 'PLAYING', 'still playing');
      t.eq(r.dying, 0, 'no death animation');
      t.ok(r.hp > 0, 'hp restored');
    }
  },
  {
    name: 'pause freezes time and resume continues',
    fn(t) {
      const g = t.game();
      g.run(() => { startRun('nurse'); __bot({ frames: 30 }); });
      g.key('KeyP');
      const paused = g.run(() => { const t0 = game.time; for (let i = 0; i < 60; i++) update(); return { state: game.state, dt: game.time - t0 }; });
      t.eq(paused.state, 'PAUSED', 'paused');
      t.eq(paused.dt, 0, 'time frozen');
      g.key('KeyP');
      t.eq(g.run(() => game.state), 'PLAYING', 'resumed');
    }
  },
  {
    name: 'retry after game over restarts on the same stage and character',
    fn(t) {
      const g = t.game();
      g.run(() => { Save.data.chars.surgeon = true; UI.selectedChar = 'surgeon'; startRun('surgeon'); player.hp = -1; for (let i = 0; i < 200; i++) update(); UI.inputGuardUntil = 0; });
      g.key('KeyR');
      const r = g.run(() => ({ state: game.state, char: game.char.id, time: game.time }));
      t.eq(r.state, 'PLAYING', 'new run started');
      t.eq(r.char, 'surgeon', 'same character');
    }
  },
  {
    name: 'aim modes fire in the expected direction',
    fn(t) {
      const g = t.game({ seed: 5 });
      // Cursor fixed to the right of the player (angle 0). Pill Popper only.
      const combos = [[true, false], [false, true], [true, true], [false, false]];
      const res = {};
      for (const [m, a] of combos) {
        res[`${m}/${a}`] = g.run((mouseAim, autoTarget) => {
          Save.data.settings.mouseAim = mouseAim;
          Save.data.settings.autoTarget = autoTarget;
          startRun('nurse');
          let shots = 0;
          let right = 0;
          for (let f = 0; f < 60 * 40; f++) {
            mouse.x = W / 2 + 300; mouse.y = H / 2;
            const ph = Math.floor(f / 90) % 4;
            keys.KeyD = ph === 0; keys.KeyS = ph === 1; keys.KeyA = ph === 2; keys.KeyW = ph === 3;
            if (game.state === State.LEVELUP) { game.pendingLevels = 0; game.state = State.PLAYING; UI.hideLevelUp(); }
            player.hp = stats.maxHp;
            const n = projectiles.length;
            update();
            for (let i = n; i < projectiles.length; i++) { shots++; if (Math.abs(projectiles[i].angle) < 0.5) right++; }
          }
          return { shots, right: shots ? right / shots : 0 };
        }, m, a);
      }
      t.log(Object.entries(res).map(([k, v]) => `mouse/auto ${k}: ${v.shots} shots, ${(v.right * 100) | 0}% toward cursor`).join(' | '));
      t.ok(res['true/false'].right > 0.95, 'mouse aim: shots go to the cursor');
      t.ok(res['false/true'].right < 0.6, 'auto-target: shots follow enemies, not the cursor');
      t.ok(res['true/true'].right < 0.9 && res['true/true'].shots > 0, 'both: mostly enemies, cursor as fallback');
      t.ok(res['false/false'].right < 0.6, 'neither: movement direction');
    }
  },
  {
    name: 'hitstop freezes simulation briefly',
    fn(t) {
      const g = t.game();
      const r = g.run(() => {
        startRun('nurse');
        update();
        hurtPlayer(10, player.x + 5, player.y);
        const hs = game.hitstop;
        const t0 = game.time;
        for (let i = 0; i < 10; i++) update();
        return { hs, advanced: game.time - t0 };
      });
      t.eq(r.hs, 3, 'hitstop on hurt');
      t.eq(r.advanced, 7, '3 of 10 frames frozen');
    }
  }
];
