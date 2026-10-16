// renderer.js - ALL drawing lives here. Game logic never touches the canvas.
import { TILE, cols, rows, widthPx, heightPx, getTile, isSolid, items, zoneId, curvedRails, stairwells, roundedCorners, inCurvedRail, lawnBox, RAIL_UP, fences } from './map.js';
import { railPath, cornerPath, RAIL_W } from './curverail.js';
import { transition } from './transition.js';
import { quest } from './quest.js';
import { dialogue } from './dialogue.js';
import { restroom } from './restroom.js';
import { intro } from './intro.js';
import { drawWell, wellBox, wellTiles } from './escalator.js';
import { drawCharacter } from './sprites.js';
import { drawGlassFront, drawGlassTops } from './glass.js';
import { drawStairwellInterior, drawStairwellRail } from './stairwell.js';
import { skyline, drawSkyline, drawCurvedBays, drawCornerNotch } from './skyline.js';
import { setVirtualUp, UP_ROWS, WATER_FILTERS } from './map.js';
import { getFloor } from './floor.js';
import { paintHedge, hedgeBase, buildOverlay } from './foliage.js';
import { drawPool, poolEntities, drawSignCard, signView, swimDepth, drawSwimmer } from './pool.js';
import { paintLeafMass, massBase, drawCrown } from './canopy.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;           // crisp pixels
const VW = canvas.width, VH = canvas.height;  // viewport size in pixels

const camera = { x: 0, y: 0 };

// Placeholder colors. Later you can swap these for real sprites.
const COLORS = {
  '#': '#5b5b66', '.': '#8f8f8b', '~': '#3a7bd5', 'h': '#2e6b34', 'g': '#4caf50',   // generic
  'p': '#a9a28e',                       // path
  'R': '#b8b2a4',                       // railing (floor drawn first, bars on top)
  'S': '#d3d1c7', 'u': '#bdbab0', 'n': '#bdbab0', 'y': '#bdbab0',       // stairs; 'u' = the 2-wide flight up to the lawn (zone 3)
  '1': '#8f8f8b', '2': '#8f8f8b', '3': '#8f8f8b', '4': '#8f8f8b', '5': '#8f8f8b', '6': '#8f8f8b', '7': '#8f8f8b', '8': '#8f8f8b', 'q': '#a6a49c', 'm': '#8f8f8b',   // amphitheatre tiers (and 'm' = their flat base slab): stone floor under them, slabs drawn by drawTier
  'L': '#b9573a', 'l': '#cfd2d6', 'f': '#e4e6e9', 'd': '#e4e6e9', 'A': '#cfd2d6',   // elevator wall (drawn by drawLiftWall)
  'D': '#9c6428',                       // store room door
  'E': '#030305', 'F': '#030305',       // escalators: painted over by drawWell() (escalator.js) - black here just in case
  'c': '#8f8f8b',                       // pillar: stone floor under it, drawn by drawPillar
  'v': '#030305',                       // escalator well = black void (the floor below)
  'X': '#a9a28e', 'U': '#a9a28e',       // exit paths (arrow drawn on top)
  'B': '#d9dde0',                       // pool rim / lawn border
  'K': '#4f4f5a',                       // storage room block (solid)
  'C': '#b8b2a4', 'T': '#b8b2a4', 'b': '#4a9a4a',   // bench + planter (floor first, drawn in drawBench / drawPlanter), bush
  'H': '#1f5a28', 'Y': '#1f5a28', 'Z': '#1f5a28',   // planted areas: hedge / bush mound / tree (drawn in drawPlanted)
  'e': '#5b5b66', 'j': '#5b5b66', 'w': '#5b5b66',   // glass doors on the west wall; 'w' = curtained sliding doors on zone 3's south wall (wall colour, door drawn on top)
  'J': '#5b5b66', 'Q': '#5b5b66',       // gym door / poster wall (wall colour, details drawn on top)
  'r': '#b8453f',                       // red gym mat (walkable)
  'M': '#5b5b66', 'G': '#5b5b66',       // restroom doors (wall colour, door drawn on top)
  'k': '#a8a69d', 'z': '#8d9094',       // basement stairwell block / its opening: painted as one piece by drawBasementBlock()
  'W': '#2f3b43',                       // glass skylight: the dark floor you see through it (drawn in drawGlass)
};

function updateCamera(player) {
  // center on player, then clamp so we never show outside the map...
  // ...EXCEPT near a rail: skyline.over[side] lets the camera slide past that edge to reveal the city (see skyline.js)
  skyline.sync();
  const o = skyline.over, push = skyline.push();            // push = extra nudge toward the rail while leaning out
  const wantX = player.cx - VW / 2 + push.x, wantY = player.cy - VH / 2 + push.y;
  camera.x = Math.max(-o.w, Math.min(wantX, widthPx - VW + o.e));
  camera.y = Math.max(-o.n, Math.min(wantY, heightPx - VH + o.s));
  camera.x = Math.round(camera.x); camera.y = Math.round(camera.y); // avoids seams
}

function drawBlobs(px, py, a) {                       // two leafy bush blobs (a = opacity)
  ctx.globalAlpha = a;
  ctx.fillStyle = '#2e7d32'; ctx.beginPath(); ctx.ellipse(px + 10, py + 19, 8, 8.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#388e3c'; ctx.beginPath(); ctx.ellipse(px + 22, py + 14, 8, 8.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#66bb6a'; ctx.fillRect(px + 12, py + 9, 5, 3);
  ctx.globalAlpha = 1;
}

// ---- planted areas: H = clipped hedge, Y = bush mound, Z = tree -----------------------------------------
// All three are solid. Leaf positions come from tx/ty (no random flicker). A pale guard rail is drawn
// automatically on every edge that faces open floor (see drawGuardRail), like the hedges in the real photos.
const isPlanted = (x, y) => { const c = getTile(x, y); return c === 'H' || c === 'Y' || c === 'Z'; };
const rnd = (a, b, c = 0) => Math.abs(Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453) % 1;
function disc(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }

// Zone 3: the hedge bed round the storage room is LIFTED to the level of the lawn-step landing - it sits on a low board-formed concrete semi-wall (the same one as zone 1's
// hedge beds). Seen from above only the wall's FRONT face shows: the south edge of the bed wherever it faces open floor (the landing and the storage room are flush with the bed).
const WALL_H = 10;                                                 // px: height of the semi-wall's front face under the hedge
const liftedFront = (x, y) => zoneId === 'zone3' && isPlanted(x, y) && !isPlanted(x, y + 1) && (getTile(x, y + 1) === '.' || getTile(x, y + 1) === '#');   // ('#': the east bed's south end stands against the south wall - its semi-wall face shows there too)
function paintBedWall(g, px, py, tx, ty) {
  const y = py + TILE - WALL_H;
  g.fillStyle = '#6f6d66'; g.fillRect(px, y, TILE, WALL_H);                                  // front face: same shade as the semi-wall's / tiers' risers
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(px, y, TILE, 2);                              // cap/face crease
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(px + 10, y, 1, WALL_H); g.fillRect(px + 21, y, 1, WALL_H);   // board-formed seams
  g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(px + 11, y, 1, WALL_H); g.fillRect(px + 22, y, 1, WALL_H);
  g.fillStyle = '#a6a49c'; g.fillRect(px, y - 2, TILE, 2);                                   // the lit concrete coping the hedge grows from
  g.fillStyle = 'rgba(255,255,255,0.30)'; g.fillRect(px, y - 2, TILE, 1);
  for (let i = 0; i < 5; i++) {                                                              // a few leaves lying over the coping
    g.fillStyle = i % 2 ? '#2f7a35' : '#43a047';
    g.beginPath(); g.ellipse(px + 3 + rnd(tx, ty, 300 + i) * 26, y - 1 + rnd(tx, ty, 320 + i) * 3, 2.6, 1.9, rnd(tx, ty, 340 + i) * 3, 0, Math.PI * 2); g.fill();
  }
}

const plantCache = new Map();                                      // one finished 32x32 picture per planted tile (they never change)
function paintPlantedTile(g, ch, px, py, tx, ty) {
  if (ch === 'Y') {                                                // bush mound: same leaf mass as the hedge, a little lighter and fluffier
    g.fillStyle = massBase; g.fillRect(px, py, TILE, TILE);
    paintLeafMass(g, px, py, 0.10);
  } else if (ch === 'Z') {                                         // tree standing in the hedge: leafy mass with a ragged crown on top
    g.fillStyle = massBase; g.fillRect(px, py, TILE, TILE);
    paintLeafMass(g, px, py, 0.02);
    drawCrown(g, px + 16, py + 15, tx, ty, 14);
  } else {                                                         // hedge: sparse planter bed <-> dense ivy, decided by a noise field (see foliage.js)
    paintHedge(g, px, py, tx, ty);
  }
  // light top edge / dark base only where the planted area ENDS, so a block of tiles reads as one big mass
  if (ty > 0 && !isPlanted(tx, ty - 1) && getTile(tx, ty - 1) !== 'k') { g.fillStyle = 'rgba(190,240,170,0.22)'; g.fillRect(px, py, TILE, 3); }
  if (liftedFront(tx, ty)) paintBedWall(g, px, py, tx, ty);                                  // zone 3: the bed stands on a semi-wall
  else if (!isPlanted(tx, ty + 1)) { g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(px, py + TILE - 6, TILE, 6); }
}
function drawPlanted(ch, px, py, tx, ty) {
  const key = zoneId + '|' + tx + '|' + ty + '|' + ch + '|' + (isPlanted(tx, ty - 1) ? 1 : 0) + (isPlanted(tx, ty + 1) ? 1 : 0) + (liftedFront(tx, ty) ? 'w' : '');
  let c = plantCache.get(key);
  if (!c) {
    c = document.createElement('canvas'); c.width = TILE; c.height = TILE;
    const g = c.getContext('2d'); g.translate(-px, -py);
    g.beginPath(); g.rect(px, py, TILE, TILE); g.clip();          // leaves never spill onto neighbour tiles
    paintPlantedTile(g, ch, px, py, tx, ty);
    plantCache.set(key, c);
  }
  ctx.drawImage(c, px, py);
  drawGuardRail(px, py, tx, ty);
}

// Pale grey safety rail for planted areas (NOT the dark two-bar roof railing): a slim handrail on top,
// thin vertical balusters under it, and a post at each end of every tile. Drawn on every open face.
const RAIL = { hand: '#d6dadd', bal: '#98a0a5', post: '#eceff1', shadow: 'rgba(0,0,0,0.28)' };
function railH(x, y, g = ctx, sh = true) {                // horizontal rail segment (top / bottom faces); g = target, sh = draw the soft shadow line
  if (sh) { g.fillStyle = RAIL.shadow; g.fillRect(x, y + 6, TILE, 1); }
  g.fillStyle = RAIL.bal; for (let i = 3; i < TILE - 2; i += 4) g.fillRect(x + i, y + 3, 1, 4);
  g.fillStyle = RAIL.hand; g.fillRect(x, y + 1, TILE, 2);
  g.fillStyle = RAIL.post; g.fillRect(x, y, 2, 7); g.fillRect(x + TILE - 2, y, 2, 7);
}
function railV(x, y, east, g = ctx, sh = true) {          // vertical rail segment (left / right faces)
  const hx = east ? x + 4 : x + 1, bx = east ? x + 1 : x + 3;
  if (sh) { g.fillStyle = RAIL.shadow; g.fillRect(east ? x : x + 6, y, 1, TILE); }
  g.fillStyle = RAIL.bal; for (let i = 3; i < TILE - 2; i += 4) g.fillRect(bx, y + i, 3, 1);
  g.fillStyle = RAIL.hand; g.fillRect(hx, y, 2, TILE);
  g.fillStyle = RAIL.post; g.fillRect(x, y, 7, 2); g.fillRect(x, y + TILE - 2, 7, 2);
}
// The two hedge beds beside the stairs (zone 1, rows 0-5: x3-5 and x18-20) sit against the semi-wall and the steps, which are solid, so they
// used to get no guard rail. A rail is now drawn on those faces too (same rail as every other hedge). The top edge (map edge) stays open.
const isStairBed = (x, y) => zoneId === 'zone1' && y >= 0 && y <= 5 && ((x >= 3 && x <= 5) || (x >= 18 && x <= 20));
const isRailable = (x, y, fx, fy) => !isPlanted(x, y) && getTile(x, y) !== 'g' && getTile(x, y) !== 'y' && getTile(x, y) !== 'u' && getTile(x, y) !== 'n' &&   /* (the lawn-step landing has its own white fence) */ (!isSolid(x, y) || (isStairBed(fx, fy) && (getTile(x, y) === 'q' || getTile(x, y) === 'm' || isTierCh(getTile(x, y)))));   // (fx, fy) = the hedge tile asking
function drawGuardRail(px, py, tx, ty) {
  const open = (x, y) => isRailable(x, y, tx, ty);   // floor / path next to the planted area (or the wall / steps beside a stair-side bed)
  const fenced = zoneId === 'zone3';                                           // zone 3: the north and west edges of the lifted bed carry the white fence (zones.js `fences`), level with the landing's
  if (open(tx, ty - 1) && !fenced) railH(px, py);
  if (open(tx, ty + 1) && !liftedFront(tx, ty)) railH(px, py + TILE - 7);   // (a bed on its semi-wall has no rail on the front: the hedge grows over the wall)
  if (open(tx - 1, ty) && !fenced) railV(px, py, false);
  if (open(tx + 1, ty) && !fenced) railV(px + TILE - 7, py, true);
}

// ---- foliage overlay: plants growing out through / over the guard rails (painted once per zone, see foliage.js) ----------
const foliageLayers = {};
function foliageLayer() {
  if (!foliageLayers[zoneId]) foliageLayers[zoneId] = buildOverlay({
    zoneId, cols, rows, widthPx, heightPx, getTile, isPlanted,
    isOpen: (x, y, fx, fy) => isRailable(x, y, fx, fy) && !(liftedFront(fx, fy) && x === fx && y === fy + 1),
    isSpill: (x, y) => getTile(x, y) === 'q' || isTierCh(getTile(x, y)),   // low walls and the big steps: hedges overgrow them
    paintRail: (g, face, px, py) => {                         // the rail of one face, WITHOUT its shadow (the tile already drew that)
      if (zoneId === 'zone3' && face !== 'S') return;                       // (N / W / E faces have the white fence instead; the S face is the semi-wall's front)
      if (face === 'N') railH(px, py, g, false); else if (face === 'S') railH(px, py + TILE - 7, g, false);
      else if (face === 'W') railV(px, py, false, g, false); else railV(px + TILE - 7, py, true, g, false);
    },
  });
  return foliageLayers[zoneId];
}
function drawFoliage(x0, x1, y0, y1) {                        // stamp the visible part over the tiles (before the player, so he walks in front)
  const sx = x0 * TILE, sy = y0 * TILE, sw = (x1 - x0 + 1) * TILE, sh = (y1 - y0 + 1) * TILE;
  ctx.drawImage(foliageLayer(), sx, sy, sw, sh, sx, sy, sw, sh);
}

// ---- concrete bench (C) and tree planter (T) -------------------------------------------------------
// Light speckled concrete seat with a darker front face, like the benches in the photos.
// T tiles sit in the middle of the bench ring: a dark grey tapered planter box with a tree growing out of it.
const isBenchPart = (x, y) => { const c = getTile(x, y); return c === 'C' || c === 'T'; };
const BENCH_R = 15;                                                                       // (*) px: radius of the rounded outer corners of a bench ring (tile = 32)
// rounded-rectangle path with a separate radius per corner: r = [top-left, top-right, bottom-right, bottom-left]
function roundRectPath(x, y, w, h, r) {
  const [tl, tr, br, bl] = r;
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);       if (tr) ctx.arcTo(x + w, y, x + w, y + tr, tr);   else ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - br);   if (br) ctx.arcTo(x + w, y + h, x + w - br, y + h, br); else ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + bl, y + h);       if (bl) ctx.arcTo(x, y + h, x, y + h - bl, bl);   else ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + tl);           if (tl) ctx.arcTo(x, y, x + tl, y, tl);           else ctx.lineTo(x, y);
  ctx.closePath();
}
function drawBench(px, py, tx, ty) {
  const n = isBenchPart(tx, ty - 1), s = isBenchPart(tx, ty + 1), w = isBenchPart(tx - 1, ty), e = isBenchPart(tx + 1, ty);
  const x0 = w ? 0 : 1, x1 = e ? TILE : TILE - 1, y0 = n ? 0 : 1, yb = s ? TILE : TILE - 6;
  const X = px + x0, Y = py + y0, W = x1 - x0, H = yb - y0;
  // a corner is rounded only where the ring sticks out in BOTH directions (a real outer corner), so the tiles of a ring still join up seamlessly
  const r = [!n && !w ? BENCH_R : 0, !n && !e ? BENCH_R : 0, !s && !e ? BENCH_R : 0, !s && !w ? BENCH_R : 0];
  if (!s) {                                                                               // darker front face + base shadow: the same rounded outline, pushed down
    ctx.fillStyle = '#6f7477'; roundRectPath(X, Y, W, H + 5, [0, 0, r[2], r[3]]); ctx.fill();
    ctx.fillStyle = '#9da1a3'; roundRectPath(X, Y, W, H + 4, [0, 0, r[2], r[3]]); ctx.fill();
  }
  ctx.save();
  roundRectPath(X, Y, W, H, r); ctx.clip();                                               // everything on the seat top is clipped to the rounded outline
  ctx.fillStyle = '#c9cccd'; ctx.fillRect(X, Y, W, H);                                    // seat top
  for (let i = 0; i < 8; i++) {                                                           // concrete speckle
    ctx.fillStyle = i % 2 ? '#aeb2b4' : '#dfe1e2';
    ctx.fillRect(px + 2 + Math.floor(rnd(tx, ty, i) * (TILE - 5)), py + 2 + Math.floor(rnd(tx, ty, i + 30) * (yb - 4)), 1, 1);
  }
  ctx.lineJoin = 'round'; ctx.lineCap = 'butt';                                           // edge light, only along the OUTER edges (stroked along the curve; clipped to the seat so half the stroke shows)
  const [rTL, rTR, rBR] = r, XR = X + W, YB = Y + H;
  if (!w) { ctx.strokeStyle = '#dfe1e2'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X, YB - r[3]); ctx.lineTo(X, Y + rTL); ctx.stroke(); }                      // lit left side
  if (!e) { ctx.strokeStyle = '#a9adaf'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(XR, Y + rTR); ctx.lineTo(XR, YB - rBR); ctx.stroke(); }                     // shaded right side
  if (!n) {                                                                               // lit top lip (2px), carried round the two top corners
    ctx.strokeStyle = '#e1e3e4'; ctx.lineWidth = 4; ctx.beginPath();
    if (rTL) { ctx.moveTo(X, Y + rTL); ctx.arcTo(X, Y, X + rTL, Y, rTL); } else ctx.moveTo(X, Y);
    ctx.lineTo(XR - rTR, Y);
    if (rTR) ctx.arcTo(XR, Y, XR, Y + rTR, rTR); else ctx.lineTo(XR, Y);
    ctx.stroke();
  }
  ctx.restore();
}
function drawPlanter(px, py, tx, ty) {
  drawBench(px, py, tx, ty);                                                              // the seat continues under the planter
  const isT = (x, y) => getTile(x, y) === 'T';
  const n = isT(tx, ty - 1), s = isT(tx, ty + 1);
  const x0 = px + 3, x1 = px + TILE - 3, y0 = py + (n ? 0 : 2), y1 = py + (s ? TILE : TILE - 2);
  const PR = 9, rr = [!n ? PR : 0, !n ? PR : 0, !s ? PR : 0, !s ? PR : 0];                // the planter box is rounded at its two ends too
  ctx.fillStyle = '#6a6c72'; roundRectPath(x0, y0, x1 - x0, y1 - y0, rr); ctx.fill();    // box body
  if (!n) { ctx.save(); roundRectPath(x0, y0, x1 - x0, y1 - y0, rr); ctx.clip(); ctx.fillStyle = '#868890'; ctx.fillRect(x0, y0, x1 - x0, 2); ctx.restore(); }   // lit rim
  if (!s) { ctx.save(); roundRectPath(x0, y0, x1 - x0, y1 - y0, rr); ctx.clip(); ctx.fillStyle = '#4d4f55'; ctx.fillRect(x0, y1 - 5, x1 - x0, 5); ctx.restore(); }   // darker front face
  const sr = Math.max(0, PR - 3), sx0 = x0 + 3, sx1 = x1 - 3, sy0 = y0 + (n ? 0 : 3), sy1 = y1 - (s ? 0 : 6);
  ctx.fillStyle = '#3b4a33'; roundRectPath(sx0, sy0, sx1 - sx0, sy1 - sy0, [!n ? sr : 0, !n ? sr : 0, !s ? sr : 0, !s ? sr : 0]); ctx.fill();   // soil
}

