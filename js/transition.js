// transition.js - black fade between zones: fade OUT -> swap zone -> fade IN.
import { TILE, loadZone } from './map.js';
import { warmup } from './warmup.js';

const FADE = 0.35;   // seconds for each half. Make it bigger for a slower fade.

export const transition = {
  active: false,
  phase: 'out',      // 'out' = screen going black, 'load' = black while the new zone is prepared, 'in' = black clearing
  t: 0,
  exit: null,        // the exit object from zones.js we are travelling through
  prepare: null,     // set by main.js: (player) => list of warm-up tasks for the zone that was just loaded (see warmup.js)

  start(exit) {
    if (this.active) return;
    this.active = true; this.phase = 'out'; this.t = 0; this.exit = exit;
  },

  update(dt, player) {
    this.t += dt;
    if (this.phase === 'load') {                                // black screen: paint the new zone's heavy pictures a slice per frame, then fade in
      if (warmup.step(dt)) { this.phase = 'in'; this.t = 0; }
      return;
    }
    if (this.phase === 'out' && this.t >= FADE) {
      loadZone(this.exit.to);                                   // screen is fully black: swap the zone
      const s = this.exit.spawn;
      player.x = s.x * TILE + (TILE - player.w) / 2;            // put the player on the arrival tile
      player.y = s.y * TILE + (TILE - player.h) / 2;
      player.facing = this.exit.facing ?? 'down';
      player.moving = false; player.animTime = 0;
      this.phase = 'load'; this.t = 0;
      warmup.start(this.prepare ? this.prepare(player) : []);
    } else if (this.phase === 'in' && this.t >= FADE) {
      this.active = false;
    }
  },

  // 0 = clear, 1 = fully black
  get alpha() {
    if (!this.active) return 0;
    const k = Math.min(1, this.t / FADE);
    return this.phase === 'out' ? k : this.phase === 'load' ? 1 : 1 - k;
  },
};