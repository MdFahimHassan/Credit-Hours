// player.js - position, movement, and X/Y-separated collision.
import { TILE, HEAD, FOOT, boxHitsSolid, solidRectsAt, isStairs, headWallBottom, footWallTop } from './map.js';
import { input } from './input.js';

const STAIR_SPEED = 0.85;   // walking speed on the stairs (1 = same as flat ground)
const STAIR_BOB = 2;       // how many px the body lifts on each step
const SWIM_SPEED = 0.6;    // swimming speed in the pool (1 = same as flat ground)
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
    this.onStairs = false;                   // true while the feet are on a stair flight (slower, and the sprite bobs with each step)
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
    this.onStairs = isStairs(Math.floor(this.cx / TILE), Math.floor((this.y + this.h - 2) / TILE));
    const speed = this.swimming ? this.speed * SWIM_SPEED : this.onStairs ? this.speed * STAIR_SPEED : this.speed;

    // --- X axis first: move, then undo overlap ---
    this.x += dx * speed * dt;
    let hit = solidRectsAt(this.x, this.y, this.w, this.h);
    if (hit.length) {
      // snap flush against the nearest edge we ran into (a whole tile, or a thin wall like a stair handrail)
      if (dx > 0) this.x = Math.min(...hit.map((r) => r.x)) - this.w;
      else if (dx < 0) this.x = Math.max(...hit.map((r) => r.x + r.w));
    }
    // --- then Y axis: doing them separately lets you SLIDE along walls ---
    this.y += dy * speed * dt;
    hit = solidRectsAt(this.x, this.y, this.w, this.h);
    if (hit.length) {
      if (dy > 0) this.y = Math.min(...hit.map((r) => r.y)) - this.h;
      else if (dy < 0) this.y = Math.max(...hit.map((r) => r.y + r.h));
    }

    // --- head and foot clearance: keep the head and the shoes off the plaster walls above / below (only if the player still fits) ---
    // (each push only happens if the player then still has room on the other side too, so a 1-tile gap never traps or blocks him)
    const wallBottom = this.swimming ? null : headWallBottom(this.x, this.y, this.w);   // (not while swimming: the pool rim must not push you about)
    if (wallBottom !== null && this.y < wallBottom + HEAD) {
      const ny = wallBottom + HEAD, ft = footWallTop(this.x, ny, this.w, this.h);
      if (!boxHitsSolid(this.x, ny, this.w, this.h) && (ft === null || ny + this.h <= ft - FOOT)) this.y = ny;
    }
    const wallTop = this.swimming ? null : footWallTop(this.x, this.y, this.w, this.h);
    if (wallTop !== null && this.y + this.h > wallTop - FOOT) {
      const ny = wallTop - FOOT - this.h, hb = headWallBottom(this.x, ny, this.w);
      if (!boxHitsSolid(this.x, ny, this.w, this.h) && (hb === null || ny >= hb + HEAD)) this.y = ny;
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
    if (!this.onStairs || !this.moving) return 0;
    const k = (this.stepDist % STEP_PX) / STEP_PX;                 // 0..1 through the current step
    return -Math.round(Math.sin(k * Math.PI) * STAIR_BOB);
  }
}