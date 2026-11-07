'use strict';

/* =========================================================================
   MAIN — fixed-timestep loop & boot
   ========================================================================= */

let lastTime = performance.now();
let accumulator = 0;

function frame(now) {
  requestAnimationFrame(frame); // schedule first so one bad frame cannot stop the loop
  accumulator += Math.min(now - lastTime, 250); // avoid spiral of death after tab switch
  lastTime = now;
  while (accumulator >= STEP) {
    update();
    accumulator -= STEP;
  }
  render();
  UI.updateHud();
  UI.updateCursor();
  Music.update();
}

// index.html and the scripts must come from the same release. A browser that
// cached an old index.html but fetched new scripts (or the other way round)
// gets one automatic reload on a versioned URL, which bypasses the cache.
function versionMismatch() {
  const meta = document.querySelector('meta[name="game-version"]');
  const htmlVersion = meta ? meta.content : null;
  if (htmlVersion === GAME_VERSION) return false;
  const key = 'pillSurvivorsReload_' + GAME_VERSION;
  let tried = false;
  try { tried = sessionStorage.getItem(key) === '1'; sessionStorage.setItem(key, '1'); } catch (e) { tried = true; }
  if (!tried) {
    location.replace(location.pathname + '?v=' + GAME_VERSION + '&t=' + Date.now() + location.hash);
    return true;
  }
  console.warn(`Pill Survivors: page is ${htmlVersion || 'unknown'} but scripts are ${GAME_VERSION}. Hard refresh (Ctrl+F5) if anything looks wrong.`);
  return false;
}

function boot() {
  window.addEventListener('resize', resize);
  resize();
  mouse.x = W / 2 + 120; // sensible aim before the mouse first moves
  mouse.y = H / 2;
  buildFloorPattern();
  Save.load();
  UI.init();
  requestAnimationFrame(frame);
}

if (!versionMismatch()) boot();
