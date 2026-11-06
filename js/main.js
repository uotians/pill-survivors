'use strict';

/* =========================================================================
   MAIN — fixed-timestep loop & boot
   ========================================================================= */

let lastTime = performance.now();
let accumulator = 0;

function frame(now) {
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
  requestAnimationFrame(frame);
}

window.addEventListener('resize', resize);

resize();
mouse.x = W / 2 + 120; // sensible aim before the mouse first moves
mouse.y = H / 2;
buildFloorPattern();
Save.load();
UI.init();
requestAnimationFrame(frame);
