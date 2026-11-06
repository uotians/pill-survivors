'use strict';

/* =========================================================================
   UI — DOM screens (menu, character select, pharmacy, level-up, pause,
   game over), HUD, keyboard routing.
   ========================================================================= */

const $ = (id) => document.getElementById(id);

const CODEX_TABS = [
  { id: 'weapon',  label: 'Weapons',       items: () => WEAPONS,     hint: 'Acquire this weapon during a run to unlock its entry.', countLabel: 'Acquired' },
  { id: 'evolution', label: 'Evolutions',  items: () => EVOLUTIONS,  hint: 'Combine a max-level weapon with the right prescription.', countLabel: 'Synthesized' },
  { id: 'passive', label: 'Prescriptions', items: () => PASSIVES,    hint: 'Take this prescription during a run to unlock its entry.', countLabel: 'Prescribed' },
  { id: 'pill',    label: 'Pills',         items: () => TEMP_PILLS,  hint: 'Swallow one during a run to unlock its entry.', countLabel: 'Swallowed' },
  { id: 'enemy',   label: 'Pathogens',     items: () => ENEMY_LIST,  hint: 'Defeat one to study it.', countLabel: 'Killed' }
];

const SETTINGS = [
  { key: 'mouseAim',   name: 'Mouse aim',                desc: 'Aimed weapons (Pill Popper, Scalpel Fan, Acid Flask) fire toward the cursor.' },
  { key: 'autoTarget', name: 'Auto-target nearest enemy', desc: 'Aimed weapons lock on to the closest enemy. If mouse aim is also on, the cursor is used whenever nothing is in range.' },
  { key: 'sound',      name: 'Sound effects',            desc: 'Hits, pickups and explosions. Shortcut: M' },
  { key: 'music',      name: 'Music',                    desc: 'Procedural chiptune soundtrack that reacts to bosses and low HP.' },
  { key: 'shake',      name: 'Screen shake',             desc: 'Camera shake from hits and explosions.' }
];

const WEAPON_STAT_LABELS = [
  ['dmg', 'DMG', (v) => v],
  ['amount', 'AMOUNT', (v) => v],
  ['cd', 'COOLDOWN', (v) => (v / 60).toFixed(2) + 's'],
  ['pierce', 'PIERCE', (v) => v],
  ['radius', 'AREA', (v) => v],
  ['chains', 'CHAINS', (v) => v],
  ['dur', 'DURATION', (v) => (v / 60).toFixed(1) + 's']
];