// ---- railings (R): wide grey steel slats (4px slat, 4px gap) between a thin top bar and bottom bar, standing on a
// weathered board-formed concrete parapet - like the rails in the photos. On the edge of a zone the rail sits on the OUTER
// 24px of the tile (parapet inside, slats outside) and the gaps show the drop + skyline beyond (see skyline.js).
// Rails in the middle of a zone get the same slats without the parapet.
const RC = { slat: '#5a646d', lit: '#8e99a3', dark: '#3b434a', bar: '#a9b2ba', barShade: '#6f7881', post: '#c3c8cb',
             para: '#a8a69d', cap: '#cdcbc2', seam: 'rgba(40,36,30,0.28)', stain: 'rgba(30,26,20,0.22)' };
const isRail = (x, y) => getTile(x, y) === 'R';

// One 32px piece of rail in a LOCAL frame: x runs along the rail (0-32), y runs from the outer edge (0) inwards.
function railPiece(idx, hasPrev, hasNext, slatH, paraH, parapet, seed) {
  if (parapet) {                                                       // concrete parapet under the slats
    ctx.fillStyle = RC.para; ctx.fillRect(0, slatH, 32, paraH);
    ctx.fillStyle = RC.cap; ctx.fillRect(0, slatH, 32, 2);             // lighter cap
    ctx.fillStyle = RC.seam; ctx.fillRect(0, slatH + 2, 1, paraH - 2); ctx.fillRect(16, slatH + 2, 1, paraH - 2);   // board seams
    ctx.fillStyle = RC.stain; ctx.fillRect(Math.floor(rnd(seed, 1) * 26) + 3, slatH + paraH - 5, 3, 5);               // weathering
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(0, slatH + paraH - 2, 32, 2);                                    // dark base
  } else {
    ctx.fillStyle = '#8a9096'; ctx.fillRect(0, slatH, 32, paraH);      // thin steel base channel
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, slatH + paraH, 32, 2);
  }
  for (const x of [2, 10, 18, 26]) {                                   // the slats: lit face on one side, dark edge on the other
    ctx.fillStyle = RC.slat; ctx.fillRect(x, 2, 4, slatH - 3);
    ctx.fillStyle = RC.lit;  ctx.fillRect(x, 2, 1, slatH - 3);
    ctx.fillStyle = RC.dark; ctx.fillRect(x + 3, 2, 1, slatH - 3);
  }
  ctx.fillStyle = RC.bar; ctx.fillRect(0, 0, 32, 2); ctx.fillRect(0, slatH - 2, 32, 2);   // top bar, bottom bar
  ctx.fillStyle = RC.barShade; ctx.fillRect(0, 2, 32, 1);
  const post = (x) => { ctx.fillStyle = RC.post; ctx.fillRect(x, 0, 3, slatH); ctx.fillStyle = RC.dark; ctx.fillRect(x + 2, 0, 1, slatH); };
  if (idx % 4 === 0 || !hasPrev) post(0);                              // a post every 4 tiles and at the ends
  if (!hasNext) post(29);
}
function inFrame(m, fn) { ctx.save(); ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]); fn(); ctx.restore(); }

function drawRail(px, py, tx, ty) {
  if (tx === 0 && ty === 0 && roundedCorners.some((c) => c.corner === 'nw')) return;   // the rounded north-west corner: drawn by drawCurvedRails()
  if (inCurvedRail(tx, ty)) return;                                    // part of a curved rail: drawn as one piece by drawCurvedRails()
  const seed = tx * 7 + ty;
  const edges = [];
  if (ty === 0) edges.push('n');
  if (ty === rows - 1) edges.push('s');
  if (tx === 0) edges.push('w');
  if (tx === cols - 1 && !(zoneId === 'zone2' && ty === 0)) edges.push('e');   // (zone 2: the north-east corner tile is part of the north rail only)
  if (edges.length) {                                                  // on the edge of the zone: parapet + slats, outer side
    for (const s of edges) {
      const m = { e: [0, 1, -1, 0, px + TILE, py], w: [0, 1, 1, 0, px, py], n: [1, 0, 0, 1, px, py], s: [1, 0, 0, -1, px, py + TILE] }[s];
      const horiz = s === 'n' || s === 's';
      const idx = horiz ? tx : ty;
      const prev = horiz ? isRail(tx - 1, ty) : isRail(tx, ty - 1), next = horiz ? isRail(tx + 1, ty) : isRail(tx, ty + 1);
      inFrame(m, () => railPiece(idx, prev, next, 16, 8, true, seed));
    }
    return;
  }
  let h = isRail(tx - 1, ty) || isRail(tx + 1, ty), v = isRail(tx, ty - 1) || isRail(tx, ty + 1);
  if (!h && !v) h = true;
  if (h) inFrame([1, 0, 0, 1, px, py + 6], () => railPiece(tx, isRail(tx - 1, ty), isRail(tx + 1, ty), 16, 3, false, seed));
  if (v) inFrame([0, 1, 1, 0, px + 6, py], () => railPiece(ty, isRail(tx, ty - 1), isRail(tx, ty + 1), 16, 3, false, seed));
}

// ---- curved rails (curverail.js) ---------------------------------------------------------------------------------------
// The west rail of zone 3 steps in beside the hole and back out in smooth bends. It looks exactly like a straight edge rail tile (concrete parapet
// under steel slats, a post every ~4 tiles and at the end) but is painted ONCE along the true curve: every band is one smooth polygon between
// two offsets of the centre line (exact tangents, 0.5px steps), so the edges stay clean. The slat pitch is stretched by a hair (7.9 - 8.1px) so that the
// pattern joins the straight rail tiles at both ends. The skyline outside the curve is painted by skyline.js drawCurvedBays().
const curvedImgs = new Map();
function buildCurvedRail(c, path = railPath(c)) {
  const { pts, len } = path, K = pts.length - 1, PAD = 4;
  const w = Math.ceil(c.depth + RAIL_W + 2 * PAD), h = Math.ceil(c.y1 - c.y0 + 2 * PAD);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'), ox = PAD, oy = PAD - c.y0;
  const sAt = (k) => k * len / K, kAt = (s) => Math.max(0, Math.min(K, Math.round(s * K / len)));
  // one band between offsets dA and dB (px inwards from the outer face) over the points k0..k1, as a single path
  const band = (k0, k1, dA, dB, fill) => {
    if (k1 <= k0) return;
    g.fillStyle = fill; g.beginPath();
    for (let k = k0; k <= k1; k++) { const f = pts[k]; (k === k0 ? g.moveTo : g.lineTo).call(g, f.x + f.ty * dA + ox, f.y - f.tx * dA + oy); }
    for (let k = k1; k >= k0; k--) { const f = pts[k]; g.lineTo(f.x + f.ty * dB + ox, f.y - f.tx * dB + oy); }
    g.closePath(); g.fill();
  };
  const span = (s0, s1, dA, dB, fill) => band(kAt(s0), kAt(s1), dA, dB, fill);   // the same, over a stretch of arc length s0..s1
  const N = Math.max(1, Math.round(len / 8)), P = len / N, u = P / 8;           // N slats' worth of pitch, one `u` = one "pixel" of the straight tile pattern
  // the dark drop seen between the slats (the same gradient as the lip of a straight edge, skyline.js)
  for (let d = 0; d < 16; d += 2) {
    const t = d / 24, mix = (a, b) => Math.round(a + (b - a) * t);
    band(0, K, d, d + 2, `rgb(${mix(0x4a, 0x2b)},${mix(0x47, 0x28)},${mix(0x40, 0x24)})`);
  }
  // Everything is laid out from the END of the rail (s' = distance from the path end), so the slats, seams and posts continue the path's own rail (skyline.js railRun) without a break
  const from = (s0, s1, dA, dB, fill) => span(len - s1, len - s0, dA, dB, fill);
  // concrete parapet (n 16-24): lighter cap, board seams, weathering, dark base
  band(0, K, 16, 24, RC.para); band(0, K, 16, 18, RC.cap); band(0, K, 22, 24, 'rgba(0,0,0,0.22)');
  for (let m = 0; m * 16 * u < len; m++) { from(m * 16 * u, m * 16 * u + u, 18, 22, RC.seam); }
  for (let m = 0; m < N / 4; m++) from((m * 4 + 1 + rnd(m, 3) * 2.6) * 8 * u, (m * 4 + 1 + rnd(m, 3) * 2.6) * 8 * u + 3 * u, 17, 22, RC.stain);
  // the slats: 4 wide every 8, lit face on the side nearest the path, dark edge on the other
  for (let m = 0; m < N; m++) {
    const a = m * P + 2 * u, b = m * P + 6 * u;
    from(a, b, 2, 15, RC.slat); from(a, a + u, 2, 15, RC.lit); from(b - u, b, 2, 15, RC.dark);
  }
  span(0, len, 0, 2, RC.bar); span(0, len, 14, 16, RC.bar); span(0, len, 2, 3, RC.barShade);   // top bar, bottom bar
  // posts: about every 4 tiles from the path's own end post (at s' = 0, drawn by the path's rail); none at the start, where the straight edge rail goes on
  const posts = Math.max(1, Math.round(len / 128));
  for (let j = 1; j < posts; j++) { const s0 = len * j / posts - 1.5 * u; from(s0, s0 + 3 * u, 0, 16, RC.post); from(s0 + 2 * u, s0 + 3 * u, 0, 16, RC.dark); }
  return { cv, x: -ox, y: -oy };
}
function drawCurvedRails(time) {
  for (const c of curvedRails) {
    if (c.y0 > camera.y + VH || c.y1 < camera.y || camera.x > c.depth + RAIL_W) continue;
    drawCurvedBays(ctx, camera, VW, VH, time);                          // the skyline outside the curve (over the floor tiles under it)
    const key = zoneId + '|' + c.y0;
    if (!curvedImgs.has(key)) curvedImgs.set(key, buildCurvedRail(c));
    const im = curvedImgs.get(key);
    ctx.drawImage(im.cv, im.x, im.y);
  }
  for (const rc of roundedCorners) {                                    // rounded north-west corner of the rail (a quarter circle in tile (0,0))
    if (camera.x > rc.r + RAIL_W || camera.y > rc.r + RAIL_W) continue;
    drawCornerNotch(ctx, time, rc.r);
    const key = zoneId + '|corner|' + rc.corner;
    if (!curvedImgs.has(key)) curvedImgs.set(key, buildCurvedRail({ y0: 0, y1: rc.r, depth: rc.r, r: rc.r }, cornerPath(rc.r)));
    const im = curvedImgs.get(key);
    ctx.drawImage(im.cv, im.x, im.y);
  }
}

