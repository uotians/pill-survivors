# 💊 Pill Survivors

**Survive the outbreak. Every cure has a side effect.**

A survivors-style roguelite made for a game jam with the theme **"Side Effects"**.
Fight waves of germs, viruses and worse through four hospital stages. Every
upgrade you take makes you stronger — and comes with a side effect that stacks.

### ▶ [Play in your browser](https://uotians.github.io/pill-survivors/)

No install, no downloads. Works in any modern desktop browser.

---

## How to play

| Key | Action |
|---|---|
| `WASD` / arrow keys | Move |
| Mouse | Aim (weapons fire automatically) |
| `1`–`4` | Pick a level-up card |
| `R` | Reroll cards (if you have rerolls) |
| `P` / `Esc` | Pause |
| `M` | Mute sound effects |

Aiming can be changed in **Settings** (`O`): aim with the mouse, auto-target the
nearest enemy, or both.

**The loop:** kill enemies → collect the XP pills they drop → level up → choose an
upgrade. Survive for 10 minutes and defeat the stage's final boss to win.

## The twist: side effects

- **Prescriptions** (passive upgrades) always come with a permanent, stacking
  drawback. *Steroids* boost damage but make you bigger. *Caffeine* makes you
  faster but slippery. *Melatonin* gives more XP… and you occasionally fall asleep.
- **Pills** found on the floor and dropped by elites give a powerful short buff
  with a chaotic side effect — inverted controls, no friction, tunnel vision,
  a fire trail that burns you too.
- **Evolutions**: a max-level weapon plus the right prescription evolves into a
  super weapon — with its own side effect. Recipes are secret until you discover them.

## Content

- **4 stages** that unlock in order and get harder: General Ward → Research Lab → Morgue → Quarantine Zone
- **5 characters**, two of them unlocked through achievements
- **9 weapons** and **9 evolutions**
- **13 prescriptions** and **8 pills**
- **14 enemy types** including minibosses and four final bosses, plus elite mutations (shielded, vaccinated, volatile…)
- **Pharmacy**: spend gold on permanent upgrades between runs
- **Encyclopedia** that fills in as you discover things, and **18 achievements**
- Procedural chiptune music that reacts to bosses and low HP

Progress is saved in your browser (localStorage), so it stays on the device you play on.

## Running locally

Clone the repo and open `index.html` in a browser. That's it — there is no build
step and no dependencies.

```sh
git clone https://github.com/uotians/pill-survivors.git
```

## Tech

- Vanilla JavaScript, HTML5 Canvas and CSS. No frameworks, no libraries.
- No external assets: all graphics are drawn with canvas shapes and all audio is
  synthesized with the Web Audio API.
- Scripts are plain `<script>` tags, so the game works straight from `file://`.

| File | Contents |
|---|---|
| `js/core.js` | Canvas, helpers, sound effects, save data, spatial grid |
| `js/data.js` | All content and balance numbers: weapons, prescriptions, pills, enemies, stages, shop |
| `js/world.js` | Procedural furniture and collisions |
| `js/achievements.js` | Achievements and their rewards |
| `js/music.js` | Procedural music |
| `js/game.js` | Game logic: player, weapons, enemies, spawning, run flow |
| `js/render.js` | Drawing |
| `js/ui.js` | Menus, HUD, encyclopedia, settings |
| `js/main.js` | Game loop and startup |

Want to tweak the balance? Almost every number lives in `js/data.js`.

## Tests

Headless tests run the real game code in Node.js (no dependencies):

```sh
node tests/run.js --quick   # ~15 s
node tests/run.js           # ~4 min, includes a full 10-minute run on every stage
```

See [`tests/README.md`](tests/README.md) for details.