const UI = {
  screen: 'menu',          // which menu overlay is open while in State.MENU
  selectedChar: 'nurse',
  inputGuardUntil: 0,      // ignore choices briefly after a screen opens
  hudBuildVersion: -1,
  badgeEls: new Map(),
  resetArmed: false,
  codexTab: 'weapon',
  codexSel: null,

  init() {
    this.selectedChar = Save.data.selectedChar || 'nurse';
    this.selectedStage = Save.data.selectedStage || 'ward';
    if (!this.stageUnlocked(STAGES.findIndex((s) => s.id === this.selectedStage))) this.selectedStage = 'ward';

    $('playBtn').onclick = () => this.openCharSelect();
    $('shopBtn').onclick = () => this.openShop();
    $('charBack').onclick = () => this.openMenu();
    $('charStart').onclick = () => this.startSelected();
    $('shopBack').onclick = () => this.openMenu();
    $('resetBtn').onclick = () => this.resetProgress();
    $('rerollBtn').onclick = () => rerollChoices();
    $('resumeBtn').onclick = () => this.resume();
    $('quitBtn').onclick = () => this.openMenu();
    $('retryBtn').onclick = () => startRun(this.selectedChar, this.selectedStage);
    $('menuBtn').onclick = () => this.openMenu();
    $('codexBtn').onclick = () => this.openCodex();
    $('codexBack').onclick = () => this.openMenu();
    $('achBtn').onclick = () => this.openAchievements();
    $('achBack').onclick = () => this.openMenu();
    $('settingsBtn').onclick = () => this.openSettings('menu');
    $('pauseSettingsBtn').onclick = () => this.openSettings('pause');
    $('settingsBack').onclick = () => this.closeSettings();

    // Buttons keep focus after click; blur them so Space/Enter don't re-trigger.
    document.addEventListener('click', (e) => {
      if (e.target.closest('button')) setTimeout(() => document.activeElement && document.activeElement.blur(), 0);
    });

    this.openMenu();
  },

  // --------------------------------------------------------- Screens --
  hideAll() {
    for (const id of ['menuScreen', 'charScreen', 'shopScreen', 'codexScreen', 'achievementsScreen', 'settingsScreen', 'levelUpScreen', 'pauseScreen', 'gameOverScreen']) {
      $(id).classList.add('hidden');
    }
  },

  openMenu() {
    Save.save(); // persists encyclopedia counters from an abandoned run too
    game.state = State.MENU;
    this.screen = 'menu';
    this.hideAll();
    $('hud').classList.add('hidden');
    $('menuScreen').classList.remove('hidden');
    $('menuGold').textContent = Save.data.gold;
    const b = Save.data.best;
    $('menuBest').textContent = Save.data.runs
      ? `Best: ${fmtTime(b.time * 60)} survived · ${b.kills} kills · LV ${b.level} · ${Save.data.wins} cure${Save.data.wins === 1 ? '' : 's'}`
      : 'No runs yet. The ward awaits.';
    const unseen = this.unseenCount();
    $('codexBtn').innerHTML = `ENCYCLOPEDIA <small>[E]</small>${unseen ? ` <span class="new-count">${unseen} new</span>` : ''}`;
    $('achBtn').innerHTML = `ACHIEVEMENTS <small>[A]</small> <span class="count-pill">${Achievements.count()}/${ACHIEVEMENTS.length}</span>`;
  },

  // -------------------------------------------------------- Settings --
  openSettings(from) {
    this.settingsReturn = from;
    if (from === 'menu') this.screen = 'settings';
    this.hideAll();
    $('settingsScreen').classList.remove('hidden');
    this.renderSettings();
  },

  closeSettings() {
    if (this.settingsReturn === 'pause' && game.state === State.PAUSED) {
      this.hideAll();
      $('pauseScreen').classList.remove('hidden');
    } else {
      this.openMenu();
    }
  },

  toggleSetting(key) {
    const s = Save.data.settings;
    s[key] = !s[key];
    if (key === 'sound') { Sfx.muted = !s.sound; if (s.sound) { Sfx.init(); Sfx.coin(); } }
    if (key === 'shake' && !s.shake && game) game.screenshake = 0;
    Save.save();
    if (!$('settingsScreen').classList.contains('hidden')) this.renderSettings();
  },

  aimSummary() {
    const s = Save.data.settings;
    if (s.autoTarget && s.mouseAim) return 'Nearest enemy in range, otherwise the cursor.';
    if (s.autoTarget) return 'Nearest enemy. Weapons hold fire when nothing is in range.';
    if (s.mouseAim) return 'Toward the cursor.';
    return 'In the direction you are moving.';
  },

  renderSettings() {
    const list = $('settingsList');
    list.innerHTML = '';
    SETTINGS.forEach((opt, i) => {
      const on = !!Save.data.settings[opt.key];
      const row = document.createElement('div');
      row.className = 'setting-row';
      row.innerHTML = `<div><b>${opt.name}</b> <span class="key-inline">[${i + 1}]</span><div class="muted">${opt.desc}</div></div>`;
      const btn = document.createElement('button');
      btn.className = 'toggle' + (on ? ' on' : '');
      btn.textContent = on ? 'ON' : 'OFF';
      btn.onclick = () => this.toggleSetting(opt.key);
      row.appendChild(btn);
      list.appendChild(row);
    });
    $('aimSummary').textContent = this.aimSummary();
  },

  updateCursor() {
    document.body.classList.toggle('aiming', game.state === State.PLAYING && settings().mouseAim);
  },

  // ---------------------------------------------------- Encyclopedia --
  isKnown(cat, id) { return !!Save.data.codex[cat][id]; },
  isUnseen(cat, id) { return this.isKnown(cat, id) && !Save.data.codexSeen[cat + ':' + id]; },

  unseenCount(cat) {
    let n = 0;
    for (const tab of CODEX_TABS) {
      if (cat && tab.id !== cat) continue;
      for (const item of tab.items()) if (this.isUnseen(tab.id, item.id)) n++;
    }
    return n;
  },

  openCodex() {
    Sfx.init();
    this.screen = 'codex';
    this.codexSel = null;
    this.hideAll();
    $('codexScreen').classList.remove('hidden');
    this.renderCodex();
  },

  switchCodexTab(dir) {
    const idx = CODEX_TABS.findIndex((t) => t.id === this.codexTab);
    this.codexTab = CODEX_TABS[(idx + dir + CODEX_TABS.length) % CODEX_TABS.length].id;
    this.codexSel = null;
    this.renderCodex();
  },

  renderCodex() {
    let found = 0;
    let total = 0;
    for (const tab of CODEX_TABS) {
      for (const item of tab.items()) {
        total++;
        if (this.isKnown(tab.id, item.id)) found++;
      }
    }
    $('codexProgress').textContent = `${found} / ${total} entries discovered`;

    const tabsEl = $('codexTabs');
    tabsEl.innerHTML = '';
    for (const tab of CODEX_TABS) {
      const items = tab.items();
      const known = items.filter((i) => this.isKnown(tab.id, i.id)).length;
      const b = document.createElement('button');
      b.className = 'tab' + (tab.id === this.codexTab ? ' active' : '');
      b.innerHTML = `${tab.label} <small>${known}/${items.length}</small>` + (this.unseenCount(tab.id) ? ' <i class="dot-new"></i>' : '');
      b.onclick = () => { this.codexTab = tab.id; this.codexSel = null; this.renderCodex(); };
      tabsEl.appendChild(b);
    }

    const tab = CODEX_TABS.find((t) => t.id === this.codexTab);
    const items = tab.items();
    if (!this.codexSel) {
      const first = items.find((i) => this.isKnown(tab.id, i.id));
      this.codexSel = first ? first.id : items[0].id;
    }
    if (this.isKnown(tab.id, this.codexSel)) Save.data.codexSeen[tab.id + ':' + this.codexSel] = true;

    const grid = $('codexGrid');
    grid.innerHTML = '';
    for (const item of items) {
      const known = this.isKnown(tab.id, item.id);
      const tile = document.createElement('button');
      tile.className = 'codex-tile' + (known ? '' : ' locked') + (item.id === this.codexSel ? ' selected' : '') + (this.isUnseen(tab.id, item.id) ? ' unseen' : '');
      tile.style.setProperty('--c', item.color);
      tile.style.setProperty('--a', item.accent || '#ffffff');
      tile.innerHTML = (tab.id === 'enemy' ? '<canvas width="56" height="56"></canvas>' : '<span class="pill-icon big"></span>') +
        `<span class="tile-name">${known ? item.name : '???'}</span>`;
      tile.onclick = () => { this.codexSel = item.id; this.renderCodex(); };
      grid.appendChild(tile);
      if (tab.id === 'enemy') drawEnemyPortrait(tile.querySelector('canvas'), item);
    }

    const sel = items.find((i) => i.id === this.codexSel);
    $('codexDetail').innerHTML = this.codexDetailHtml(tab, sel);
    const portrait = $('codexDetail').querySelector('canvas');
    if (portrait) drawEnemyPortrait(portrait, sel);
    Save.save();
  },

  codexDetailHtml(tab, item) {
    const count = Save.data.codex[tab.id][item.id] || 0;
    const icon = tab.id === 'enemy'
      ? `<canvas class="cd-portrait${count ? '' : ' locked'}" width="112" height="112"></canvas>`
      : `<span class="pill-icon huge${count ? '' : ' locked'}" style="--c:${item.color};--a:${item.accent || '#ffffff'}"></span>`;
    if (!count) {
      return `<div class="cd-head">${icon}<div><div class="cd-name">???</div><div class="cd-kind">${tab.label}</div></div></div>` +
        `<p class="cd-hint">LOCKED: ${tab.id === 'evolution' ? this.evolutionHint(item) : tab.hint}</p>`;
    }
    const lore = LORE[`${tab.id}:${item.id}`] || '';
    let body = '';

    if (tab.id === 'weapon') {
      const rows = [1, 2, 3, 4, 5].map((L) => item.base(L));
      const cols = WEAPON_STAT_LABELS.filter(([k]) => rows[0][k] !== undefined);
      body += '<div class="table-wrap"><table class="cd-table"><tr><th>LV</th>' + cols.map((c) => `<th>${c[1]}</th>`).join('') + '<th>UPGRADE</th></tr>';
      rows.forEach((r, i) => {
        body += `<tr><td>${i + 1}</td>` + cols.map(([k, , f]) => `<td>${f(r[k])}</td>`).join('') + `<td class="lt">${item.levelText[i]}</td></tr>`;
      });
      body += '</table></div>';
    } else if (tab.id === 'passive') {
      body += `<div class="buff">&#9650; ${item.buff} <span class="muted">per level</span></div>` +
        `<div class="side">&#9660; ${item.side} <span class="muted">per level</span></div>` +
        `<p class="muted">Max level ${item.max}. Buff and side effect stack together.</p>`;
    } else if (tab.id === 'pill') {
      body += `<div class="buff">&#9650; ${item.buffDesc}</div><div class="side">&#9660; ${item.sideEffectDesc}</div>` +
        `<p class="muted">Lasts ${(item.duration / 60).toFixed(0)} seconds. Dropped by elites and found on the floor.</p>`;
    } else if (tab.id === 'evolution') {
      const b = item.base();
      const cols = WEAPON_STAT_LABELS.filter(([k]) => b[k] !== undefined && b[k] < 1e6 && !(k === 'pierce' && b[k] > 100));
      body += `<p class="recipe">Recipe: <b>${WEAPON_BY_ID[item.from].name}</b> (max level) + <b>${PASSIVE_BY_ID[item.requires].name}</b></p>` +
        `<div class="card-desc">${item.desc}</div><div class="side">&#9660; ${item.side}</div>` +
        '<div class="table-wrap"><table class="cd-table"><tr>' + cols.map((c) => `<th>${c[1]}</th>`).join('') + '</tr><tr>' +
        cols.map(([k, , f]) => `<td>${f(b[k])}</td>`).join('') + '</tr></table></div>';
    } else if (tab.id === 'enemy') {
      body += '<div class="cd-stats">' +
        `<div><span class="label">HP</span>${item.hp}</div>` +
        `<div><span class="label">DAMAGE</span>${item.dmg}</div>` +
        `<div><span class="label">SPEED</span>${item.speed}</div>` +
        `<div><span class="label">XP</span>${item.xp}</div></div>` +
        `<p>${ENEMY_BEHAVIOR[item.id] || ''}</p>` +
        '<p class="muted">Base values. Enemies grow tougher as the outbreak spreads.</p>';
    }

    return `<div class="cd-head">${icon}<div><div class="cd-name" style="color:${item.color}">${item.name}</div>` +
      `<div class="cd-kind">${tab.label.replace(/s$/, '')}</div></div></div>` +
      (lore ? `<p class="cd-lore">&ldquo;${lore}&rdquo;</p>` : '') + body +
      `<div class="cd-count">${tab.countLabel}: <b>${count.toLocaleString()}</b></div>`;
  },

  evolutionHint(ev) {
    const base = WEAPON_BY_ID[ev.from];
    return Save.data.codex.weapon[base.id]
      ? `Combine a max-level <b>${base.name}</b> with a certain prescription.`
      : 'Combine a max-level weapon with a certain prescription.';
  },

  // ---------------------------------------------------- Achievements --
  openAchievements() {
    Sfx.init();
    this.screen = 'achievements';
    this.hideAll();
    $('achievementsScreen').classList.remove('hidden');
    this.renderAchievements();
  },

  renderAchievements() {
    const c = Achievements.context('menu');
    c.inRun = false;
    $('achProgress').textContent = `${Achievements.count()} / ${ACHIEVEMENTS.length} unlocked`;
    const list = $('achList');
    list.innerHTML = '';
    for (const a of ACHIEVEMENTS) {
      const done = !!Save.data.achievements[a.id];
      const row = document.createElement('div');
      row.className = 'ach' + (done ? ' done' : '');
      let prog = '';
      if (!done && a.progress) {
        const [cur, max] = a.progress(c);
        prog = `<div class="ach-bar"><div style="width:${Math.min(100, (cur / max) * 100).toFixed(1)}%"></div></div>` +
          `<div class="ach-num">${Math.min(cur, max).toLocaleString()} / ${max.toLocaleString()}</div>`;
      }
      row.innerHTML =
        `<div class="ach-icon">${done ? '&#10003;' : '?'}</div>` +
        `<div class="ach-body"><b>${a.name}</b><div class="ach-desc">${a.desc}</div>${prog}</div>` +
        `<div class="ach-reward">${Achievements.rewardText(a)}</div>`;
      list.appendChild(row);
    }
  },

  toastAchievement(a) {
    const el = document.createElement('div');
    el.className = 'toast achievement';
    el.style.setProperty('--c', '#ffe14d');
    el.innerHTML = `<span class="label">ACHIEVEMENT UNLOCKED</span><b>${a.name}</b><span class="reward">${Achievements.rewardText(a)}</span>`;
    $('toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 3800);
    setTimeout(() => el.remove(), 4400);
  },

  toastDiscovery(category, id) {
    const tab = CODEX_TABS.find((t) => t.id === category);
    const item = tab && tab.items().find((i) => i.id === id);
    if (!item) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.style.setProperty('--c', item.color);
    el.innerHTML = `<span class="label">NEW ENCYCLOPEDIA ENTRY</span><b>${item.name}</b>`;
    $('toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3200);
  },

  openCharSelect() {
    Sfx.init();
    this.screen = 'char';
    this.hideAll();
    $('charScreen').classList.remove('hidden');
    this.renderChars();
  },

  renderChars() {
    const list = $('charList');
    list.innerHTML = '';
    CHARACTERS.forEach((ch, i) => {
      const unlocked = !!Save.data.chars[ch.id];
      const card = document.createElement('div');
      card.className = 'char-card' + (ch.id === this.selectedChar ? ' selected' : '') + (unlocked ? '' : ' locked');
      card.style.setProperty('--c', ch.color);
      const weapon = WEAPON_BY_ID[ch.weapon];
      card.innerHTML =
        `<div class="char-avatar"><span>+</span></div>` +
        `<div class="char-name">${ch.name}</div>` +
        `<div class="char-desc">${ch.desc}</div>` +
        `<div class="char-weapon">Starts with <b style="color:${weapon.color}">${weapon.name}</b></div>` +
        `<div class="char-bonus">${ch.bonus}</div>` +
        (unlocked
          ? `<div class="key">[${i + 1}]</div>`
          : ch.achievement
            ? `<div class="lock-req">LOCKED: achievement <b>${ACHIEVEMENT_BY_ID[ch.achievement].name}</b><br>${ACHIEVEMENT_BY_ID[ch.achievement].desc}</div>`
            : `<button class="btn small buy">Unlock ${ch.cost}g</button>`);
      card.onclick = (e) => {
        if (!unlocked) {
          if (e.target.classList.contains('buy')) this.unlockChar(ch);
          return;
        }
        this.selectedChar = ch.id;
        this.renderChars();
      };
      card.ondblclick = () => { if (unlocked) this.startSelected(); };
      list.appendChild(card);
    });
    $('charGold').textContent = Save.data.gold;
    this.renderStages();
  },

  unlockChar(ch) {
    if (ch.achievement) return;
    if (Save.data.gold < ch.cost) { this.flash($('charGold')); return; }
    Save.data.gold -= ch.cost;
    Save.data.chars[ch.id] = true;
    this.selectedChar = ch.id;
    Save.save();
    Sfx.chest();
    this.renderChars();
  },

  startSelected() {
    if (!Save.data.chars[this.selectedChar]) return;
    startRun(this.selectedChar, this.selectedStage);
  },

  // ---------------------------------------------------------- Stages --
  stageUnlocked(i) {
    return i === 0 || (i > 0 && !!Save.data.stagesCleared[STAGES[i - 1].id]);
  },

  renderStages() {
    const list = $('stageList');
    list.innerHTML = '';
    STAGES.forEach((st, i) => {
      const unlocked = this.stageUnlocked(i);
      const cleared = !!Save.data.stagesCleared[st.id];
      const card = document.createElement('div');
      card.className = 'stage-card' + (st.id === this.selectedStage ? ' selected' : '') + (unlocked ? '' : ' locked');
      card.style.setProperty('--c', st.color);
      const skulls = '&#9679;'.repeat(i + 1) + '<span class="dim">' + '&#9679;'.repeat(STAGES.length - i - 1) + '</span>';
      const mods = i === 0 ? 'Standard difficulty' :
        `Enemies +${Math.round((st.hpMult - 1) * 100)}% HP, +${Math.round((st.dmgMult - 1) * 100)}% dmg · Gold &times;${st.goldMult}`;
      card.innerHTML =
        `<div class="stage-top"><span class="stage-name">${unlocked ? st.name : '???'}</span><span class="stage-diff">${skulls}</span></div>` +
        (unlocked
          ? `<div class="stage-desc">${st.desc}</div><div class="stage-mods">${mods}</div>` +
            `<div class="stage-boss">Final boss: <b>${Save.data.codex.enemy[st.final] ? ENEMIES[st.final].name : '???'}</b></div>` +
            (cleared ? '<div class="stage-clear">&#10003; CLEARED</div>' : '')
          : `<div class="stage-desc">Clear <b>${STAGES[i - 1].name}</b> to unlock.</div>`);
      card.onclick = () => {
        if (!unlocked) return;
        this.selectedStage = st.id;
        this.renderStages();
      };
      list.appendChild(card);
    });
  },

  cycleStage(dir) {
    const open = STAGES.filter((s, i) => this.stageUnlocked(i));
    const idx = open.findIndex((s) => s.id === this.selectedStage);
    this.selectedStage = open[(idx + dir + open.length) % open.length].id;
    this.renderStages();
  },

  openShop() {
    Sfx.init();
    this.screen = 'shop';
    this.resetArmed = false;
    $('resetBtn').textContent = 'Reset progress';
    this.hideAll();
    $('shopScreen').classList.remove('hidden');
    this.renderShop();
  },

  renderShop() {
    const list = $('shopList');
    list.innerHTML = '';
    for (const item of SHOP) {
      const L = Save.data.shop[item.id] || 0;
      if (item.requires && !Save.data.shopUnlocked[item.id] && L === 0) {
        const a = ACHIEVEMENT_BY_ID[item.requires];
        const row = document.createElement('div');
        row.className = 'shop-item locked';
        row.innerHTML = `<div class="shop-name">???</div><div class="shop-desc">Requires achievement <b>${a.name}</b>: ${a.desc}</div><div></div>`;
        list.appendChild(row);
        continue;
      }
      const maxed = L >= item.max;
      const cost = item.cost * (L + 1);
      const row = document.createElement('div');
      row.className = 'shop-item' + (maxed ? ' maxed' : '');
      let pips = '';
      for (let i = 0; i < item.max; i++) pips += `<i class="${i < L ? 'on' : ''}"></i>`;
      row.innerHTML =
        `<div class="shop-name">${item.name}</div>` +
        `<div class="shop-desc">${item.desc} <span class="per">/ level</span></div>` +
        `<div class="pips">${pips}</div>`;
      const btn = document.createElement('button');
      btn.className = 'btn small';
      btn.textContent = maxed ? 'MAX' : `${cost}g`;
      btn.disabled = maxed || Save.data.gold < cost;
      btn.onclick = () => {
        if (Save.data.gold < cost || maxed) return;
        Save.data.gold -= cost;
        Save.data.shop[item.id] = L + 1;
        Save.save();
        Sfx.coin();
        this.renderShop();
      };
      row.appendChild(btn);
      list.appendChild(row);
    }
    $('shopGold').textContent = Save.data.gold;
  },

  resetProgress() {
    if (!this.resetArmed) {
      this.resetArmed = true;
      $('resetBtn').textContent = 'Click again to wipe ALL progress';
      return;
    }
    Save.reset();
    this.selectedChar = 'nurse';
    this.resetArmed = false;
    $('resetBtn').textContent = 'Progress wiped';
    this.renderShop();
  },

  flash(el) {
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  },

  // -------------------------------------------------------- In-run --
  onRunStart() {
    this.hideAll();
    $('hud').classList.remove('hidden');
    $('stageName').textContent = game.stage.name;
    $('stageName').style.color = game.stage.color;
    this.hudBuildVersion = -1;
    this.badgeEls.forEach((b) => b.el.remove());
    this.badgeEls.clear();
  },

  showLevelUp() {
    const isChest = game.levelUpSource === 'chest';
    $('luTitle').textContent = isChest ? 'CARE PACKAGE' : `LEVEL ${game.level - game.pendingLevels + 1}`;
    $('luSub').textContent = isChest ? 'Pick one free upgrade.' : 'Choose your prescription. Read the side effects.';
    $('levelUpScreen').classList.remove('hidden');
    $('levelUpScreen').classList.toggle('chest', isChest);
    const list = $('cardList');
    list.innerHTML = '';
    game.choices.forEach((c, i) => {
      const card = document.createElement('button');
      card.className = 'card' + (c.kind === 'evolution' ? ' evolution' : '');
      card.style.animationDelay = `${i * 60}ms`;
      card.innerHTML = this.cardHtml(c, i);
      card.onclick = () => this.pick(i);
      list.appendChild(card);
    });
    const rr = $('rerollBtn');
    rr.classList.toggle('hidden', game.rerolls <= 0);
    rr.textContent = `Reroll (${game.rerolls}) [R]`;
    this.inputGuardUntil = performance.now() + 350;
  },

  cardHtml(c, i) {
    if (c.kind === 'gold' || c.kind === 'heal') {
      const gold = c.kind === 'gold';
      return `<div class="card-top" style="--c:${gold ? '#ffd23d' : '#3dff8a'}"><span class="pill-icon"></span>` +
        `<span class="card-name">${gold ? 'Insurance Payout' : 'Bandages'}</span></div>` +
        `<div class="card-desc">${gold ? `+${c.amount} gold` : `Heal ${c.amount} HP`}</div><div class="key">[${i + 1}]</div>`;
    }
    if (c.kind === 'evolution') {
      const ev = c.def;
      return `<div class="card-top" style="--c:${ev.color};--a:${ev.accent}"><span class="pill-icon"></span>` +
        `<span class="card-name">${ev.name}</span><span class="card-lv"><span class="new">EVOLUTION</span></span></div>` +
        `<div class="card-kind">${WEAPON_BY_ID[ev.from].name} + ${PASSIVE_BY_ID[ev.requires].name}</div>` +
        `<div class="card-desc">${ev.desc}</div><div class="side">&#9660; ${ev.side}</div><div class="key">[${i + 1}]</div>`;
    }
    const def = c.def;
    const isWeapon = c.kind === 'weapon';
    const lvLabel = c.level === 1 ? '<span class="new">NEW!</span>' : `LV ${c.level}`;
    const accent = def.accent || '#ffffff';
    let body;
    if (isWeapon) {
      const desc = def.levelText[c.level - 1];
      body = `<div class="card-desc">${desc}</div>`;
    } else {
      body =
        `<div class="buff">▲ ${def.buff}</div>` +
        `<div class="side">▼ ${def.side}${stats.sideMult > 1 ? ` <b class="mult">×${stats.sideMult}</b>` : ''}</div>` +
        (c.level > 1 ? `<div class="stack">side effect stacks ×${c.level}</div>` : '');
    }
    return `<div class="card-top" style="--c:${def.color};--a:${accent}"><span class="pill-icon"></span>` +
      `<span class="card-name">${def.name}</span><span class="card-lv">${lvLabel}</span></div>` +
      `<div class="card-kind">${isWeapon ? 'WEAPON' : 'PRESCRIPTION'}</div>` +
      body + `<div class="key">[${i + 1}]</div>`;
  },

  pick(i) {
    if (performance.now() < this.inputGuardUntil) return;
    chooseOption(i);
  },

  hideLevelUp() {
    $('levelUpScreen').classList.add('hidden');
  },

  pause() {
    if (game.state !== State.PLAYING) return;
    game.state = State.PAUSED;
    $('pauseScreen').classList.remove('hidden');
    $('pauseBuild').innerHTML = this.buildHtml();
  },

  resume() {
    if (game.state !== State.PAUSED) return;
    game.state = State.PLAYING;
    $('pauseScreen').classList.add('hidden');
    $('settingsScreen').classList.add('hidden');
  },

  buildHtml() {
    let html = '<div class="build-col"><h3>Weapons</h3>';
    for (const w of player.weapons) {
      html += `<div class="build-row" style="--c:${w.def.color}"><span class="dot"></span>${w.def.name} <b>${w.def.evo ? 'EVOLVED' : 'LV ' + w.level}</b></div>`;
    }
    html += '</div><div class="build-col"><h3>Prescriptions</h3>';
    if (!player.passiveOrder.length) html += '<div class="muted">none yet</div>';
    for (const id of player.passiveOrder) {
      const def = PASSIVE_BY_ID[id];
      const L = player.passives[id];
      html += `<div class="build-row" style="--c:${def.color}"><span class="dot"></span>${def.name} <b>LV ${L}</b>` +
        `<div class="mini buff">▲ ${def.buff} ×${L}</div><div class="mini side">▼ ${def.side} ×${L}</div></div>`;
    }
    html += '</div>';
    return html;
  },

  showGameOver() {
    this.hideAll();
    $('hud').classList.add('hidden');
    const win = game.victory;
    $('gameOverScreen').classList.remove('hidden');
    $('gameOverScreen').classList.toggle('win', win);
    $('goTitle').textContent = win ? 'CURED!' : 'OVERDOSE';
    $('goSub').textContent = win
      ? `${game.stage.name} is cured. For now.`
      : `${game.char.name} succumbed to the side effects in the ${game.stage.name}.`;
    $('goTime').textContent = fmtTime(game.time);
    $('goLevel').textContent = game.level;
    $('goKills').textContent = game.kills;
    $('goDmg').textContent = Math.round(game.damageDealt).toLocaleString();
    const g = game.goldEarned;
    $('goGold').innerHTML =
      `+${g.total} gold <span class="muted">(pickups ${g.pickup} · survival ${g.time}${g.win ? ` · cure bonus ${g.win}` : ''})</span>` +
      `<br><span class="muted">Total: ${Save.data.gold}g — spend it in the Pharmacy</span>`;
    const got = game.newAchievements || [];
    $('goAch').innerHTML = got.length
      ? '<h3>Achievements unlocked</h3>' + got.map((id) => {
        const a = ACHIEVEMENT_BY_ID[id];
        return `<div class="go-ach"><b>${a.name}</b> <span class="muted">${Achievements.rewardText(a)}</span></div>`;
      }).join('')
      : '';
    if (game.unlockedStage) {
      $('goAch').innerHTML = `<div class="go-unlock">NEW STAGE UNLOCKED: <b style="color:${game.unlockedStage.color}">${game.unlockedStage.name}</b></div>` + $('goAch').innerHTML;
    }
    $('goBuild').innerHTML = this.buildHtml();
    this.inputGuardUntil = performance.now() + 700;
  },

  // ------------------------------------------------------------- HUD --
  updateHud() {
    if (!player || (game.state !== State.PLAYING && game.state !== State.LEVELUP && game.state !== State.PAUSED)) return;

    const hpK = clamp(player.hp / stats.maxHp, 0, 1);
    $('hpFill').style.width = (hpK * 100).toFixed(1) + '%';
    $('hpFill').classList.toggle('low', hpK < 0.3);
    $('xpFill').style.width = ((game.xp / game.xpNext) * 100).toFixed(1) + '%';
    $('xpFill').style.filter = game.xpPulse > 0.03 ? `brightness(${(1 + game.xpPulse * 1.2).toFixed(2)})` : '';

    if (game.time % 6 === 0 || game.state !== State.PLAYING) {
      $('hpText').textContent = `${Math.ceil(Math.max(0, player.hp))}/${Math.round(stats.maxHp)}`;
      $('lvText').textContent = `LV ${game.level}`;
      $('timer').textContent = fmtTime(game.time);
      $('timer').classList.toggle('final', game.finalSpawned);
      $('kills').textContent = game.kills;
      $('gold').textContent = game.gold;
    }

    if (this.hudBuildVersion !== game.buildVersion) {
      this.hudBuildVersion = game.buildVersion;
      this.renderSlots();
    }
    this.updateBadges();
  },

  renderSlots() {
    let wh = '';
    for (let i = 0; i < MAX_WEAPON_SLOTS; i++) {
      const w = player.weapons[i];
      wh += w
        ? `<div class="slot" title="${w.def.name}" style="--c:${w.def.color}"><span class="pill-icon"></span><b>${w.def.evo ? '&#9733;' : w.level}</b></div>`
        : '<div class="slot empty"></div>';
    }
    $('weaponSlots').innerHTML = wh;
    let ph = '';
    for (let i = 0; i < MAX_PASSIVE_SLOTS; i++) {
      const id = player.passiveOrder[i];
      if (id) {
        const def = PASSIVE_BY_ID[id];
        ph += `<div class="slot passive" title="${def.name}: ${def.buff} / ${def.side}" style="--c:${def.color}"><span class="pill-icon"></span><b>${player.passives[id]}</b></div>`;
      } else {
        ph += '<div class="slot passive empty"></div>';
      }
    }
    $('passiveSlots').innerHTML = ph;
  },

  updateBadges() {
    const active = new Set();
    for (const eff of player.tempEffects) {
      const id = eff.def.id;
      active.add(id);
      let badge = this.badgeEls.get(id);
      if (!badge) {
        const el = document.createElement('div');
        el.className = 'badge';
        el.style.setProperty('--pill', eff.def.color);
        el.innerHTML =
          `<div class="name">${eff.def.name.toUpperCase()}</div>` +
          `<div class="buff">▲ ${eff.def.buffDesc}</div>` +
          `<div class="side">▼ ${eff.def.sideEffectDesc}</div>` +
          '<div class="bar"><div></div></div>';
        $('effects').appendChild(el);
        badge = { el, bar: el.querySelector('.bar div') };
        this.badgeEls.set(id, badge);
      }
      badge.bar.style.width = ((eff.duration / eff.maxDuration) * 100).toFixed(1) + '%';
      badge.el.classList.toggle('ending', eff.duration < 120);
    }
    this.badgeEls.forEach((b, id) => {
      if (!active.has(id)) { b.el.remove(); this.badgeEls.delete(id); }
    });
  },

  // ---------------------------------------------------------- Keyboard --
  onKey(code) {
    const digit = code.startsWith('Digit') ? Number(code.slice(5)) : code.startsWith('Numpad') ? Number(code.slice(6)) : 0;

    switch (game.state) {
      case State.MENU:
        if (this.screen === 'menu') {
          if (code === 'Enter' || code === 'Space') this.openCharSelect();
          else if (code === 'KeyS') this.openShop();
          else if (code === 'KeyE') this.openCodex();
          else if (code === 'KeyO') this.openSettings('menu');
          else if (code === 'KeyA') this.openAchievements();
        } else if (this.screen === 'char') {
          if (code === 'Enter' || code === 'Space') this.startSelected();
          else if (code === 'Escape') this.openMenu();
          else if (digit >= 1 && digit <= CHARACTERS.length) {
            const ch = CHARACTERS[digit - 1];
            if (Save.data.chars[ch.id]) { this.selectedChar = ch.id; this.renderChars(); }
          } else if (code === 'ArrowLeft' || code === 'ArrowRight' || code === 'KeyA' || code === 'KeyD') {
            this.cycleChar(code === 'ArrowLeft' || code === 'KeyA' ? -1 : 1);
          } else if (code === 'ArrowUp' || code === 'ArrowDown' || code === 'KeyW' || code === 'KeyS') {
            this.cycleStage(code === 'ArrowUp' || code === 'KeyW' ? -1 : 1);
          }
        } else if (this.screen === 'shop') {
          if (code === 'Escape') this.openMenu();
        } else if (this.screen === 'achievements') {
          if (code === 'Escape') this.openMenu();
        } else if (this.screen === 'settings') {
          if (code === 'Escape') this.closeSettings();
          else if (digit >= 1 && digit <= SETTINGS.length) this.toggleSetting(SETTINGS[digit - 1].key);
        } else if (this.screen === 'codex') {
          if (code === 'Escape') this.openMenu();
          else if (code === 'ArrowLeft' || code === 'KeyQ') this.switchCodexTab(-1);
          else if (code === 'ArrowRight' || code === 'KeyE') this.switchCodexTab(1);
          else if (digit >= 1 && digit <= CODEX_TABS.length) { this.codexTab = CODEX_TABS[digit - 1].id; this.codexSel = null; this.renderCodex(); }
        }
        break;
      case State.PLAYING:
        if (code === 'KeyP' || code === 'Escape') this.pause();
        break;
      case State.PAUSED:
        if (!$('settingsScreen').classList.contains('hidden')) {
          if (code === 'Escape' || code === 'KeyO') this.closeSettings();
          else if (digit >= 1 && digit <= SETTINGS.length) this.toggleSetting(SETTINGS[digit - 1].key);
        } else if (code === 'KeyP' || code === 'Escape') this.resume();
        else if (code === 'KeyO') this.openSettings('pause');
        break;
      case State.LEVELUP:
        if (digit >= 1 && digit <= game.choices.length) this.pick(digit - 1);
        else if (code === 'KeyR') rerollChoices();
        break;
      case State.GAMEOVER:
        if (performance.now() < this.inputGuardUntil) break;
        if (code === 'KeyR') startRun(this.selectedChar, this.selectedStage);
        else if (code === 'Enter' || code === 'Escape') this.openMenu();
        break;
    }
  },

  cycleChar(dir) {
    const unlocked = CHARACTERS.filter((c) => Save.data.chars[c.id]);
    const idx = unlocked.findIndex((c) => c.id === this.selectedChar);
    this.selectedChar = unlocked[(idx + dir + unlocked.length) % unlocked.length].id;
    this.renderChars();
  }
};

// ----------------------------------------------------------------- Input --
const PREVENT_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter'];

// Audio may only start after a user gesture; the first one also starts the menu music.
window.addEventListener('pointerdown', () => Sfx.init());

window.addEventListener('keydown', (e) => {
  Sfx.init();
  if (PREVENT_KEYS.includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (e.repeat) return;
  if (e.code === 'KeyM') UI.toggleSetting('sound');
  UI.onKey(e.code);
});

window.addEventListener('keyup', (e) => { keys[e.code] = false; });

window.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  mouse.active = true;
});

window.addEventListener('pagehide', () => Save.save());

window.addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
  if (game.state === State.PLAYING) UI.pause();
});
