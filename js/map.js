// map.js - loads ONE zone at a time from zones.js into a 2D array.
// Other files import cols/rows/items/spawn... as "live bindings", so they update automatically
// when loadZone() switches zones.
import { ZONES } from './zones.js';
export const TILE = 32;

export let zoneId = 'zone1';                 // which zone is loaded right now
export let cols = 0, rows = 0, widthPx = 0, heightPx = 0;
export const grid = [];                      // grid[y][x] = a single tile character
export let spawn = { x: 1, y: 1 };
export let npcSpawn = { x: 2, y: 2 };
export let items = [];                       // [{x, y, collected}] in tile coordinates
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
  buildThinWalls();
}
loadZone('zone1');                           // the game starts in zone 1

export function getTile(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) return '#'; // outside = wall
  return grid[ty][tx];
}
export const isSolid = (tx, ty) => '#RLlAfdDvEFB~MGKCTWHYZJQaoc12345678qmk'.includes(getTile(tx, ty));   // H = hedge, Y = bush mound, Z = tree, J = gym door, Q = gym poster wall, c = pillar, 1-6 = amphitheatre tiers, m = flat base slab under the tiers, q = hedge semi-wall (all solid)

// Exit info for a tile of the current zone (or null)
export const getExit = (tx, ty) => ZONES[zoneId].exits?.[tx + ',' + ty] ?? null;

export function getExitHint(tx, ty) {
  const e = getExit(tx, ty);
  if (e && !e.to) return e.label + ' - leads to another zone (coming soon)';
  return null;
}

// Thin solid walls: the silver handrail down the middle of each zone 1 stair flight is a rail, not floor, so it blocks the
// player. It is drawn by renderer.js drawFlight() at x = tile edge - 2 (4px wide, with a 6px post at each end of the flight);
// these rectangles must match that drawing. A flight lane is 32px wide, so the 20px player still fits either side of it.
function buildThinWalls() {
  thinWalls = [];
  if (zoneId !== 'zone1') return;                                   // only zone 1 draws S tiles as railed flights
  for (let ty = 0; ty < rows; ty++) for (let tx = 1; tx < cols; tx++) {
    if (grid[ty][tx] !== 'S' || grid[ty][tx - 1] !== 'S') continue;   // the rail sits on the seam between two lanes
    const x = tx * TILE, y = ty * TILE;
    thinWalls.push({ x: x - 2, y, w: 4, h: TILE });                   // the rail itself
    if (getTile(tx, ty - 1) !== 'S') thinWalls.push({ x: x - 3, y, w: 6, h: 4 });                 // end post (top of the flight)
    if (getTile(tx, ty + 1) !== 'S') thinWalls.push({ x: x - 3, y: y + TILE - 5, w: 6, h: 5 });   // end post (bottom)
  }
}

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

// Is this tile one of the stair flights the player can walk on (zone 1's railed flights)?
export const isStairs = (tx, ty) => zoneId === 'zone1' && getTile(tx, ty) === 'S';
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