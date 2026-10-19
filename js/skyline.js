// skyline.js - what you see beyond the edges of a zone: the city past the rails, the cream wall of the building,
// and the open paths / stairs that lead off the edge towards other zones.
//
// WHAT CHANGED (v2)
//   * NOTHING IS STRETCHED ANY MORE. Every picture is drawn at its real size (1 picture pixel = 1 screen pixel), just
//     like the tiles. The old version squashed one long picture into whatever space was revealed - that was the
//     "weird stretch" near the rails.
//   * The skyline is always "there" beyond a rail. Getting closer only does two things, both smooth:
//       1. the camera slides past the edge (the world simply carries on beyond the rail), and
//       2. a layer of FOG over the city thins out - far away it is a milky mist, at the rail it is almost clear.
//     Pressing [E] at a rail (lean out) clears the last of the fog.
//   * Beyond the edge, everywhere that is not a rail window, is the cream concrete wall of the building (same warm
//     colour as the big stairs / the lobby walls). A window ends in a concrete pier, so a corner is just wall:
//     the skyline never "turns the corner" any more.
//   * Exits (paths / stairs on the edge of a zone) are no longer a black hole in the wall. The path simply carries on
//     for a few tiles - stone slabs, a railing on both sides - and fades softly into black, so it reads as
//     "this goes somewhere". (The exit tile itself still works exactly as before.)
//
// HOW IT WORKS
//   Every edge ("side": n / e / s / w) has its own LOCAL FRAME: u = distance along the edge, d = distance away from it.
//   Two pictures are painted once per zone and side (cached): `deco` (concrete details, the terrace, the exit paths)
//   and `pano` (the skyline, painted at a slightly smaller zoom Z so the horizon fits in the visible depth).
//   drawSide() then lays the local frame onto the world with a plain 1:1 transform (a flip / quarter turn, no scaling).
//
// TWEAK ME (all the numbers are in this block)
const PH = 320;               // depth (px) of the painted pictures = the furthest you can ever see beyond an edge
const Z = 0.72;               // zoom of the skyline painting (smaller = the city looks further away / more of it fits)
const LIP = 24;               // width (px) of the rail band at the edge of the last tile (see renderer.js drawRail)
const OVER_WIN = 270;         // px of view revealed beyond a rail when you touch it
const OVER_PATH = 250;        // px revealed beyond an exit when you stand next to it (the path + the black fade)
const LEAN_EXTRA = 40;        // extra px revealed while leaning out
const LEAN_PUSH = 60;         // how far the camera is pushed toward the rail while leaning
const NEAR = 5 * 32;          // the view starts to appear when you are closer than this (5 tiles)
const FOG_FAR = 1.0;          // fog strength when you are far from the rail (0 = none, 1 = thick milk)
const FOG_NEAR = 0.07;        // fog strength when touching the rail (a hint of haze stays)
const FOG_COL = '#dcd8cd';    // fog colour (slightly warm white)
const PATH_LEN = 176;         // how far an open path carries on beyond the edge (px) before it is black
const STAIR_LEN = 192;        // same for a flight of stairs
const EXIT_VIEW = { zone3: { s: 80 } };   // per zone + side: reveal only this many px beyond an exit instead of OVER_PATH (and fade to black within it). Zone 3's south edge shows just a short glimpse of what is below
const REVEAL_SPEED = 5;       // how quickly the camera slides (higher = snappier)

import { TILE, FOOT, groundDY, getTile, getExit, zoneId, cols, rows, widthPx, heightPx, curvedRails, roundedCorners, innerCorners } from './map.js';
import { railPath, faceX, mirrorX, RAIL_W } from './curverail.js';
import { vineStrands, railVineStrands, drawCurveVines, drawVines, drawVineLip } from './foliage.js';
import { paintDoorFront } from './glassdoor.js';

const SIDES = ['n', 'e', 's', 'w'];
const FACE = { n: 'up', e: 'right', s: 'down', w: 'left' };
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const EO = PH / Z;            // depth of the painting in its own (zoomed) units

// ---------------------------------------------------------------------------------------------
// Per-zone settings
//   SKIP        sides that never show a skyline, even if a stray rail tile is there (zone 1's west side is another zone)
//   WINDOW_FILL tile ranges that show the skyline although they have no rail (zone 1: the wall behind the east hedge bed)
//   WALL_STYLE  'concrete' (default) or 'terrace' (the wall of the level above, with planters and vines)
// ---------------------------------------------------------------------------------------------
const SKIP = { zone1: ['w'], zone2: [] };
const SKIP_TILES = { zone2: { e: [0, 29] }, zone3: { s: [73] } };   // (zone 3: the south-east corner tile (68, 51) is part of the EAST rail only, so the east skyline runs on round the corner without a little south window)   // zone 2: the north rails (x 9-29, along the corridor) show the skyline; the corner rail tile (0,0) belongs to the west skyline only
const WINDOW_FILL = { zone1: { e: [[8, 21]] }, zone2: { w: [[8, 21]] } };   // zone 2: the wall behind the west hedge bed
// CURVED RAILS (curverail.js, `curvedRails` in zones.js): the west rail steps in towards the floor for a stretch and back out in smooth bends (zone 3, beside the hole).
//   The window along the edge stays ONE straight picture (the x0 rail tiles are all rails). Where the rail has stepped in, the picture simply carries on to the
//   left of it: the picture has `depth` px of near ground on the wrong side of its edge line (paintPano dneg), and drawCurvedBays() paints it into the area outside the curve.
const BAY_NEAR = 96;   // px of near ground (the street at d 46-58 + the roofs round it) that is repeated to fill a deep bay (see paintPano)
const bayDepthPx = (side) => Math.max(0, ...curvedRails.filter((c) => c.side === side).map((c) => c.depth));   // (c.side: 'w' or 'e', see curverail.js)
// a rounded rail corner needs the picture of its side to reach r px past the edge, into the map (the notch outside the quarter circle, see drawCornerNotch)
const cornerDepthPx = (side) => Math.max(0, ...roundedCorners.filter((c) => c.corner[1] === side).map((c) => c.r));   // (c.corner[1] = 'w' or 'e')
const WALL_STYLE = { zone1: { n: 'terrace' } };
const wallStyle = (zid, side) => WALL_STYLE[zid]?.[side] ?? 'concrete';
// EXTEND: the skyline of this side carries on past the START of the edge (u < 0) instead of ending in a cream-wall corner.
//   zone 1: the east skyline runs on up past the top-right corner, the south skyline runs on left past the bottom-left corner.
//   It also carries on past the END of the edge, so the bottom-right corner (east + south) can turn smoothly (see drawCorner).
const EXTEND = { zone1: { e: true, s: true }, zone2: { n: true, w: true, s: true }, zone3: { n: true, w: true, e: true } };   // zone 2: the west skyline runs the full height and on past the top corner; west + south meet in a turning corner (CORNER)
const EXTEND_S_END = ['zone2'];   // zones whose SOUTH skyline also runs on past the south-east corner (beside the path that leaves there)
const EXTEND_END_E = ['zone3'];   // zones whose east skyline runs on past the END of the edge (the south-east corner is skyline, not a drawCorner square)
const EXT = 480;                // how far (px) the skyline carries on past the corner (the camera can never show more than PH = 320)
// STAIRS_DARK: flights of stairs on these zones do NOT show steps / rails / extra view beyond the edge: the stairs lead straight
// up to the next level (zone 1: the lawn, painted by renderer.js). The camera does not slide out for them either.
const STAIRS_DARK = ['zone1'];
// PATH_RAILS: which sides of an open path carry a railing, [first side, last side] (u0 side, u1 side); default both.
//   zone 3 south: the 1-tile entry path from zone 1 is just a path between two plain walls.  zone 3 west: the path to zone 2 has a rail on its north side only (the south side is the wall)
//   a side may also be an object keyed by the FIRST TILE of each path (the row / column of its first exit tile): { 10: [false, false], 28: [false, true] }; paths not listed keep both rails.
//   zone 2 east: the two lift paths (rows 10-11, 19-20) are plain walls both sides; the north corridor (rows 1-2) and the south path (row 28) have no path rail of their own: the bay rail carries on beside them (RUN_ON).
const pathRails = (side, grp) => { const c = PATH_RAILS[zoneId]?.[side]; return (Array.isArray(c) ? c : c?.[grp.a]) ?? [true, true]; };
const PATH_RAILS = { zone1: { w: [false, false] }, zone2: { e: { 10: [false, false], 19: [false, false], 1: [false, false], 28: [false, false] } }, zone3: { s: [false, false], w: [true, false] } };
// PATH_CONT / RUN_ON: the edge rail of the zone carries on along one side of the open path that sits right beside it (zone 1 west: the south rail of the bay runs on past the corner;
//   zone 2 east: the north and the south rail run on beside the corridor / the south path). RUN_ON is drawn by renderer.js drawRunOnRail (see runOnRails below).
// PATH_RAIL_FRONT: the rail on one side of an open path is drawn IN FRONT of the skyline window beside it (it would otherwise be hidden by the window's picture).
//   key = first tile of the path group; wall 0 = the u0 side, 1 = the u1 side. (zone 1 north: the path at x31-32 runs between the hedge bed and the north-east skyline window; its right rail goes up the window's edge)
const PATH_RAIL_FRONT = { zone1: { n: { 31: { wall: 1 } } } };
const PATH_CONT = { zone1: { w: { 28: 1 } }, zone2: { e: { 1: 0, 28: 1 } } };   // key = first tile of the path; value = which side (0 = u0, 1 = u1) has the carried-on rail beside it, so its floor reaches 8px further to meet the rail's parapet
// PATH_DOORS: glass room doors (the ones on zone 1's west wall) in the plain wall beside an open path. key = first row of the path group; wall 0 = the u0 (north) side, 1 = the u1 (south) side;
//   doors = [[ch, d], ...]: ch = 'j' (3 panes) or 'e' (2 panes); d = distance (px) from the edge of the map to the start of the 64px door (one plain tile of wall, 32px, between two doors).
const PATH_DOORS = { zone1: { w: { 28: { wall: 0, doors: [['j', 40], ['e', 136]] }, 19: { wall: 1, doors: [['e', 40], ['j', 136]] }, 10: { wall: 0, doors: [['j', 40], ['e', 136]] } } } };
// WINDOW_TRIM: px cut off the END of the last skyline window of a side, so the rail of the open path that follows it (see PATH_RAILS) is not painted over by the picture
const WINDOW_TRIM = { zone3: { w: { b: 47, px: 24 } } };   // (the window whose last tile row is b)
// SHARE: this side's skyline window does not paint its own picture, it shows the picture of another side (in THAT side's direction, so
//   nothing turns). zone 1: the north window (x 31-37, top right) shows the east skyline, which simply carries on to the left.
//   The source side gets DNEG extra px of near ground on the "wrong" side of its edge for that (see paintPano, dneg).
const SHARE = { zone1: { n: 'e' } };
const DNEG = 240;
// OPEN_END: this side's window has no concrete pier at its far end (its picture goes on round the corner)
const OPEN_END = { zone1: ['n'] };
// LINK: sides whose skylines are one picture round a corner: they share the same fog clearness so no seam shows
const LINK = { zone1: ['n', 'e', 's'], zone2: ['w', 's'], zone3: ['w', 'n', 'e'] };
// ROAD_FIX: the street round the corner must have the same distance / width on both sides so the two roads meet in a clean mitre
const ROAD_FIX = { zone1: { e: { d: 46, h: 12 }, s: { d: 46, h: 12 } }, zone2: { w: { d: 46, h: 12, speed: 18, cars: 1.2 }, s: { d: 46, h: 12 }, n: { d: 46, h: 12, speed: 18, cars: 1.2 } },
  zone3: { w: { d: 46, h: 12, speed: 18, cars: 1.2 }, n: { d: 46, h: 12, speed: 18, cars: 1.2 }, e: { d: 46, h: 12, speed: 18, cars: 1.2 } } };   // (n: so the west road and the north road meet in a mitre at the north-west corner, see drawCornerNW)

