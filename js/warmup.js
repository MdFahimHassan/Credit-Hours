// warmup.js - paints the heavy one-time pictures of a zone (floor, foliage, skyline panoramas, stairs, escalator...) BEHIND A BLACK SCREEN.
// Before, every one of them was built the first time it was drawn, in the middle of play: entering a zone froze the game for 0.5 s on a fast PC and
// for several seconds on a phone. Now main.js (at start-up) and transition.js (after each fade-out) hand a list of small tasks to warmup.start(), run one
// slice per frame (~8 ms) while the screen is black, and only then fade in. A task that returns `false` is "not ready yet" (e.g. the sprite sheet is still
// downloading) and is tried again for up to 4 seconds.
export const warmup = {
  active: false,
  queue: [],
  total: 0,
  t: 0,
  start(tasks) { this.queue = tasks.slice(); this.total = tasks.length; this.active = this.queue.length > 0; this.t = 0; },
  // runs for a few ms; returns true when everything is done
  step(dt) {
    this.t += dt;
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < 8) {
      const task = this.queue.shift();
      let ok = true;
      try { ok = task() !== false; } catch (e) { console.error('warm-up task failed', e); }    // a failed task must never block the game
      if (!ok && this.t < 4) this.queue.push(task);
      else if (!ok) console.warn('warm-up task gave up');
      if (!ok && this.queue.length === 1) break;                                              // only a waiting task left: try again next frame
    }
    if (!this.queue.length) this.active = false;
    return !this.active;
  },
  get progress() { return this.total ? 1 - this.queue.length / this.total : 1; },
};