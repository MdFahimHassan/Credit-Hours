// map.js - loads ONE zone at a time from zones.js into a 2D array.
// Other files import cols/rows/items/spawn... as "live bindings", so they update automatically
// when loadZone() switches zones.
import { ZONES } from './zones.js';
import { holeBands } from './hole.js';
import { stairwellBands, stairDepth } from './stairwell.js';
import { railBands, curvedRailPx, roundedCornerPx, cornerBands } from './curverail.js';
import { noseBands, NOSE } from './nose.js';
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
export let curvedRails = [];                 // curved west- or east-edge rails in PIXELS: [{y0, y1, depth, r, side}] - from the zone's `curvedRails` (tile units), see curverail.js
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
  curvedRails = (zone.curvedRails ?? []).map((d) => curvedRailPx(d, TILE, widthPx));
  roundedCorners = (zone.roundedCorners ?? []).map((d) => roundedCornerPx(d, TILE));
  fences = (zone.fences ?? []).map((f) => ({ pts: f.points.map(([x, y]) => [x * TILE, y * TILE]) }));
  lawnBoxCache = null;
  buildThinWalls();
}

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
  if (tx >= 24 && tx <= 26) return grid[(r + 2) % 6][tx + 3];   // the hedge BEHIND the storage room (x24-26, same plants as the bed beside it, shifted so the pattern does not repeat) carries on up to the top of the upper zone
  if (tx === 1 || tx === 22 || tx === 23) return '.';   // normal stone paving: the up-path (x1) and the lane beside the storage room (the hedge behind the room is x24-26, see above)
  return 'g';                                                 // everything else: lawn (the hedges beside the stairs end at the stairs)
}

export function getTile(tx, ty) {
  if (tx === 0 && ty === -1 && zoneId === 'zone1') return UP_DOOR;      // top half of the third west glass door (solid, like the wall it replaces)
  if (virtualUp && ty < 0 && ty >= -UP_ROWS && tx >= 0 && tx < cols && zoneId === 'zone1') return upperTile(tx, ty);
  if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) return '#'; // outside = wall
  return grid[ty][tx];
}
export const swim = { on: false };   // true while the player is in the zone 2 pool: the water ('~') is then open to him (the rim 'B' stays solid, so the steel ladder is the only way in or out)
const SOLID_TILES = '#RLlAfdDvEFB~MGKCTWHYZJQaoVc12345678qmkejw';   // H = hedge, Y = bush mound, Z = tree, J = gym door, Q = gym poster wall, c = pillar, 1-6 = amphitheatre tiers, m = flat base slab under the tiers, q = hedge semi-wall (all solid)
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

// ---- railings (R) ------------------------------------------------------------------------------------------------------------------
// An 'R' tile is NOT a full 32px block: renderer.js drawRail() paints the rail on the OUTER 24px of a tile on the edge of the zone (16px of slats + 8px of parapet, RAIL_W),
// and as a 19px-thick strip (6..25px into the tile) for a railing in the middle of a zone (the escalator). The collision follows that picture, so there is no
// invisible 8px of wall beside a rail. (Tiles of a curved rail, the rounded corner and the escalator nose are replaced by exact bands, see buildThinWalls.)
const RAIL_EDGE = 24, RAIL_MID_A = 6, RAIL_MID_B = 25;
export function railEdges(tx, ty) {                                  // which edges of the zone this rail tile sits on (renderer.js drawRail uses the same rule)
  const e = [];
  if (ty === 0) e.push('n');
  if (ty === rows - 1 && !(zoneId === 'zone3' && tx === cols - 1)) e.push('s');             // (zone 3: the south-east corner tile is part of the east rail only)
  if (tx === 0 && !(zoneId === 'zone1' && ty === rows - 1)) e.push('w');                    // (zone 1: the south rail runs on along the path to zone 2 - no west piece in the corner)
  if (tx === cols - 1 && !(zoneId === 'zone2' && (ty === 0 || ty === rows - 1))) e.push('e');   // (zone 2: the north-east and south-east corner tiles are part of the north / south rail only)
  return e;
}
const isRailTile = (x, y) => getTile(x, y) === 'R';
// is this 'R' tile drawn by something else (and so given its collision by something else)?
const railHandledElsewhere = (tx, ty) => inCurvedRail(tx, ty)
  || (tx === 0 && ty === 0 && roundedCorners.some((c) => c.corner === 'nw'))
  || (zoneId === 'zone1' && tx >= NOSE.tx + 1 && tx < NOSE.tx + NOSE.w && ty >= NOSE.ty && ty < NOSE.ty + NOSE.h);
