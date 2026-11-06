'use strict';

/* =========================================================================
   Test runner.
     node tests/run.js            run everything
     node tests/run.js --quick    skip slow full-run tests
     node tests/run.js stages     only tests whose file or name matches "stages"
   Exit code is 1 if any test fails.
   ========================================================================= */

const fs = require('fs');
const path = require('path');
const { createGame } = require('./harness');

const args = process.argv.slice(2);
const quick = args.includes('--quick');
const filter = args.find((a) => !a.startsWith('--'));

class AssertionError extends Error {}

function makeT(log) {
  return {
    game: (opts) => createGame(opts),
    ok(cond, msg) { if (!cond) throw new AssertionError(msg || 'expected truthy'); },
    eq(a, b, msg) {
      if (a !== b) throw new AssertionError(`${msg || 'not equal'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
    },
    between(v, lo, hi, msg) {
      if (!(v >= lo && v <= hi)) throw new AssertionError(`${msg || 'out of range'}: expected ${lo}..${hi}, got ${v}`);
    },
    log: (...m) => log.push(m.join(' '))
  };
}

const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js')).sort();
let passed = 0;
let failed = 0;
let skipped = 0;
const t0 = Date.now();

for (const file of files) {
  const tests = require(path.join(__dirname, file));
  const group = file.replace('.test.js', '');
  for (const test of tests) {
    const label = `${group} › ${test.name}`;
    if (filter && !label.toLowerCase().includes(filter.toLowerCase())) continue;
    if (quick && test.slow) { skipped++; console.log(`  \x1b[90mSKIP  ${label} (slow)\x1b[0m`); continue; }
    const log = [];
    const start = Date.now();
    try {
      test.fn(makeT(log));
      passed++;
      console.log(`  \x1b[32mPASS\x1b[0m  ${label} \x1b[90m(${Date.now() - start} ms)\x1b[0m`);
      for (const l of log) console.log(`        \x1b[90m${l}\x1b[0m`);
    } catch (e) {
      failed++;
      console.log(`  \x1b[31mFAIL\x1b[0m  ${label} \x1b[90m(${Date.now() - start} ms)\x1b[0m`);
      for (const l of log) console.log(`        \x1b[90m${l}\x1b[0m`);
      console.log(`        \x1b[31m${e instanceof AssertionError ? e.message : (e.stack || e)}\x1b[0m`);
    }
  }
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\n${failed ? '\x1b[31m' : '\x1b[32m'}${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}\x1b[0m in ${secs}s`);
process.exit(failed ? 1 : 0);