// ---------------------------------------------------------------------------------------------
// Which parts of the edges are rails (skyline windows) and which are exits (paths / stairs). Cached per zone.
// ---------------------------------------------------------------------------------------------
let featZone = null, feat = null;
function features() {
  if (featZone === zoneId && feat) return feat;
  featZone = zoneId; feat = {};
  const skip = SKIP[zoneId] ?? [];
  for (const s of SIDES) {
    const n = s === 'n' || s === 's' ? cols : rows;
    const at = (i) => s === 'n' ? [i, 0] : s === 's' ? [i, rows - 1] : s === 'w' ? [0, i] : [cols - 1, i];
    const rails = [], exits = [], exitsView = [], set = new Set();
    for (let i = 0; i < n; i++) {
      const [x, y] = at(i);
      if (getTile(x, y) === 'R' && !skip.includes(s) && !(SKIP_TILES[zoneId]?.[s] ?? []).includes(i)) { rails.push(i); set.add(i); }
      if (getExit(x, y)) {
        exits.push(i);
        if (!(STAIRS_DARK.includes(zoneId) && getTile(x, y) === 'S')) exitsView.push(i);   // dark stairs never pull the camera out
      }
    }
    if (!skip.includes(s)) for (const [a, b] of WINDOW_FILL[zoneId]?.[s] ?? []) for (let i = a; i <= b; i++) set.add(i);
    const sorted = [...set].sort((x, y) => x - y), windows = [];
    let cur = null;
    for (const i of sorted) { if (cur && i === cur.b + 1) cur.b = i; else { if (cur) windows.push(cur); cur = { a: i, b: i }; } }
    if (cur) windows.push(cur);
    // exits: neighbouring exit tiles form one "group" (one opening in the wall); inside it, stair tiles and path tiles are segments
    const groups = [];
    let g = null;
    for (const i of exits) {
      const [x, y] = at(i), st = getTile(x, y) === 'S';
      if (g && i === g.b + 1) { g.b = i; const last = g.segs[g.segs.length - 1]; if (last.stairs === st) last.b = i; else g.segs.push({ a: i, b: i, stairs: st }); }
      else { if (g) groups.push(g); g = { a: i, b: i, segs: [{ a: i, b: i, stairs: st }] }; }
    }
    if (g) groups.push(g);
    const ex = EXTEND[zoneId]?.[s] ? EXT : 0;
    feat[s] = { len: n * TILE, rails, exits, exitsView, windows, groups, ext: ex, extEnd: ex,
                dneg: Math.max(Object.values(SHARE[zoneId] ?? {}).includes(s) ? DNEG : 0, bayDepthPx(s), cornerDepthPx(s)), share: SHARE[zoneId]?.[s] ?? null };
  }
  return feat;
}

// RUN_ON: stretches of rail drawn BEYOND the map, carrying a bay's edge rail on along a path (renderer.js draws them like the real rail tiles):
//   [{ edge, ty, a, b }] = tiles a..b (tile x, may lie outside the map) on row ty, hung on that edge ('n' / 's')
export function runOnRails() {
  if (zoneId === 'zone1') return [{ edge: 's', ty: rows - 1, a: -16, b: -1 }];
  if (zoneId === 'zone2') return [{ edge: 'n', ty: 0, a: cols, b: cols + 15 }, { edge: 's', ty: rows - 1, a: cols, b: cols + 15 }];
  return [];
}

// distance (px) from the player's hitbox to the nearest tile of a list along one edge. `inset` = how deep the tile row is
// (a rail tile row is 1 tile deep, the exit tiles themselves are right on the edge)
// how far (px) the west rail's face stands in from the edge at height y (curved rails, see CURVED RAILS)
const curvedFace = (y, side = 'w') => Math.max(0, ...curvedRails.filter((c) => c.side === side).map((c) => faceX(c, y)));
// distance (px) from the player's hitbox to the nearest point of the INNER face of any curved rail (bay) on this side, in every direction - so the fog clears
// when you walk up to the north / south walls of a bay just as it does when you walk up to the straight edge from the east (curverail.js)
const curveCache = new Map();
function curveFacePts(c) {
  const key = c.y0 + ',' + c.y1 + ',' + c.depth + ',' + c.r + ',' + c.side + ',' + c.closed + ',' + c.ret + ',' + c.tail + ',' + c.W;
  let pts = curveCache.get(key);
  if (!pts) {
    pts = railPath(c).pts.map((q) => { const x = q.x + q.ty * RAIL_W, y = q.y - q.tx * RAIL_W; return { x: c.side === 'e' ? c.W - x : x, y }; });
    curveCache.set(key, pts);
  }
  return pts;
}
function curveDist(side, p) {
  let best = Infinity;
  const gt = p.y + groundDY(p.h), gb = p.y + p.h + FOOT;           // only the feet (the strip under the soles) meet the rail
  for (const c of curvedRails) {
    if (c.side !== side) continue;
    for (const q of curveFacePts(c)) {
      const dx = Math.max(p.x - q.x, 0, q.x - (p.x + p.w)), dy = Math.max(gt - q.y, 0, q.y - gb);
      const d = Math.hypot(dx, dy);
      if (d < best) best = d;
    }
  }
  return best;
}
// `ground` = measure from the player's feet (the strip under the soles, map.js groundBox) to the rail's visible inner face (inset = RAIL_W): that is where he can really stand.
// (the exit paths are measured from the hitbox, inset 0, as before)
function edgeDist(side, p, list, inset, ground = false) {
  const top = ground ? p.y + groundDY(p.h) : p.y, bot = ground ? p.y + p.h + FOOT : p.y + p.h, mid = (top + bot) / 2;
  let perp, lc;
  if (side === 'e') { const f = curvedFace(mid, 'e'); perp = (f > 0 ? widthPx - f - RAIL_W : cols * TILE - inset) - (p.x + p.w); lc = p.cy; }
  else if (side === 'w') { const f = curvedFace(mid); perp = p.x - (f > 0 ? f + RAIL_W : inset); lc = p.cy; }
  else if (side === 'n') { perp = top - inset; lc = p.cx; }
  else { perp = rows * TILE - inset - bot; lc = p.cx; }
  perp = Math.max(0, perp);
  let best = Infinity;
  for (const i of list) {
    const lat = Math.max(0, Math.abs(lc - (i * TILE + TILE / 2)) - TILE / 2);
    best = Math.min(best, Math.hypot(perp, lat));
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// State: how much is revealed on each side, how clear the fog is, and the lean-out
// ---------------------------------------------------------------------------------------------
export const skyline = {
  over: { n: 0, e: 0, s: 0, w: 0 },     // px revealed past each edge (the camera uses this)
  close: { n: 0, e: 0, s: 0, w: 0 },    // smoothed 0..1 closeness to a rail on each side (drives the fog)
  pclose: { n: 0, e: 0, s: 0, w: 0 },   // smoothed 0..1 closeness to an exit on each side
  lean: 0,                              // 0..1 how far we are leaning out
  leaning: false, leanSide: null, leanTime: 0,
  touch: null,                          // side whose rail the player is touching right now (or null)
  _zone: null,
  forget() { this._zone = null; },   // a new run: the next sync() resets everything (main.js resetRun)

  // forget everything when the zone changes, and paint the new zone's pictures one by one in the background
  sync() {
    if (this._zone === zoneId) return;
    this._zone = zoneId;
    for (const s of SIDES) { this.over[s] = 0; this.close[s] = 0; this.pclose[s] = 0; }
    this.lean = 0; this.leaning = false; this.leanSide = null; this.leanTime = 0; this.touch = null;
    // (the pictures of every side are painted ahead of time behind the black screen, see warmup.js / skylineWarmTasks)
  },

  update(dt, p) {
    this.sync();
    const f = features();
    this.touch = null;
    let best = Infinity;
    for (const s of SIDES) {
      const F = f[s];
      const dw = F.rails.length ? edgeDist(s, p, F.rails, RAIL_W, true) : Infinity;
      const dFog = Math.min(dw, curveDist(s, p));            // fog + reveal: the distance to the rail in ANY direction (a bay's north / south walls count too)
      const dp = F.exitsView.length ? edgeDist(s, p, F.exitsView, 0) : Infinity;
      let tw = clamp01(1 - dFog / NEAR);
      if (this.leaning && s === this.leanSide) tw = 1;
      this.close[s] += (tw - this.close[s]) * Math.min(1, dt * 4);
      this.pclose[s] += (clamp01(1 - dp / NEAR) - this.pclose[s]) * Math.min(1, dt * 4);
      if (Math.min(dFog, dp) < NEAR * 2) layers(s);
      if (dw <= 10 && dw < best) { best = dw; this.touch = s; }
    }
    this.lean += ((this.leaning ? 1 : 0) - this.lean) * Math.min(1, dt * 6);
    if (!this.leaning && this.lean < 0.01) { this.lean = 0; this.leanSide = null; }
    if (this.leaning) this.leanTime += dt;
    for (const s of SIDES) {
      let t = Math.max(OVER_WIN * smooth(this.close[s]), (EXIT_VIEW[zoneId]?.[s] ?? OVER_PATH) * smooth(this.pclose[s]));
      if (s === this.leanSide) t += LEAN_EXTRA * this.lean;
      t = Math.min(t, PH);
      this.over[s] += (t - this.over[s]) * Math.min(1, dt * REVEAL_SPEED);   // the camera glides, it never jumps
      if (t === 0 && this.over[s] < 0.3) this.over[s] = 0;
    }
  },

  canLean() { return !this.leaning && this.touch !== null; },
  startLean(p) {
    this.leaning = true; this.leanSide = this.touch; this.leanTime = 0;
    p.facing = FACE[this.leanSide];
  },
  stopLean() { this.leaning = false; },

  // E again, or a walk key that is not "toward the rail", lets go
  wantsRelease(input) {
    if (input.wasPressed('KeyE')) return true;
    if (this.leanTime < 0.25) return false;
    const L = input.left(), R = input.right(), U = input.up(), D = input.down();
    switch (this.leanSide) {
      case 'e': return L || U || D;
      case 'w': return R || U || D;
      case 'n': return D || L || R;
      default:  return U || L || R;
    }
  },

  // direction vector (length = lean amount) toward the rail we lean on
  vec() {
    const k = this.leanSide ? this.lean : 0;
    return { x: (this.leanSide === 'e' ? 1 : this.leanSide === 'w' ? -1 : 0) * k,
             y: (this.leanSide === 's' ? 1 : this.leanSide === 'n' ? -1 : 0) * k };
  },
  push() { const v = this.vec(); return { x: v.x * LEAN_PUSH, y: v.y * LEAN_PUSH }; },   // camera push
  bodyShift() { const v = this.vec(); return { x: v.x * 3, y: v.y * 3 }; },              // player sprite shift
  any() { return this.over.n > 0.5 || this.over.e > 0.5 || this.over.s > 0.5 || this.over.w > 0.5; },
};

// ---------------------------------------------------------------------------------------------
// Little helpers: seeded random, colours, canvases
// ---------------------------------------------------------------------------------------------
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const h2 = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
function mix(a, b, k) { const A = hex(a), B = hex(b); return '#' + h2(A[0] + (B[0] - A[0]) * k) + h2(A[1] + (B[1] - A[1]) * k) + h2(A[2] + (B[2] - A[2]) * k); }
const rgba = (c, a) => { const [r, g, b] = hex(c); return `rgba(${r},${g},${b},${a})`; };
const range = (r, t) => r[0] + (r[1] - r[0]) * t;
const pickOf = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];
function R(g, x, y, w, h, col) { if (col) g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }
function disc(g, x, y, r, col) { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }

// ---------------------------------------------------------------------------------------------
// THE CREAM WALL (world space, so it is seamless everywhere beyond the edges, corners included)
// Same warm cream-grey as the big stairs and the lobby walls: board-formed concrete with faint panel seams.
// ---------------------------------------------------------------------------------------------
const WALL = { base: '#bcb6a6', lit: '#cdc8b9', dark: '#a39d8e', cap: '#d6d1c3' };
let wallPattern = null;
function wallFill(ctx) {
  if (!wallPattern) {
    const S = 256, c = mkCanvas(S, S), g = c.getContext('2d'), rnd = rng(90210);
    g.fillStyle = WALL.base; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 46; i++) {                                   // soft blotches: slightly lighter / darker concrete
      const x = rnd() * S, y = rnd() * S, r = 18 + rnd() * 40;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const col = rnd() < 0.5 ? '255,250,238' : '70,62,48';
      gr.addColorStop(0, `rgba(${col},${0.05 + rnd() * 0.05})`); gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let x = 0; x < S; x += 64) { g.fillStyle = 'rgba(50,44,34,0.10)'; g.fillRect(x, 0, 1, S); g.fillStyle = 'rgba(255,252,240,0.12)'; g.fillRect(x + 1, 0, 1, S); }   // panel seams
    for (let y = 0; y < S; y += 128) { g.fillStyle = 'rgba(50,44,34,0.12)'; g.fillRect(0, y, S, 1); g.fillStyle = 'rgba(255,252,240,0.14)'; g.fillRect(0, y + 1, S, 1); }   // pour joints
    for (let i = 0; i < 700; i++) { g.fillStyle = i % 2 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.10)'; g.fillRect(Math.floor(rnd() * S), Math.floor(rnd() * S), 2, 1); }   // speckle
    for (let i = 0; i < 26; i++) {                                   // faint tie holes
      g.fillStyle = 'rgba(40,34,26,0.20)'; g.fillRect(16 + Math.floor(rnd() * 8) * 32, 20 + Math.floor(rnd() * 2) * 128 + Math.floor(rnd() * 20), 2, 2);
    }
    wallPattern = ctx.createPattern(c, 'repeat');
  }
  return wallPattern;
}