// ---- the nose of the escalator railing (zone 1) -----------------------------------------------------------------------
// The two straight rails (rows 13 and 17) run on, then taper in diagonally with a soft S-bend and meet in a narrow rounded
// tip - a "hat" / bullet shape like the real escalator rail. Painted once into an offscreen image (tiles x 15-18, rows 13-17) and
// stamped over those tiles every frame. The black void is the same shape pulled in from the rail, so it runs parallel to it.
// Everything is built from exact curve maths (true tangents, each edge painted as ONE smooth band), so the lines stay clean.
// TWEAK ME (pixels inside that image, 32px per tile, x 0 = left edge of tile 15, y 0 = top edge of row 13):
//   HAT_START = where the diagonal begins     HAT_TIP = how far right the tip reaches     TIP_R = how round the tip is
//   HAT_ANGLE = steepness (degrees) where the diagonal turns into the round tip           HAT_HANDLE = how straight the diagonal is
//   WELL_IN_TOP / WELL_IN_BOT = distance from each rail's centre-line to the void's edge (they differ by 4 because the two straight
//   rails are built differently: top 14 -> void edge 32, bottom 142 -> void edge 128)
const NOSE = { tx: 15, ty: 13, w: 4, h: 5 };
const HAT_TOP = 14, HAT_BOT = 142, HAT_START = 27, HAT_TIP = 114, TIP_R = 26, HAT_ANGLE = 48, HAT_HANDLE = 10;
const WELL_X = 32, WELL_TOP = 32, WELL_BOT = 128, WELL_IN_TOP = 18, WELL_IN_BOT = 14;   // the void starts at tile 16 and fills rows 14-16
let noseImg = null, noseMask = null;   // noseMask = the void's exact shape (pixel-snapped); the escalator well is painted through it
function buildNose() {
  const c = document.createElement('canvas'); c.width = NOSE.w * TILE; c.height = NOSE.h * TILE;
  const g = c.getContext('2d');
  const cy = (HAT_TOP + HAT_BOT) / 2, phi = HAT_ANGLE * Math.PI / 180, cx = HAT_TIP - TIP_R;
  const dirx = Math.cos(phi), diry = Math.sin(phi);
  const E = [cx + TIP_R * Math.sin(phi), cy - TIP_R * Math.cos(phi)];          // where the diagonal meets the round tip
  const B = [[HAT_START, HAT_TOP], [HAT_START + 22, HAT_TOP], [E[0] - HAT_HANDLE * dirx, E[1] - HAT_HANDLE * diry], E];

  // ---- 1. the rail centre-line with EXACT tangents. top side: straight -> S-bend -> round tip; bottom side = its mirror ----
  const top = [];
  const add = (x, y, tx, ty) => top.push({ x, y, tx, ty });
  for (let x = 0; x < HAT_START; x += 0.25) add(x, HAT_TOP, 1, 0);
  for (let i = 0; i <= 480; i++) {
    const t = i / 480, u = 1 - t;
    const x = u*u*u*B[0][0] + 3*u*u*t*B[1][0] + 3*u*t*t*B[2][0] + t*t*t*B[3][0];
    const y = u*u*u*B[0][1] + 3*u*u*t*B[1][1] + 3*u*t*t*B[2][1] + t*t*t*B[3][1];
    const dx = 3 * (u*u*(B[1][0] - B[0][0]) + 2*u*t*(B[2][0] - B[1][0]) + t*t*(B[3][0] - B[2][0]));
    const dy = 3 * (u*u*(B[1][1] - B[0][1]) + 2*u*t*(B[2][1] - B[1][1]) + t*t*(B[3][1] - B[2][1]));
    const l = Math.hypot(dx, dy); add(x, y, dx / l, dy / l);
  }
  for (let i = 1; i <= 180; i++) { const a = phi + (Math.PI / 2 - phi) * i / 180; add(cx + TIP_R * Math.sin(a), cy - TIP_R * Math.cos(a), Math.cos(a), Math.sin(a)); }
  const dense = top.slice();                                                    // the whole loop, travelling clockwise
  for (let i = top.length - 2; i >= 0; i--) dense.push({ x: top[i].x, y: 2 * cy - top[i].y, tx: -top[i].tx, ty: top[i].ty });
  const nTop = top.length;

  // ---- 2. the black void: the centre-line pulled in by a constant distance (along the true normal), exactly parallel to the rail ----
  const smoother = (v) => { v = Math.max(0, Math.min(1, v)); return v * v * v * (v * (v * 6 - 15) + 10); };
  const vc = document.createElement('canvas'); vc.width = c.width; vc.height = c.height;
  const vg = vc.getContext('2d');
  vg.beginPath(); vg.rect(WELL_X, 0, vc.width - WELL_X, vc.height); vg.clip();    // only right of tile 16 (the escalator end-block covers the rest)
  vg.fillStyle = '#000'; vg.beginPath();
  dense.forEach((q, i) => {
    const th = Math.atan2(q.ty, q.tx), inset = (WELL_IN_TOP + WELL_IN_BOT) / 2 + (WELL_IN_TOP - WELL_IN_BOT) / 2 * Math.cos(th);   // 18 top -> 14 bottom, blended round the tip
    const x = q.x - q.ty * inset;
    let y = q.y + q.tx * inset;
    const w = 1 - smoother((x - WELL_X) / 8), edge = i < nTop ? WELL_TOP : WELL_BOT;     // flush with the end-block corner, then eases out over 8px (under 1px of change)
    y += (edge - y) * w;
    i ? vg.lineTo(x, y) : vg.moveTo(x, y);
  });
  vg.closePath(); vg.fill();
  const im = vg.getImageData(0, 0, vc.width, vc.height), d = im.data;             // snap to whole pixels: crisp, even stair-steps
  for (let i = 0; i < d.length; i += 4) { const on = d[i + 3] >= 128; d[i] = 3; d[i + 1] = 3; d[i + 2] = 5; d[i + 3] = on ? 255 : 0; }
  vg.putImageData(im, 0, 0); noseMask = vc;                       // the void is no longer filled black here: drawWellLayer() paints the escalator well into this shape

  // ---- 3. frames along the rail at 4 per pixel; N (a multiple of 8) pixels long so the slats line up with the straight rails ----
  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].y - dense[i - 1].y));
  const len = cum[cum.length - 1], N = Math.max(1, Math.round(len / 8)) * 8, K = N * 4;
  const F = []; let j = 1;
  for (let k = 0; k <= K; k++) {
    const sA = k * len / K; while (j < cum.length - 1 && cum[j] < sA) j++;
    const t = (sA - cum[j - 1]) / ((cum[j] - cum[j - 1]) || 1), p = dense[j - 1], q = dense[j];
    const tx = p.tx + (q.tx - p.tx) * t, ty = p.ty + (q.ty - p.ty) * t, l = Math.hypot(tx, ty) || 1;
    F.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, tx: tx / l, ty: ty / l });
  }
  const KT = K / 2;                                                             // frame at the tip (top side is 0..KT, bottom side KT..K)
  // one band between two offsets from the centre-line, painted as a single path (no seams, no ripples). dA/dB can be numbers or functions of k
  const band = (k0, k1, dA, dB, fill) => {
    const fa = typeof dA === 'function' ? dA : () => dA, fb = typeof dB === 'function' ? dB : () => dB;
    g.fillStyle = fill; g.beginPath();
    for (let k = k0; k <= k1; k++) { const f = F[k], o = fa(k); (k === k0 ? g.moveTo : g.lineTo).call(g, f.x - f.ty * o, f.y + f.tx * o); }
    for (let k = k1; k >= k0; k--) { const f = F[k], o = fb(k); g.lineTo(f.x - f.ty * o, f.y + f.tx * o); }
    g.closePath(); g.fill();
  };

  // steel base channel + shadow: inside on the top rail, outside on the bottom; it fades out round the tip
  const fk = (k) => Math.max(0, Math.min(1, Math.abs(F[k].tx) * 1.6));
  band(0, KT, 8, (k) => 8 + 3 * fk(k), '#8a9096');            band(0, KT, (k) => 8 + 3 * fk(k), (k) => 8 + 5 * fk(k), 'rgba(0,0,0,0.18)');
  band(KT, K, (k) => -8 - 3 * fk(k), -8, '#8a9096');         band(KT, K, (k) => -8 - 5 * fk(k), (k) => -8 - 3 * fk(k), 'rgba(0,0,0,0.18)');
  // slats: 4px wide every 8px, lit face on the left, dark edge on the right (as if the rail ran left to right)
  for (let m = 0; m * 8 < N; m++) {
    const a = m * 8 + 2, b = m * 8 + 6;
    for (const [col, lo, hi] of [[RC.slat, a, b], [RC.lit, a, a + 1], [RC.dark, b - 1, b]]) {
      const kt0 = lo * 4, kt1 = Math.min(KT, hi * 4);                           // top side: position along = i
      if (kt1 > kt0) band(kt0, kt1, -6, 6, col);
      const kb0 = Math.max(KT, (N - hi) * 4), kb1 = (N - lo) * 4;               // bottom side: position along = N - i
      if (kb1 > kb0) band(kb0, kb1, -6, 6, col);
    }
  }
  band(0, K, -8, -6, RC.bar); band(0, K, 6, 8, RC.bar);                          // outer bar, inner bar
  band(0, KT, -6, -5, RC.barShade); band(KT, K, 5, 6, RC.barShade);
  g.save(); g.translate(HAT_TIP, cy);                                           // one post at the tip
  g.fillStyle = RC.post; g.fillRect(-1.5, -9.5, 3, 19); g.fillStyle = RC.dark; g.fillRect(0.5, -9.5, 1, 19);
  g.restore();
  return c;
}
// The escalator well (escalator.js): belts fading into the dark + the floors below. Painted into an offscreen layer, cut to the
// shape of the straight part + the nose's void, then stamped on the map.
let wellLayer = null, wellMaskImg = null;
function drawWellLayer(time) {
  const B = wellBox;
  if (!wellLayer) {
    wellLayer = document.createElement('canvas'); wellLayer.width = B.w; wellLayer.height = B.h;
    wellMaskImg = document.createElement('canvas'); wellMaskImg.width = B.w; wellMaskImg.height = B.h;
    const m = wellMaskImg.getContext('2d');
    m.fillStyle = '#000'; m.fillRect(0, 0, (NOSE.tx + 1) * TILE - B.x, B.h);                       // straight part: tiles up to 15
    m.drawImage(noseMask, NOSE.tx * TILE - B.x, NOSE.ty * TILE - B.y);                            // + the nose's void (tile 16 on)
  }
  const g = wellLayer.getContext('2d');
  g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, B.w, B.h);
  g.save(); g.translate(-B.x, -B.y); drawWell(g, time); g.restore();
  g.globalCompositeOperation = 'destination-in'; g.drawImage(wellMaskImg, 0, 0);
  g.globalCompositeOperation = 'source-over';
  ctx.drawImage(wellLayer, B.x, B.y);
}
function drawEscalatorNose(x0, x1, y0, y1, time) {
  for (let ty = NOSE.ty; ty < NOSE.ty + NOSE.h; ty++) for (let tx = NOSE.tx; tx < NOSE.tx + NOSE.w; tx++) {
    if (tx < x0 || tx > x1 || ty < y0 || ty > y1) continue;
    if (tx === NOSE.tx && ty > NOSE.ty && ty < NOSE.ty + NOSE.h - 1) continue;   // keep the belt ends in tile 15
    drawTile('.', tx * TILE, ty * TILE, tx, ty, 0);                             // fresh floor under the nose
  }
  if (!noseImg) noseImg = buildNose();
  if (!(x1 < wellTiles.x0 || x0 > wellTiles.x1 || y1 < wellTiles.y0 || y0 > wellTiles.y1)) drawWellLayer(time);   // the well, under the rails
  ctx.drawImage(noseImg, NOSE.tx * TILE, NOSE.ty * TILE);
}

// ---- pillars (c): the steel-blue columns of the rooftop shelter -----------------------------------------------------
// They run from the floor up to the roof, so seen from above (the roof is not drawn) a pillar is just its square cross-section:
// a dark steel-blue square with a pale concrete border (the plinth) around it and a soft shadow on the floor.
function drawPillar(px, py, tx, ty) {
  const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(px + x, py + y, w, h); };
  R(4, 4, 28, 28, 'rgba(0,0,0,0.20)');                                // soft shadow to the south-east
  R(2, 2, 28, 28, '#a9a69d');                                         // concrete plinth: outline,
  R(3, 3, 26, 26, '#d8d5cc');                                         //   pale top face,
  R(3, 3, 26, 1, '#ecebe4'); R(3, 3, 1, 26, '#e6e4dc');               //   lit top / left edge,
  R(3, 28, 26, 1, '#bdbab1'); R(28, 3, 1, 26, '#c4c1b8');             //   shaded bottom / right edge
  R(6, 6, 20, 20, '#1b2436');                                         // the column: dark outline,
  R(7, 7, 18, 18, '#2f3d57');                                         //   steel-blue face,
  R(7, 7, 18, 2, '#4a5d80'); R(7, 7, 2, 18, '#415473');               //   lit top / left bevel,
  R(7, 23, 18, 2, '#1f2a3f'); R(23, 7, 2, 18, '#222e45');             //   shaded bottom / right bevel
  R(11, 11, 10, 10, '#2a3850');                                       //   slightly recessed middle
  if ((tx * 5 + ty * 3) % 2 === 0) { R(13, 13, 1, 4, '#3d4d6b'); R(17, 17, 2, 1, '#3d4d6b'); R(5, 24, 3, 1, '#9b988f'); }          // paint / concrete wear
  else                              { R(15, 12, 1, 3, '#3d4d6b'); R(12, 17, 3, 1, '#27344d'); R(24, 4, 3, 1, '#b3b0a7'); }
}

// ---- recycling bins: a = blue (recyclable), o = red (non-recyclable) ------------------------------------------------
// Modelled on the real ones: a bin with a flip-top dome lid and a yellow flap, black rings under the lid and at the bottom,
// a round label on the front, hanging on a black post over a rectangular black base frame. Each bin fills one tile.
const BIN = {
  a: { body: '#2f62b3', lit: '#4a82d2', dark: '#214a8c', lid: '#7d9ed6', lidLit: '#a6bfe6', lidDark: '#5a7cba', label: '#e9f3ea', mark: '#2f9a5d' },
  o: { body: '#c4372e', lit: '#e0584a', dark: '#942720', lid: '#dd5448', lidLit: '#f08072', lidDark: '#b2352c', label: '#f4eaea', mark: '#c4372e' },
};
function drawBin(ch, px, py) {
  const c = BIN[ch], R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(px + x, py + y, w, h); };
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(px + 16, py + 28, 14, 3.5, 0, 0, Math.PI * 2); ctx.fill();   // floor shadow
  R(4, 25, 24, 4, '#1b1d21'); R(6, 26, 20, 2, '#3b3e45');                      // base frame (dark tray with a lighter inside)
  R(14, 21, 4, 5, '#1b1d21'); R(15, 21, 1, 5, '#454850');                      // post
  for (let y = 11; y <= 22; y++) {                                              // body: slightly tapered, lit on the left, shaded on the right
    const t = Math.floor((y - 11) / 6), x0 = 7 + t, x1 = 25 - t;
    R(x0, y, x1 - x0, 1, c.body); R(x0, y, 2, 1, c.lit); R(x1 - 2, y, 2, 1, c.dark);
  }
  R(10, 21, 12, 2, '#1b1d21'); R(11, 21, 10, 1, '#3b3e45');                      // black ring at the bottom
  const lidRows = [[10, 22], [8, 24], [7, 25], [7, 25], [7, 25], [7, 25]];     // dome lid (y 4-9)
  lidRows.forEach(([x0, x1], i) => { R(x0, 4 + i, x1 - x0, 1, c.lid); R(x0, 4 + i, 2, 1, c.lidLit); R(x1 - 2, 4 + i, 2, 1, c.lidDark); });
  R(11, 4, 10, 1, c.lidLit);                                                     // light along the top of the dome
  R(12, 1, 10, 2, '#e8c23c'); R(11, 3, 12, 1, '#c99f22'); R(13, 1, 4, 1, '#f6dc72');   // yellow flap on top, tilted open
  R(6, 10, 20, 2, '#1b1d21'); R(7, 10, 18, 1, '#3b3e45');                        // black ring under the lid
  ctx.fillStyle = c.label; ctx.beginPath(); ctx.arc(px + 16, py + 17, 4.6, 0, Math.PI * 2); ctx.fill();   // round label on the front
  ctx.fillStyle = c.mark; ctx.beginPath(); ctx.arc(px + 16, py + 17, 3, 0, Math.PI * 2); ctx.fill();        // its symbol: green ring (recycle) / red ring
  ctx.fillStyle = c.label; ctx.beginPath(); ctx.arc(px + 16, py + 17, 1.4, 0, Math.PI * 2); ctx.fill();
  if (ch === 'a') { R(13, 16, 1, 1, c.label); R(18, 18, 1, 1, c.label); R(16, 14, 1, 1, c.label); }           // little gaps in the ring = recycling arrows
}


// ---- amphitheatre tiers (A) + railed stair flights (S, zone 1) ---------------------------------------------------------
// Zone 1's upper section copies the real rooftop: two stair flights (each with a silver handrail down the middle) with wide,
// tall concrete tiers between and beside them. Every row of tiers is one step: pale tread on top, darker riser below, and the
// bottom corners of a tier block are rounded wherever the block ends (like the "D"-shaped ends in the photos).
// level of whatever is at (x, y) as seen from a tier: 1-3 = tier, 9 = hedge / wall (never rounded, no side face), 0 = floor / stairs
const tierLevel = (x, y) => {
  const c = getTile(x, y);
  if (c >= '1' && c <= '8' && c.length === 1) return +c;
  if (c === 'm') return 1;                                                  // flat base slab: same height as the lowest tier
  return (c === 'H' || c === 'Y' || c === 'Z' || c === '#' || c === 'D' || c === 'q') ? 9 : 0;
};
// base = true: the flat base slab ('m') at the foot of a flight of tiers. It is one straight, square-cut tile (no rounded ends, no
// stepping) - the stepped layers and their risers start on the tile ABOVE it, and its front face lines up with the semi-wall's.
function drawTier(px, py, tx, ty, L, base = false) {
  const n = tierLevel(tx, ty - 1), s = tierLevel(tx, ty + 1), w = tierLevel(tx - 1, ty), e = tierLevel(tx + 1, ty);
  const onBase = base || getTile(tx, ty + 1) === 'm';                      // base slab, or the tile sitting right on it: square bottom corners
  const R = 20, drop = (v) => v < L;                                       // a face shows wherever the neighbour is lower
  const rad = (a, b, bottom = false) => (drop(a) && drop(b) && !(bottom && onBase) ? R : 0);   // round a corner when BOTH its sides drop away
  const riser = drop(s) ? 9 : 0, lit = 20 * (Math.min(L, 7) - 1);
  ctx.save();
  ctx.beginPath(); ctx.roundRect(px, py, TILE, TILE, [rad(n, w), rad(n, e), rad(s, e, true), rad(s, w, true)]); ctx.clip();
  ctx.fillStyle = '#6f6d66'; ctx.fillRect(px, py, TILE, TILE);             // face colour (shows wherever nothing else is painted)
  ctx.fillStyle = `rgb(${142 + lit / 2},${140 + lit / 2},${133 + lit / 2})`; ctx.fillRect(px, py, TILE, TILE - riser);   // tread: higher steps are a touch lighter
  for (let i = 0; i < 5; i++) { ctx.fillStyle = i % 2 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.12)'; ctx.fillRect(px + 2 + Math.floor(rnd(tx, ty, i) * 28), py + 3 + Math.floor(rnd(tx, ty, i + 20) * 16), 2, 1); }
  if (drop(n)) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(px, py, TILE, 2); }                  // lit back edge
  if (drop(w)) { ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(px, py, 2, TILE - riser); }          // lit west edge
  if (drop(e)) { ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fillRect(px + TILE - 4, py, 4, TILE); }             // shaded east wall
  if (riser) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(px, py + TILE - riser, TILE, 2); }           // tread/riser crease
  ctx.restore();
}

