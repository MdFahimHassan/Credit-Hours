// map.js - loads ONE zone at a time from zones.js into a 2D array.
// Other files import cols/rows/items/spawn... as "live bindings", so they update automatically
// when loadZone() switches zones.
import { ZONES } from './zones.js';
import { holeBands } from './hole.js';
import { stairwellBands, stairDepth } from './stairwell.js';
import { railBands, curvedRailPx, roundedCornerPx } from './curverail.js';
export const TILE = 32;

export const UP_ROWS = 11;                  // see upperTile() below
let virtualUp = false;
export const setVirtualUp = (v) => { virtualUp = v; };
export let zoneId = 'zone1';                 // which zone is loaded right now
export let cols = 0, rows = 0, widthPx = 0, heightPx = 0;
export const grid = [];                      // grid[y][x] = a single tile character
export let spawn = { x: 1, y: 1 };
export let npcSpawn = { x: 2, y: 2 };
export let items = [];                       // [{x, y, collected}] in tile coordinates
export let holes = [];                       // capsule-shaped openings in the floor, in PIXELS: [{x, y, w, h}] - from the zone's `holes` (tile units), see hole.js
export let stairwells = [];                  // big stairs down to the (not yet built) lower floor, in PIXELS: [{x, y, w, h}] - from the zone's `stairwells`, see stairwell.js
export let roundedCorners = [];               // rounded rail corners in PIXELS: [{corner: 'nw', r}] - from the zone's `roundedCorners`, see curverail.js cornerPath
export let curvedRails = [];                 // curved west-edge rails in PIXELS: [{y0, y1, depth, r}] - from the zone's `curvedRails` (tile units), see curverail.js
let lawnBoxCache = null;
export let fences = [];                      // white fences in PIXELS: [{ pts: [[x, y], ...] }] - from the zone's `fences` (tile units), see renderer.js drawFence
export let thinWalls = [];                   // solid pixel rectangles thinner than a tile (the stair handrails) - see buildThinWalls()
const itemCache = {};                        // keeps the ID card "collected" when you leave and come back

export function loadZone(id) {
  const zone = ZONES[id];
  const text = zone.rows;
  if (text.some((r) => r.length !== text[0].length))
    throw new Error(`Zone "${id}": every row must be the same length (check for a missing or extra character)`);
  zoneId = id;
  cols = text[0].length; rows = text.length;
  widthPx = cols * TILE; heightPx = rows * TILE;
  spawn = zone.spawn ?? { x: 1, y: 1 };
  grid.length = 0;
  const found = [];
  // Parse the text: P/N/I are "markers", so we store the floor under them.
  for (let y = 0; y < rows; y++) {
    grid[y] = [];
    for (let x = 0; x < cols; x++) {
      let ch = text[y][x];
      if (ch === 'P') { spawn = { x, y }; ch = '.'; }
      else if (ch === 'N') { npcSpawn = { x, y }; ch = '.'; }
      else if (ch === 'I') { found.push({ x, y, collected: false }); ch = '.'; }
      grid[y][x] = ch;
    }
  }
  if (!itemCache[id]) itemCache[id] = found;
  items = itemCache[id];
  holes = (zone.holes ?? []).map((h) => ({ x: h.x * TILE, y: h.y * TILE, w: h.w * TILE, h: h.h * TILE, r: h.r === undefined ? undefined : h.r * TILE }));
  stairwells = (zone.stairwells ?? []).map((s) => ({ x: s.x * TILE, y: s.y * TILE, w: s.w * TILE, h: s.h * TILE, r: s.r === undefined ? undefined : s.r * TILE, sw: s.sw === undefined ? undefined : s.sw * TILE, len: s.len === undefined ? undefined : s.len * TILE }));
  curvedRails = (zone.curvedRails ?? []).map((d) => curvedRailPx(d, TILE));
  roundedCorners = (zone.roundedCorners ?? []).map((d) => roundedCornerPx(d, TILE));
  fences = (zone.fences ?? []).map((f) => ({ pts: f.points.map(([x, y]) => [x * TILE, y * TILE]) }));
  lawnBoxCache = null;
  buildThinWalls();
}
loadZone('zone1');                           // the game starts in zone 1

