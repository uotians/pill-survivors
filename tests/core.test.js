'use strict';

// Boot, save data and UI screens.

const SAVE_KEY = 'pillSurvivorsSave_v1';

module.exports = [
  {
    name: 'boots to the main menu',
    fn(t) {
      const g = t.game();
      t.eq(g.run(() => game.state), 'MENU', 'initial state');
      t.ok(!g.el('menuScreen').classList.contains('hidden'), 'menu screen visible');
      g.run(() => { for (let i = 0; i < 30; i++) render(); });
    }
  },
  {
    name: 'fresh save has sane defaults',
    fn(t) {
      const g = t.game();
      const d = g.run(() => Save.data);
      t.eq(d.gold, 0, 'gold');
      t.ok(d.chars.nurse, 'nurse unlocked');
      t.ok(!d.chars.hypochondriac && !d.chars.addict, 'achievement characters locked');
      t.eq(d.settings.mouseAim, true, 'mouse aim default');
      t.eq(d.settings.autoTarget, false, 'auto-target default');
      for (const c of ['weapon', 'evolution', 'passive', 'pill', 'enemy']) t.ok(d.codex[c], `codex.${c} exists`);
    }
  },
  {
    name: 'legacy save migrates without losing progress',
    fn(t) {
      const legacy = { gold: 321, shop: { vitality: 2 }, chars: { nurse: true, surgeon: true }, settings: { aim: 'auto' } };
      const g = t.game({ storage: { [SAVE_KEY]: JSON.stringify(legacy) } });
      const d = g.run(() => Save.data);
      t.eq(d.gold, 321, 'gold kept');
      t.eq(d.shop.vitality, 2, 'shop kept');
      t.ok(d.chars.surgeon, 'unlocked character kept');
      t.eq(d.settings.mouseAim, false, 'old auto aim -> mouseAim off');
      t.eq(d.settings.autoTarget, true, 'old auto aim -> autoTarget on');
      t.ok(!('aim' in d.settings), 'old aim key removed');
      t.ok(d.stats && d.achievements && d.stagesCleared, 'new sections added');
    }
  },
  {
    name: 'corrupted save falls back to defaults',
    fn(t) {
      const g = t.game({ storage: { [SAVE_KEY]: '{not json' } });
      t.eq(g.run(() => Save.data.gold), 0, 'defaults used');
    }
  },
  {
    name: 'every screen renders and only uses ids that exist in index.html',
    fn(t) {
      const g = t.game();
      g.run(() => {
        UI.openCharSelect();
        UI.openShop();
        UI.openAchievements();
        UI.openSettings('menu');
        UI.openCodex();
        for (const tab of CODEX_TABS) {
          UI.codexTab = tab.id;
          for (const item of tab.items()) { UI.codexSel = item.id; UI.renderCodex(); }
        }
        UI.openMenu();
        startRun('nurse');
        UI.updateHud();
        UI.pause();
        UI.resume();
        openLevelUp('level');
        chooseOption(0);
        player.hp = -1;
        for (let i = 0; i < 200 && game.state !== State.GAMEOVER; i++) update();
      });
      t.eq(g.run(() => game.state), 'GAMEOVER', 'reached game over');
      t.eq([...g.missingIds].join(','), '', 'getElementById used ids missing from index.html');
    }
  },
  {
    name: 'menu keyboard navigation',
    fn(t) {
      const g = t.game();
      const screen = () => g.run(() => UI.screen);
      g.key('Enter'); t.eq(screen(), 'char', 'Enter -> character select');
      g.key('Escape'); t.eq(screen(), 'menu', 'Esc -> menu');
      g.key('KeyS'); t.eq(screen(), 'shop', 'S -> shop');
      g.key('Escape');
      g.key('KeyE'); t.eq(screen(), 'codex', 'E -> encyclopedia');
      g.key('ArrowRight'); t.eq(g.run(() => UI.codexTab), 'evolution', 'arrow switches codex tab');
      g.key('Escape');
      g.key('KeyA'); t.eq(screen(), 'achievements', 'A -> achievements');
      g.key('Escape');
      g.key('KeyO'); t.eq(screen(), 'settings', 'O -> settings');
      g.key('Escape'); t.eq(screen(), 'menu', 'back to menu');
      g.key('Enter'); g.key('Enter');
      t.eq(g.run(() => game.state), 'PLAYING', 'Enter twice starts a run');
    }
  },
  {
    name: 'pharmacy purchase spends gold and persists',
    fn(t) {
      const g = t.game();
      const r = g.run(() => {
        Save.data.gold = 1000;
        UI.openShop();
        const item = SHOP[0];
        const cost = item.cost;
        // emulate the buy button handler
        Save.data.gold -= cost;
        Save.data.shop[item.id] = 1;
        Save.save();
        return { gold: Save.data.gold, cost };
      });
      t.eq(r.gold, 1000 - r.cost, 'gold deducted');
      const stored = JSON.parse(g.storage[SAVE_KEY]);
      t.eq(stored.shop.vitality, 1, 'purchase persisted');
    }
  }
  ,
  {
    name: 'index.html version matches GAME_VERSION on the meta tag and every asset URL',
    fn(t) {
      const fs = require('fs');
      const path = require('path');
      const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
      const g = t.game();
      const v = g.run(() => GAME_VERSION);
      const meta = (html.match(/<meta name="game-version" content="([^"]*)"/) || [])[1];
      t.eq(meta, v, 'meta game-version');
      const assets = [...html.matchAll(/(?:src|href)="((?:js\/[^"]+\.js|style\.css)[^"]*)"/g)].map((m) => m[1]);
      t.ok(assets.length >= 10, `found ${assets.length} assets`);
      for (const a of assets) t.ok(a.endsWith('?v=' + v), `${a} carries ?v=${v}`);
    }
  },
  {
    name: 'a missing element (stale cached index.html) does not crash the menu or a run',
    fn(t) {
      const g = t.game();
      const r = g.run(() => {
        const real = document.getElementById;
        document.getElementById = (id) => (['menuVersion', 'gearSlots', 'luBanished'].includes(id) ? null : real.call(document, id));
        try {
          UI.openMenu();
          startRun('nurse');
          __bot({ frames: 120 });
          openLevelUp('level');
          return game.state;
        } finally { document.getElementById = real; }
      });
      t.eq(r, 'LEVELUP', 'still playable');
    }
  }
  ,
  {
    name: 'touch joystick moves the player (analog, no keyboard)',
    fn(t) {
      const g = t.game();
      const r = g.run(() => {
        startRun('nurse');
        const x0 = player.x, y0 = player.y;
        Object.assign(touchStick, { active: true, x: 1, y: 0 });
        for (let i = 0; i < 60; i++) update();
        const full = player.x - x0;
        const x1 = player.x;
        Object.assign(touchStick, { x: 0.4, y: 0 });
        for (let i = 0; i < 60; i++) update();
        const half = player.x - x1;
        Object.assign(touchStick, { active: false, x: 0, y: 0 });
        return { full, half, dy: Math.abs(player.y - y0) };
      });
      t.ok(r.full > 100, `moved right with the stick (${Math.round(r.full)} px)`);
      t.ok(r.half > 10 && r.half < r.full * 0.7, `partial tilt moves slower (${Math.round(r.half)} px)`);
      t.ok(r.dy < 5, 'no vertical drift');
    }
  }
];
