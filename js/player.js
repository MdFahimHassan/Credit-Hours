// player.js - position, movement, and X/Y-separated collision.
import { TILE, COLL_H, groundDY, solidRectsAt, isStairs, stairwellDepth } from './map.js';
import { input } from './input.js';

const STAIR_SPEED = 0.85;   // walking speed on the stairs (1 = same as flat ground)
const STAIR_BOB = 2;       // how many px the body lifts on each step
const SWIM_SPEED = 0.6;    // swimming speed in the pool (1 = same as flat ground)
const DESCENT_PX = 13;      // how many px he has sunk by the time he reaches the dark end of the big stairs down
const STEP_PX = 16;        // one stair step = 16px (two per tile)

export class Player {
  constructor(tx, ty) {
    this.w = 20; this.h = 20;               // hitbox is smaller than the 32px sprite
    this.x = tx * TILE + (TILE - this.w) / 2; // x,y = top-left of the HITBOX
    this.y = ty * TILE + (TILE - this.h) / 2;
    this.speed = 120;                        // pixels PER SECOND (not per frame!)
    this.facing = 'down';                    // 'up' | 'left' | 'down' | 'right' (which sprite row to draw)
    this.moving = false;                     // true while actually walking (plays the walk cycle)
    this.animTime = 0;                       // seconds spent walking (drives the animation frame)
    this.sitting = false;                    // true while sitting on a bench
    this.sitTime = 0;                        // seconds spent sitting (so a held walk key doesn't stand you up instantly)
    this.preSit = null;                      // where we stood before sitting (we go back there when standing up)
    this.swimming = false;                   // true while in the pool (see pool.js ladder)
    this.climbing = false;                   // true while on the pool ladder (the sprite plays the climbing row instead of walking)
    this.climbFront = false;                 // climbing while facing the camera (the south ladder) instead of with his back to it
    this.climbFrame = 0;                     // which of the 6 climb frames to draw (set by pool.js ladder)
    this.onStairs = false;                   // true while the feet are on a stair flight (slower, and the sprite bobs with each step)
    this.descent = 0;                        // 0..1: how far down the big stairs (zone 3) he is: he sinks, dims and dips on every step (stairBob / renderer drawPlayer)
    this.stairDir = 1;                       // 1 = walking down (west), -1 = coming back up (east)
    this.stepDist = 0;                       // pixels walked on stairs (drives the step bob: one bob per 16px = one stair step)
  }
  // Sit on a bench tile found by findSeat(): the sprite's sitting pose is drawn by sprites.js
  sitDown(seat) {
    this.preSit = { x: this.x, y: this.y };
    this.sitting = true; this.sitTime = 0; this.moving = false; this.animTime = 0;
    this.facing = seat.facing;
    this.x = seat.x - this.w / 2;
    this.y = seat.y - this.h / 2 + 1;        // +1: nudge so the seated sprite rests on the seat
  }
  standUp() {
    this.sitting = false;
    if (this.preSit) { this.x = this.preSit.x; this.y = this.preSit.y; }
  }
  get cx() { return this.x + this.w / 2; }   // center, handy for distance checks
  get cy() { return this.y + this.h / 2; }

  update(dt, canMove) {
    if (!canMove) { this.moving = false; this.animTime = 0; return; }   // frozen during dialogue
    let dx = (input.right() ? 1 : 0) - (input.left() ? 1 : 0);
    let dy = (input.down() ? 1 : 0) - (input.up() ? 1 : 0);
    if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; } // diagonal isn't faster

    const ox = this.x, oy = this.y;           // remember where we started (to know if we really moved)
    if (dx < 0) this.facing = 'left'; else if (dx > 0) this.facing = 'right';
    else if (dy < 0) this.facing = 'up'; else if (dy > 0) this.facing = 'down';

    // Walking on a stair flight is a little slower than on the flat (so the steps are felt, but not a lot)
    const sd = stairwellDepth(this.cx, this.cy);                         // the big stairs down (stairwell.js): -1 = not on them
    this.descent = sd < 0 ? 0 : sd;
    if (sd >= 0 && dx) this.stairDir = dx < 0 ? 1 : -1;
    this.onStairs = sd >= 0 || isStairs(Math.floor(this.cx / TILE), Math.floor((this.y + this.h - 2) / TILE));
    const speed = this.swimming ? this.speed * SWIM_SPEED : this.onStairs ? this.speed * STAIR_SPEED : this.speed;

    // --- collision: only the FEET (a strip under the soles, see map.js groundBox) hit the map; swimming uses the whole hitbox (the water is a flat shape) ---
    const gy = this.swimming ? 0 : groundDY(this.h), gh = this.swimming ? this.h : COLL_H;   // box = [this.y + gy, this.y + gy + gh]
    // --- X axis first: move, then undo overlap ---
    this.x += dx * speed * dt;
    let hit = solidRectsAt(this.x, this.y + gy, this.w, gh);
    if (hit.length) {
      // snap flush against the nearest edge we ran into (a whole tile, or a thin wall like a stair handrail)
      if (dx > 0) this.x = Math.min(...hit.map((r) => r.x)) - this.w;
      else if (dx < 0) this.x = Math.max(...hit.map((r) => r.x + r.w));
    }
    // --- then Y axis: doing them separately lets you SLIDE along walls ---
    this.y += dy * speed * dt;
    hit = solidRectsAt(this.x, this.y + gy, this.w, gh);
    if (hit.length) {
      if (dy > 0) this.y = Math.min(...hit.map((r) => r.y)) - gy - gh;
      else if (dy < 0) this.y = Math.max(...hit.map((r) => r.y + r.h)) - gy;
    }

    // walking animation only plays if we actually moved (not when pushing against a wall)
    const moved = Math.hypot(this.x - ox, this.y - oy);
    this.moving = moved > 0.01;
    this.animTime = this.moving ? this.animTime + dt * (this.swimming ? SWIM_SPEED : this.onStairs ? STAIR_SPEED : 1) : 0;   // slower legs on the stairs too
    this.stepDist = this.onStairs ? this.stepDist + moved : 0;
  }

  // How far (px, negative = up) the sprite is lifted right now: on a stair flight each step lifts the body a touch and lets it
  // settle again, once per 16px walked (= the height of one stair step as drawn by renderer.js drawFlight).
  get stairBob() {
    const sink = Math.round(this.descent * DESCENT_PX);             // the big stairs down: he is lower the further down he is
    if (!this.onStairs || !this.moving) return sink;
    const k = (this.stepDist % STEP_PX) / STEP_PX;                 // 0..1 through the current step
    if (this.descent > 0) return sink + Math.round(Math.sin(k * Math.PI) * STAIR_BOB) * this.stairDir;   // going down each step DROPS the body (going up lifts it)
    return -Math.round(Math.sin(k * Math.PI) * STAIR_BOB);
  }
}