// ---------------------------------------------------------------------------------------------
// STONE SLABS for the open paths: the same grey square slabs as floor.js (one tile each, thin dark gaps)
// ---------------------------------------------------------------------------------------------
function paintSlabs(g, x0, y0, w, h) {
  const rnd = rng(4242 + Math.round(x0) * 7 + Math.round(y0));
  for (let sy = y0; sy < y0 + h; sy += TILE) for (let sx = x0; sx < x0 + w; sx += TILE) {
    const v = 134 + (rnd() - 0.5) * 12, t = (rnd() - 0.5) * 6;
    g.fillStyle = `rgb(${v + t},${v},${v - t + 2})`; g.fillRect(sx, sy, TILE, TILE);
    g.fillStyle = 'rgb(62,62,63)'; g.fillRect(sx, sy, TILE, 2); g.fillRect(sx, sy, 2, TILE);                 // dark gaps
    g.fillStyle = 'rgba(0,0,0,0.13)'; g.fillRect(sx + 2, sy + 2, TILE - 2, 1); g.fillRect(sx + 2, sy + 2, 1, TILE - 2);   // rim
    for (let i = 0; i < 9; i++) { g.fillStyle = i % 2 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'; g.fillRect(sx + 3 + Math.floor(rnd() * 27), sy + 3 + Math.floor(rnd() * 27), 2, 1); }
    disc(g, sx + 1, sy + 1, 5, 'rgba(40,40,44,0.45)');                                                       // smudge where four slabs meet
  }
}

// a run of railing: x runs ALONG the rail, y runs from the outer edge (0) inwards. `m` places that frame on the canvas.
// Same railing as renderer.js (concrete parapet + steel slats + posts).
function railRun(g, m, L) {
  g.save(); g.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
  for (let x = 0, i = 0; x < L; x += 32, i++) {
    g.fillStyle = '#a8a69d'; g.fillRect(x, 16, 32, 8);                                       // parapet
    g.fillStyle = '#cdcbc2'; g.fillRect(x, 16, 32, 2);
    g.fillStyle = 'rgba(40,36,30,0.28)'; g.fillRect(x, 18, 1, 6); g.fillRect(x + 16, 18, 1, 6);
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x, 22, 32, 2);
    for (const sx of [2, 10, 18, 26]) {                                                      // slats
      g.fillStyle = '#5a646d'; g.fillRect(x + sx, 2, 4, 13);
      g.fillStyle = '#8e99a3'; g.fillRect(x + sx, 2, 1, 13);
      g.fillStyle = '#3b434a'; g.fillRect(x + sx + 3, 2, 1, 13);
    }
    g.fillStyle = '#a9b2ba'; g.fillRect(x, 0, 32, 2); g.fillRect(x, 14, 32, 2);              // top bar, bottom bar
    g.fillStyle = '#6f7881'; g.fillRect(x, 2, 32, 1);
    const post = (px) => { g.fillStyle = '#c3c8cb'; g.fillRect(px, 0, 3, 16); g.fillStyle = '#3b434a'; g.fillRect(px + 2, 0, 1, 16); };
    if (i % 4 === 0) post(x);
  }
  const end = Math.ceil(L / 32) * 32;
  g.fillStyle = '#c3c8cb'; g.fillRect(end - 3, 0, 3, 16); g.fillStyle = '#3b434a'; g.fillRect(end - 1, 0, 1, 16);
  g.restore();
}