// ---- zone 1: the lawn above the top edge --------------------------------------------------------------------------
// The upper zone is a full grass lawn. It is NOT part of the map (nothing there is walkable or solid); renderer.js paints it, only while
// the camera slides above the top edge, by switching `virtualUp` on and drawing the rows -1 ... -UP_ROWS with the normal tile code.
// Which tile goes where: the hedge beds and the low semi-walls round them simply carry on upwards, everything else is lawn.
// The third west glass door (rows -1 and 0 of x0): one wall tile (row 1) above the north door 'j' (rows 2-3). Its lower half (row 0) is a real map tile
// ('e' in zones.js), its upper half (row -1) lives in the upper zone, so getTile() returns it even when the upper zone is not being painted
// (that is what lets drawGlassDoor() tell the two halves apart).
const UP_DOOR = 'e';
const UP_HEDGES = [27, 28, 29, 30];                         // columns of row 0..5 that hold a hedge bed which carries on upwards: the one bed beside the lane (now x27-30; the stair-side beds end at the stairs)
function upperTile(tx, ty) {
  const r = (-ty - 1) % 6;                                    // reuse the look of rows 0-5 so the beds do not repeat obviously
  if (tx >= 31) return '#';                                   // the north skyline window (31-37) is drawn by skyline.js
  if (tx === 0) return ty === -1 ? UP_DOOR : '#';             // the west wall (cream, see renderer.js) carries on up; row -1 holds the top half of the new glass door (see UP_DOOR)
  if (tx === 2 || tx === 21) return 'q';                      // the 1-tile semi-wall borders of the stair-side hedge beds go on to the top (the hedges themselves end at the stairs)
  if (UP_HEDGES.includes(tx)) return grid[r][tx];
  if (tx === 1 || (tx >= 22 && tx <= 26)) return '.';   // normal stone paving: the up-path (x1), behind the storage room, the lane
  return 'g';                                                 // everything else: lawn (the hedges beside the stairs end at the stairs)
}

export function getTile(tx, ty) {
  if (tx === 0 && ty === -1 && zoneId === 'zone1') return UP_DOOR;      // top half of the third west glass door (solid, like the wall it replaces)
  if (virtualUp && ty < 0 && ty >= -UP_ROWS && tx >= 0 && tx < cols && zoneId === 'zone1') return upperTile(tx, ty);
  if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) return '#'; // outside = wall
  return grid[ty][tx];
}
export const swim = { on: false };   // true while the player is in the zone 2 pool: the water ('~') is then open to him (the rim 'B' stays solid, so the steel ladder is the only way in or out)
const SOLID_TILES = '#RLlAfdDvEFB~MGKCTWHYZJQaoc12345678qmkejw';   // H = hedge, Y = bush mound, Z = tree, J = gym door, Q = gym poster wall, c = pillar, 1-6 = amphitheatre tiers, m = flat base slab under the tiers, q = hedge semi-wall (all solid)
export const isSolid = (tx, ty) => { const c = getTile(tx, ty); return c === '~' ? !swim.on : SOLID_TILES.includes(c); };

// Exit info for a tile of the current zone (or null)
export const stairwellDepth = (cx, cy) => { for (const s of stairwells) { const t = stairDepth(s, cx, cy); if (t >= 0) return t; } return -1; };   // -1 = not on the big stairs down, else 0..1 how far down (stairwell.js)
export const getExit = (tx, ty) => ZONES[zoneId].exits?.[tx + ',' + ty] ?? null;

export function getExitHint(tx, ty) {
  const e = getExit(tx, ty);
  if (e && !e.to) return e.label + ' - leads to another zone (coming soon)';
  return null;
}