// ---- the two BIG outer tier blocks (zone 1, x5-7 and x14-16): nested L-shaped layers, painted as ONE smooth piece ---------
// In the real amphitheatre these are not a grid of tiles: each side is a stack of long concrete layers. Every layer is an "L"
// hugging the pit (one arm along the front, one along the flight), its outer corner swept round in a big smooth curve, with a
// curved riser below it that follows the same curve. Each higher layer is the same shape pulled back toward the hedge.
// A block is found automatically = a group of connected tier tiles (1-8) that sits on a flat base slab (m). The digits in the map
// only mark WHERE the block is (all of it is solid); the layers are drawn from the block's size: one layer per tile of width.
// The middle block between the two flights has no base slab, so it keeps the tile-by-tile steps (drawTier).
// TWEAK ME:
const LAYER_W = 32;       // width of every layer's tread band (px)
const CORNER_R = 28;      // roundness of every layer's outer corner (px)
const RISER_S = 9;        // height of the riser facing the front (south)
const RISER_SIDE = 4;     // width of the side wall facing the pit
const TURN_R = 22;        // roundness of the turn towards the middle (px): bigger = smoother, smaller = pointier
const STEP_H = 40;        // height (px) between the turns of neighbouring layers at the top: the highest layer turns at STEP_H, the next at 2 x STEP_H...
const TREAD = ['#a6a49c', '#aeaca4', '#b6b4ab', '#bdbbb2'];   // tread colour of layer 1, 2, 3...: higher = a touch lighter (layer 1 matches the semi-wall cap)
const isTierCh = (c) => (c >= '1' && c <= '8' && c.length === 1) || c === 'm';
const tierBlockCache = {};
function tierBlocks() {
  if (tierBlockCache[zoneId]) return tierBlockCache[zoneId];
  const byTile = new Map(), seen = new Set();
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
    if (!isTierCh(getTile(tx, ty)) || seen.has(tx + ',' + ty)) continue;
    const stack = [[tx, ty]], tiles = [];
    let hasBase = false, x0 = tx, x1 = tx, y0 = ty, y1 = ty;
    seen.add(tx + ',' + ty);
    while (stack.length) {                                           // flood fill the connected group
      const [x, y] = stack.pop(); tiles.push([x, y]);
      if (getTile(x, y) === 'm') hasBase = true;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
        if (isTierCh(getTile(nx, ny)) && !seen.has(k)) { seen.add(k); stack.push([nx, ny]); }
      }
    }
    if (!hasBase || tiles.length !== (x1 - x0 + 1) * (y1 - y0 + 1)) continue;   // only solid rectangles standing on a base slab
    const outerWest = isPlanted(x0 - 1, y0) || getTile(x0 - 1, y0) === 'q';      // hedge / wall on the west = the pit is to the east (else mirrored)
    const blk = { tx0: x0, ty0: y0, img: paintTierBlock((x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE, outerWest, x0 * 7 + y0) };
    for (const [x, y] of tiles) byTile.set(x + ',' + y, blk);
  }
  return (tierBlockCache[zoneId] = byTile);
}
// W x H px block. outerWest: the back of the block (hedge side) is the west edge and the pit is east; otherwise mirrored.
// Like the real steps: layer 0 (the lowest) runs along the stair flight; every higher layer's pit-side edge runs up, then at ITS OWN height
// turns 90 degrees towards the middle and runs on until it meets the small stairs. The higher the layer, the further up it turns.
function paintTierBlock(W, H, outerWest, seed) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const layers = Math.max(1, Math.min(TREAD.length, Math.floor(W / LAYER_W)));
  const s = outerWest ? 1 : -1, P = outerWest ? W : 0;                  // P = the far end of the turns: the side of the block that touches the stair flight
  // outline: back edge bk, pit-side edge p, bottom y1 (bottom pit corner rounded r), and above row yb the layer runs on to P (the 90-degree turn)
  const shape = (bk, p, y1, r, yb, fil = TURN_R) => {
    g.beginPath(); g.moveTo(bk, 0); g.lineTo(P, 0);
    if (yb > 0 && p !== P) { g.lineTo(P, yb); g.arcTo(p, yb, p, yb + fil, fil); }   // the turn: a smooth inside curve, not a sharp corner
    g.lineTo(p, y1 - r); g.arcTo(p, y1, p - s * r, y1, r); g.lineTo(bk, y1); g.closePath();
  };
  const sideCol = outerWest ? '#5e5c56' : '#8a877f';                   // wall facing the pit: shaded on the east, lit on the west
  let prev = null;
  for (let k = 0; k < layers; k++) {
    const inset = k * LAYER_W, yb = k === 0 ? 0 : (layers - k) * STEP_H;   // yb: where layer k turns towards the middle
    const x0 = outerWest ? 0 : inset, x1 = outerWest ? W - inset : W, y1 = H - inset;   // footprint of layer k (tread + risers)
    const bk = outerWest ? x0 : x1, p = outerWest ? x1 : x0;
    if (prev) {                                                        // the layer below sits in the shadow of this one
      g.save(); shape(prev.bk, prev.p, prev.ty1, CORNER_R - 6, prev.yb); g.clip();
      g.globalAlpha = 0.20; g.fillStyle = '#000'; shape(bk + 3, p + 3, y1 + 5, CORNER_R, yb + 4); g.fill(); g.globalAlpha = 1;
      g.restore();
    }
    shape(bk, p, y1, CORNER_R, yb); g.fillStyle = '#6f6d66'; g.fill();           // riser colour fills the whole footprint...
    g.save(); shape(bk, p, y1, CORNER_R, yb); g.clip();                        // ...with the side wall in its own shade
    const top = yb ? yb + TURN_R : 0;                                         // the straight part of the side wall starts below the curve...
    g.fillStyle = sideCol; g.fillRect(outerWest ? p - RISER_SIDE - 2 : p, top, RISER_SIDE + 2, y1 - 6 - top);
    if (yb) {                                                                  // ...and the curve gets the same wall shade, following the curve
      const gr = g.createLinearGradient(p + s * TURN_R, yb, p, yb + TURN_R); gr.addColorStop(0, '#6f6d66'); gr.addColorStop(1, sideCol);   // front-riser shade -> side-wall shade, so there is no hard edge
      g.strokeStyle = gr; g.lineWidth = 2 * (RISER_SIDE + 2); g.beginPath();
      g.arc(p + s * TURN_R, yb + TURN_R, TURN_R, outerWest ? Math.PI : 0, 1.5 * Math.PI, !outerWest); g.stroke();
    }
    g.restore();
    const t = { bk, p: outerWest ? p - RISER_SIDE : p + RISER_SIDE, ty1: y1 - RISER_S, yb: yb ? yb - RISER_S : 0 };   // the tread: footprint minus the risers
    const tShape = () => shape(t.bk, t.p, t.ty1, CORNER_R - 5, t.yb, TURN_R + 5);   // a bit wider curve: same centre as the footprint's
    tShape(); g.fillStyle = TREAD[k]; g.fill();
    g.save(); tShape(); g.clip();
    for (let i = 0; i < 90; i++) {                                     // concrete speckle
      const sx = rnd(seed, k, i) * W, sy = rnd(seed, k, i + 90) * t.ty1;
      g.fillStyle = i % 2 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.13)'; g.fillRect(Math.round(sx), Math.round(sy), 2, 1);
    }
    g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = 2; tShape(); g.stroke();   // lit rim all round the tread (the stroke is clipped to its inside)
    g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 2; g.beginPath();                                                   // crease where tread meets the front riser
    const cx0 = outerWest ? t.bk : t.p + CORNER_R - 5, cx1 = outerWest ? t.p - CORNER_R + 5 : t.bk;
    g.moveTo(cx0, t.ty1 - 1); g.lineTo(cx1, t.ty1 - 1); g.stroke();
    if (yb) { g.beginPath(); g.moveTo(t.p + s * (TURN_R + 5), t.yb - 1); g.lineTo(P, t.yb - 1); g.stroke(); }   // only along the straight part, not into the curve                              // ...and under the turned part
    g.restore();
    prev = { bk, p, ty1: y1, yb };
  }
  return c;
}
function stampTierBlock(px, py, tx, ty) {                              // the 32x32 piece of a block that belongs to this tile
  const b = tierBlocks().get(tx + ',' + ty);
  if (!b) return false;
  ctx.drawImage(b.img, (tx - b.tx0) * TILE, (ty - b.ty0) * TILE, TILE, TILE, px, py, TILE, TILE);
  return true;
}

// ---- semi-wall (q): the low concrete planter wall around the hedge beds (zone 1) ----------------------------------------
// Same board-formed concrete as the '#' walls (vertical seams, darker base), a touch lighter so it reads as a low wall, with a lit
// cap on top and a darker front face wherever the wall faces open floor to the south.
const isSemi = (x, y) => getTile(x, y) === 'q';
function drawSemiWall(px, py, tx, ty, base = false) {   // base = the 'm' slab at the foot of the tiers: same drawing, but no lit cap line on top
  const front = !isSemi(tx, ty + 1) && getTile(tx, ty + 1) !== '#', capTop = !base && !isSemi(tx, ty - 1) && ty > 0 && !isPlanted(tx, ty - 1);
  const body = TILE - (front ? 9 : 0), floorAt = (x, y) => tierLevel(x, y) === 0;
  ctx.fillStyle = '#a6a49c'; ctx.fillRect(px, py, TILE, TILE);                                         // cap / top surface: same warm concrete as the stairs
  ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(px + 10, py, 1, body); ctx.fillRect(px + 21, py, 1, body);   // board-formed seams (as on '#')
  ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(px + 11, py, 1, body); ctx.fillRect(px + 22, py, 1, body);
  for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.12)'; ctx.fillRect(px + 2 + Math.floor(rnd(tx, ty, i) * 28), py + 3 + Math.floor(rnd(tx, ty, i + 20) * Math.max(1, body - 6)), 2, 1); }   // speckle (as on the tiers)
  if (floorAt(tx - 1, ty)) { ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(px, py, 2, body); }  // lit west edge
  if (floorAt(tx + 1, ty)) { ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fillRect(px + TILE - 4, py, 4, TILE); }   // shaded east wall
  if (capTop) { ctx.fillStyle = 'rgba(255,255,255,0.30)'; ctx.fillRect(px, py, TILE, 2); }
  if (front) {
    ctx.fillStyle = '#6f6d66'; ctx.fillRect(px, py + body, TILE, 9);                                    // front face: same shade as the tiers' risers
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(px, py + body, TILE, 2);                           // cap/face crease
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(px + 11, py + body, 1, 9); ctx.fillRect(px + 22, py + body, 1, 9);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(px + 10, py + body, 1, 9); ctx.fillRect(px + 21, py + body, 1, 9);
  }
}

// ---- white rail round the lawn (zone 3) -------------------------------------------------------------------------------
// Copied from the photos of the real lawn: on top of the low concrete border wall stands a WHITE aluminium railing - a flat top rail, stout square posts
// every four balusters (64px) and thin round balusters every 16px between them, all see-through to the grass. It runs along the whole border (the wall tiles 'q' on
// the outline of the lawn, see map.js lawnBox) as ONE rail through the corners (it turns on the centre line of the wall: x + 16 / y + 18), and stops where the wall
// does (the entrance, the stairs down to zone 1) with a post at the end. Drawn in the same oblique view as the hole's balustrade: the foot is on the wall's cap,
// everything stands RAIL_UP px up the screen. Each wall tile is a depth-sorted entity (see render()): the rail is drawn over a player standing north of it.
const RAIL_BASE = 18;                                                          // y of the foot of the rail inside a wall tile (horizontal runs)
const hedgeSide = (x, y) => { const L = lawnBox(); return !!L && x === L.x0 && isPlanted(x - 1, y); };   // zone 3: where a hedge bed meets the lawn's west wall, the HEDGE carries the white fence (zones.js `fences`), not the lawn
const lawnWall = (x, y) => {
  const L = lawnBox();
  return !!L && getTile(x, y) === 'q' && x >= L.x0 && x <= L.x1 && y >= L.y0 && y <= L.y1 && (x === L.x0 || x === L.x1 || y === L.y0 || y === L.y1);
};
function lawnRailEntities(x0, x1, y0, y1) {
  const out = [];
  if (!lawnBox()) return out;
  for (let ty = Math.max(0, y0 - 1); ty <= Math.min(rows - 1, y1 + 1); ty++) for (let tx = x0; tx <= x1; tx++)
    if (lawnWall(tx, ty)) out.push({ y: (ty + 1) * TILE, draw: () => drawLawnRail(tx * TILE, ty * TILE, tx, ty) });
  return out;
}
function drawLawnRail(px, py, tx, ty) {
  const L = lawnBox(), W = '#eef0f2', W2 = '#c9ced3', SH = 'rgba(20,24,30,0.30)';
  const post = (x, y) => {                                                       // a square post (x = left edge, y = foot): lit face, shaded side, flat cap
    ctx.fillStyle = SH; ctx.fillRect(x - 1, y, 6, 2);
    ctx.fillStyle = W2; ctx.fillRect(x, y - RAIL_UP, 4, RAIL_UP); ctx.fillStyle = W; ctx.fillRect(x, y - RAIL_UP, 2, RAIL_UP);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 0.5, y - RAIL_UP - 1, 5, 2);
  };
  const bar = (x, y) => { ctx.fillStyle = W2; ctx.fillRect(x, y - RAIL_UP, 2, RAIL_UP); ctx.fillStyle = W; ctx.fillRect(x, y - RAIL_UP, 1, RAIL_UP); };
  // the positions along a run inside this tile (tA..tB): a post at the start, the end and every 64px, a baluster every 16px
  const spots = (tA, tB, s, e) => {
    const set = new Set();
    for (let k = Math.max(0, Math.ceil((tA - s) / 16)); s + 16 * k <= e && s + 16 * k < tB; k++) if (s + 16 * k >= tA) set.add(s + 16 * k);
    if (e > tA && e <= tB) set.add(e);
    return [...set].map((pos) => ({ pos, post: pos === s || pos === e || (pos - s) % 64 === 0 }));
  };
  if (ty === L.y0 || ty === L.y1) {                                              // horizontal run through this tile
    let a = tx, b = tx; while (lawnWall(a - 1, ty)) a--; while (lawnWall(b + 1, ty)) b++;
    const s = a === L.x0 ? a * TILE + 16 : a * TILE, e = b === L.x1 ? b * TILE + 16 : (b + 1) * TILE, by = py + RAIL_BASE;
    const lo = Math.max(px, s), hi = Math.min(px + TILE, e);
    if (hi > lo) {
      ctx.fillStyle = SH; ctx.fillRect(lo, by, hi - lo, 2);                       // contact shadow on the cap
      for (const q of spots(px, px + TILE, s, e)) if (!q.post) bar(q.pos - 1, by);
      ctx.fillStyle = W2; ctx.fillRect(lo, by - RAIL_UP, hi - lo, 3);             // top rail: flat bar, lit on top
      ctx.fillStyle = '#ffffff'; ctx.fillRect(lo, by - RAIL_UP, hi - lo, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(lo, by - RAIL_UP + 3, hi - lo, 1);
      for (const q of spots(px, px + TILE, s, e)) if (q.post) post(q.pos - 2, by);
    }
  }
  if ((tx === L.x0 || tx === L.x1) && !hedgeSide(tx, ty)) {                      // vertical run: seen from the side, a column of bars under one top rail
    let a = ty, b = ty; while (lawnWall(tx, a - 1) && !hedgeSide(tx, a - 1)) a--; while (lawnWall(tx, b + 1) && !hedgeSide(tx, b + 1)) b++;
    const s = a === L.y0 ? a * TILE + RAIL_BASE : a * TILE, e = b === L.y1 ? b * TILE + RAIL_BASE : (b + 1) * TILE, cx = px + 16;
    const lo = Math.max(py, s), hi = Math.min(py + TILE, e);
    if (hi > lo) {
      ctx.fillStyle = SH; ctx.fillRect(cx + 2, lo, 2, hi - lo);
      for (const q of spots(py, py + TILE, s, e)) if (!q.post) bar(cx - 1, q.pos);
      ctx.fillStyle = W2; ctx.fillRect(cx - 2, lo - RAIL_UP, 4, hi - lo); ctx.fillStyle = W; ctx.fillRect(cx - 2, lo - RAIL_UP, 2, hi - lo);   // top rail seen end-on
      for (const q of spots(py, py + TILE, s, e)) if (q.post) post(cx - 2, q.pos);
    }
  }
}

// ---- free-standing white fences (zone 3 `fences`: e.g. round the landing at the top of the lawn steps) ----------------------------------------------------------
// The same white aluminium rail as the lawn's, drawn along a chain of points (the foot line): posts at the ends and every 64px, balusters every 16px, a top rail.
function drawFence(pts) {
  const W = '#eef0f2', W2 = '#c9ced3', SH = 'rgba(20,24,30,0.30)';
  const post = (x, y) => { ctx.fillStyle = SH; ctx.fillRect(x - 1, y, 6, 2); ctx.fillStyle = W2; ctx.fillRect(x, y - RAIL_UP, 4, RAIL_UP); ctx.fillStyle = W; ctx.fillRect(x, y - RAIL_UP, 2, RAIL_UP); ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 0.5, y - RAIL_UP - 1, 5, 2); };
  const bar = (x, y) => { ctx.fillStyle = W2; ctx.fillRect(x, y - RAIL_UP, 2, RAIL_UP); ctx.fillStyle = W; ctx.fillRect(x, y - RAIL_UP, 1, RAIL_UP); };
  for (let i = 1; i < pts.length; i++) {
    const [xa, ya] = pts[i - 1], [xb, yb] = pts[i];
    if (xa === xb) {                                                          // vertical piece (seen from the side: a column of bars under one top rail)
      const y0 = Math.min(ya, yb), y1 = Math.max(ya, yb);
      ctx.fillStyle = SH; ctx.fillRect(xa + 2, y0, 2, y1 - y0);
      for (let y = y0 + 16, k = 1; y < y1; y += 16, k++) if (k % 4) bar(xa - 1, y);
      ctx.fillStyle = W2; ctx.fillRect(xa - 2, y0 - RAIL_UP, 4, y1 - y0); ctx.fillStyle = W; ctx.fillRect(xa - 2, y0 - RAIL_UP, 2, y1 - y0);
      for (let y = y0, k = 0; y < y1; y += 64, k++) post(xa - 2, y);
      post(xa - 2, y1);
    } else {                                                                  // horizontal piece
      const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
      ctx.fillStyle = SH; ctx.fillRect(x0, ya, x1 - x0, 2);
      for (let x = x0 + 16, k = 1; x < x1; x += 16, k++) if (k % 4) bar(x - 1, ya);
      ctx.fillStyle = W2; ctx.fillRect(x0, ya - RAIL_UP, x1 - x0, 3); ctx.fillStyle = '#ffffff'; ctx.fillRect(x0, ya - RAIL_UP, x1 - x0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(x0, ya - RAIL_UP + 3, x1 - x0, 1);
      for (let x = x0, k = 0; x < x1; x += 64, k++) post(x - 2, ya);
      post(x1 - 2, ya);
    }
  }
}
function fenceEntities(camera) {
  const out = [];
  for (const f of fences) {
    const xs = f.pts.map((p) => p[0]), ys = f.pts.map((p) => p[1]);
    if (Math.max(...xs) + 8 < camera.x || Math.min(...xs) - 8 > camera.x + VW || Math.max(...ys) + 8 < camera.y || Math.min(...ys) - 24 > camera.y + VH) continue;
    // depth: the fence is drawn over a player standing north of it and under one standing on its south / inner side (the top of the fence for a vertical piece)
    for (let i = 1; i < f.pts.length; i++) out.push({ y: f.pts[i - 1][0] === f.pts[i][0] ? Math.min(f.pts[i - 1][1], f.pts[i][1]) + 2 : f.pts[i][1] + 1, draw: () => drawFence([f.pts[i - 1], f.pts[i]]) });
  }
  return out;
}