// ---------------------------------------------------------------------------------------------
// THE OPEN PATHS (exits). In the local frame: u along the edge, d away from it (d = 0 is the edge of the map).
// floor (slabs or stairs) + a railing on each side + dark space behind the rails, all fading to black with distance.
// ---------------------------------------------------------------------------------------------
function paintExit(g, grp, side) {
  if (STAIRS_DARK.includes(zoneId) && grp.segs.every((s) => s.stairs)) return;   // nothing beyond the top of a dark flight (zone 1: renderer.js paints the lawn there)
  const u0 = grp.a * TILE, u1 = (grp.b + 1) * TILE, w = u1 - u0;
  const stairsAny = grp.segs.some((s) => s.stairs), L = EXIT_VIEW[zoneId]?.[side] ?? (stairsAny ? STAIR_LEN : PATH_LEN);
  const [RA, RB] = stairsAny ? [24, 24] : (pathRails(side, grp)).map((on) => (on ? 24 : 0));   // (a flat path may have plain walls beside it, no rails)
  const cs = PATH_CONT[zoneId]?.[side]?.[grp.a], contA = cs === 0, contB = cs === 1;     // the path floor reaches 8px towards a carried-on rail (its parapet stands there)
  const door = PATH_DOORS[zoneId]?.[side]?.[grp.a] ?? null, DP = door ? TILE : 0;                 // a door strip (one tile thick) beside the path
  const padA = RA + (door && door.wall === 0 ? DP : 0) + (contA ? 8 : 0), padB = RB + (door && door.wall === 1 ? DP : 0) + (contB ? 8 : 0);
  const x0 = u0 - padA, tw = w + padA + padB;
  const t = mkCanvas(tw, PH), h = t.getContext('2d');
  h.translate(-x0, 0);                                             // from here on x = u (same numbers as the side's own frame)
  // dark space around and behind the rails
  const vg = h.createLinearGradient(0, 0, 0, PH);
  vg.addColorStop(0, '#2b2824'); vg.addColorStop(0.4, '#171512'); vg.addColorStop(1, '#030303');
  h.fillStyle = vg; h.fillRect(x0, 0, tw, PH);
  // the floor: paving, and steps where the exit is a flight of stairs
  for (const seg of grp.segs) {
    const a = seg.a * TILE, wd = (seg.b - seg.a + 1) * TILE;
    const eA = contA && seg === grp.segs[0] ? 8 : 0, eB = contB && seg === grp.segs[grp.segs.length - 1] ? 8 : 0;
    if (!seg.stairs) paintSlabs(h, a - eA, 0, wd + eA + eB, Math.ceil(L / TILE) * TILE);
    else {
      for (let k = 0; k * 16 < L; k++) {                           // a step = riser facing you (near side) + tread (far side)
        const d = k * 16;
        h.fillStyle = '#77746c'; h.fillRect(a, d, wd, 5);
        h.fillStyle = 'rgba(0,0,0,0.28)'; h.fillRect(a, d, wd, 1);
        h.fillStyle = '#bdbab0'; h.fillRect(a, d + 5, wd, 11);
        h.fillStyle = 'rgba(255,255,255,0.45)'; h.fillRect(a, d + 15, wd, 1);
      }
      h.fillStyle = 'rgba(0,0,0,0.12)'; h.fillRect(a, 0, 2, L); h.fillRect(a + wd - 2, 0, 2, L);
      if (zoneId === 'zone1' || zoneId === 'zone3') for (let i = seg.a + 1; i <= seg.b; i++) {   // handrail between the lanes of a flight (as on the map)
        const x = i * TILE;
        h.fillStyle = 'rgba(0,0,0,0.22)'; h.fillRect(x, 0, 5, L);
        h.fillStyle = '#9aa2a8'; h.fillRect(x - 2, 0, 4, L);
        h.fillStyle = '#e3e7ea'; h.fillRect(x - 1, 0, 2, L);
        h.fillStyle = '#eef1f3'; h.fillRect(x - 3, L - 5, 6, 5); h.fillStyle = '#7d858b'; h.fillRect(x - 3, L - 2, 6, 2);
      }
    }
  }
  for (let i = 1; i < grp.segs.length; i++) {                      // where a flight meets a flat path: a low handrail
    const x = grp.segs[i].a * TILE;
    h.fillStyle = '#9aa2a8'; h.fillRect(x - 2, 0, 4, L); h.fillStyle = '#e3e7ea'; h.fillRect(x - 1, 0, 2, L);
  }
  // a railing on each side (parapet next to the path, slats outside)
  if (RA) railRun(h, [0, 1, 1, 0, u0 - RA, 0], L);
  if (RB) railRun(h, [0, 1, -1, 0, u1 + RB, 0], L);
  if (door) {                                                      // the room door in the wall beside the path: front view, flat side towards the path
    const m = door.wall === 0 ? [0, 1, 1, 0, u0 - TILE, 0] : [0, 1, -1, 0, u1 + TILE, 0];
    h.save(); h.transform(...m);
    h.fillStyle = '#d9d7d0'; h.fillRect(0, 0, PH, TILE); h.fillStyle = '#eceae4'; h.fillRect(0, 0, PH, 3); h.fillStyle = '#c2c0b8'; h.fillRect(0, 26, PH, 6);   // plain plaster wall along the whole strip
    for (const [ch, d] of door.doors) { h.save(); h.translate(d, 0); paintDoorFront(h, ch); h.restore(); }
    h.restore();
  }
  // fade to black with distance, and a soft shadow at the start of the path
  const fg = h.createLinearGradient(0, 0, 0, PH);
  for (let i = 0; i <= 12; i++) {
    const d = (i / 12) * L, a = Math.pow(clamp01((d - 12) / (L - 12)), 1.5) * 0.985;
    fg.addColorStop(Math.min(1, d / PH), `rgba(0,0,0,${a.toFixed(3)})`);
  }
  fg.addColorStop(Math.min(1, L / PH), 'rgba(0,0,0,1)'); fg.addColorStop(1, 'rgba(0,0,0,1)');
  h.fillStyle = fg; h.fillRect(x0, 0, tw, PH);
  g.drawImage(t, x0, 0);
}

// ---------------------------------------------------------------------------------------------
// DECO layer: everything beyond an edge that is not the skyline (cached per zone + side)
// ---------------------------------------------------------------------------------------------
function paintTerrace(g, len, rnd, cfg) {
  const top = 132;
  const sg = g.createLinearGradient(0, top, 0, PH);                  // sky behind the trees of the level above
  sg.addColorStop(0, mix(cfg.glow, cfg.skyTop, 0.35)); sg.addColorStop(1, cfg.skyTop);
  g.fillStyle = sg; g.fillRect(0, top, len, PH - top);
  R(g, 0, top + 10, len, 2, '#d6dadd');                              // pale guard rail on the level above
  for (let u = 0; u < len; u += 4) R(g, u, top + 10, 1, 7, '#98a0a5');
  for (let u = -10; u < len + 20; u += 28 + rnd() * 26) {            // tree canopies behind
    const r = 14 + rnd() * 12, d = top + 26 + rnd() * 44;
    disc(g, u + 1, d - 1, r, 'rgba(0,0,0,0.20)');
    disc(g, u, d, r, pickOf(['#2e6b34', '#2a5f30', '#37793c'], rnd));
    disc(g, u - r * 0.3, d + r * 0.3, r * 0.6, '#4a9a4a');
    disc(g, u - r * 0.35, d + r * 0.45, r * 0.25, '#8bd18f');
  }
  R(g, 0, top, len, 10, '#aaa497'); R(g, 0, top + 8, len, 2, 'rgba(0,0,0,0.30)'); R(g, 0, top, len, 2, WALL.cap);   // planter beam
  for (let u = 0; u < len; u += 9 + rnd() * 9) {                     // foliage hanging over the beam
    const r = 5 + rnd() * 6;
    disc(g, u, top + 1 + rnd() * 10 - 6, r, pickOf(['#2e7d32', '#388e3c', '#1f5a28', '#43a047'], rnd));
  }
  for (let u = 0; u < len; u += 22 + rnd() * 30) {                   // vines hanging down the wall
    const l = 14 + rnd() * 52, vx = u + rnd() * 6;
    R(g, vx, top - l, 1, l, '#2f5a2c');
    for (let d = top - l; d < top - 3; d += 6) disc(g, vx + (rnd() < 0.5 ? -1.5 : 2.5), d, 1.7, '#3f8a3c');
  }
}

const decoCache = {};
function buildDeco(side, zid) {
  const F = features()[side], len = F.len, cfg = COMP[side], rnd = rng(hashStr(zid + side + 'deco'));
  const c = mkCanvas(len, PH), g = c.getContext('2d');
  if (wallStyle(zid, side) === 'terrace') paintTerrace(g, len, rnd, cfg);
  const sh = g.createLinearGradient(0, 0, 0, 30);                    // where the wall meets the roof: a soft contact shadow
  sh.addColorStop(0, 'rgba(24,20,14,0.40)'); sh.addColorStop(1, 'rgba(24,20,14,0)');
  g.fillStyle = sh; g.fillRect(0, 0, len, 30);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, len, 2);
  for (const grp of F.groups) paintExit(g, grp, side);
  g.fillStyle = rgba('#ffb86e', cfg.warm * 0.5); g.fillRect(0, 0, len, PH);       // the same warm light as the skyline
  return c;
}

// ---------------------------------------------------------------------------------------------
// THE SKYLINE PAINTING. One composition per side. Muted, hazy, with real atmospheric depth:
// near things are darker and crisper, far things lighter, bluer and softer.
//   e = the view from your photos (white high-rise, mesh building, mast, busy road)
//   n = tall hazy towers far off, a river on the horizon
//   s = a dense sea of low blocks, big trees, a highway
//   w = golden hour: the sun glow, dark silhouettes against it
// ---------------------------------------------------------------------------------------------
const COMP = {
  e: { haze: '#cdc8bc', glow: '#ead8b6', skyTop: '#a7b8cb', warm: 0.07, sil: 0,    silCol: '#5a5560', lit: 0.05, tall: 0.10, road: { d: 44, h: 10, speed: 14, cars: 1.0 }, river: false, sun: false },
  n: { haze: '#c5cacb', glow: '#e4d9c0', skyTop: '#aabccd', warm: 0.05, sil: 0,    silCol: '#5a5560', lit: 0.04, tall: 0.30, road: null,                                  river: true,  sun: false },
  s: { haze: '#cec6b6', glow: '#ecd6aa', skyTop: '#a6b5c4', warm: 0.08, sil: 0,    silCol: '#5a5560', lit: 0.06, tall: 0.08, road: { d: 50, h: 15, speed: 22, cars: 1.6 }, river: false, sun: false },
  w: { haze: '#d8c7a4', glow: '#f0d49c', skyTop: '#8a9bb2', warm: 0.16, sil: 0.34, silCol: '#4f4a5a', lit: 0.20, tall: 0.22, road: null,                                  river: false, sun: true },
};

const FACADES = ['#c4baa6', '#d6cfbf', '#a47d68', '#8b7a6a', '#a6a39d', '#dcd9d1', '#9aabb9', '#c0b6a1', '#b0a58f', '#a6786b', '#bd9890', '#c3ad7c', '#8a9f89'];
const ROOFS = ['#8f8577', '#9d6650', '#6f8290', '#b0a591', '#7d7468', '#979fa4', '#ab7a6d', '#a39a86'];

function building(g, rnd, u, base, w, h, col, o) {
  const dark = mix(col, '#1a1a22', 0.24), light = mix(col, '#ffffff', 0.28);
  R(g, u, base, w, h, col);
  R(g, u + w * 0.72, base, w * 0.28, h, dark);               // shaded side
  R(g, u, base + h, w, 3, light);                            // roof top
  R(g, u, base, w, 1.5, mix(col, '#1a1a22', 0.35));          // where it meets the ground
  if (o.win && w >= 10 && h >= 14) {
    const cw = 4, ch = 5, nx = Math.floor((w - 2) / cw), ny = Math.floor((h - 4) / ch);
    const glass = mix(col, '#26333f', 0.45);
    for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
      if (rnd() < 0.2) continue;
      R(g, u + 2 + ix * cw, base + 3 + iy * ch, cw - 2, ch - 2.5, rnd() < o.lit ? '#f1cb85' : glass);
    }
  }
  if (rnd() < 0.45) {                                         // water tank / stair head / antenna
    const x = u + 1 + rnd() * Math.max(1, w - 6), k = rnd();
    if (k < 0.45) R(g, x, base + h + 3, 4, 4, mix(col, '#2a2a30', 0.45));
    else if (k < 0.8) R(g, x, base + h + 3, 5, 3, mix(col, '#ffffff', 0.15));
    else R(g, x, base + h + 3, 1, 8, '#5b5b60');
  }
}
function layer(g, rnd, cfg, o) {
  for (let u = o.u0; u < o.u1;) {
    const tall = rnd() < (o.tall ?? 0);
    const w = tall ? range([10, 18], rnd()) : range(o.w, rnd());
    const h = tall ? range(o.tallH, rnd()) : o.h[0] + (o.h[1] - o.h[0]) * Math.pow(rnd(), 1.8);
    const base = range(o.base, rnd());
    let col = mix(pickOf(o.pal ?? FACADES, rnd), cfg.haze, o.haze);
    if (cfg.sil) col = mix(col, cfg.silCol, cfg.sil * (0.6 + 0.4 * o.haze));
    building(g, rnd, u, base, w, h, col, { win: o.win, lit: cfg.lit });
    u += w + range(o.gap ?? [0, 3], rnd());
  }
}

