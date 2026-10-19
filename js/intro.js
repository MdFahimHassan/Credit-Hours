// intro.js - the opening cutscene: the player rides the escalator up from the
// floor below, the screen fades in, then he steps off onto the landing.
// It finds the escalator by scanning the map for 'E' tiles, so if you move or
// resize the escalator in map.js, nothing here needs to change.
// (This escalator runs WEST: the steps come out of a hatch at its EAST end.)
import { TILE, spawn } from './map.js';
import { geo, rideAt, RIDE_TIME } from './escalator.js';

// The ride itself (path, speed, the rider growing out of the dark far end of the belt) lives in escalator.js.
// If you move or resize the E/F tiles in zones.js nothing here needs to change.
const STEP_TIME = 0.7;   // walking off the end
const FADE_TIME = 1.8;   // black -> clear

export const escalator = { row: geo.eRow, left: geo.left, right: geo.right };
const endRide = rideAt(1);                       // where the belt meets the landing

export const intro = {
  active: true,
  t: 0,
  rider: { scale: 1, alpha: 1 },                 // how the renderer draws the player during the ride
  // 1 = fully black, 0 = clear
  get fade() { return Math.max(0, 1 - this.t / FADE_TIME); },

  update(dt, player) {
    this.t += dt;
    player.facing = 'left';                                          // we travel west
    if (this.t < RIDE_TIME) {
      player.moving = false; player.animTime = 0;                    // standing still on the belt
      const r = rideAt(this.t / RIDE_TIME);                          // emerges small and dark from the far end, grows as he rises
      this.rider.scale = r.scale; this.rider.alpha = r.alpha;
      place(player, r.cx, r.cy);
    } else if (this.t < RIDE_TIME + STEP_TIME) {
      this.rider.scale = 1; this.rider.alpha = 1;
      player.moving = true; player.animTime += dt;                   // walk off the end
      const k = (this.t - RIDE_TIME) / STEP_TIME;
      const e = k * k * (3 - 2 * k);                                 // smoothstep ease
      const goalX = spawn.x * TILE + TILE / 2, goalY = spawn.y * TILE + TILE / 2;
      place(player, endRide.cx + (goalX - endRide.cx) * e, endRide.cy + (goalY - endRide.cy) * e);
    } else {
      this.skip(player);
    }
  },

  // Back to the very start (a new run from the menu): black screen, the player on the escalator again
  reset() { this.active = true; this.t = 0; this.rider.scale = 1; this.rider.alpha = 1; },

  // Jump straight to the end (also called when the cutscene finishes naturally)
  skip(player) {
    place(player, spawn.x * TILE + TILE / 2, spawn.y * TILE + TILE / 2);
    player.facing = 'left'; player.moving = false; player.animTime = 0;
    this.rider.scale = 1; this.rider.alpha = 1;
    this.active = false;
    this.t = FADE_TIME;
  },
};

// Put the player's HITBOX so its center is at (cx, cy)
function place(p, cx, cy) { p.x = cx - p.w / 2; p.y = cy - p.h / 2; }