// the red fire extinguisher hanging on the louvered wall of the storage room (zone 3), beside the top of the steps (x, y = top-left, 8 x 13 px)
function drawExtinguisher(x, y) {
  const R = (dx, dy, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x + dx, y + dy, w, h); };
  R(0, 12, 8, 2, 'rgba(0,0,0,0.30)');                       // shadow on the floor
  R(1, 2, 6, 1, '#3b3b42'); R(1, 3, 1, 8, '#3b3b42');       // wall bracket / strap
  R(1, 4, 6, 8, '#c62828'); R(1, 4, 2, 8, '#e53935'); R(6, 4, 1, 8, '#8e1b1b');   // red cylinder, lit left edge, shaded right
  R(1, 7, 6, 2, '#f2f2f2'); R(2, 7, 4, 1, '#2f2f35');      // white label
  R(2, 3, 4, 1, '#c62828'); R(3, 1, 3, 2, '#2b2b30');       // shoulder + black valve head
  R(1, 0, 3, 1, '#2b2b30'); R(0, 1, 1, 6, '#1c1c20');        // handle + hose hanging down the side
}
// the concrete landing at the top of the lawn steps (zone 3, 'y'): the colour of the treads
function drawLanding(px, py, tx, ty) {
  const same = (x, y) => getTile(x, y) === 'y' || getTile(x, y) === 'u' || getTile(x, y) === 'n';
  ctx.fillStyle = '#bdbab0'; ctx.fillRect(px, py, TILE, TILE);
  for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.14)'; ctx.fillRect(px + 2 + Math.floor(rnd(tx, ty, i) * 28), py + 2 + Math.floor(rnd(tx, ty, i + 20) * 28), 2, 1); }
  if (same(tx, ty + 1)) { ctx.fillStyle = 'rgba(0,0,0,0.07)'; ctx.fillRect(px, py + TILE - 1, TILE, 1); }     // faint slab joints between landing tiles
  if (same(tx + 1, ty)) { ctx.fillStyle = 'rgba(0,0,0,0.07)'; ctx.fillRect(px + TILE - 1, py, 1, TILE); }
  ctx.fillStyle = 'rgba(0,0,0,0.12)';                                                                        // side shade where it meets the paving (as on the flight)
  if (!same(tx - 1, ty) && !isPlanted(tx - 1, ty)) ctx.fillRect(px, py, 2, TILE);   // (no edge shade where the hedge bed is flush with the landing)
  if (getTile(tx + 1, ty) === 'g') ctx.fillRect(px + TILE - 2, py, 2, TILE);
  if (!same(tx, ty - 1) && getTile(tx, ty - 1) !== 'q') ctx.fillRect(px, py, TILE, 2);
  if (getTile(tx, ty - 1) === '.') {                                                                         // the platform's north edge stands above the path: a concrete kerb lip (lit top, shaded face) so it reads as raised
    ctx.fillStyle = 'rgba(0,0,0,0.20)'; ctx.fillRect(px, py, TILE, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(px, py + 4, TILE, 1);
  }
}
function drawFlight(px, py, tx, ty) {
  const me = getTile(tx, ty), flip = me === 'n';                           // 'n' = the flight north of the landing: the same picture turned upside down (treads / risers / end posts)
  const top = getTile(tx, ty + (flip ? 1 : -1)) !== me, bottom = getTile(tx, ty + (flip ? -1 : 1)) !== me;
  ctx.save();
  if (flip) { ctx.translate(0, 2 * py + TILE); ctx.scale(1, -1); }
  for (let i = 0; i < 2; i++) {                                            // two small steps per tile (the flight's steps are smaller than the tiers')
    const y = py + i * 16;
    ctx.fillStyle = '#bdbab0'; ctx.fillRect(px, y, TILE, 11);               // tread
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(px, y, TILE, 1);
    ctx.fillStyle = '#77746c'; ctx.fillRect(px, y + 11, TILE, 5);           // riser
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(px, y + 11, TILE, 1);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(px, py, 2, TILE);        // side shade where the flight meets the tiers
  ctx.fillRect(px + TILE - 2, py, 2, TILE);
  if (getTile(tx - 1, ty) === 'S') {                                        // handrail down the middle of the flight (the 2 lanes meet here)
    const x = px - 2;
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x + 2, py + (top ? 2 : 0), 5, TILE - (top ? 2 : 0));   // shadow
    ctx.fillStyle = '#9aa2a8'; ctx.fillRect(x, py, 4, TILE);
    ctx.fillStyle = '#e3e7ea'; ctx.fillRect(x + 1, py, 2, TILE);
    if (top)    { ctx.fillStyle = '#eef1f3'; ctx.fillRect(x - 1, py, 6, 4); ctx.fillStyle = '#7d858b'; ctx.fillRect(x - 1, py + 3, 6, 1); }   // end posts
    if (bottom) { ctx.fillStyle = '#eef1f3'; ctx.fillRect(x - 1, py + TILE - 5, 6, 5); ctx.fillStyle = '#7d858b'; ctx.fillRect(x - 1, py + TILE - 2, 6, 2); }
  }
  const wallE = getTile(tx + 1, ty) === 'q', wallW = getTile(tx - 1, ty) === 'q';          // the lawn wall is on the east (west steps) or the west (east steps, a mirror image)
  if ((me === 'u' || me === 'n') && (wallE || wallW)) {                                     // the small silver handrail on the wall side of the lawn steps (as in the photo), same drawing as zone 1's
    const x = wallE ? px + TILE - 8 : px + 4;
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x + 2, py + (top ? 2 : 0), 5, TILE - (top ? 2 : 0));
    ctx.fillStyle = '#9aa2a8'; ctx.fillRect(x, py, 4, TILE);
    ctx.fillStyle = '#e3e7ea'; ctx.fillRect(x + 1, py, 2, TILE);
    if (top)    { ctx.fillStyle = '#eef1f3'; ctx.fillRect(x - 1, py, 6, 4); ctx.fillStyle = '#7d858b'; ctx.fillRect(x - 1, py + 3, 6, 1); }
    if (bottom) { ctx.fillStyle = '#eef1f3'; ctx.fillRect(x - 1, py + TILE - 5, 6, 5); ctx.fillStyle = '#7d858b'; ctx.fillRect(x - 1, py + TILE - 2, 6, 2); }
  }
  ctx.restore();
}


// ---- basement stairwell block (k, zone 1: x 21-23, rows 0-2) ----------------------------------------------------------
// The real storage room is a concrete wedge: tall at the front, the roof sloping down along the louvered side wall, and a tall
// framed portal between two wall piers with a stair going down. Top-down it is drawn in the same pseudo-3D as the glass box:
//   roof (y 0-P_TOP) = 4 shaded bands, lightest at the tall front, with board-formed seams; louvered steel west face
//   front face (y P_TOP-96) = two wall piers (x21 with two Wi-Fi units, x23) and the portal between them
//   portal = pale frame, unlit interior that fades to black at the top (it is far away), faint steps that fade upward
//   (= going down), two handrails vanishing into the dark, and a paved landing at the foot.
// The portal is drawn over the piers and cuts up into the roof edge, so it can be wider/taller than the middle tile. It is only
// a picture: ALL tiles of the block are solid ('k'), the player stops on the floor tile in front of it.
// TWEAK ME (px inside the block, 96 wide x 96 tall; 0,0 = top-left of tile 21,0):
//   P_X0 / P_X1 = left / right edge of the portal (the middle tile is 32-64)     P_TOP = top edge of the portal AND of the wall piers
//   (the wall face is as tall as the frame, so the roof gets shorter when P_TOP gets smaller)
const P_X0 = 24, P_X1 = 72, P_TOP = 36, FRAME = 3, FLOOR_Y = 90;
const BLOCKS = { zone1: [{ tx: 24, ty: 0 }], zone3: [{ tx: 11, ty: 35, ext: 64, mirror: true, extinguisher: { x: 439, y: 1063 } }, { tx: 11, ty: 25, ext: 64, mirror: true, back: true }] };   // ext = px of extra roof BEHIND the 3x3 block (zone 3: 2 more rows, the roof is 3 tiles deep)
//   // top-left tile of each 3x3 block per zone; mirror = the louvered face is on the EAST (zone 3: it faces the stairs, as in the photo)
//   // back = the room seen from its BACK (zone 3, the second storage room: its door is on the north side, hidden from the camera; we see the roof and the concrete back wall on the south side, drawBlockBack)
function drawBasementBlocks(camera) { for (const B of BLOCKS[zoneId] ?? []) (B.back ? drawBlockBack : drawBasementBlock)(camera, B); }
function drawBasementBlock(camera, BLOCK) {
  const bx = BLOCK.tx * TILE, by = BLOCK.ty * TILE, E = BLOCK.ext ?? 0;
  const FY = !!BLOCK.flipY;
  if (bx > camera.x + VW || bx + 3 * TILE < camera.x || by - (FY ? 0 : E) > camera.y + VH || by + 3 * TILE + (FY ? E : 0) < camera.y) return;
  ctx.save();
  ctx.translate(bx + (BLOCK.mirror ? 96 : 0), by + (FY ? 96 : 0)); ctx.scale(BLOCK.mirror ? -1 : 1, FY ? -1 : 1);   // from here on: block-local pixels (0,0 = top-left of the block)
  const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
  // roof: bands get lighter towards the tall front
  const bh = (P_TOP + E) / 4;                                                             // (E = extra roof behind the block: the roof starts E px above the block's top, y = -E)
  ['#8a8880', '#94928a', '#9e9c93', '#a8a69d'].forEach((c, i) => R(0, Math.round(i * bh) - E, 96, Math.ceil(bh), c));
  for (const x of [10, 21, 42, 53, 74, 85]) R(x, -E, 1, P_TOP + E, 'rgba(0,0,0,0.08)');     // board-formed seams
  R(0, -E, 96, 1, '#b7b5ab');                                                             // lit back edge
  // front face: the two wall piers (full tiles) with seams
  R(0, P_TOP, 96, 96 - P_TOP, '#c9bda9'); R(0, P_TOP, 96, 1, '#e0d6c4'); R(0, 94, 96, 2, '#a79b88');   // the wall is as tall as the portal frame
  for (const x of [10, 85]) R(x, P_TOP + 1, 1, 94 - P_TOP - 1, 'rgba(0,0,0,0.07)');
  for (const x of [5, 14]) {                                                              // two Wi-Fi units on the left pier
    R(x - 1, 55, 1, 4, '#dcdcd6'); R(x + 5, 55, 1, 4, '#dcdcd6'); R(x, 58, 5, 6, '#f1f1ee');
    R(x - 1, 64, 1, 4, '#dcdcd6'); R(x + 5, 64, 1, 4, '#dcdcd6');
  }
  R(78, 72, 6, 10, 'rgba(0,0,0,0.05)');                                                  // old patch on the right pier
  // louvered west face
  R(0, -E, 8, P_TOP + E, '#6b6a73');
  for (let y = 2 - E; y < P_TOP; y += 3) R(0, y, 8, 1, 'rgba(0,0,0,0.25)');
  R(0, -E, 1, P_TOP + E, '#8f8e98');
  // the portal: pale frame (cutting up into the roof edge), then the unlit interior
  const ix0 = P_X0 + FRAME, ix1 = P_X1 - FRAME, iw = ix1 - ix0, it = P_TOP + FRAME, ih = FLOOR_Y - it;
  R(P_X0, P_TOP, P_X1 - P_X0, 96 - P_TOP, '#d8cfbd'); R(P_X0, P_TOP, P_X1 - P_X0, 1, '#ece4d3');
  for (let y = it; y < FLOOR_Y; y += 3) {                                                // black at the top, fading up out of the dark
    const t = (y - it) / ih, v = Math.round(2 + t * t * 38);
    R(ix0, y, iw, Math.min(3, FLOOR_Y - y), `rgb(${v},${v + 1},${v + 2})`);
  }
  [[84, 0.26], [80, 0.20], [76, 0.14], [72, 0.09], [68, 0.05]]                           // faint steps: closer + dimmer going up = going down
    .forEach(([y, a]) => R(ix0, y, iw, 1, `rgba(170,178,182,${a})`));
  ctx.lineWidth = 1;                                                                      // handrails converging inwards, vanishing into the dark
  const k = (y) => (88 - y) / 26 * 7;
  [[88, 80, 0.40], [80, 72, 0.28], [72, 66, 0.16], [66, 61, 0.08]].forEach(([ya, yb, a]) => {
    ctx.strokeStyle = `rgba(170,178,182,${a})`; ctx.beginPath();
    ctx.moveTo(ix0 + 2.5 + k(ya), ya); ctx.lineTo(ix0 + 2.5 + k(yb), yb);
    ctx.moveTo(ix1 - 2.5 - k(ya), ya); ctx.lineTo(ix1 - 2.5 - k(yb), yb); ctx.stroke();
  });
  R(ix0, it, 3, ih, 'rgba(0,0,0,0.30)'); R(ix1 - 3, it, 3, ih, 'rgba(0,0,0,0.30)');     // shaded side walls
  ctx.drawImage(getFloor(zoneId, cols, rows), bx + (BLOCK.mirror ? 96 - ix1 : ix0), FY ? by : by + FLOOR_Y, iw, 96 - FLOOR_Y, ix0, FLOOR_Y, iw, 96 - FLOOR_Y);   // landing: the same stone paving as the floor
  R(ix0, FLOOR_Y, iw, 1, '#cfd3d6');                                                    // metal edge strip at the drop
  ctx.restore();
  if (BLOCK.extinguisher) drawExtinguisher(BLOCK.extinguisher.x, BLOCK.extinguisher.y);
}

// The second storage room (zone 3, north of the hedge patch): its door faces NORTH, away from the camera, so (in the same oblique view as the other room) the door is hardly
// seen - just the top of the lintel over a dark slit - and what shows is the roof sloping down from the tall front and the plain concrete BACK wall on the south side.
function drawBlockBack(camera, B) {
  const bx = B.tx * TILE, by = B.ty * TILE, H = 96 + (B.ext ?? 0), WALL = 26, RH = H - WALL;    // H = whole height (3 rows + roof), WALL = height of the back wall face, RH = roof
  if (bx > camera.x + VW || bx + 3 * TILE < camera.x || by > camera.y + VH || by + H < camera.y) return;
  ctx.save(); ctx.translate(bx, by);
  const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
  const bh = RH / 4;                                                                       // roof bands: lightest at the tall front (north), darker towards the back
  ['#a8a69d', '#9e9c93', '#94928a', '#8a8880'].forEach((c, i) => R(0, Math.round(i * bh), 96, Math.ceil(bh), c));
  for (const x of [10, 21, 42, 53, 74, 85]) R(x, 0, 1, RH, 'rgba(0,0,0,0.08)');            // board-formed seams
  R(0, 0, 96, 1, '#c4c2b8');                                                               // lit front edge of the roof
  R(24, 0, 48, 8, '#d8cfbd'); R(24, 0, 48, 1, '#ece4d3'); R(27, 2, 42, 6, '#06070a'); R(27, 2, 42, 2, '#15171b');   // the top of the portal peeking over the edge: frame + dark slit
  R(0, RH - 3, 96, 3, 'rgba(0,0,0,0.16)');                                                 // shade where the roof meets the back wall
  R(0, RH, 96, WALL, '#bcb9ae'); R(0, RH, 96, 2, '#d9d6cb');                               // the concrete back wall, lit along its top
  for (const x of [16, 32, 48, 64, 80]) { R(x, RH + 2, 1, WALL - 4, 'rgba(0,0,0,0.10)'); R(x + 1, RH + 2, 1, WALL - 4, 'rgba(255,255,255,0.06)'); }   // board-formed seams
  R(0, H - 3, 96, 3, 'rgba(0,0,0,0.24)');                                                  // dark foot
  R(88, 0, 8, H, '#6b6a73');                                                               // louvered east face (towards the stairs), full height
  for (let y = 2; y < H - 3; y += 3) R(88, y, 8, 1, 'rgba(0,0,0,0.25)');
  R(95, 0, 1, H, '#8f8e98'); R(88, 0, 1, H, 'rgba(0,0,0,0.25)');
  ctx.restore();
}