// Does the player's ground strip collide with the WHOLE tile? (R tiles never do - their rails are thin walls; so are the nose tiles of the escalator)
const tileBlocks = (tx, ty) => {
  if (getTile(tx, ty) === 'R' && tx >= 0 && ty >= 0 && tx < cols && ty < rows) return false;
  if (zoneId === 'zone1' && tx >= NOSE.tx + 1 && tx < NOSE.tx + NOSE.w && ty >= NOSE.ty && ty < NOSE.ty + NOSE.h) return false;   // the escalator nose (nose.js)
  return isSolid(tx, ty);
};
function railRects() {
  const out = [];
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
    if (grid[ty][tx] !== 'R' || railHandledElsewhere(tx, ty)) continue;
    const px = tx * TILE, py = ty * TILE, edges = railEdges(tx, ty);
    if (edges.length) {
      for (const s of edges) out.push(s === 'n' ? { x: px, y: py, w: TILE, h: RAIL_EDGE } : s === 's' ? { x: px, y: py + TILE - RAIL_EDGE, w: TILE, h: RAIL_EDGE }
        : s === 'w' ? { x: px, y: py, w: RAIL_EDGE, h: TILE } : { x: px + TILE - RAIL_EDGE, y: py, w: RAIL_EDGE, h: TILE });
      continue;
    }
    let h = isRailTile(tx - 1, ty) || isRailTile(tx + 1, ty), v = isRailTile(tx, ty - 1) || isRailTile(tx, ty + 1);
    if (!h && !v) h = true;
    if (h) out.push({ x: px, y: py + RAIL_MID_A, w: TILE, h: RAIL_MID_B - RAIL_MID_A });
    if (v) out.push({ x: px + RAIL_MID_A, y: py, w: RAIL_MID_B - RAIL_MID_A, h: TILE });
  }
  return out;
}
function mergeRects(list) {                                          // glue neighbouring rects with the same extent together (fewer rects to test every frame)
  const same = (a, b, k, l) => Math.abs(a[k] - b[k]) < 0.001 && Math.abs(a[l] - b[l]) < 0.001;
  for (const [pos, size, cross, crossSize] of [['x', 'w', 'y', 'h'], ['y', 'h', 'x', 'w']]) {
    list.sort((a, b) => a[cross] - b[cross] || a[crossSize] - b[crossSize] || a[pos] - b[pos]);
    const res = [];
    for (const r of list) {
      const last = res[res.length - 1];
      if (last && same(last, r, cross, crossSize) && Math.abs(last[pos] + last[size] - r[pos]) < 0.001) last[size] += r[size]; else res.push({ ...r });
    }
    list = res;
  }
  return list;
}

// Thin solid walls: the silver handrail down the middle of each zone 1 stair flight is a rail, not floor, so it blocks the
// player. It is drawn by renderer.js drawFlight() at x = tile edge - 2 (4px wide, with a 6px post at each end of the flight);
// these rectangles must match that drawing. A flight lane is 32px wide, so the 20px player still fits either side of it.
function buildThinWalls() {
  thinWalls = [];
  for (const h of holes) thinWalls.push(...holeBands(h));          // every hole is solid, following its curve exactly (hole.js)
  for (const s of stairwells) thinWalls.push(...stairwellBands(s));   // the kerb ring + the barrier in the dark (stairwell.js); the steps are walkable
  for (const c of curvedRails) thinWalls.push(...railBands(c));    // so is everything outside a curved rail (curverail.js)
  for (const c of roundedCorners) if (c.corner === 'nw') thinWalls.push(...cornerBands(c.r));   // the rounded north-west corner: the quarter circle, not the whole corner tile
  if (zoneId === 'zone1') thinWalls.push(...noseBands());                                          // the rounded nose of the escalator rail (nose.js)
  thinWalls.push(...mergeRects(railRects()));                                                      // every other railing 'R' tile: exactly the picture of the rail, not the whole tile
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
    if ((c !== 'u' && c !== 'n') || (grid[ty][tx + 1] !== 'q' && !(tx > 0 && grid[ty][tx - 1] === 'q'))) continue;
    const x = tx * TILE + (grid[ty][tx + 1] === 'q' ? TILE - 8 : 4), y = ty * TILE;   // west flights: wall on the east; east flights (mirror image): wall on the west
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
export const inCurvedRail = (tx, ty) => curvedRails.some((c) => ty * TILE >= c.y0 && ty * TILE < c.y1 && (tx === (c.side === 'e' ? cols - 1 : 0) ||
  (c.tail > 0 && tx === cols - 1 - c.tail / TILE && ty * TILE >= c.ret)));   // (a bay with a `tail`: the tiles under the straight tail are covered by the curve too)

// Every solid rectangle (whole tiles + thin walls) that a pixel-space box overlaps: [{x, y, w, h}]
export function solidRectsAt(x, y, w, h) {
  const out = [];
  const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 0.01) / TILE);
  const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 0.01) / TILE);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++)
      if (tileBlocks(tx, ty)) out.push({ x: tx * TILE, y: ty * TILE, w: TILE, h: TILE });
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
  const sgn = facing === 'up' ? -1 : facing === 'down' ? 1 : 0;
  if (!sgn) return null;
  for (const dy of [16, 30, 44]) for (const dx of [0, -8, 8]) {          // look ahead of the player's centre (he can now stand right at the door: the wall tile is only ~10-30px away)
    const c = getTile(Math.floor((cx + dx) / TILE), Math.floor((cy + sgn * dy) / TILE));
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
// ---- The player's collision box --------------------------------------------------------------------------------------------------
// The sprite is ~38px tall: the head reaches ~13px above the 20x20 hitbox and the soles ~5px below it. Only the FEET collide with the map, exactly like a person
// standing on the roof: a COLL_H-px-tall strip whose bottom edge is the SOLE of the shoes (hitbox bottom + FOOT). The head and body are free to pass in front
// of a wall, a hedge, a bench...: in this oblique view the picture of a solid thing fills its own tile, so the player may stand right at the foot of it.
// (This replaces the old "head / foot clearance", which kept the whole 38px sprite off every solid tile: it stopped the player ~37px - more than a tile - short of
// anything he approached from the south, and left the tiles in front of walls, rooms and rails unreachable.)
export const FOOT = 5;                                    // the soles reach ~5px below the hitbox
export const COLL_H = 8;                                  // height of the strip under the soles that collides (a shoe, not a body)
export const groundDY = (h) => h + FOOT - COLL_H;         // offset of that strip's top edge from the hitbox top
export const groundBox = (x, y, w, h) => ({ x, y: y + groundDY(h), w, h: COLL_H });

loadZone('zone1');                           // the game starts in zone 1 (at the END of the file: loading a zone builds the thin walls, which use the helpers above)