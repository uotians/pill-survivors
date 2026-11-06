'use strict';

/* =========================================================================
   MUSIC — procedural chiptune via Web Audio. A lookahead scheduler plays
   16th-note steps over a 4-bar progression (Am - F - C - G). Layers change
   with game state: menu (pads), run (drums + bass + arp), boss (faster,
   with a lead melody). Ducked while paused / levelling up, muffled at low HP.
   ========================================================================= */

const Music = {
  gain: null,
  filter: null,
  timer: null,
  nextTime: 0,
  step: 0,
  mode: 'off',
  bpm: 120,
  lastVol: -1,
  keyMult: 1,
  lastCutoff: -1,

  // Chord root (Hz, octave 2) and third (3 = minor, 4 = major).
  PROG: [
    { root: 110.0, third: 3 },  // Am
    { root: 87.31, third: 4 },  // F
    { root: 130.81, third: 4 }, // C
    { root: 98.0, third: 4 }    // G
  ],

  // Boss lead: semitones from A4 per 16th step (null = rest), one row per bar.
  LEAD: [
    [0, null, 3, null, 7, null, 3, null, 12, null, 10, null, 7, null, 3, null],
    [8, null, 7, null, 3, null, 0, null, 3, null, 7, null, 8, null, 7, null],
    [7, null, 3, null, 7, null, 10, null, 12, null, 10, null, 7, null, 3, null],
    [10, null, 7, null, 2, null, 7, null, 10, null, 14, null, 12, null, 10, 11]
  ],

  init() {
    if (this.gain || !Sfx.ctx) return;
    const c = Sfx.ctx;
    this.gain = c.createGain();
    this.gain.gain.value = 0;
    this.filter = c.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 12000;
    this.gain.connect(this.filter);
    this.filter.connect(c.destination);
    this.nextTime = c.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  },

  desiredMode() {
    if (!Save.data.settings.music) return 'off';
    if (game.state === State.MENU || game.state === State.GAMEOVER) return 'menu';
    if (game.dying) return 'off';
    return enemies.some((e) => e.boss && !e.dead) ? 'boss' : 'run';
  },

  // Called every animation frame.
  update() {
    if (!Sfx.ctx) return;
    if (!this.gain) this.init();
    if (!this.gain) return;

    this.mode = this.desiredMode();
    const inRun = this.mode === 'run' || this.mode === 'boss';
    const stage = inRun && game.stage ? game.stage : null;
    this.keyMult = stage ? Math.pow(2, stage.key / 12) : 1; // each stage has its own key
    this.bpm = { menu: 92, run: 124, boss: 146, off: 120 }[this.mode] + (stage ? stage.bpmAdd : 0);

    const duck = game.state === State.PAUSED || game.state === State.LEVELUP;
    let vol = { off: 0, menu: 0.5, run: 0.75, boss: 0.85 }[this.mode] * 0.32;
    if (duck) vol *= 0.45;
    if (game.state === State.GAMEOVER) vol *= 0.6;
    const lowHp = player && game.state === State.PLAYING && player.hp < stats.maxHp * 0.25;
    const cutoff = duck ? 900 : lowHp ? 1300 : 12000;

    const t = Sfx.ctx.currentTime;
    // Only add automation when the target changes, so events don't pile up.
    if (Math.abs(vol - this.lastVol) > 0.001) {
      this.gain.gain.cancelScheduledValues(t);
      this.gain.gain.setTargetAtTime(vol, t, 0.35);
      this.lastVol = vol;
    }
    if (cutoff !== this.lastCutoff) {
      this.filter.frequency.cancelScheduledValues(t);
      this.filter.frequency.setTargetAtTime(cutoff, t, 0.25);
      this.lastCutoff = cutoff;
    }
  },

  schedule() {
    const c = Sfx.ctx;
    if (!c) return;
    if (this.nextTime < c.currentTime - 0.25) this.nextTime = c.currentTime + 0.05; // resync after a stall
    while (this.nextTime < c.currentTime + 0.12) {
      if (this.mode !== 'off') this.playStep(this.step, this.nextTime);
      this.nextTime += 60 / this.bpm / 4;
      this.step = (this.step + 1) % 64;
    }
  },

  playStep(step, t) {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const ch = this.PROG[bar];
    const tones = [0, ch.third, 7, 12];
    const note = (semi, mult) => ch.root * this.keyMult * mult * Math.pow(2, semi / 12);
    const six = 60 / this.bpm / 4;

    if (this.mode === 'menu') {
      if (s === 0) for (const semi of tones.slice(0, 3)) this.voice('triangle', note(semi, 2), t, six * 15, 0.09, 0.5);
      if (s % 4 === 2) this.voice('sine', note(tones[(s >> 2) % 4], 4), t, six * 3, 0.06, 0.01);
      if (s === 0 || s === 8) this.voice('triangle', note(0, 1), t, six * 6, 0.14, 0.05);
      return;
    }

    // Drums
    if (s % 4 === 0) this.kick(t);
    if (s === 4 || s === 12) this.snare(t, 1);
    if (s % 2 === 1) this.hat(t, s % 4 === 3 ? 0.06 : 0.035);
    if (this.mode === 'boss' && bar === 3 && s >= 13) this.snare(t, 0.6);

    // Syncopated bass, octave jump on the "and" of beat 3
    if ([0, 3, 6, 8, 10, 14].includes(s)) this.voice('triangle', note(s === 10 ? 12 : 0, 1), t, six * 1.6, 0.3, 0.005);

    // Arpeggio
    if (s % 2 === 0) this.voice('square', note(tones[(s >> 1) % 4], 4), t, six * 0.9, 0.03, 0.003);

    // Boss lead
    if (this.mode === 'boss') {
      const semi = this.LEAD[bar][s];
      if (semi !== null) this.voice('sawtooth', 440 * this.keyMult * Math.pow(2, semi / 12), t, six * 1.9, 0.045, 0.01, 2600);
    }
  },

  voice(type, freq, t, dur, vol, attack = 0.005, lowpass = 0) {
    const c = Sfx.ctx;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.02));
    let node = osc;
    if (lowpass) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      osc.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(this.gain);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  },

  kick(t) {
    const c = Sfx.ctx;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.14);
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(g);
    g.connect(this.gain);
    osc.start(t);
    osc.stop(t + 0.2);
  },

  noiseHit(t, dur, vol, type, freq) {
    const c = Sfx.ctx;
    const src = c.createBufferSource();
    src.buffer = Sfx.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.gain);
    src.start(t, Math.random() * 0.3);
    src.stop(t + dur + 0.02);
  },

  snare(t, k) {
    this.noiseHit(t, 0.13, 0.35 * k, 'bandpass', 1800);
    this.voice('triangle', 190, t, 0.08, 0.15 * k, 0.002);
  },

  hat(t, vol) {
    this.noiseHit(t, 0.03, vol * 2, 'highpass', 7000);
  }
};