// Tiles that stand on the grey stone paving (see floor.js). Everything else keeps its flat colour from COLORS.
const STONE_FLOOR = '.pXURCTaoc12345678m';
function drawTile(ch, px, py, tx, ty, time) {
  if (STONE_FLOOR.includes(ch)) {
    ctx.drawImage(getFloor(zoneId, cols, rows), px, py, TILE, TILE, px, py, TILE, TILE);   // 32x32 piece of the pre-painted stone floor
  } else {
    ctx.fillStyle = COLORS[ch];
    ctx.fillRect(px, py, TILE, TILE);
  }
  if (ch === '.') {
    // plain stone floor: nothing to add (the texture is already in the floor canvas)
  } else if (ch === '~' && zoneId === 'zone2') {       // the whole test pool is painted in one piece by pool.js drawPool()
  } else if (ch === '~') {                           // moving ripple line
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(px + 4 + Math.sin(time * 2 + tx) * 4, py + 14, 16, 3);
  } else if (ch === 'h') {                           // leafy dots
    ctx.fillStyle = '#1f4d25';
    ctx.fillRect(px + 6, py + 6, 6, 6); ctx.fillRect(px + 18, py + 16, 6, 6);
  } else if (ch === '#' && ((zoneId === 'zone1' && tx === 0) || zoneId === 'zone2' || zoneId === 'zone3')) {   // zone 1 west wall (round the glass doors) and ALL the walls of zone 2: the same pale plaster as the doors and the lift wall
    ctx.fillStyle = '#bdbab0'; ctx.fillRect(px, py, TILE, TILE);                 // the warm concrete of the stairs
    ctx.fillStyle = '#cfccc2'; ctx.fillRect(px, py, TILE, 3);
    ctx.fillStyle = '#a6a49c'; ctx.fillRect(px, py + TILE - 6, TILE, 6);
    ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.fillRect(px + 10, py, 1, TILE - 6); ctx.fillRect(px + 21, py, 1, TILE - 6);
    const wf = zoneId === 'zone1' && WATER_FILTERS.find((f) => ty >= f.y0 && ty <= f.y1);
    if (wf) drawWaterFilter(px, py, ty, wf);
    if (zoneId === 'zone2') drawRestroomWall(px, py, tx, ty);   // signs / lamp / bucket / louvers beside the restroom doors
    if (zoneId === 'zone3' && ty === 50 && tx >= 1 && tx <= 9) { ctx.fillStyle = '#e0a82e'; ctx.fillRect(px, py, TILE, 3); }   // yellow floor line along the foot of the curtained doors (see drawCurtainDoor)
  } else if (ch === '#') {
    ctx.fillStyle = '#44444d'; ctx.fillRect(px, py + TILE - 6, TILE, 6);
    ctx.fillStyle = 'rgba(0,0,0,0.10)'; ctx.fillRect(px + 10, py, 1, TILE - 6); ctx.fillRect(px + 21, py, 1, TILE - 6);   // board-formed concrete seams
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(px + 11, py, 1, TILE - 6); ctx.fillRect(px + 22, py, 1, TILE - 6);
  } else if (ch === 'p' || ch === 'X' || ch === 'U') {  // old path tiles now just look like the stone floor; exits keep their arrow
    if (ch !== 'p') drawArrow(ch === 'U' ? '\u2191' : (tx === 0 ? '\u2190' : (ty === rows - 1 ? '\u2193' : '\u2192')), px, py);   // X: west edge = left, bottom edge = down, otherwise right
  } else if (ch === 'R') {                            // railing: grey steel slats on a concrete parapet
    drawRail(px, py, tx, ty);
  } else if (ch === 'B') {                            // pool rim: light concrete with seams
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(px, py, TILE, 2); ctx.fillRect(px, py, 2, TILE);
  } else if (ch === 'r') {                            // red gym mat: rubber ribbing + yellow edge strip against the wall
    ctx.fillStyle = 'rgba(0,0,0,0.10)'; for (let i = 4; i < TILE; i += 6) ctx.fillRect(px, py + i, TILE, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; for (let i = 5; i < TILE; i += 6) ctx.fillRect(px, py + i, TILE, 1);
    if ((tx + ty) % 2 === 0) { ctx.fillStyle = 'rgba(0,0,0,0.05)'; ctx.fillRect(px, py, TILE, TILE); }
    ctx.fillStyle = '#e0a82e'; ctx.fillRect(px, py, 3, TILE);
  } else if (ch === 'e' || ch === 'j') {              // two glass doors, top-left wall
    drawGlassDoor(ch, px, py, tx, ty);
  } else if (ch === 'w') {                            // curtained sliding glass doors, zone 3 south wall
    drawCurtainDoor(px, py, tx, ty);
  } else if (ch === 'J' || ch === 'Q') {              // gym facade (west wall, faces east)
    drawGymWall(ch, px, py, tx, ty);
  } else if (ch === 'M' || ch === 'G') {              // restroom doors (see drawRestroomDoor)
    drawRestroomDoor(ch, px, py, tx, ty);
  } else if (ch === 'g') {                            // grass: a few darker tufts
    if ((tx * 7 + ty * 13) % 4 === 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      ctx.fillRect(px + 6 + (tx % 3) * 5, py + 8, 2, 4); ctx.fillRect(px + 20 - (ty % 3) * 4, py + 20, 2, 4);
    }
  } else if (ch === 'c') {                            // pillar
    drawPillar(px, py, tx, ty);
  } else if (ch === 'a' || ch === 'o') {              // recycling bins (blue / red)
    drawBin(ch, px, py);
  } else if (ch === 'C') {                            // concrete bench
    drawBench(px, py, tx, ty);
  } else if (ch === 'T') {                            // tree in a grey planter box
    drawPlanter(px, py, tx, ty);
  } else if (ch === 'b') {                            // bush (walkable)
    drawBlobs(px, py, 1);
  } else if (ch === 'H' || ch === 'Y' || ch === 'Z') {   // planted areas: solid, with a pale guard rail on open edges
    drawPlanted(ch, px, py, tx, ty);
  } else if (ch === 'K') {                            // storage room block: roof edge on top, shadow below
    ctx.fillStyle = '#6a6a76'; ctx.fillRect(px, py, TILE, 3);
    ctx.fillStyle = '#3b3b45'; ctx.fillRect(px, py + TILE - 6, TILE, 6);
  } else if (ch >= '1' && ch <= '8') {                // amphitheatre tier (zone 1, upper section)
    if (!stampTierBlock(px, py, tx, ty)) drawTier(px, py, tx, ty, +ch);   // big outer blocks: smooth L layers; the middle block: tile steps
  } else if (ch === 'm') {                            // flat base slab under the outer tier flights
    if (!stampTierBlock(px, py, tx, ty)) drawSemiWall(px, py, tx, ty, true);               // exactly the semi-wall's colour + texture, so wall and base read as one piece
  } else if (ch === 'y') {                            // zone 3: the concrete landing at the top of the lawn steps
    drawLanding(px, py, tx, ty);
  } else if (ch === 'q') {                            // hedge semi-wall
    drawSemiWall(px, py, tx, ty);
  } else if ((ch === 'S' && (zoneId === 'zone1' || zoneId === 'zone3')) || ch === 'u' || ch === 'n') {      // zones 1 and 3: the railed stair flights ('u' = the plain flight up to zone 3's lawn)
    drawFlight(px, py, tx, ty);
  } else if (ch === 'S') {                            // stairs: horizontal steps
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < 4; i++) ctx.fillRect(px, py + i * 8 + 6, TILE, 2);
  } else if (ch === 'L') {                            // brick pillar beside the lifts (2 tiles wide, sticks out from the west wall)
    drawLiftPillar(px, py, tx, ty);
  } else if (ch === 'l' || ch === 'A' || ch === 'f' || ch === 'd') {   // elevator wall (west wall of zone 1)
    drawLiftWall(ch, px, py, tx, ty);
  } else if (ch === 'D') {                            // door with a knob
    ctx.fillStyle = '#6e4519'; ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 2);
    ctx.fillStyle = '#e0b04a'; ctx.fillRect(px + 22, py + 16, 4, 4);
  } else if (ch === 'W') {
    drawGlassFront(ctx, px, py, tx, ty);
  }
}


// ---- glass doors (e = south door: two panes, j = north door: three panes), zone 1 west wall, rows 2-3 and 5-6 ------------------
// Copied from the lobby video: a pale plastered wall, a recessed opening with a thin grey aluminium frame and tall panes of clear,
// slightly blue glass (the bright day outside shows through), a dark handle on the middle stile and a plain threshold.
// Each door is 2 tiles long (64px). Like the lifts/gym it is drawn as a front view and turned a quarter turn, so
// left -> right on the front view = SOUTH -> NORTH on the map. The southern tile of a door is its left half.
// ---- zone 3: curtained sliding glass doors on the SOUTH wall (the doors of the real terrace: thick grey aluminium frames, three sliding panels,
// white sheer curtains with soft folds behind the glass, one panel with a beige curtain, dark pull handles on the meeting stiles, a yellow line on the floor).
// Same idea as drawGlassDoor(): a 64x32 front view per door (one tile = half of it), here flipped so the FLOOR side (threshold + yellow line) is the
// NORTH edge of the tile, where the player stands, and the lintel is on the south edge. 'w' tiles come in pairs: west half, east half.
function drawCurtainDoor(px, py, tx, ty) {
  const east = getTile(tx - 1, ty) === 'w';                       // is this the east half (right half) of its door?
  const off = east ? TILE : 0, first = east ? tx - 1 : tx;
  const warm = first === 4;                                        // only the middle door has a beige curtain on its first panel (like the photo)
  const panes = [[5, 17], [24, 17], [43, 16]];                    // [x, width] of each panel in the 64px front view
  ctx.save();
  ctx.beginPath(); ctx.rect(px, py, TILE, TILE); ctx.clip();
  ctx.translate(px, py + TILE); ctx.scale(1, -1); ctx.translate(-off, 0);   // 0..64 along the door (west -> east), y 0 = lintel (south), y 32 = floor (north)
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  R(0, 0, 64, TILE, '#d9d7d0'); R(0, 0, 64, 3, '#eceae4');         // pale plaster wall + lit lintel edge
  R(0, 26, 64, 6, '#c2c0b8');                                      // wall foot
  R(2, 4, 60, 24, '#4d5156');                                      // dark reveal round the frame
  R(3, 5, 58, 22, '#a6a7ac');                                      // thick aluminium frame
  R(3, 5, 58, 1, '#c9cacd'); R(3, 26, 58, 1, '#6e7075');           // lit top / shaded bottom of the frame
  panes.forEach(([x, w], i) => {
    R(x, 6, w, 20, '#cfdfe2');                                     // daylight in the glass
    const beige = warm && i === 0;
    R(x, 6, w, 20, beige ? '#d9c898' : '#dde2e1');                 // the curtain behind the glass
    for (let k = 0; k < w; k += 3) {                               // soft vertical folds
      R(x + k, 6, 1, 20, beige ? 'rgba(110,80,35,0.28)' : 'rgba(110,122,128,0.30)');
      R(x + k + 1, 6, 1, 20, 'rgba(255,255,255,0.32)');
    }
    if (beige) { R(x + w - 6, 6, 6, 20, '#dde2e1'); R(x + 2, 12, 2, 11, 'rgba(40,36,30,0.55)'); }   // the curtain is only half drawn, a dark tie-back
    R(x, 6, w, 2, 'rgba(80,90,95,0.38)');                          // gathered top of the curtain
    R(x, 24, w, 2, 'rgba(80,90,95,0.30)');                         // hem
    R(x + 2, 7, 2, 18, 'rgba(255,255,255,0.40)');                  // sheen on the glass
    if (i > 0) {                                                   // meeting stile where one panel slides over the next
      R(x - 3, 5, 3, 22, '#8c8d92'); R(x - 3, 5, 1, 22, '#c8c9cd'); R(x - 1, 5, 1, 22, '#5d5e63');
      R(x - 2, 12, 1, 8, '#1b1b22');                               // dark pull handle
    }
  });
  R(2, 27, 60, 2, '#3a3d42');                                      // threshold / sliding track
  R(0, 29, 64, 3, '#e0a82e');                                      // yellow line on the floor along the foot of the doors
  R(0, 29, 64, 1, 'rgba(255,255,255,0.25)');
  ctx.restore();
}

function drawGlassDoor(ch, px, py, tx, ty) {
  const north = getTile(tx, ty - 1) !== ch;                       // is this the northern tile (right half) of its door?
  const off = north ? TILE : 0;
  const panes = ch === 'e' ? [[5, 27], [29, 27]] : [[5, 17], [24, 17], [43, 16]];   // [x, width] of each pane in the 64px front view
  ctx.save();
  ctx.beginPath(); ctx.rect(px, py, TILE, TILE); ctx.clip();
  ctx.translate(px + TILE / 2, py + TILE / 2); ctx.rotate(-Math.PI / 2); ctx.translate(-TILE / 2, -TILE / 2);
  ctx.translate(-off, 0);                                         // now 0..64 along the door, 0..32 from the wall out to the floor
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  R(0, 0, 64, TILE, '#d9d7d0'); R(0, 0, 64, 3, '#eceae4');         // pale plaster wall + lit lintel edge
  R(0, 26, 64, 6, '#c2c0b8');                                      // wall base
  R(2, 4, 60, 24, '#4d5156');                                      // opening: dark inner reveal
  R(3, 5, 58, 22, '#8a9096');                                      // thin aluminium frame
  for (const [x, w] of panes) {
    R(x, 6, w, 20, '#dcebee');                                     // clear glass, bright from the daylight behind it
    R(x, 6, w, 7, '#eef7f8'); R(x, 19, w, 7, '#b9ced3');           // brighter top, a little darker low down
    R(x + 2, 8, 2, 16, 'rgba(255,255,255,0.55)');                  // glossy reflection streak
    R(x + w - 3, 9, 1, 14, 'rgba(120,150,160,0.35)');
  }
  for (let i = 1; i < panes.length; i++) {                         // stiles between panes
    const sx = panes[i][0] - 2; R(sx, 5, 2, 22, '#6f757b');
  }
  if (ch === 'e') { R(30, 13, 1, 7, '#1b1b22'); R(33, 13, 1, 7, '#1b1b22'); }   // handles either side of the meeting stile
  else { R(20, 14, 1, 6, '#1b1b22'); R(23, 14, 1, 6, '#1b1b22'); }
  R(2, 27, 60, 2, '#3a3d42');                                      // threshold
  ctx.restore();
}

// ---- restroom doors (zone 2: M M = men's, north block | G G = women's, south block) ----------------------------------------------
// Copied from the two photos. Each restroom has TWO openings side by side (left tile = a black slatted steel gate, right tile = the
// real doorway) with a small blue sign on the wall beside them (and a little blue lamp above it).
//   men's   : sign | gate | doorway with a dark door leaf swung open on its left | sign + lamp + light switch. A yellow mop bucket
//             with a mop leans against the wall at the far left (x23, row 5).
//   women's : (sign + lamp on BOTH sides, like the men's) a band of louvres runs above everything | gate (sunlit bars on a dark background) | doorway with a cream door leaf
//             swung open, a warm light at the top, a red/white "no smoking" sign on the inner door | sign + lamp + a monstera plant (x25).
// Interaction: stand in front facing the doors and press E (main.js -> restroom.js). Drawing of the fade / text card: drawRestroomScene().
function plaster(px, py) {                          // the pale plaster every wall of zone 2 has (same fills as the '#' branch)
  ctx.fillStyle = '#bdbab0'; ctx.fillRect(px, py, TILE, TILE);
  ctx.fillStyle = '#cfccc2'; ctx.fillRect(px, py, TILE, 3);
  ctx.fillStyle = '#a6a49c'; ctx.fillRect(px, py + TILE - 6, TILE, 6);
  ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.fillRect(px + 10, py, 1, TILE - 6); ctx.fillRect(px + 21, py, 1, TILE - 6);
}

// Blue restroom sign with a white pictogram, built from a 7x9 pixel grid. cell = pixels per grid cell (1 on the wall, 4 on the text card).
const SIGN_ICON = {
  men:   ['..###..', '..###..', '.#####.', '#.###.#', '..###..', '..###..', '..#.#..', '..#.#..', '..#.#..'],
  women: ['..###..', '..###..', '...#...', '..###..', '.#####.', '#######', '..#.#..', '..#.#..', '..#.#..'],
};
function drawSign(x, y, cell, kind) {
  ctx.fillStyle = '#143f78'; ctx.fillRect(x, y, 9 * cell, 11 * cell);                         // dark edge
  ctx.fillStyle = '#2573cf'; ctx.fillRect(x + cell, y + cell, 7 * cell, 9 * cell);            // blue face
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x + cell, y + cell, 7 * cell, cell);   // light catching the top edge
  ctx.fillStyle = '#f4f7fb';
  SIGN_ICON[kind].forEach((row, r) => { for (let c = 0; c < 7; c++) if (row[c] === '#') ctx.fillRect(x + (1 + c) * cell, y + (1 + r) * cell, cell, cell); });
}
function drawLamp(x, y) {                           // the small blue light / sensor box above the sign
  ctx.fillStyle = '#143f78'; ctx.fillRect(x, y, 5, 4);
  ctx.fillStyle = '#3b86e0'; ctx.fillRect(x + 1, y + 1, 3, 2);
  ctx.fillStyle = '#c4defa'; ctx.fillRect(x + 1, y + 1, 1, 1);
}

function drawLouvres(px, py) {                      // the horizontal vent band above the women's doors
  ctx.fillStyle = '#4c4a46'; ctx.fillRect(px, py + 1, TILE, 7);
  ctx.fillStyle = '#a3a096'; for (let y = 1; y < 8; y += 2) ctx.fillRect(px, py + y, TILE, 1);
  ctx.fillStyle = '#8c897f'; ctx.fillRect(px, py + 8, TILE, 1);
}

// wall tiles beside the doors: called from the '#' branch of drawTile (after the plaster is painted)
function drawRestroomWall(px, py, tx, ty) {
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(px + x, py + y, w, h); };
  const right = getTile(tx + 1, ty), left = getTile(tx - 1, ty);
  if (right === 'M') {                              // men's: wall just left of the gate -> sign, mop bucket and mop
    drawSign(px + 20, py + 8, 1, 'men');
    ctx.strokeStyle = '#d3cdb9'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px + 10.5, py + 20); ctx.lineTo(px + 5.5, py + 5); ctx.stroke();   // mop handle leaning on the wall
    R(3, 24, 9, 1, '#26262b'); R(4, 25, 7, 5, '#e2b81c'); R(4, 25, 7, 1, '#f5da63'); R(10, 25, 1, 5, '#b48d0e'); R(4, 29, 7, 1, '#8a6a08');   // yellow bucket
    R(3, 22, 9, 2, '#3b3b40'); R(5, 21, 1, 2, '#6a6a70'); R(9, 21, 1, 2, '#6a6a70');                                                         // wringer on top
  } else if (left === 'M') {                        // men's: wall right of the doorway -> lamp, sign and switch
    drawLamp(px + 6, py + 4); drawSign(px + 4, py + 9, 1, 'men');
    R(19, 17, 4, 6, '#e9e9e3'); R(19, 17, 4, 1, '#ffffff'); R(20, 19, 2, 2, '#9ba0a3');
  } else if (right === 'G' || left === 'G') {       // women's: louvres run across the whole wall above the openings
    drawLouvres(px, py);
    if (right === 'G') { drawLamp(px + 22, py + 10); drawSign(px + 20, py + 15, 1, 'women'); }   // wall left of the gate: lamp + sign (same as the men's, signs on BOTH sides)
    if (left === 'G') {                             // wall right of the open door: lamp, sign, plant and a mop
      drawLamp(px + 6, py + 10); drawSign(px + 4, py + 15, 1, 'women');
      ctx.strokeStyle = '#8f8467'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px + 30.5, py + 11); ctx.lineTo(px + 28.5, py + 26); ctx.stroke();   // mop
      R(18, 25, 8, 5, '#6d6d72'); R(18, 25, 8, 1, '#8c8c92');                                   // grey planter
      ctx.fillStyle = '#2f6b32';                                                                // monstera leaves
      for (const [lx, ly, rw, rh, rot] of [[19, 21, 4.5, 3, -0.7], [24, 20, 4.5, 3, 0.5], [21.5, 16, 3.5, 5, 0], [26, 24, 3.5, 2.2, 0.9]]) {
        ctx.beginPath(); ctx.ellipse(px + lx, py + ly, rw, rh, rot, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#4f9d42'; ctx.fillRect(px + 20, py + 14, 2, 3); ctx.fillRect(px + 17, py + 20, 3, 1); ctx.fillRect(px + 23, py + 19, 3, 1);   // lit leaf edges
      ctx.fillStyle = '#1d4a20'; ctx.fillRect(px + 21, py + 17, 1, 8);                          // stem
    }
  }
}