// Zone 2 pool props (tile coordinates). The pool is x8-23, rows 11-18, ringed by the rim (row 10 / row 19, x7 / x24).
//   sign: the "RESTRICTED AREA" board standing on the floor beside the east rim (it faces LEFT / west, towards the pool)
//   operators: two Robotics Lab members with remote controls, one north of the pool looking south, one south of it looking north
export const POOL_PROPS = {
  sign: { tx: 25, ty: 12 },
  operators: [{ tx: 14, ty: 9, facing: 'down' }, { tx: 25, ty: 14, facing: 'left' }],
};


// The outline of a zone's lawn (zone 3): the bounding box of its grass tiles ('g'), one tile further out = the border wall. null where there is no lawn.
// (renderer.js draws the white rail along it, buildThinWalls() uses it for the rail posts at the entrance.)
export function lawnBox() {
  if (lawnBoxCache !== null) return lawnBoxCache || null;
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (grid[y][x] === 'g') { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  lawnBoxCache = x1 >= 0 ? { x0: x0 - 1, y0: y0 - 1, x1: x1 + 1, y1: y1 + 1 } : false;
  return lawnBoxCache || null;
}
export const RAIL_UP = 15;   // how far (px) the white lawn rail stands up the screen from the wall (renderer.js drawLawnRail)

// Thin solid walls: the silver handrail down the middle of each zone 1 stair flight is a rail, not floor, so it blocks the
// player. It is drawn by renderer.js drawFlight() at x = tile edge - 2 (4px wide, with a 6px post at each end of the flight);
// these rectangles must match that drawing. A flight lane is 32px wide, so the 20px player still fits either side of it.
function buildThinWalls() {
  thinWalls = [];
  for (const h of holes) thinWalls.push(...holeBands(h));          // every hole is solid, following its curve exactly (hole.js)
  for (const s of stairwells) thinWalls.push(...stairwellBands(s));   // the kerb ring + the barrier in the dark (stairwell.js); the steps are walkable
  for (const c of curvedRails) thinWalls.push(...railBands(c));    // so is everything outside a curved rail (curverail.js)
  const L = lawnBox();                                              // the white rail round the lawn: where it stops (the entrance), the end post stands up in front of the open floor - solid too
  if (L) for (const x of [L.x0, L.x1]) for (let y = L.y0 + 1; y <= L.y1; y++)
    if (grid[y][x] === 'q' && grid[y - 1][x] !== 'q') thinWalls.push({ x: x * TILE + 14, y: y * TILE - RAIL_UP, w: 4, h: RAIL_UP });
  if (zoneId === 'zone2') {                                         // the Robotics Lab test pool: the signboard and the two operators block the player (see pool.js)
    const { sign, operators } = POOL_PROPS;
    thinWalls.push({ x: sign.tx * TILE - 2, y: sign.ty * TILE + 15, w: TILE + 4, h: 14 });   // the board is wide and low: it blocks the width of its tile
    for (const o of operators) thinWalls.push({ x: o.tx * TILE + 4, y: o.ty * TILE + 4, w: TILE - 8, h: TILE - 6 });
    return;
  }
  for (const f of fences) for (let i = 1; i < f.pts.length; i++) {  // fences: every straight piece is a thin solid wall along its foot line
    const [xa, ya] = f.pts[i - 1], [xb, yb] = f.pts[i];
    if (xa === xb) thinWalls.push({ x: xa - 2, y: Math.min(ya, yb) - 2, w: 4, h: Math.abs(yb - ya) + 4 });
    else thinWalls.push({ x: Math.min(xa, xb) - 2, y: ya - 2, w: Math.abs(xb - xa) + 4, h: 4 });
  }
  if (zoneId === 'zone3') for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols - 1; tx++) {   // the small handrail down the east side of the lawn steps ('u' beside the border wall): see drawFlight()
    const c = grid[ty][tx];                                         // 'u' = the flight south of the landing, 'n' = the flipped one north of it
    if ((c !== 'u' && c !== 'n') || grid[ty][tx + 1] !== 'q') continue;
    const x = tx * TILE + TILE - 8, y = ty * TILE;
    thinWalls.push({ x, y, w: 4, h: TILE });
    if (grid[ty - 1][tx] !== c) thinWalls.push({ x: x - 1, y, w: 6, h: 4 });
    if (grid[ty + 1][tx] !== c) thinWalls.push({ x: x - 1, y: y + TILE - 5, w: 6, h: 5 });
  }
  if (zoneId !== 'zone1') return;                                   // only zone 1 draws S tiles as railed flights
  for (let ty = 0; ty < rows; ty++) for (let tx = 1; tx < cols; tx++) {
    if (grid[ty][tx] !== 'S' || grid[ty][tx - 1] !== 'S') continue;   // the rail sits on the seam between two lanes
    const x = tx * TILE, y = ty * TILE;
    thinWalls.push({ x: x - 2, y, w: 4, h: TILE });                   // the rail itself
    if (getTile(tx, ty - 1) !== 'S') thinWalls.push({ x: x - 3, y, w: 6, h: 4 });                 // end post (top of the flight)
    if (getTile(tx, ty + 1) !== 'S') thinWalls.push({ x: x - 3, y: y + TILE - 5, w: 6, h: 5 });   // end post (bottom)
  }
}

