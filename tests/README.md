# Tests

Headless tests that run the real game code in Node.js (no dependencies, no browser).

```sh
node tests/run.js            # everything (~3 min, includes full 10-minute runs on every stage)
node tests/run.js --quick    # skip slow tests (~15 s) — run this after every change
node tests/run.js stages     # only tests whose name matches "stages"
```

## How it works

`harness.js` loads every `<script>` from `index.html` (in order) into an isolated
VM context and mocks the browser: canvas (draw calls are accepted and ignored), DOM
elements, `localStorage` and Web Audio. `Math.random` is seeded, so runs are
reproducible. If the code calls `getElementById` with an id that does not exist in
`index.html`, the "every screen renders" test fails.

`g.run(fn)` evaluates `fn` **inside the game scope**, so it can use `game`, `player`,
`startRun()` etc. It cannot see variables from the test file — pass data as extra
arguments: `g.run((id) => startRun(id), 'nurse')`.

`__bot({ frames, untilTime, keepAlive, pick })` plays the game: walks in a square,
picks level-up cards and calls `update()` frame by frame.

## Adding a test

Create or edit a `*.test.js` file that exports an array:

```js
module.exports = [
  {
    name: 'what it checks',
    slow: false,            // true = skipped by --quick
    fn(t) {
      const g = t.game({ seed: 1 });
      const r = g.run(() => { startRun('nurse'); return __bot({ frames: 600 }); });
      t.ok(r.kills > 0, 'killed something');
      t.eq(r.state, 'PLAYING', 'still alive');
      t.between(r.level, 2, 10, 'level');
      t.log('kills', r.kills);  // shown under the result
    }
  }
];
```

## Limits

The tests prove that things run and that rules hold (unlocks, stats, spawns).
They cannot tell whether something looks or sounds good, and the bot is not a
real player — balance numbers are only indicative.