// door tiles: the left tile of each pair is the slatted gate, the right tile is the real doorway
function drawRestroomDoor(ch, px, py, tx, ty) {
  const men = ch === 'M', gate = getTile(tx - 1, ty) !== ch;
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(px + x, py + y, w, h); };
  plaster(px, py);
  if (!men) drawLouvres(px, py);
  const ox = 5, ow = 22, top = men ? 5 : 11, h = TILE - top, mid = top + Math.round(h * 0.45);   // the opening goes right down to the floor
  R(ox - 1, top - 1, ow + 2, h + 1, '#8a877d');                       // concrete reveal around the opening
  if (gate) {
    // steel gate: black vertical bars. Men's: dim grey light behind. Women's: warm sunlight at the top, bars catching the sun on a dark background
    R(ox, top, ow, h, men ? '#55534e' : '#18171b');
    R(ox, top, ow, 3, men ? '#d6d0bd' : '#e5a566');                   // light coming through at the top
    for (let x = ox + 1; x < ox + ow - 1; x += 3) { R(x, top, 1, h, men ? '#1a1a1d' : '#b9a78a'); if (!men) R(x + 1, top + 3, 1, h - 3, '#0d0d10'); }
    R(ox, top, ow, 1, men ? '#222226' : '#8f8268'); R(ox, mid, ow, 2, men ? '#2c2c30' : '#c7b99f');   // top rail + cross rail
    R(ox + ow - 4, mid + 4, 2, 3, '#cfd3d6');                         // latch
    R(ox, TILE - 1, ow, 1, '#4a463f');                                // threshold
  } else if (men) {
    // doorway: dark inside, a lit lintel and a dark door leaf swung open on the left
    R(ox, top, ow, h, '#0c0c0f');
    R(ox + 9, top + 5, ow - 12, 9, '#16161b');                        // faint depth of the corridor
    R(ox, top, ow, 2, '#a8723a');                                     // warm light on the lintel
    R(ox, top + 2, 7, h - 2, '#3c3b40'); R(ox, top + 2, 1, h - 2, '#6e6d73'); R(ox + 6, top + 2, 1, h - 2, '#1f1f23');   // open door leaf
    R(ox + 4, mid, 1, 4, '#b9bec2');                                  // handle
    R(ox + 7, TILE - 3, ow - 7, 3, '#25262c'); R(ox + 7, TILE - 3, ow - 7, 1, '#363840');   // floor inside catching a little light
  } else {
    // doorway: warm light at the top, a cream door leaf open on the left, the inner door with the red/white sign, grey floor tiles
    R(ox, top, ow, h, '#16151b');
    R(ox, top, ow, 3, '#e29a52'); R(ox, top + 3, ow, 2, '#8a5a31');   // warm glow at the top
    R(ox + 11, top + 7, 9, h - 10, '#2b2931');                        // inner door
    R(ox + 14, top + 10, 4, 6, '#f4f4f4'); R(ox + 14, top + 10, 4, 1, '#c0392b'); R(ox + 14, top + 15, 4, 1, '#c0392b'); R(ox + 15, top + 12, 2, 2, '#2a2a2e');   // no-smoking sign
    R(ox + 9, TILE - 4, ow - 9, 4, '#44545c'); R(ox + 9, TILE - 4, ow - 9, 1, '#6e8089');   // floor inside
    R(ox, top, 9, h, '#d8d1bf'); R(ox, top, 1, h, '#efe9da'); R(ox + 9, top, 1, h, '#8c8575');   // cream door leaf
    R(ox + 1, top + 2, 7, 6, '#cbc3ae'); R(ox + 1, top + 11, 7, 7, '#cbc3ae');                   // raised panels
    R(ox + 7, mid + 1, 1, 4, '#9a9fa3');                              // handle
  }
}

// The fade + text card of a restroom visit (restroom.js): drawn above everything, in screen space.
function drawRestroomScene() {
  const dark = restroom.alpha;
  if (dark > 0) { ctx.fillStyle = `rgba(0,0,0,${dark})`; ctx.fillRect(0, 0, VW, VH); }
  const a = restroom.cardAlpha;
  if (a <= 0) return;
  const men = restroom.kind === 'men', cx = VW / 2, cy = VH / 2 - 14;
  ctx.save(); ctx.globalAlpha = a;
  drawSign(cx - 18, cy - 92, 4, restroom.kind);                       // big sign on top of the card (36 x 44)
  if (!men) {                                                         // denied: a red 'no entry' ring + slash over the sign
    ctx.strokeStyle = '#e0445a'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(cx, cy - 70, 27, 0, Math.PI * 2); ctx.moveTo(cx - 19, cy - 89); ctx.lineTo(cx + 19, cy - 51); ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.font = 'bold 16px monospace'; ctx.fillStyle = men ? '#ffd54f' : '#ff7a8c';
  ctx.fillText(men ? "Men's Restroom" : "Women's Restroom - Not for you", cx, cy - 20);
  ctx.font = '16px monospace'; ctx.fillStyle = '#fff';
  const full = restroom.lines[restroom.i], words = full.split(' ');   // word-wrap using the FULL line so words do not jump while typing
  const rows = []; let row = '';
  for (const w of words) { if (ctx.measureText(row + w).width > VW - 120) { rows.push(row.trim()); row = ''; } row += w + ' '; }
  rows.push(row.trim());
  let shown = Math.floor(restroom.typed);
  rows.forEach((r, k) => {
    const part = r.slice(0, Math.max(0, shown)); shown -= r.length + 1;
    ctx.fillText(part, cx, cy + 12 + k * 22);
  });
  if (restroom.lineDone) {
    const last = restroom.i >= restroom.lines.length - 1;
    ctx.font = '12px monospace'; ctx.fillStyle = '#9a9aa6';
    ctx.fillText(last ? '[E] Done' : '[E] Next', cx, VH - 34);
  }
  ctx.restore();
}

// ---- water filters (zone 1, west wall, rows 7-9 and 21-23) -------------------------------------------------------------------
// Copied from the photo: a 3-stage under-sink style purifier on the wall: a horizontal pre-filter on a white bracket, two white / grey
// cartridges and a blue one, a pipe with a red valve coming down from above into a small dark junction box with loose black cables, a thin
// white tube running from the blue cartridge down to a little chrome tap. Like the lifts / gym it is drawn as a FRONT VIEW (96 wide = the 3
// tiles, x runs SOUTH -> NORTH, y from the top of the wall (0) down to the floor (32)) and the tile is turned a quarter turn.
// Interaction: stand in front of it facing the wall and press E (main.js) = drink.
function drawWaterFilter(px, py, ty, wf) {
  ctx.save();
  ctx.beginPath(); ctx.rect(px, py, TILE, TILE); ctx.clip();
  ctx.translate(px + TILE / 2, py + TILE / 2); ctx.rotate(-Math.PI / 2); ctx.translate(-TILE / 2, -TILE / 2);
  ctx.translate(-(wf.y1 - ty) * TILE, 0);                                  // this tile shows 32 px of the 96 px picture
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  ctx.translate(6, 0);                                                    // the cartridges sit a little to the north so the tap hangs clear below them
  R(29, 12, 41, 10, 'rgba(0,0,0,0.10)');                                  // soft shadow of the whole unit on the wall
  R(63, 0, 3, 6, '#d9dcdd'); R(65, 0, 1, 6, '#a9aeb1'); R(63, 0, 1, 6, '#f3f4f4');   // vertical pipe coming down from above
  R(61, 2, 7, 2, '#c0392b'); R(61, 2, 7, 1, '#e2574a'); R(60, 2, 1, 2, '#7d2019'); R(68, 2, 1, 2, '#7d2019');   // red valve handle
  R(56, 6, 13, 5, '#2b2b30'); R(57, 7, 11, 3, '#e9ebeb'); R(58, 8, 4, 1, '#9aa0a5'); R(63, 8, 3, 1, '#c0392b');   // dark junction box with a pale label
  R(28, 6, 22, 4, '#e9ebeb'); R(28, 9, 22, 1, '#b4b9bc'); R(28, 6, 2, 4, '#c3c8ca'); R(48, 6, 2, 4, '#c3c8ca'); R(31, 7, 15, 1, '#fafafa');   // horizontal pre-filter
  R(30, 10, 39, 2, '#f4f4f2'); R(30, 11, 39, 1, '#b8bcbf');               // white bracket plate
  const cart = (x, w, body, lit, shade, cap) => {                         // one cartridge
    R(x - 1, 12, w + 2, 2, cap); R(x - 1, 13, w + 2, 1, 'rgba(0,0,0,0.20)');
    R(x, 14, w, 7, body); R(x, 14, 2, 7, lit); R(x + w - 2, 14, 2, 7, shade);
    R(x, 20, w, 1, 'rgba(0,0,0,0.30)');
  };
  cart(32, 9, '#e6e8e8', '#fbfbfb', '#b3b8bb', '#dfe2e3');                // white
  cart(43, 9, '#d2d6d7', '#eceeee', '#9fa5a8', '#dfe2e3');                // grey
  cart(54, 11, '#2b3a9e', '#4f63d6', '#1b2570', '#dfe2e3');               // blue
  R(46, 8, 10, 1, '#26262b'); R(55, 9, 1, 3, '#26262b');                  // cable: prefilter -> box
  R(62, 11, 1, 3, '#26262b');                                             // cable: box -> blue cap
  R(69, 8, 2, 1, '#26262b'); R(70, 9, 1, 8, '#26262b'); R(69, 17, 1, 8, '#26262b'); R(68, 25, 1, 2, '#26262b');   // loose cable hanging on the right
  R(59, 21, 1, 9, '#ecebe6'); R(60, 21, 1, 9, '#b9b8b0');                 // thin white tube from the blue cartridge straight down to the tap
  R(50, 29, 11, 1, 'rgba(0,0,0,0.18)');                                   // the tap: a chrome faucet with a lever on top ...
  R(46, 25, 14, 3, '#c8ced2'); R(46, 25, 14, 1, '#f4f6f7'); R(46, 27, 14, 1, '#7d858b');   // horizontal stem (the tube plugs into its end)
  R(46, 25, 3, 7, '#c8ced2'); R(47, 25, 1, 7, '#f4f6f7'); R(46, 31, 3, 1, '#6c747a');       // spout curving down: water comes out of its tip
  R(53, 22, 4, 3, '#9aa2a8'); R(53, 22, 4, 1, '#d5dadd');                                   // lever
  R(47, 32, 1, 1, '#8fc9f0');                                                              // a drip
  ctx.restore();
}

// ---- gymnasium facade (J = sliding glass door, Q = poster + cabinet wall) ---------------------------------
// Drawn as a normal front view (top of the door at the top of the tile, threshold at the bottom), then the whole tile is
// rotated a quarter turn anticlockwise so it fits the WEST wall of a top-down map: door top -> wall side, threshold -> mat side.
function drawGymWall(ch, px, py, tx, ty) {
  ctx.save();
  ctx.beginPath(); ctx.rect(px, py, TILE, TILE); ctx.clip();
  ctx.translate(px + TILE / 2, py + TILE / 2); ctx.rotate(-Math.PI / 2); ctx.translate(-TILE / 2, -TILE / 2);   // now draw in 0..32 local coords
  ctx.fillStyle = '#bdbab0'; ctx.fillRect(0, 0, TILE, TILE);                         // the warm concrete of the stairs
  ctx.fillStyle = '#cfccc2'; ctx.fillRect(0, 0, TILE, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.10)'; ctx.fillRect(10, 0, 1, TILE); ctx.fillRect(21, 0, 1, TILE);   // board-formed seams
  if (ch === 'J') {
    const open = ty > 24;                                                           // the second door is slid slightly open
    ctx.fillStyle = '#9aa3a8'; ctx.fillRect(2, 1, TILE - 4, TILE - 1);              // aluminium frame
    ctx.fillStyle = '#b9d3d6'; ctx.fillRect(4, 3, 11, 24);                          // frosted panel 1
    ctx.fillStyle = '#a8c4c8'; ctx.fillRect(17, 3, 11, 24);                         // frosted panel 2
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(6, 5, 2, 18); ctx.fillRect(19, 5, 2, 18);
    ctx.fillStyle = '#9aa3a8'; ctx.fillRect(15, 3, 2, 24);                          // meeting stile
    if (open) {                                                                     // dark gym interior + a pink mat in the gap
      ctx.fillStyle = '#17171c'; ctx.fillRect(4, 3, 4, 24);
      ctx.fillStyle = '#e58fb5'; ctx.fillRect(4, 19, 4, 7);
    }
    ctx.fillStyle = '#1b1b22'; ctx.fillRect(13, 12, 2, 7);                          // handle
    ctx.fillStyle = '#e0a82e'; ctx.fillRect(2, 27, TILE - 4, 4);                    // yellow threshold strip (bottom)
  } else {
    ctx.fillStyle = '#a6a49c'; ctx.fillRect(0, TILE - 6, TILE, 6);                  // wall base (like the west wall)
    ctx.fillStyle = '#f1f1ee'; ctx.fillRect(9, 3, 13, 15);                          // usage-rules poster
    ctx.fillStyle = '#2a2a30'; ctx.fillRect(9, 3, 13, 4);                           // poster header
    ctx.fillStyle = '#d32f2f'; ctx.fillRect(18, 3, 4, 2);
    ctx.fillStyle = '#9a9a9a'; for (let i = 0; i < 3; i++) ctx.fillRect(11, 9 + i * 2, 9, 1);
    ctx.fillStyle = '#b89870'; ctx.fillRect(4, 19, 24, 11);                         // wooden cabinet (front view)
    ctx.fillStyle = '#9a7e58'; ctx.fillRect(4, 19, 24, 2); ctx.fillRect(15, 21, 2, 9);
  }
  ctx.restore();
}

// ---- elevator wall (zone 1, west wall, rows 12-18) ---------------------------------------------------------------
// Copied from the real lobby photo. Seen from the lobby, left -> right is SOUTH -> NORTH on the map:
//   L brick pillar (x0-2, rows 12 and 18) | f white wall strip (rows 13, 17) | l lift 03 | A steel panel with the "13 LEVEL" sign + call button | l lift 04
// Like the gym, each tile is drawn as a normal front view (x along the wall, y = from the wall out to the floor) and turned a quarter turn.
// Zone 2 has the same lift set on its EAST wall (rows 11-17, between the two exit paths): L f l A l d L from north to south; row 18 is plain plaster wall.
// A west wall turns the front view -90deg (left -> right = south -> north); an east wall turns it +90deg (left -> right = north -> south),
// so the picture is NOT mirrored: it still reads f | lift | steel panel | lift | directory from the left, just facing west into the pool zone.
function drawLiftWall(ch, px, py, tx, ty) {
  const east = zoneId === 'zone2';
  ctx.save();
  ctx.beginPath(); ctx.rect(px, py, TILE, TILE); ctx.clip();
  ctx.translate(px + TILE / 2, py + TILE / 2); ctx.rotate(east ? Math.PI / 2 : -Math.PI / 2); ctx.translate(-TILE / 2, -TILE / 2);
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  if (ch === 'f' || ch === 'd') {                                                                // plain white wall strip between a pillar and a lift
    R(0, 0, TILE, TILE, '#e4e6e9'); R(0, 0, TILE, 5, '#f2f3f5'); R(0, 27, TILE, 5, '#d2d5d9'); R(0, 27, TILE, 1, '#c3c6cb');
    if (ch === 'd') {                                                              // dark slatted 'All Floor Directory' board with a pale title block
      R(5, 7, 22, 21, '#1b2a44'); R(5, 7, 22, 4, '#dfe4ea'); R(7, 8, 10, 1, '#7d8aa0'); R(7, 9, 7, 1, '#9aa5b5');
      for (let i = 0; i < 6; i++) { R(6, 13 + i * 2, 20, 1, 'rgba(255,255,255,0.10)'); R(8, 13 + i * 2, 5 + (i * 5) % 11, 1, '#8aa0c0'); }
      R(5, 7, 22, 1, '#9aa0a6'); R(5, 27, 22, 1, '#9aa0a6'); R(5, 7, 1, 21, '#9aa0a6'); R(26, 7, 1, 21, '#9aa0a6');
    }
  } else if (ch === 'A') {                                                         // steel panel between the lifts
    R(0, 0, TILE, TILE, '#cfd2d6'); R(0, 0, TILE, 5, '#e6e8ea');
    R(0, 5, TILE, 27, '#b3b9bf');
    for (let i = 2; i < TILE; i += 4) R(i, 5, 1, 27, 'rgba(255,255,255,0.18)');
    R(0, 5, 2, 27, '#d9dde1'); R(TILE - 2, 5, 2, 27, '#d9dde1');
    R(10, 8, 12, 11, '#1b66c4'); R(10, 8, 12, 1, '#4a93ee');                      // blue "13 LEVEL" sign
    ctx.font = 'bold 9px monospace'; ctx.fillStyle = '#fff'; ctx.fillText('13', 11, 16);
    R(12, 18, 8, 1, '#9fc4f2');
    R(13, 21, 6, 8, '#7e848b'); R(14, 22, 4, 1, '#c8ccd0'); R(15, 25, 2, 3, '#e8eaed');   // call button plate
  } else {                                                                         // 'l': one lift (one tile wide)
    const num = east ? (ty <= 13 ? '01' : '02') : (ty <= 14 ? '04' : '03');   // zone 2: lifts 01 (north) + 02 (south) - change the text to rename them
    ctx.scale(0.5, 1);                                                             // the 64-wide lift design squeezed into one tile
    R(0, 0, 64, 32, '#cfd2d6'); R(0, 0, 64, 5, '#e6e8ea');                         // pale wall + white lintel
    R(8, 2, 48, 4, '#1f6fd0'); R(8, 2, 48, 1, '#4a93ee');                         // blue "ELEVATOR 0x : floors" strip
    for (let i = 0; i < 8; i++) R(10 + i * 4, 4, 2, 1, '#dce9fb');
    ctx.font = 'bold 5px monospace'; ctx.fillStyle = '#fff'; ctx.fillText(num, 46, 6);
    R(26, 8, 12, 4, '#101418'); R(30, 9, 4, 2, '#d23a2e');                        // floor-number display
    R(4, 11, 56, 21, '#9aa0a6');                                                   // steel frame
    R(7, 13, 25, 19, '#b7bdc3'); R(32, 13, 25, 19, '#c3c9cf');                    // two sliding doors
    for (let i = 8; i < 56; i += 3) R(i, 13, 1, 19, i % 2 ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.06)');
    R(11, 13, 5, 19, 'rgba(255,255,255,0.38)'); R(39, 13, 7, 19, 'rgba(255,255,255,0.42)');   // glossy reflections
    R(31, 13, 2, 19, '#5c626a'); R(4, 11, 3, 21, '#d9dde1'); R(57, 11, 3, 21, '#d9dde1');
    R(5, 28, 54, 1, '#2a2d31'); R(5, 29, 54, 3, '#d8dde2');                        // dark gap + steel sill
  }
  ctx.restore();
}

// Brick pillar (L, 3 tiles wide: zone 1 x0-2 rows 12 and 18, zone 2 x28-30 rows 11 and 17): rust-red tile blocks sticking out from the west wall; the north one carries the blue notice board.
function drawLiftPillar(px, py, tx, ty) {
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(px + x, py + y, w, h); };
  R(0, 0, TILE, TILE, '#b9573a');
  for (let cx = 0; cx < 4; cx++) for (let cy = 0; cy < 3; cy++) {
    const v = (cx * 3 + cy * 5 + tx) % 4;
    if (v === 0) R(cx * 8 + 1, cy * 8 + 1, 7, 7, 'rgba(0,0,0,0.07)'); else if (v === 1) R(cx * 8 + 1, cy * 8 + 1, 7, 7, 'rgba(255,255,255,0.06)');
  }
  for (let i = 0; i < TILE; i += 8) { R(i, 0, 1, TILE - 6, '#dcab95'); if (i < TILE - 6) R(0, i, TILE, 1, '#dcab95'); }
  R(0, 0, TILE, 2, '#d98466');                                                    // lit top edge
  R(0, TILE - 6, TILE, 6, '#8f3f29'); R(0, TILE - 6, TILE, 1, '#a94c34');         // front face of the block (like the wall base)
  if (tx === 2 && ty === 12 && zoneId === 'zone1') {                              // notice board on the end of the north pillar
    R(22, 6, 8, 16, '#3bb4e0'); R(23, 8, 6, 6, '#e9f6fb'); R(23, 16, 6, 1, '#d4eef8'); R(23, 18, 4, 1, '#d4eef8');
  } else if (tx === 28 && ty === 11 && zoneId === 'zone2') {                       // zone 2: same board on the free (west-facing) end of the north pillar
    R(2, 6, 8, 16, '#3bb4e0'); R(3, 8, 6, 6, '#e9f6fb'); R(3, 16, 6, 1, '#d4eef8'); R(3, 18, 4, 1, '#d4eef8');
  }
}