// Is this x0 tile part of a curved rail (drawn by renderer.js drawCurvedRails instead of as a straight rail tile)?
export const inCurvedRail = (tx, ty) => tx === 0 && curvedRails.some((c) => ty * TILE >= c.y0 && ty * TILE < c.y1);

// Every solid rectangle (whole tiles + thin walls) that a pixel-space box overlaps: [{x, y, w, h}]
export function solidRectsAt(x, y, w, h) {
  const out = [];
  const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 0.01) / TILE);
  const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 0.01) / TILE);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++)
      if (isSolid(tx, ty)) out.push({ x: tx * TILE, y: ty * TILE, w: TILE, h: TILE });
  for (const r of thinWalls)
    if (x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y) out.push(r);
  return out;
}

// Does a pixel-space box overlap anything solid? (the core of AABB collision)
export const boxHitsSolid = (x, y, w, h) => solidRectsAt(x, y, w, h).length > 0;

// The two water filters on the west wall of zone 1 (wall tiles x0, rows 7-9 and 21-23; drawn by renderer.js drawWaterFilter). You can drink
// from one when you stand right in front of it, facing the wall.
export const WATER_FILTERS = [{ y0: 7, y1: 9 }, { y0: 21, y1: 23 }];
export const nearWaterFilter = (cx, cy, facing) => zoneId === 'zone1' && facing === 'left' && cx < 2 * TILE
  && WATER_FILTERS.some((f) => cy >= f.y0 * TILE && cy < (f.y1 + 1) * TILE);

// Restroom doors of zone 2 (M = men's, north block, doors face south | G = women's, south block, doors face north; drawn by renderer.js
// drawRestroomDoor). Stand in front of the doors, facing them, and press E. Returns 'men' | 'women' | null.
export function nearRestroom(cx, cy, facing) {
  if (zoneId !== 'zone2') return null;
  const dy = facing === 'up' ? -44 : facing === 'down' ? 44 : 0;      // look 44px ahead of the player's centre
  if (!dy) return null;
  for (const dx of [0, -8, 8]) {                                       // a little sideways slack so you need not be perfectly centred
    const c = getTile(Math.floor((cx + dx) / TILE), Math.floor((cy + dy) / TILE));
    if (c === 'M') return 'men';
    if (c === 'G') return 'women';
  }
  return null;
}