// ---- landmarks (from your photos), in muted real-world colours ----
function whiteTower(g, rnd, u, base, w, h, hz) {
  const col = mix('#e2ded2', hz, 0.10);
  R(g, u, base, w, h, col);
  R(g, u + w * 0.76, base, w * 0.24, h, mix(col, '#222222', 0.16));
  for (let iy = 0; iy < Math.floor((h - 8) / 7); iy++) for (let ix = 0; ix < Math.floor((w - 4) / 6); ix++) {
    R(g, u + 3 + ix * 6, base + 4 + iy * 7, 3, 4, '#555d64');
    R(g, u + 2 + ix * 6, base + 8 + iy * 7, 5, 1, '#b8b4a6');                 // balcony
  }
  R(g, u - 1, base + h, w + 2, 4, '#efece3');
  R(g, u + 4, base + h + 4, w - 10, 6, '#cfcabb'); R(g, u + 7, base + h + 10, 6, 4, '#a9a595');
  const sw = 14;                                                              // dark glass slab next to it
  R(g, u + w, base, sw, h - 10, mix('#34405a', hz, 0.14));
  for (let k = 0; k < 3; k++) R(g, u + w + 3 + k * 4, base, 1, h - 10, '#6b7b96');
  R(g, u + w - 1, base + h - 10, sw + 1, 3, '#d3cfc1');
}
function mast(g, u, base, h) {
  g.lineWidth = 1;
  const half = (y) => 1.5 + 6 * (1 - y / h);
  for (let y = 0; y < h; y += 10) {
    const y1 = Math.min(h, y + 10), seg = Math.floor(y / 20) % 2 ? '#e2dfd7' : '#b9564e';
    R(g, u - half(y), base + y, 1.5, 10, seg); R(g, u + half(y) - 1, base + y, 1.5, 10, seg);
    g.strokeStyle = '#c4beb4'; g.beginPath();
    g.moveTo(u - half(y), base + y); g.lineTo(u + half(y1), base + y1);
    g.moveTo(u + half(y), base + y); g.lineTo(u - half(y1), base + y1); g.stroke();
  }
  R(g, u - 4, base + h, 8, 2, '#9a958c');
}
function meshBuilding(g, rnd, u, base, w, h, hz) {
  const col = mix('#5b7f64', hz, 0.22);
  R(g, u, base, w, h - 14, col);
  R(g, u + w * 0.75, base, w * 0.25, h - 14, mix(col, '#10281a', 0.3));
  g.fillStyle = mix('#47694f', hz, 0.12);
  for (let y = 3; y < h - 14; y += 6) g.fillRect(Math.round(u), Math.round(base + y), Math.round(w), 1);
  for (let x = 2; x < w; x += 5) g.fillRect(Math.round(u + x), Math.round(base), 1, Math.round(h - 14));
  for (let f = 0; f < 3; f++) {                                               // unfinished top floors: just columns and slabs
    R(g, u, base + h - 14 + f * 5, w, 1, '#aeb6a8');
    for (let x = 1; x < w; x += 6) R(g, u + x, base + h - 14 + f * 5, 2, 5, '#8f9a8c');
  }
  R(g, u + 4, base + h, 3, 6, '#7d7d78');
}
function glassBuilding(g, u, base, w, h, hz) {                                // the blue building, now a hazy glass tower
  const col = mix('#6f93b4', hz, 0.22);
  R(g, u, base, w, h, col); R(g, u + w * 0.72, base, w * 0.28, h, mix(col, '#0a2a50', 0.28));
  for (let y = 5; y < h - 3; y += 6) R(g, u + 2, base + y, w - 4, 2, 'rgba(255,255,255,0.35)');
  R(g, u + 2, base + h, w - 4, 4, '#a9c6de'); R(g, u + 5, base + h + 4, 8, 3, '#8aaac4');
}
function lowBlock(g, rnd, u, base, w, h, hz) {                                // the yellow block, now a weathered ochre apartment
  const a = mix('#c4a65a', hz, 0.2), b = mix('#a8b98a', hz, 0.2);
  R(g, u, base, w, h, a); R(g, u + w, base, w * 0.7, h - 4, b);
  for (let y = 4; y < h - 2; y += 6) { R(g, u + 2, base + y, w * 1.7 - 4, 1, 'rgba(60,50,20,0.25)'); }
  R(g, u, base + h, w * 1.7, 3, '#e4d9ac');
}
function bigTree(g, rnd, x, d, r, hz) {
  disc(g, x + 1, d - 1, r, 'rgba(0,0,0,0.22)');
  disc(g, x, d, r, mix('#3a6a3a', hz, 0.14));
  disc(g, x - r * 0.3, d + r * 0.25, r * 0.6, mix('#4f8a4a', hz, 0.14));
  R(g, x - 2, d + r * 0.4, 3, 2, mix('#8bd18f', hz, 0.3));
}
function silhouetteTowers(g, rnd, cfg, u, base) {
  for (let i = 0; i < 5; i++) {
    const w = 10 + rnd() * 10, h = 60 + rnd() * 42, x = u + i * (w + 3 + rnd() * 6);
    const col = mix(mix('#7f8c9a', cfg.haze, 0.4), cfg.silCol, cfg.sil);
    R(g, x, base, w, h, col); R(g, x + w * 0.7, base, w * 0.3, h, mix(col, '#101018', 0.25));
    R(g, x, base + h, w, 2, mix(col, '#ffffff', 0.3));
    for (let y = 6; y < h - 4; y += 6) R(g, x + 2, base + y, w - 4, 1, 'rgba(255,255,255,0.12)');
  }
}
function roofsPass(g, rnd, u0, u1, dMin, dMax, hazeCol) {
  for (let u = u0; u < u1;) {
    const w = 10 + rnd() * 22, h = 7 + rnd() * 14;
    const d = dMin + rnd() * Math.max(1, dMax - dMin - h);
    const col = mix(rnd() < 0.08 ? '#5b7fa6' : pickOf(ROOFS, rnd), hazeCol, 0.08);
    R(g, u + 1, d - 1, w, h, 'rgba(0,0,0,0.22)');
    R(g, u, d, w, h, col);
    R(g, u, d + h - 1, w, 1, mix(col, '#ffffff', 0.3));
    if (rnd() < 0.35) disc(g, u + w * rnd(), d + h * 0.5, 2.5, '#475f6a');                    // water tank
    if (rnd() < 0.25) bigTree(g, rnd, u + w * rnd(), d + h * 0.5, 4 + rnd() * 5, hazeCol);   // tree
    u += w + rnd() * 9;
  }
}
function cluster(side, g, rnd, cfg, u, k) {
  const hz = cfg.haze;
  if (side === 'e') {
    mast(g, u + 24, 128 + (k % 2) * 6, 138);
    meshBuilding(g, rnd, u - 78, 114, 34, 82, hz);
    glassBuilding(g, u - 18, 94, 30, 34, hz);
    whiteTower(g, rnd, u + 26, 112, 44, 118 - (k % 2) * 14, hz);
    lowBlock(g, rnd, u + 118, 104, 22, 40, hz);
  } else if (side === 'n') {
    silhouetteTowers(g, rnd, cfg, u - 60, 196);
    mast(g, u + 130, 140, 110);
    whiteTower(g, rnd, u + 20, 118, 36, 92 + (k % 2) * 18, hz);
    glassBuilding(g, u + 92, 100, 28, 30, hz);
  } else if (side === 's') {
    lowBlock(g, rnd, u - 70, 106, 24, 46, hz);
    mast(g, u + 80, 120, 112);
    meshBuilding(g, rnd, u + 100, 112, 30, 70, hz);
    whiteTower(g, rnd, u - 8, 114, 40, 96, hz);
    glassBuilding(g, u + 56, 92, 26, 28, hz);
    for (let i = 0; i < 3; i++) bigTree(g, rnd, u - 40 + i * 70, 88 + (i % 2) * 6, 11 + rnd() * 5, hz);
  } else {
    silhouetteTowers(g, rnd, cfg, u - 40, 150);
    silhouetteTowers(g, rnd, cfg, u + 90, 176);
    mast(g, u + 60, 132, 120);
    whiteTower(g, rnd, u - 100, 120, 34, 80 + (k % 2) * 16, hz);
  }
}

// soft(): paint a layer at half resolution and scale it up, which blurs it a little. Far things are out of focus.
function soft(g, spanPx, fn, dOff = 0) {
  const t = mkCanvas(spanPx / 2, PH / 2), h = t.getContext('2d');
  h.scale(Z / 2, Z / 2); fn(h);
  const prev = g.imageSmoothingEnabled;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(t, 0, dOff, t.width * 2, t.height * 2); g.restore(); g.imageSmoothingEnabled = prev;
}

