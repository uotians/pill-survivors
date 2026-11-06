'use strict';

/* =========================================================================
   ACHIEVEMENTS — challenges that reward gold and unlock content.
   check(c) receives { event, game, player, save, inRun } and returns true
   when the achievement is earned. Events: 'tick' (twice a second in a run),
   'evolve', 'bossKill', 'victory', 'runEnd'.
   ========================================================================= */

// Lifetime kills including the run in progress (runEnd has already banked them).
const liveKills = (c) => c.save.stats.kills + (c.inRun ? c.game.kills : 0);

const ACHIEVEMENTS = [
  {
    id: 'firstDose', name: 'First Dose', desc: 'Finish your first run.',
    reward: { gold: 50 },
    check: (c) => c.event === 'runEnd'
  },
  {
    id: 'outpatient', name: 'Outpatient', desc: 'Survive for 5:00.',
    reward: { gold: 100 },
    check: (c) => c.inRun && c.game.time >= 300 * 60
  },
  {
    id: 'cured', name: 'Cured', desc: 'Defeat Patient Zero.',
    reward: { gold: 300 },
    check: (c) => c.event === 'victory'
  },
  {
    id: 'polypharmacy', name: 'Polypharmacy', desc: 'Hold 6 different prescriptions at once.',
    reward: { char: 'hypochondriac' },
    check: (c) => c.inRun && c.player.passiveOrder.length >= 6
  },
  {
    id: 'frequent', name: 'Frequent Flyer', desc: 'Swallow 25 pills in total.',
    reward: { char: 'addict' },
    progress: (c) => [c.save.stats.pills, 25],
    check: (c) => c.save.stats.pills >= 25
  },
  {
    id: 'frequentPatient', name: 'Frequent Patient', desc: 'Overdose (die) 5 times.',
    reward: { shop: 'revive' },
    progress: (c) => [c.save.stats.deaths, 5],
    check: (c) => c.save.stats.deaths >= 5
  },
  {
    id: 'synthesis', name: 'Synthesis', desc: 'Evolve a weapon.',
    reward: { gold: 150 },
    check: (c) => c.inRun && c.game.evolutions >= 1
  },
  {
    id: 'madScientist', name: 'Mad Scientist', desc: 'Evolve 3 weapons in a single run.',
    reward: { gold: 400 },
    check: (c) => c.inRun && c.game.evolutions >= 3
  },
  {
    id: 'squasher', name: 'Superbug Squasher', desc: 'Defeat a Superbug.',
    reward: { gold: 100 },
    check: (c) => c.event === 'bossKill'
  },
  {
    id: 'exterminator', name: 'Exterminator', desc: 'Kill 1,000 enemies in a single run.',
    reward: { gold: 150 },
    check: (c) => c.inRun && c.game.kills >= 1000
  },
  {
    id: 'pandemic', name: 'Pandemic Control', desc: 'Kill 25,000 enemies in total.',
    reward: { gold: 300 },
    progress: (c) => [liveKills(c), 25000],
    check: (c) => liveKills(c) >= 25000
  },
  {
    id: 'cleanLiving', name: 'Clean Living', desc: 'Survive 4:00 without taking any prescription.',
    reward: { gold: 200 },
    check: (c) => c.inRun && c.game.time >= 240 * 60 && c.player.passiveOrder.length === 0
  },
  {
    id: 'cocktail', name: 'Cocktail', desc: 'Have 4 different pills active at the same time.',
    reward: { gold: 150 },
    check: (c) => c.inRun && c.player.tempEffects.filter((e) => !e.def.hidden).length >= 4
  },
  {
    id: 'untouchable', name: 'Untouchable', desc: 'Survive the first 3:00 without taking damage.',
    reward: { gold: 200 },
    check: (c) => c.inRun && c.game.time >= 180 * 60 && c.game.damageTaken === 0
  },
  {
    id: 'fullyMedicated', name: 'Fully Medicated', desc: 'Reach level 30 in a run.',
    reward: { gold: 150 },
    check: (c) => c.inRun && c.game.level >= 30
  },
  {
    id: 'labRat', name: 'Lab Rat', desc: 'Clear the Research Lab.',
    reward: { gold: 400 },
    check: (c) => c.event === 'victory' && c.game.stage.id === 'lab'
  },
  {
    id: 'graveShift', name: 'Grave Shift', desc: 'Clear the Morgue.',
    reward: { gold: 600 },
    check: (c) => c.event === 'victory' && c.game.stage.id === 'morgue'
  },
  {
    id: 'patientZeroZero', name: 'Herd Immunity', desc: 'Clear the Quarantine Zone.',
    reward: { gold: 1000 },
    check: (c) => c.event === 'victory' && c.game.stage.id === 'quarantine'
  }
];

const ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

const Achievements = {
  context(event) {
    return { event, game, player, save: Save.data, inRun: event !== 'runEnd' && !!player };
  },

  check(event) {
    const c = this.context(event);
    for (const a of ACHIEVEMENTS) {
      if (Save.data.achievements[a.id]) continue;
      let ok = false;
      try { ok = a.check(c); } catch (e) { ok = false; }
      if (ok) this.unlock(a);
    }
  },

  unlock(a) {
    Save.data.achievements[a.id] = Date.now();
    const r = a.reward;
    if (r.gold) Save.data.gold += r.gold;
    if (r.char) Save.data.chars[r.char] = true;
    if (r.shop) Save.data.shopUnlocked[r.shop] = true;
    if (game && game.newAchievements) game.newAchievements.push(a.id);
    Save.save();
    UI.toastAchievement(a);
    Sfx.chest();
  },

  rewardText(a) {
    const r = a.reward;
    if (r.gold) return `+${r.gold} gold`;
    if (r.char) return `Unlocks character: ${CHAR_BY_ID[r.char].name}`;
    if (r.shop) return `Unlocks Pharmacy item: ${SHOP.find((s) => s.id === r.shop).name}`;
    return '';
  },

  count() {
    return ACHIEVEMENTS.filter((a) => Save.data.achievements[a.id]).length;
  }
};