// Is this tile one of the stair flights the player can walk on (zone 1's railed flights)?
export const isStairs = (tx, ty) => (zoneId === 'zone1' && getTile(tx, ty) === 'S') || (zoneId === 'zone3' && (getTile(tx, ty) === 'u' || getTile(tx, ty) === 'n'));   // zone 3: 'u' / 'n' = the flights up to the lawn landing (n = the flipped one on the north side)
// Nearest bench tile ('C') close enough to sit on, or null. `facing` = the open side of the bench, i.e. the way a
// person sits (looking away from the planter, towards the side the player walked up from).
export function findSeat(cx, cy) {
  const tx0 = Math.floor(cx / TILE), ty0 = Math.floor(cy / TILE);
  let best = null, bestD = 46;
  for (let ty = ty0 - 2; ty <= ty0 + 2; ty++) for (let tx = tx0 - 2; tx <= tx0 + 2; tx++) {
    const c = getTile(tx, ty);
    if (c !== 'C' && !(c >= '1' && c <= '8')) continue;                         // benches, and the big amphitheatre steps...
    if (c !== 'C' && ![[-1, 0], [1, 0], [0, -1], [0, 1]].some(([a, b]) => !isSolid(tx + a, ty + b))) continue;   // ...but only those you can reach (floor / stair lane beside them)
    const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2, d = Math.hypot(cx - x, cy - y);
    if (d >= bestD) continue;
    const dirs = [['left', -1, 0], ['right', 1, 0], ['up', 0, -1], ['down', 0, 1]];
    dirs.sort((a, b) => (b[1] * (cx - x) + b[2] * (cy - y)) - (a[1] * (cx - x) + a[2] * (cy - y)));   // side the player is on first
    const open = (d) => !isSolid(tx + d[1], ty + d[2]);
    best = { tx, ty, x, y, facing: (dirs.find(open) ?? dirs[0])[0] }; bestD = d;
  }
  return best;
}
// Head / foot clearance: the sprite is ~17px taller than the collision box above it and its shoes stick out ~5px below it, so walking up to a
// wall, hedge, bench or the pool rim used to put the head or the feet on it. Solid tiles (see clearsPlayer) keep both off them: the player stops HEAD / FOOT px short. (Skipped where there is no room, e.g. a 1-tile path under a wall.)
export const HEAD = 17;                                   // the head reaches ~17px above the hitbox
export const FOOT = 5;                                    // the shoes reach ~5px below the hitbox
const clearsPlayer = (tx, ty) => { const c = getTile(tx, ty); return c !== 'R' && isSolid(tx, ty); };   // every solid tile (walls, hedges and their rails, benches, the pool rim...) except the edge railings
const lowBed = (tx, ty) => zoneId === 'zone3' && 'HYZC'.includes(getTile(tx, ty));   // zone 3: the hedge bed (on a LOW semi-wall, renderer.js liftedFront) and the sitting-area benches are low: a head may pass over them
const clearsHead = (tx, ty) => clearsPlayer(tx, ty) && getTile(tx, ty) !== 'B' && !lowBed(tx, ty);   // the head may overlap the FLAT pool rim / lawn border (so you can walk right up to it from the south), the shoes may not (no standing on it from the north)
export function headWallBottom(x, y, w) {                // lowest pixel edge of a wall tile that the strip above the hitbox overlaps, or null
  const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 0.01) / TILE);
  const y0 = Math.floor((y - HEAD) / TILE), y1 = Math.floor((y - 0.01) / TILE);
  let best = null;
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++)
    if (clearsHead(tx, ty)) best = Math.max(best ?? -Infinity, (ty + 1) * TILE);
  return best;
}
export function footWallTop(x, y, w, h) {               // top pixel edge of the highest wall tile that the strip below the hitbox overlaps, or null
  const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 0.01) / TILE);
  const y0 = Math.floor((y + h) / TILE), y1 = Math.floor((y + h + FOOT - 0.01) / TILE);
  let best = null;
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++)
    if (clearsPlayer(tx, ty)) best = Math.min(best ?? Infinity, ty * TILE);
  return best;
}