function drawArrow(glyph, px, py) {                   // exit marker on a path tile
  ctx.font = 'bold 20px monospace'; ctx.fillStyle = '#7ed957';
  ctx.fillText(glyph, px + 8, py + 23);
}

function drawLabel(text, x, y) {
  ctx.font = '14px monospace'; ctx.fillStyle = '#fff'; ctx.fillText(text, x, y);
}

// ---- zone 1: the upper zone above the top edge ---------------------------------------------------------------------------
// A grass lawn with the hedge beds carrying on upwards (same tiles, guard rails and semi-walls as below the edge, see map.js upperTile),
// fading into black well before the end: nothing up there can be reached yet. The skyline window on the right (x 31-37) is not touched.
const LAWN_X1 = 31 * TILE;                           // lawn / hedges end where the north skyline window starts
const LAWN_FADE = [[0, 0], [0.22, 0.30], [0.5, 0.78], [0.72, 0.96], [1, 1]];   // [depth 0..1 of the fade, black opacity]
const LAWN_FADE_PX = 150;                            // px above the edge until it is fully black
function drawUpperLawn(time) {
  if (skyline.over.n < 0.5 || camera.y >= 0) return;
  const tx0 = Math.max(0, Math.floor(camera.x / TILE)), tx1 = Math.min(LAWN_X1 / TILE - 1, Math.floor((camera.x + VW) / TILE));
  if (tx1 < tx0) return;
  const ty0 = Math.max(-UP_ROWS, Math.floor(camera.y / TILE));
  setVirtualUp(true);
  for (let ty = ty0; ty <= -1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const ch = getTile(tx, ty);
    if (ch === '.') ctx.drawImage(getFloor(zoneId, cols, rows), tx * TILE, (7 + ((-ty - 1) % 2)) * TILE, TILE, TILE, tx * TILE, ty * TILE, TILE, TILE);   // plain paving: the same slabs as rows 7-8
    else drawTile(ch, tx * TILE, ty * TILE, tx, ty, time);
  }
  setVirtualUp(false);
  const gx0 = tx0 * TILE, gw = (tx1 + 1) * TILE - gx0, top = ty0 * TILE;
  const fg = ctx.createLinearGradient(0, 0, 0, -LAWN_FADE_PX);
  for (const [t, a] of LAWN_FADE) fg.addColorStop(t, `rgba(0,0,0,${a})`);
  ctx.fillStyle = fg; ctx.fillRect(gx0, -LAWN_FADE_PX, gw, LAWN_FADE_PX);
  if (top < -LAWN_FADE_PX) { ctx.fillStyle = '#000'; ctx.fillRect(gx0, top, gw, -LAWN_FADE_PX - top); }
}

export function render(game, time) {
  const { player, npc, debug } = game;
  updateCamera(player);
  ctx.clearRect(0, 0, VW, VH);
  ctx.save();
  ctx.translate(-camera.x, -camera.y);               // everything below is in WORLD pixels
  drawSkyline(ctx, camera, VW, VH, time);            // the city beyond the rails (before the tiles, so the rail slats are see-through)
  if (zoneId === 'zone1') drawUpperLawn(time);       // the lawn of the upper zone above the top edge (only while the camera is up there)

  // Only draw tiles that are on screen (cheap "culling"); max/min keep us inside the map when the camera slides past an edge
  const x0 = Math.max(0, Math.floor(camera.x / TILE)), x1 = Math.min(cols - 1, Math.floor((camera.x + VW) / TILE));
  const y0 = Math.max(0, Math.floor(camera.y / TILE)), y1 = Math.min(rows - 1, Math.floor((camera.y + VH) / TILE));
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++)
      drawTile(getTile(tx, ty), tx * TILE, ty * TILE, tx, ty, time);
  drawCurvedRails(time);                             // zone 3: the curved west rail (+ the skyline outside it)
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (getTile(tx, ty) === 'T') drawCrown(ctx, tx * TILE + 16, ty * TILE + 15, tx, ty, 19);   // the sitting-area trees: crowns drawn over their planters
  if (zoneId === 'zone2') drawPool(ctx, time);       // the Robotics Lab test pool: water, robots, ripples
  if (zoneId === 'zone1') drawEscalatorNose(x0, x1, y0, y1, time);
  drawBasementBlocks(camera);   // storage-room stairwell (k / z tiles): zone 1 and zone 3   // the escalator well + rounded end of the escalator railing
  drawFoliage(x0, x1, y0, y1);                       // leaves poking through / over the hedge rails
  drawGlassTops(ctx, time, camera, VW, VH);          // glass skylight + the students seen through it (after tiles, before characters)
  for (const s of stairwells) { drawStairwellInterior(ctx, s, time); drawStairwellRail(ctx, s); }   // zone 3: the big stairs down (stairwell.js)

  // Item (ID card): small white card with a bobbing motion
  for (const it of items) {
    if (it.collected) continue;
    const bob = Math.sin(time * 4) * 2;
    ctx.fillStyle = '#fff'; ctx.fillRect(it.x * TILE + 8, it.y * TILE + 10 + bob, 16, 12);
    ctx.fillStyle = '#d32f2f'; ctx.fillRect(it.x * TILE + 10, it.y * TILE + 12 + bob, 5, 5);
  }

  // Draw NPC and player in order of their feet (whoever is lower on screen is drawn on top)
  const ents = [];                                    // (zone 2 adds the pool signboard and the two operators here)
  if (npc.zone === zoneId) ents.push({ y: npc.footY, draw: () => drawNPC(npc, player) });
  if (zoneId === 'zone2') ents.push(...poolEntities(ctx, time));
  if (zoneId === 'zone3') ents.push(...lawnRailEntities(x0, x1, y0, y1), ...fenceEntities(camera));   // the white lawn rail (drawn over a player standing north of it)
  ents.push({ y: player.y + player.h, draw: () => drawPlayer(player) });
  ents.sort((a, b) => a.y - b.y);                     // stable: on a tie the player is drawn last
  for (const e of ents) e.draw();

  if (debug) drawDebug(game);
  ctx.restore();

  // ---- HUD (screen space, not affected by camera) ----
  if (!intro.active) {
    drawQuestTracker(game.hasCard);
    ctx.font = '12px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillText('[C] Credits', VW - 100, 24);
  }
  if (dialogue.active) drawDialogue();
  else if (game.hint && !intro.active) drawHint(game.hint);
  if (game.showCredits) drawCredits();
  const fade = Math.max(intro.fade, transition.alpha);   // intro fade-in OR zone-change fade
  if (fade > 0) {                                    // drawn last = covers everything
    ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, VW, VH);
  }
  if (signView.active) drawSignCard(ctx, VW, VH);     // zone 2: the signboard read up close
  if (restroom.active) drawRestroomScene();           // restroom visit: fade (black for the men's, a dim for the women's) + text card
}

function drawDebug({ player, npc }) {
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
  for (let x = 0; x <= cols; x++) { ctx.beginPath(); ctx.moveTo(x * TILE, 0); ctx.lineTo(x * TILE, heightPx); ctx.stroke(); }
  for (let y = 0; y <= rows; y++) { ctx.beginPath(); ctx.moveTo(0, y * TILE); ctx.lineTo(widthPx, y * TILE); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,0,0,0.3)';
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++)
    if (isSolid(tx, ty)) ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
  ctx.strokeStyle = '#0f0'; ctx.lineWidth = 2;       // player hitbox
  ctx.strokeRect(player.x, player.y, player.w, player.h);
  if (npc.zone === zoneId) {
    ctx.strokeStyle = '#ff0';                        // NPC talk range
    ctx.beginPath(); ctx.arc(npc.cx, npc.cy, npc.talkRange, 0, Math.PI * 2); ctx.stroke();
  }
}

function drawQuestTracker(hasCard) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(10, 10, 330, 44);
  ctx.font = 'bold 13px monospace'; ctx.fillStyle = '#ffd54f'; ctx.fillText('QUEST: Lost ID Card', 18, 28);
  ctx.font = '13px monospace'; ctx.fillStyle = '#fff'; ctx.fillText(quest.trackerText, 18, 46);
}

function drawDialogue() {
  const h = 110, y = VH - h - 10;
  ctx.fillStyle = 'rgba(15,15,30,0.92)'; ctx.fillRect(10, y, VW - 20, h);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(10, y, VW - 20, h);
  ctx.font = 'bold 16px monospace'; ctx.fillStyle = '#ffd54f'; ctx.fillText(dialogue.speaker, 26, y + 28);
  ctx.font = '16px monospace'; ctx.fillStyle = '#fff';
  // simple word-wrap so long lines don't run off the box
  let line = '', ly = y + 56;
  for (const word of dialogue.text.split(' ')) {
    if (ctx.measureText(line + word).width > VW - 70) { ctx.fillText(line, 26, ly); line = ''; ly += 22; }
    line += word + ' ';
  }
  ctx.fillText(line, 26, ly);
  ctx.font = '12px monospace'; ctx.fillStyle = '#aaa'; ctx.fillText('[E] next', VW - 90, y + h - 12);
}

function drawHint(text) {                             // small bar at the bottom of the screen
  ctx.font = '14px monospace';
  const w = ctx.measureText(text).width + 24;
  const x = (VW - w) / 2, y = VH - 40;
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x, y, w, 28);
  ctx.fillStyle = '#7ed957'; ctx.fillText(text, x + 12, y + 19);
}

function drawNPC(npc, player) {                       // NPC: drawn from its own spritesheet
  if (!drawCharacter(ctx, npc, 'npc')) {             // sheet not loaded yet -> orange box fallback
    ctx.fillStyle = '#ff9800'; ctx.fillRect(npc.x + 6, npc.y + 4, 20, 26);
    ctx.fillStyle = '#ffe0b2'; ctx.fillRect(npc.x + 10, npc.y + 6, 12, 10);
  }
  if (npc.isNear(player) && !dialogue.active) drawLabel('[E] Talk', npc.x - 6, npc.footY - 44);
}

function drawPlayer(player) {
  ctx.save();
  if (intro.active && (intro.rider.alpha < 1 || intro.rider.scale < 1)) {   // the ride: he comes up out of the dark, small and faint, and grows
    const cx = player.cx, cy = player.y + player.h / 2, k = intro.rider.scale;
    ctx.globalAlpha = Math.max(0, intro.rider.alpha);
    ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(-cx, -cy);
  }
  if (player.descent > 0 && !intro.active) {          // going down the big stairs: he dims and gets a little smaller as he descends into the dark
    const d = player.descent, fx = player.cx, fy = player.y + player.h;
    ctx.globalAlpha *= 1 - 0.5 * d;
    ctx.translate(fx, fy); ctx.scale(1 - 0.1 * d, 1 - 0.1 * d); ctx.translate(-fx, -fy);
  }
  const lean = skyline.bodyShift();                  // leaning out: the sprite shifts a few px toward the rail
  ctx.translate(lean.x, lean.y + (intro.active ? 0 : player.stairBob));   // on the stairs: the body lifts a little with every step
  const wet = swimDepth(player);                     // in the pool (or on the ladder): waist-deep in the water
  if (wet > 0) drawSwimmer(ctx, player, wet, performance.now() / 1000);
  else if (!drawCharacter(ctx, player)) {            // sprite not loaded yet -> blue box fallback
    const sx = player.cx - 16, sy = player.cy - 22;
    ctx.fillStyle = '#1976d2'; ctx.fillRect(sx + 6, sy + 8, 20, 24);
    ctx.fillStyle = '#ffe0b2'; ctx.fillRect(sx + 10, sy + 10, 12, 10);
  }
  ctx.restore();
  // Walking in a bush: draw the bush leaves again over the player's feet so he looks "inside" it
  const ftx = Math.floor(player.cx / TILE), fty = Math.floor((player.y + player.h - 1) / TILE);
  if (!intro.active && getTile(ftx, fty) === 'b') drawBlobs(ftx * TILE, fty * TILE, 0.9);
}

// ---- Credits screen (press C). LPC art REQUIRES visible credits, so keep this! ----
function wrap(text, x, y, maxW, lineH) {
  let line = '';
  for (const word of text.split(' ')) {
    if (ctx.measureText(line + word).width > maxW) { ctx.fillText(line, x, y); line = ''; y += lineH; }
    line += word + ' ';
  }
  ctx.fillText(line, x, y);
  return y + lineH;
}
function drawCredits() {
  ctx.fillStyle = '#0a0a14'; ctx.fillRect(0, 0, VW, VH);
  ctx.font = 'bold 20px monospace'; ctx.fillStyle = '#ffd54f'; ctx.fillText('CREDITS', 30, 44);
  ctx.font = '14px monospace'; ctx.fillStyle = '#fff';
  let y = 78;
  y = wrap('Game: Md. Fahim Hassan & Shahriar Islam Tawsifa - BRAC University, Dept. of CSE', 30, y, VW - 60, 20) + 8;
  y = wrap('Character sprite: made with the Universal LPC Spritesheet Character Generator.', 30, y, VW - 60, 20) + 8;
  y = wrap('Sprites contributed as part of the Liberated Pixel Cup project from OpenGameArt.org: http://opengameart.org/content/lpc-collection', 30, y, VW - 60, 20) + 8;
  y = wrap('License: Creative Commons Attribution-ShareAlike 3.0 (CC-BY-SA 3.0) http://creativecommons.org/licenses/by-sa/3.0/', 30, y, VW - 60, 20) + 8;
  y = wrap('Detailed per-artist credits: see CREDITS.md and assets/character-credits.txt', 30, y, VW - 60, 20);
  ctx.fillStyle = '#aaa'; ctx.fillText('[C] close', 30, VH - 24);
}