// paints ONE skyline picture `len` px wide (u = 0 at its left edge)
// dneg > 0: the picture also has `dneg` px BEFORE d = 0 (canvas y = 0 is d = -dneg; it is the mirror image of d = 0 ... dneg), so a side that
// shows this picture can carry on to the "wrong" side of the edge line. Nothing is changed for d >= 0.
function paintPano(side, len, rnd, grainSeed, dneg = 0, zid = '') {
  const cfg = COMP[side];
  const c = mkCanvas(len, PH + dneg), g = c.getContext('2d');
  const spanO = len / Z, road = ROAD_FIX[zid]?.[side] ? { ...cfg.road, ...ROAD_FIX[zid][side] } : cfg.road;   // painting units: everything below is in zoomed units
  g.translate(0, dneg);
  g.scale(Z, Z);

  // ground near the rail (d small) up to the sky (d large)
  const grd = g.createLinearGradient(0, 0, 0, EO);
  grd.addColorStop(0, '#5f5a52'); grd.addColorStop(90 / EO, '#7b7466'); grd.addColorStop(180 / EO, mix(cfg.haze, '#9a9486', 0.3));
  grd.addColorStop(238 / EO, cfg.glow); grd.addColorStop(300 / EO, mix(cfg.glow, cfg.skyTop, 0.55)); grd.addColorStop(1, cfg.skyTop);
  g.fillStyle = grd; g.fillRect(0, 0, spanO, EO);

  if (cfg.sun) {                                                  // golden-hour glow
    for (let u = 120; u < spanO; u += 480) {
      const rg = g.createRadialGradient(u, 250, 0, u, 250, 190);
      rg.addColorStop(0, 'rgba(255,236,170,0.70)'); rg.addColorStop(0.4, 'rgba(255,205,120,0.30)'); rg.addColorStop(1, 'rgba(255,190,100,0)');
      g.fillStyle = rg; g.fillRect(u - 190, 60, 380, 300);
    }
  }
  if (cfg.river) {                                                // thin river on the horizon
    R(g, 0, 232, spanO, 6, mix('#9fb7c4', cfg.glow, 0.3));
    for (let u = 0; u < spanO; u += 17) R(g, u, 234, 9, 1, 'rgba(255,255,255,0.40)');
  }

  // far -> near. The two far layers are painted soft (out of focus)
  soft(g, len, (h) => {
    layer(h, rnd, cfg, { u0: 0, u1: spanO, base: [222, 238], w: [10, 26], h: [26, 62], tallH: [62, 92], tall: cfg.tall, haze: 0.80, win: false });
    layer(h, rnd, cfg, { u0: 0, u1: spanO, base: [196, 214], w: [10, 28], h: [24, 70], tallH: [70, 96], tall: cfg.tall * 0.6, haze: 0.64, win: false });
  }, dneg);
  layer(g, rnd, cfg, { u0: 0, u1: spanO, base: [136, 158], w: [10, 26], h: [22, 56], haze: 0.34, win: true });
  for (let u = 160, k = 0; u < spanO + 100; u += 520 + rnd() * 80, k++) cluster(side, g, rnd, cfg, u, k);
  layer(g, rnd, cfg, { u0: 0, u1: spanO, base: [94, 116], w: [12, 30], h: [18, 46], haze: 0.14, win: true });

  // low roofs, trees and the street right below the rail
  const hz = cfg.haze;
  if (road) {
    roofsPass(g, rnd, 0, spanO, road.d + road.h + 3, road.d + road.h + 30, hz);
    R(g, 0, road.d, spanO, road.h, '#50535a');
    R(g, 0, road.d, spanO, 1, '#8b8d8f'); R(g, 0, road.d + road.h - 1, spanO, 1, '#3a3c3f');
    for (let u = 0; u < spanO; u += 14) R(g, u, road.d + road.h / 2, 7, 1, '#d4d0c4');
    roofsPass(g, rnd, 0, spanO, 4, road.d - 2, hz);
  } else {
    roofsPass(g, rnd, 0, spanO, 34, 72, hz);
    roofsPass(g, rnd, 0, spanO, 4, 40, hz);
  }
  if (dneg) {                                                     // the near side of the edge line: the first `near` px of the picture mirrored (and slid along the edge so the mirror does not show), so the street and roofs simply go on
    // a bay (curved rail, see CURVED RAILS) can be deeper than the near ground (street + roofs) is: then that strip is mirrored again and again (BAY_NEAR px each time),
    // so the bay is filled with more street and roofs instead of the far city seen upside down
    const near = bayDepthPx(side) > 0 ? Math.min(dneg, BAY_NEAR) : dneg;
    const tmp = mkCanvas(len, near); tmp.getContext('2d').drawImage(c, 0, dneg, len, near, 0, 0, len, near);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    for (let k = 0; k * near < dneg; k++) {                       // strip k covers d from -(k + 1) * near to -k * near: flipped when k is even, as drawn when odd (so every seam is a mirror line)
      const slide = Math.round(len * 0.37 * (k + 1)) % len;
      g.save();
      if (k % 2 === 0) { g.translate(0, dneg - k * near); g.scale(1, -1); } else g.translate(0, dneg - (k + 1) * near);
      g.drawImage(tmp, slide, 0); g.drawImage(tmp, slide - len, 0);
      g.restore();
    }
    g.restore();
  }
  const shade = g.createLinearGradient(0, 0, 0, 44);              // the building's own shadow along the foot
  shade.addColorStop(0, 'rgba(10,10,14,0.45)'); shade.addColorStop(1, 'rgba(10,10,14,0)');
  if (!dneg) { g.fillStyle = shade; g.fillRect(0, 0, spanO, 44); }   // (a picture that goes on past its edge line has no foot shadow: it would show as a line there)
  g.fillStyle = rgba('#ffb86e', cfg.warm); g.fillRect(0, -dneg / Z, spanO, EO + dneg / Z);          // golden-hour tint

  // fine film grain so nothing looks like flat vector shapes
  g.setTransform(1, 0, 0, 1, 0, 0);
  const gr = rng(hashStr(grainSeed));
  for (let i = 0; i < len * (PH + dneg) / 90; i++) {
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    g.fillRect(Math.floor(gr() * len), Math.floor(gr() * (PH + dneg)), 1, 1);
  }
  return c;
}

function buildPano(side, zid) {
  const F = features()[side], len = F.len, cfg = COMP[side], rnd = rng(hashStr(zid + side)), dneg = F.dneg;
  const road = ROAD_FIX[zid]?.[side] ? { ...cfg.road, ...ROAD_FIX[zid][side] } : cfg.road;
  const off = F.ext, offEnd = F.extEnd;                           // px of extra skyline before u = 0 and after u = len (the corners that are not corners)
  const main = paintPano(side, len, rnd, zid + side + 'grain', dneg, zid);
  let c = main;
  if (off || offEnd) {                                            // [ extension | main | extension ]: the same painting, simply carried on past the corners
    c = mkCanvas(off + len + offEnd, PH + dneg);
    const cg = c.getContext('2d');
    if (off) cg.drawImage(paintPano(side, off, rng(hashStr(zid + side + 'ext')), zid + side + 'extgrain', dneg, zid), 0, 0);
    cg.drawImage(main, off, 0);
    if (offEnd) cg.drawImage(paintPano(side, offEnd, rng(hashStr(zid + side + 'ext2')), zid + side + 'ext2grain', dneg, zid), off + len, 0);
  }
  const tot = off + len + offEnd, spanO = tot / Z;
  // things that move (drawn every frame by drawSide, in painting units)
  const cars = [];
  if (road) for (let i = 0; i < Math.floor(spanO / 110 * road.cars); i++)
    cars.push({ u: rnd() * spanO, v: range([8, 26], rnd()) * (rnd() < 0.5 ? -1 : 1) * (road.speed / 18), lane: rnd() < 0.5 ? 0.25 : 0.65, col: pickOf(['#d4cfc1', '#a8403f', '#d8b14a', '#3b6285', '#2e2e32', '#cdcdcd'], rnd) });
  const clouds = [];
  for (let i = 0; i < 6; i++) clouds.push({ u: rnd() * spanO, d: range([270, 380], rnd()), w: range([60, 140], rnd()), h: range([9, 20], rnd()), v: range([1.5, 4], rnd()), a: range([0.14, 0.26], rnd()) });
  const birds = [];
  for (let i = 0; i < 3; i++) birds.push({ u: rnd() * spanO, d: range([250, 350], rnd()), v: range([10, 22], rnd()) * (rnd() < 0.5 ? -1 : 1), ph: rnd() * 6 });
  // drifting fog banks: they thin out (and finally vanish) as you come close to the rail
  const wisps = [];
  for (let i = 0; i < Math.ceil(tot / 150); i++) wisps.push({ u: rnd() * tot, d: range([14, PH - 30], rnd()), w: range([170, 360], rnd()), v: range([3, 9], rnd()) * (rnd() < 0.5 ? -1 : 1), a: range([0.35, 0.70], rnd()), s: rnd() });
  return { canvas: c, len, off, tot, dneg, cfg, road, cars, clouds, birds, wisps };
}

// one soft fog blob, painted once and stamped many times
let wispImg = null;
function wispSprite() {
  if (wispImg) return wispImg;
  const c = mkCanvas(240, 64), g = c.getContext('2d');
  for (const [x, y, rx, ry, a] of [[120, 32, 112, 22, 0.55], [78, 36, 70, 18, 0.45], [170, 30, 66, 17, 0.45], [120, 26, 84, 12, 0.35]]) {
    g.save(); g.translate(x, y); g.scale(rx, ry);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.6, `rgba(255,255,255,${a * 0.4})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fill(); g.restore();
  }
  return (wispImg = c);
}

// ---------------------------------------------------------------------------------------------
// Layer cache
// ---------------------------------------------------------------------------------------------
const cache = {};
function layers(side) {
  const key = zoneId + '|' + side;
  if (cache[key]) return cache[key];
  const F = features()[side];
  return (cache[key] = {
    deco: buildDeco(side, zoneId),
    pano: F.windows.length && !F.share ? buildPano(side, zoneId) : null,    // a shared window shows another side's picture
    share: F.share,
    off: F.ext,
    wins: F.windows.map((w) => {
      const openA = !!F.ext && w.a === 0, openB = (!!F.extEnd && (w.b + 1) * TILE === F.len) || (OPEN_END[zoneId]?.includes(side) && (w.b + 1) * TILE === F.len);
      return { u0: openA ? -F.ext : w.a * TILE, u1: (w.b + 1) * TILE + (F.extEnd && openB ? F.extEnd : 0) - (WINDOW_TRIM[zoneId]?.[side]?.b === w.b ? WINDOW_TRIM[zoneId][side].px : 0), openA, openB };
    }),
  });
}

// ---------------------------------------------------------------------------------------------
// Drawing (called by renderer.js BEFORE the tiles, inside the camera transform)
// ---------------------------------------------------------------------------------------------
// one task per side whose picture will be needed: paints it now instead of when the player first walks up to a rail
export function skylineWarmTasks() {
  skyline.sync();
  const f = features();
  return SIDES.filter((s) => f[s].windows.length || f[s].groups.length).map((s) => () => { layers(s); });
}
export function drawSkyline(ctx, camera, VW, VH, time) {
  skyline.sync();
  const f = features(), W = widthPx, H = heightPx;
  // the dark "drop" you see between the rail slats (always there, even when nothing is revealed)
  const lip = (x, y, w, h, gx0, gy0, gx1, gy1) => {
    const g = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
    g.addColorStop(0, '#34332f'); g.addColorStop(1, '#5f5a52');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  };
  if (f.e.rails.length && camera.x + VW > W - LIP) lip(W - LIP, 0, LIP, H, W - LIP, 0, W, 0);
  if (f.w.rails.length && camera.x < LIP) lip(0, 0, LIP, H, LIP, 0, 0, 0);
  if (f.n.rails.length && camera.y < LIP) lip(0, 0, W, LIP, 0, LIP, 0, 0);
  if (f.s.rails.length && camera.y + VH > H - LIP) lip(0, H - LIP, W, LIP, 0, H - LIP, 0, H);

  if (skyline.any()) {
    ctx.fillStyle = wallFill(ctx);                                  // the cream wall of the building, everywhere beyond the map
    ctx.fillRect(camera.x, camera.y, VW, VH);
    for (const s of SIDES) if (skyline.over[s] >= 0.5) drawSide(ctx, s, time);
    drawCorner(ctx, time);
    drawNorthCorners(ctx, time);
    for (const r of runOnRails()) {                                 // the dark drop behind the slats of the carried-on rails (it would be hidden by the side pictures drawn above)
      const x = r.a * TILE, w = (r.b - r.a + 1) * TILE;
      if (x > camera.x + VW || x + w < camera.x) continue;
      if (r.edge === 'n') lip(x, 0, w, LIP, 0, LIP, 0, 0); else lip(x, H - LIP, w, LIP, 0, H - LIP, 0, H);
    }
  }
}

// The area outside a curved rail (see CURVED RAILS): the straight skyline picture, clipped to everything left of the curve. Called by renderer.js AFTER the tiles
// (the floor tiles under it are simply painted over); the rail itself is drawn on top by renderer.js drawCurvedRails().
const bayClips = new Map();                                          // the clip outline of a bay is ~1500 points: build it once, not every frame
function bayClip(c, pts) {
  const key = c.y0 + ',' + c.y1 + ',' + c.depth + ',' + c.r + ',' + c.side + ',' + c.tail + ',' + c.W;
  let p = bayClips.get(key);
  if (!p) {
    p = new Path2D();
    pts.forEach((q, i) => (i ? p.lineTo(mirrorX(c, q.x), q.y) : p.moveTo(mirrorX(c, q.x), q.y)));
    if (c.tail > 0) p.lineTo(mirrorX(c, 0), c.y1);                   // a tail ends inside the map: close the area along the edge from there
    p.closePath(); bayClips.set(key, p);
  }
  return p;
}
export function drawCurvedBays(g, camera, VW, VH, time, only = null) {
  for (const c of curvedRails) {
    if (only && c !== only) continue;
    const side = c.side, L = layers(side);
    if (!L.pano) continue;
    if (c.y0 > camera.y + VH || c.y1 < camera.y) continue;
    if (side === 'e' ? camera.x + VW < widthPx - c.depth : camera.x > c.depth) continue;
    const { pts } = railPath(c);
    g.save();
    g.clip(bayClip(c, pts));                                         // the face of the rail + the straight edge (x 0, or the east edge) it leaves and returns to
    g.save();
    g.transform(...sideMatrix(side));
    g.imageSmoothingEnabled = false;
    drawPicture(g, side, L.pano, time);
    g.restore();
    const va = vineAlpha(side);                                      // the vines fade out with the same fog as the skyline, so they never float over the milk when you are far away
    if (va > 0.01) { g.globalAlpha = va; drawCurveVines(g, c, pts, side === 'e', time); g.globalAlpha = 1; }   // a few vines hanging from the curved rail (still inside the clip)
    g.restore();
  }
}

// The notch outside a rounded rail corner (inside the map's corner tile): the picture of the side the corner is on (west picture for 'nw' / 'sw', east for 'ne' / 'se') carried on,
// like the bays (it has `depth` px of near ground on the wrong side). The clip is the NW shape (the square corner minus the quarter circle of the rail), mirrored for the other corners.
export function drawCornerNotch(g, time, R, corner = 'nw') {
  const side = corner[1], east = side === 'e', south = corner[0] === 's';
  const L = layers(side);
  if (!L.pano) return;
  const mirror = [east ? -1 : 1, 0, 0, south ? -1 : 1, east ? widthPx : 0, south ? heightPx : 0];   // a mirror is its own inverse: applying it twice leaves the clip where it is and the picture unmirrored
  g.save();
  g.transform(...mirror);
  g.beginPath(); g.moveTo(0, 0); g.lineTo(R, 0); g.arc(R, R, R, -Math.PI / 2, -Math.PI, true); g.closePath(); g.clip();   // the square corner minus the quarter circle of the rail
  g.transform(...mirror);
  g.transform(...sideMatrix(side));
  g.imageSmoothingEnabled = false;
  drawPicture(g, side, L.pano, time);
  g.restore();
}

// local frame of a side -> world: x = along the edge, y = away from it (1:1, a flip / quarter turn, NO scaling)
const sideMatrix = (side) => ({ e: [0, 1, 1, 0, widthPx, 0], w: [0, 1, -1, 0, 0, 0], n: [1, 0, 0, -1, 0, 0], s: [1, 0, 0, 1, 0, heightPx] }[side]);

// One side: deco (wall details, exit paths), then the skyline + fog inside the window(s), vines, concrete piers.
function drawSide(g, side, time) {
  const L = layers(side), F = features()[side], W = widthPx, H = heightPx;
  const over = Math.min(PH, Math.ceil(skyline.over[side])), len = F.len, ext = F.ext;
  g.save();
  g.beginPath();                                               // only the strip beyond this edge; a side with an extension also covers the corner at its start (see EXTEND)
  const sw = CORNER[zoneId]?.corner === 'sw';                   // zone 2: the south-west corner square is drawn by drawCorner
  if (side === 'e') {
    g.rect(W, -ext, over, H + (EXTEND_END_E.includes(zoneId) ? 2 * ext : ext));   // (zone 3: the east skyline also carries on past the south-east corner, instead of a cream wall block)
  }
  else if (side === 'w') g.rect(-over, -ext, over, H + (sw ? ext : 2 * ext));   // (ext = 0 where the west side has no extension: zone 1)
  else if (side === 'n') g.rect(0, -over, W + (NORTH_CORNERS[zoneId]?.includes('ne') ? 0 : ext), over);   // (ext: the north skyline also carries on past the north-east corner, above the exit path)
  else g.rect(sw ? 0 : -ext, H, W + (sw ? (EXTEND_S_END.includes(zoneId) ? ext : 0) : ext) - (EXTEND_END_E.includes(zoneId) ? 5 * TILE + RAIL_W : 0), over);   // (zone 3: the south wall stops where the east bay's tail rail runs on past the south edge - 5 tiles + the rail in from the east edge: everything right of it is skyline, see drawCurvedBays)
  g.clip();
  g.transform(...sideMatrix(side));
  g.imageSmoothingEnabled = false;
  g.drawImage(L.deco, 0, 0);

  if (L.pano || L.share) drawWindows(g, side, L, len, time);

  for (const w of L.wins) {                                    // concrete piers where a window meets the wall (none where the skyline carries on round a corner)
    for (const lit of [true, false]) {
      if (lit ? w.openA : w.openB) continue;
      const x = lit ? w.u0 : w.u1 - 9;
      R(g, x, 0, 9, PH, '#aaa597'); R(g, lit ? x : x + 8, 0, 1, PH, lit ? '#cdc8b9' : 'rgba(0,0,0,0.30)');
      R(g, lit ? x + 7 : x, 0, 2, PH, 'rgba(0,0,0,0.20)');
      for (let d = 46; d < PH; d += 64) R(g, x, d, 9, 1, 'rgba(0,0,0,0.16)');
    }
  }
  for (const grp of F.groups) {                                // rails that must stand in front of a window picture (PATH_RAIL_FRONT)
    const cfg = PATH_RAIL_FRONT[zoneId]?.[side]?.[grp.a];
    if (!cfg) continue;
    const ox = cfg.wall ? (grp.b + 1) * TILE : grp.a * TILE - RAIL_W;
    const ic = side === 'n' && cfg.wall ? innerCorners.find((c) => c.x === ox) : null;        // the rail meets the north rail in a rounded inner corner: the first Rs px belong to the curve (renderer.js drawCurvedRails)
    const cut = ic ? ic.r - RAIL_W : 0;
    if (cut) g.drawImage(railOverlay(grp, side, cfg.wall), 0, cut, RAIL_W, PH - cut, ox, cut, RAIL_W, PH - cut);
    else g.drawImage(railOverlay(grp, side, cfg.wall), ox, 0);
  }
  g.restore();
}

// one railing along the side of an open path, in front of the window picture, running the whole depth of the view (as far north / west / ... as you can see); cached
const overlayCache = {};
function railOverlay(grp, side, wall) {
  const key = zoneId + side + grp.a + wall;
  if (overlayCache[key]) return overlayCache[key];
  const c = mkCanvas(RAIL_W, PH), h = c.getContext('2d');
  railRun(h, wall ? [0, 1, -1, 0, RAIL_W, 0] : [0, 1, 1, 0, 0, 0], PH);
  return (overlayCache[key] = c);
}

// how clear the air is for a side: linked sides (one skyline round a corner) share it, so no fog seam shows between them
function fogDens(side) {
  const group = LINK[zoneId]?.includes(side) ? LINK[zoneId] : [side];
  const k = smooth(Math.max(...group.map((s) => skyline.close[s])));
  let dens = lerp(FOG_FAR, FOG_NEAR, k);
  if (skyline.leanSide && group.includes(skyline.leanSide)) dens *= 1 - 0.75 * skyline.lean;
  return dens;
}

// How visible the hanging vines are: like the skyline picture they are thick and clear next to the rail and vanish into the fog when you are far (fogDens runs from FOG_NEAR to FOG_FAR)
const vineAlpha = (side) => clamp01(1 - (fogDens(side) - FOG_NEAR) / (FOG_FAR - FOG_NEAR) * 1.15);

function drawWindows(g, side, L, len, time) {
  g.save();
  g.beginPath();
  for (const w of L.wins) g.rect(w.u0, 0, w.u1 - w.u0, PH);
  g.clip();
  if (L.share) {                                               // this window shows another side's picture, in THAT side's direction
    const src = layers(L.share);
    g.save();
    const inv = new DOMMatrix(sideMatrix(side)).inverse();
    g.transform(inv.a, inv.b, inv.c, inv.d, inv.e, inv.f);
    g.transform(...sideMatrix(L.share));
    drawPicture(g, L.share, src.pano, time);
    g.restore();
  } else drawPicture(g, side, L.pano, time);
  g.restore();

  const va = vineAlpha(side);                                  // vines fade with the fog (see vineAlpha): no leaves floating over the milk when you are far from the edge
  const vines = vineStrands(zoneId, side);                     // hedge vines hanging over the edge (foliage.js VINE_EDGES)
  if (vines.length) { g.globalAlpha = va; if (va > 0.01) drawVines(g, vines, time); g.globalAlpha = 1; drawVineLip(g, vines); }   // (the leafy lip is part of the hedge: it stays)
  const rv = railVineStrands(zoneId, side, features()[side].rails);   // a few single vines hanging from the balcony rails (foliage.js section 4)
  if (rv.length) { g.globalAlpha = va; if (va > 0.01) drawVines(g, rv, time); g.globalAlpha = 1; drawVineLip(g, rv); }
}

// The picture of one side (skyline, traffic, clouds, birds, fog) in that side's local frame: u along the edge, d away from it.
function drawPicture(g, side, P, time) {
  const cfg = P.cfg, spanO = P.canvas.width / Z, off = P.off, len = P.len;
  const wrap = (v) => ((v % spanO) + spanO) % spanO;
  g.drawImage(P.canvas, -off, -P.dneg);                        // the skyline at its real size (starts `off` px before u = 0 when it carries on round a corner)

  g.save(); g.translate(-off, 0); g.scale(Z, Z);               // moving things, in painting units
  g.fillStyle = cfg.sun ? '#ffe0aa' : '#ffffff';
  for (const c of P.clouds) {
    const u = wrap(c.u + time * c.v);
    g.globalAlpha = c.a;
    g.beginPath(); g.ellipse(u, c.d, c.w / 2, c.h / 2, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(u - c.w * 0.25, c.d + c.h * 0.2, c.w * 0.3, c.h * 0.4, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(u + c.w * 0.28, c.d + c.h * 0.15, c.w * 0.28, c.h * 0.38, 0, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
  if (P.road) for (const car of P.cars) {                      // traffic
    const u = wrap(car.u + time * car.v), d = P.road.d + P.road.h * car.lane - 1;
    g.fillStyle = car.col; g.fillRect(Math.round(u), Math.round(d), 6, 3);
    g.fillStyle = 'rgba(255,240,180,0.9)'; g.fillRect(Math.round(u + (car.v > 0 ? 5 : 0)), Math.round(d + 1), 1, 1);
  }
  g.strokeStyle = cfg.sun ? '#3a3040' : '#3b3f45'; g.lineWidth = 1;   // birds
  for (const b of P.birds) {
    const u = wrap(b.u + time * b.v), fl = Math.sin(time * 9 + b.ph) * 2.2;
    g.beginPath(); g.moveTo(u - 4, b.d + fl); g.lineTo(u, b.d); g.lineTo(u + 4, b.d + fl); g.stroke();
  }
  g.restore();

  // ---- FOG: thick milk when you are far from the rail, almost gone when you touch it ----
  const dens = fogDens(side);
  if (dens > 0.004) {
    const vg = g.createLinearGradient(0, 0, 0, PH);            // the view clears from the rail outwards: far things stay misty longest
    vg.addColorStop(0, rgba(FOG_COL, clamp01(dens * 0.50))); vg.addColorStop(0.5, rgba(FOG_COL, clamp01(dens * 0.85))); vg.addColorStop(1, rgba(FOG_COL, clamp01(dens * 1.10)));
    g.fillStyle = vg; g.fillRect(-off, -P.dneg, P.tot, PH + P.dneg);
    const sp = wispSprite();                                   // slow drifting banks of mist on top
    const T = P.tot + 400;
    for (const w of P.wisps) {
      const u = ((w.u + time * w.v) % T + T) % T - 200 - off;
      const a = clamp01(w.a * Math.pow(dens, 0.8) * (0.8 + 0.2 * Math.sin(time * 0.3 + w.s * 6.28)));
      if (a < 0.01) continue;
      g.globalAlpha = a;
      g.drawImage(sp, u - w.w / 2, w.d - w.w * 0.1, w.w, w.w * 64 / 240 * 1.2);
    }
    g.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------------------------------------
// THE TURNING CORNER (zone 1, bottom right: east + south). Beyond a convex corner both skylines carry on, and they meet along the
// diagonal ("mitre") of the corner square. Each strip simply carries on into the corner on its own side of the diagonal (below the east strip:
// the east picture carried on downwards, beside the south strip: the south picture carried on to the right), so both strips continue without
// any seam. The street has the same distance and width on both sides (ROAD_FIX), so the two roads turn into one L-shaped bend, and the
// diagonal is a soft blend instead of a line.
// ---------------------------------------------------------------------------------------------
const CORNER = { zone1: { a: 'e', b: 's', corner: 'se' }, zone2: { a: 'w', b: 's', corner: 'sw' } };   // a = the side carried on downwards, b = the south side carried on sideways
const BLEND = 16;                                              // half width (px) of the soft seam
let cornerA = null, cornerB = null;
function drawCorner(g, time) {
  const cfg = CORNER[zoneId];
  if (!cfg) return;
  const { a, b, corner } = cfg, west = corner === 'sw';
  const cw = Math.min(PH, Math.ceil(skyline.over[a])), ch = Math.min(PH, Math.ceil(skyline.over[b]));
  if (skyline.over[a] < 0.5 || skyline.over[b] < 0.5) return;
  const W = widthPx, H = heightPx, ox = west ? 0 : W;          // (ox, H) = the corner point of the map
  const La = layers(a), Lb = layers(b);
  if (!La.pano || !Lb.pano) return;
  if (!cornerA) { cornerA = mkCanvas(PH, PH); cornerB = mkCanvas(PH, PH); }
  const paint = (cv, side, P) => {
    const c = cv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, PH, PH);
    c.translate(west ? PH : -W, -H); c.transform(...sideMatrix(side)); c.imageSmoothingEnabled = false;   // corner-local: x = x - W (se) / x + PH (sw), y = y - H
    drawPicture(c, side, P, time);
    return c;
  };
  paint(cornerA, b, Lb.pano);                                  // south picture, carried on sideways
  const cb = paint(cornerB, a, La.pano);                       // east / west picture, carried on downwards, then masked by the diagonal
  cb.setTransform(1, 0, 0, 1, 0, 0); cb.globalCompositeOperation = 'destination-in';
  const mk = west ? cb.createLinearGradient(PH + BLEND / 2, BLEND / 2, PH - BLEND / 2, -BLEND / 2)   // west picture: weight 1 on the west side of the diagonal
                  : cb.createLinearGradient(0, BLEND, BLEND, 0);                                      // east picture: weight 0 where (x - y) = -BLEND ... 1 where (x - y) = +BLEND
  mk.addColorStop(0, 'rgba(0,0,0,0)'); mk.addColorStop(1, 'rgba(0,0,0,1)');
  cb.fillStyle = mk; cb.fillRect(0, 0, PH, PH);
  cb.globalCompositeOperation = 'source-over';
  g.save();
  g.beginPath(); g.rect(west ? -cw : W, H, cw, ch); g.clip();
  g.imageSmoothingEnabled = false;
  g.drawImage(cornerA, west ? -PH : W, H);
  g.drawImage(cornerB, west ? -PH : W, H);
  g.restore();
}
// ---------------------------------------------------------------------------------------------
// NORTH CORNERS (zones 2 and 3): the north skyline carried on sideways and the west / east skyline carried on upwards meet in a soft diagonal,
// exactly like the south-west corner (drawCorner), just mirrored. Without it there would be a hard seam above the west / east rail.
//   NORTH_CORNERS: which corners get one ('nw' = north-west, 'ne' = north-east). Needs EXTEND for the sides involved.
// ---------------------------------------------------------------------------------------------
const NORTH_CORNERS = { zone2: ['nw'], zone3: ['nw', 'ne'] };
const nCorner = { nw: [null, null], ne: [null, null] };
function drawNorthCorners(g, time) {
  for (const c of NORTH_CORNERS[zoneId] ?? []) drawNorthCorner(g, time, c === 'ne');
}
function drawNorthCorner(g, time, east) {
  const vs = east ? 'e' : 'w', key = east ? 'ne' : 'nw';
  const cw = Math.min(PH, Math.ceil(skyline.over[vs])), ch = Math.min(PH, Math.ceil(skyline.over.n));
  if (skyline.over[vs] < 0.5 || skyline.over.n < 0.5) return;
  const Ln = layers('n'), Lv = layers(vs);
  if (!Ln.pano || !Lv.pano) return;
  const cv = nCorner[key];
  if (!cv[0]) { cv[0] = mkCanvas(PH, PH); cv[1] = mkCanvas(PH, PH); }
  const W = widthPx;
  const paint = (canvas, side, P) => {
    const c = canvas.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, PH, PH);
    c.translate(east ? -W : PH, PH); c.transform(...sideMatrix(side)); c.imageSmoothingEnabled = false;   // corner-local: x = x + PH (nw) / x - W (ne), y = y + PH
    drawPicture(c, side, P, time);
    return c;
  };
  paint(cv[0], 'n', Ln.pano);                                   // north picture, carried on sideways
  const cb = paint(cv[1], vs, Lv.pano);                         // west / east picture, carried on upwards, then masked by the diagonal
  cb.setTransform(1, 0, 0, 1, 0, 0); cb.globalCompositeOperation = 'destination-in';
  const mk = east ? cb.createLinearGradient((PH - BLEND) / 2, (PH - BLEND) / 2, (PH + BLEND) / 2, (PH + BLEND) / 2)   // east picture: weight 1 on the east side of the diagonal
                  : cb.createLinearGradient(BLEND / 2, -BLEND / 2, -BLEND / 2, BLEND / 2);                          // west picture: weight 1 on the west side
  mk.addColorStop(0, 'rgba(0,0,0,0)'); mk.addColorStop(1, 'rgba(0,0,0,1)');
  cb.fillStyle = mk; cb.fillRect(0, 0, PH, PH);
  cb.globalCompositeOperation = 'source-over';
  g.save();
  g.beginPath(); g.rect(east ? W : -cw, -ch, cw, ch); g.clip();
  g.imageSmoothingEnabled = false;
  g.drawImage(cv[0], east ? W : -PH, -PH);
  g.drawImage(cv[1], east ? W : -PH, -PH);
  g.restore();
}