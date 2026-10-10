// renderer.js - ALL drawing lives here. Game logic never touches the canvas.
import { TILE, cols, rows, widthPx, heightPx, getTile, isSolid, items, zoneId } from './map.js';
import { transition } from './transition.js';
import { quest } from './quest.js';
import { dialogue } from './dialogue.js';
import { intro } from './intro.js';
import { drawWell, wellBox, wellTiles } from './escalator.js';
import { drawCharacter } from './sprites.js';
import { drawGlassFront, drawGlassTops } from './glass.js';
import { skyline, drawSkyline } from './skyline.js';
import { getFloor } from './floor.js';

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
  'S': '#d3d1c7',                       // stairs
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

function drawPlanted(ch, px, py, tx, ty) {
  ctx.save();
  ctx.beginPath(); ctx.rect(px, py, TILE, TILE); ctx.clip();       // leaves never spill onto neighbour tiles
  if (ch === 'Y') {                                                // bush mounds: rounder and lighter than the hedge
    ctx.fillStyle = '#24652b'; ctx.fillRect(px, py, TILE, TILE);
    const shades = ['#2f8a37', '#3a9a42', '#43a047', '#2c7d33'];
    [[9, 10], [22, 9], [11, 23], [24, 22], [16, 16]].forEach(([sx, sy], i) => {
      const cx = px + sx + (rnd(tx, ty, i) - 0.5) * 4, cy = py + sy + (rnd(tx, ty, i + 9) - 0.5) * 4;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; disc(cx + 1, cy + 2, 9);
      ctx.fillStyle = shades[i % shades.length]; disc(cx, cy, 8.5);
      ctx.fillStyle = '#8bd18f'; ctx.fillRect(Math.round(cx - 3), Math.round(cy - 4), 3, 2);
    });
  } else if (ch === 'Z') {                                         // tree: one big canopy
    ctx.fillStyle = '#1f5a28'; ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = 'rgba(0,0,0,0.30)'; disc(px + 17, py + 19, 14.5);
    ctx.fillStyle = '#2e7d32'; disc(px + 16, py + 15, 14.5);
    ctx.fillStyle = '#388e3c'; disc(px + 12, py + 12, 9); disc(px + 21, py + 17, 8);
    ctx.fillStyle = '#4caf50'; disc(px + 11, py + 9, 5);
    ctx.fillStyle = '#8bd18f';
    ctx.fillRect(px + 9, py + 7, 3, 2); ctx.fillRect(px + 20, py + 13, 3, 2); ctx.fillRect(px + 14, py + 20, 3, 2);
  } else {                                                         // clipped hedge: dense wall of leaves
    const shades = ['#2e7d32', '#388e3c', '#2a7030', '#43a047'];
    for (let i = 0; i < 9; i++) {                                  // 3x3 grid of overlapping leaf blobs
      const gx = i % 3, gy = Math.floor(i / 3);
      const h = Math.abs(Math.sin((tx * 3 + gx) * 12.9898 + (ty * 3 + gy) * 78.233) * 43758.5453) % 1;
      ctx.fillStyle = shades[Math.floor(h * shades.length)];
      ctx.beginPath(); ctx.arc(px + gx * 11 + 5 + (h - 0.5) * 4, py + gy * 11 + 5 + (h * 7 % 1 - 0.5) * 4, 8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#7bc47f';                                     // a few bright leaf highlights
    for (let i = 0; i < 4; i++) {
      const h = Math.abs(Math.sin((tx * 5 + i) * 39.346 + (ty * 7 + i) * 11.135) * 43758.5453) % 1;
      const h2 = Math.abs(Math.sin((tx * 5 + i) * 17.17 + (ty * 7 + i) * 91.7) * 12345.678) % 1;
      ctx.fillRect(px + 3 + Math.floor(h * 24), py + 3 + Math.floor(h2 * 22), 3, 2);
    }
    ctx.fillStyle = '#143d1a';                                     // deep gaps between the leaves
    ctx.fillRect(px + 7, py + 14, 3, 2); ctx.fillRect(px + 20, py + 8, 3, 2); ctx.fillRect(px + 14, py + 24, 3, 2);
  }
  // light top edge / dark base only where the planted area ENDS, so a block of tiles reads as one big mass
  if (ty > 0 && !isPlanted(tx, ty - 1)) { ctx.fillStyle = 'rgba(190,240,170,0.28)'; ctx.fillRect(px, py, TILE, 4); }   // (none at the map's top edge: the hedge carries on)
  if (!isPlanted(tx, ty + 1)) { ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fillRect(px, py + TILE - 6, TILE, 6); }
  ctx.restore();
  drawGuardRail(px, py, tx, ty);
}

// Pale grey safety rail for planted areas (NOT the dark two-bar roof railing): a slim handrail on top,
// thin vertical balusters under it, and a post at each end of every tile. Drawn on every open face.
const RAIL = { hand: '#d6dadd', bal: '#98a0a5', post: '#eceff1', shadow: 'rgba(0,0,0,0.28)' };
function railH(x, y) {                                    // horizontal rail segment (top / bottom faces)
  ctx.fillStyle = RAIL.shadow; ctx.fillRect(x, y + 6, TILE, 1);
  ctx.fillStyle = RAIL.bal; for (let i = 3; i < TILE - 2; i += 4) ctx.fillRect(x + i, y + 3, 1, 4);
  ctx.fillStyle = RAIL.hand; ctx.fillRect(x, y + 1, TILE, 2);
  ctx.fillStyle = RAIL.post; ctx.fillRect(x, y, 2, 7); ctx.fillRect(x + TILE - 2, y, 2, 7);
}
function railV(x, y, east) {                              // vertical rail segment (left / right faces)
  const hx = east ? x + 4 : x + 1, bx = east ? x + 1 : x + 3;
  ctx.fillStyle = RAIL.shadow; ctx.fillRect(east ? x : x + 6, y, 1, TILE);
  ctx.fillStyle = RAIL.bal; for (let i = 3; i < TILE - 2; i += 4) ctx.fillRect(bx, y + i, 3, 1);
  ctx.fillStyle = RAIL.hand; ctx.fillRect(hx, y, 2, TILE);
  ctx.fillStyle = RAIL.post; ctx.fillRect(x, y, 7, 2); ctx.fillRect(x, y + TILE - 2, 7, 2);
}
function drawGuardRail(px, py, tx, ty) {
  const open = (x, y) => !isPlanted(x, y) && !isSolid(x, y);   // floor / path next to the planted area
  if (open(tx, ty - 1)) railH(px, py);
  if (open(tx, ty + 1)) railH(px, py + TILE - 7);
  if (open(tx - 1, ty)) railV(px, py, false);
  if (open(tx + 1, ty)) railV(px + TILE - 7, py, true);
}

// ---- concrete bench (C) and tree planter (T) -------------------------------------------------------
// Light speckled concrete seat with a darker front face, like the benches in the photos.
// T tiles sit in the middle of the bench ring: a dark grey tapered planter box with a tree growing out of it.
const isBenchPart = (x, y) => { const c = getTile(x, y); return c === 'C' || c === 'T'; };
function drawBench(px, py, tx, ty) {
  const n = isBenchPart(tx, ty - 1), s = isBenchPart(tx, ty + 1), w = isBenchPart(tx - 1, ty), e = isBenchPart(tx + 1, ty);
  const x0 = w ? 0 : 1, x1 = e ? TILE : TILE - 1, y0 = n ? 0 : 1, yb = s ? TILE : TILE - 6;
  ctx.fillStyle = '#c9cccd'; ctx.fillRect(px + x0, py + y0, x1 - x0, yb - y0);           // seat top
  for (let i = 0; i < 8; i++) {                                                           // concrete speckle
    ctx.fillStyle = i % 2 ? '#aeb2b4' : '#dfe1e2';
    ctx.fillRect(px + 2 + Math.floor(rnd(tx, ty, i) * (TILE - 5)), py + 2 + Math.floor(rnd(tx, ty, i + 30) * (yb - 4)), 1, 1);
  }
  if (!n) { ctx.fillStyle = '#e1e3e4'; ctx.fillRect(px + x0, py + y0, x1 - x0, 2); }      // lit top lip
  if (!w) { ctx.fillStyle = '#dfe1e2'; ctx.fillRect(px + x0, py + y0, 1, yb - y0); }
  if (!e) { ctx.fillStyle = '#a9adaf'; ctx.fillRect(px + x1 - 1, py + y0, 1, yb - y0); }
  if (!s) {                                                                               // darker front face + base shadow
    ctx.fillStyle = '#9da1a3'; ctx.fillRect(px + x0, py + yb, x1 - x0, 4);
    ctx.fillStyle = '#6f7477'; ctx.fillRect(px + x0 + 1, py + yb + 4, x1 - x0 - 2, 1);
  }
}
function drawPlanter(px, py, tx, ty) {
  drawBench(px, py, tx, ty);                                                              // the seat continues under the planter
  const isT = (x, y) => getTile(x, y) === 'T';
  const n = isT(tx, ty - 1), s = isT(tx, ty + 1);
  const x0 = px + 3, x1 = px + TILE - 3, y0 = py + (n ? 0 : 2), y1 = py + (s ? TILE : TILE - 2);
  ctx.fillStyle = '#6a6c72'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);                      // box body
  if (!n) { ctx.fillStyle = '#868890'; ctx.fillRect(x0, y0, x1 - x0, 2); }                // lit rim
  if (!s) { ctx.fillStyle = '#4d4f55'; ctx.fillRect(x0, y1 - 5, x1 - x0, 5); }            // darker front face
  ctx.fillStyle = '#3b4a33'; ctx.fillRect(x0 + 3, y0 + (n ? 0 : 3), x1 - x0 - 6, (y1 - y0) - (n ? 0 : 3) - (s ? 0 : 6));   // soil
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; disc(px + 17, py + 17, 12);                         // canopy shadow
  ctx.fillStyle = '#2e7d32'; disc(px + 16, py + 14, 12);
  ctx.fillStyle = '#43a047'; disc(px + 12, py + 10, 7);
  ctx.fillStyle = '#8bd18f'; ctx.fillRect(px + 9, py + 7, 3, 2); ctx.fillRect(px + 19, py + 14, 3, 2);
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
  const seed = tx * 7 + ty;
  const edges = [];
  if (ty === 0) edges.push('n');
  if (ty === rows - 1) edges.push('s');
  if (tx === 0) edges.push('w');
  if (tx === cols - 1) edges.push('e');
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
function drawFlight(px, py, tx, ty) {
  const top = getTile(tx, ty - 1) !== 'S', bottom = getTile(tx, ty + 1) !== 'S';
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
const BLOCK = { tx: 21, ty: 0 };
function drawBasementBlock(camera) {
  const bx = BLOCK.tx * TILE, by = BLOCK.ty * TILE;
  if (bx > camera.x + VW || bx + 3 * TILE < camera.x || by > camera.y + VH || by + 3 * TILE < camera.y) return;
  const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(bx + x, by + y, w, h); };
  // roof: bands get lighter towards the tall front
  const bh = P_TOP / 4;
  ['#8a8880', '#94928a', '#9e9c93', '#a8a69d'].forEach((c, i) => R(0, Math.round(i * bh), 96, Math.ceil(bh), c));
  for (const x of [10, 21, 42, 53, 74, 85]) R(x, 0, 1, P_TOP, 'rgba(0,0,0,0.08)');          // board-formed seams
  R(0, 0, 96, 1, '#b7b5ab');                                                             // lit back edge
  // front face: the two wall piers (full tiles) with seams
  R(0, P_TOP, 96, 96 - P_TOP, '#c9bda9'); R(0, P_TOP, 96, 1, '#e0d6c4'); R(0, 94, 96, 2, '#a79b88');   // the wall is as tall as the portal frame
  for (const x of [10, 85]) R(x, P_TOP + 1, 1, 94 - P_TOP - 1, 'rgba(0,0,0,0.07)');
  for (const x of [5, 14]) {                                                              // two Wi-Fi units on the left pier
    R(x - 1, 55, 1, 4, '#dcdcd6'); R(x + 5, 55, 1, 4, '#dcdcd6'); R(x, 58, 5, 6, '#f1f1ee');
    R(x - 1, 64, 1, 4, '#dcdcd6'); R(x + 5, 64, 1, 4, '#dcdcd6');
  }
  R(78, 72, 6, 10, 'rgba(0,0,0,0.05)');                                                  // old patch on the right pier
  // louvered west face
  R(0, 0, 8, P_TOP, '#6b6a73');
  for (let y = 2; y < P_TOP; y += 3) R(0, y, 8, 1, 'rgba(0,0,0,0.25)');
  R(0, 0, 1, P_TOP, '#8f8e98');
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
    ctx.moveTo(bx + ix0 + 2.5 + k(ya), by + ya); ctx.lineTo(bx + ix0 + 2.5 + k(yb), by + yb);
    ctx.moveTo(bx + ix1 - 2.5 - k(ya), by + ya); ctx.lineTo(bx + ix1 - 2.5 - k(yb), by + yb); ctx.stroke();
  });
  R(ix0, it, 3, ih, 'rgba(0,0,0,0.30)'); R(ix1 - 3, it, 3, ih, 'rgba(0,0,0,0.30)');     // shaded side walls
  ctx.drawImage(getFloor(zoneId, cols, rows), bx + ix0, by + FLOOR_Y, iw, 96 - FLOOR_Y, bx + ix0, by + FLOOR_Y, iw, 96 - FLOOR_Y);   // landing: the same stone paving as the floor
  R(ix0, FLOOR_Y, iw, 1, '#cfd3d6');                                                    // metal edge strip at the drop
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
  } else if (ch === '~') {                           // moving ripple line
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(px + 4 + Math.sin(time * 2 + tx) * 4, py + 14, 16, 3);
  } else if (ch === 'h') {                           // leafy dots
    ctx.fillStyle = '#1f4d25';
    ctx.fillRect(px + 6, py + 6, 6, 6); ctx.fillRect(px + 18, py + 16, 6, 6);
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
  } else if (ch === 'J' || ch === 'Q') {              // gym facade (west wall, faces east)
    drawGymWall(ch, px, py, tx, ty);
  } else if (ch === 'M' || ch === 'G') {              // restroom door with a sign: M = men, W = women
    ctx.fillStyle = '#44444d'; ctx.fillRect(px, py + TILE - 6, TILE, 6);
    ctx.fillStyle = ch === 'M' ? '#2f6fb5' : '#c2548c'; ctx.fillRect(px + 3, py + 3, TILE - 6, TILE - 3);
    ctx.strokeStyle = '#1b1b22'; ctx.lineWidth = 1; ctx.strokeRect(px + 3.5, py + 3.5, TILE - 7, TILE - 4);
    ctx.font = 'bold 15px monospace'; ctx.fillStyle = '#fff'; ctx.fillText(ch === 'M' ? 'M' : 'W', px + 11, py + 22);
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
    drawTier(px, py, tx, ty, +ch);
  } else if (ch === 'm') {                            // flat base slab under the outer tier flights
    drawSemiWall(px, py, tx, ty, true);               // exactly the semi-wall's colour + texture, so wall and base read as one piece
  } else if (ch === 'q') {                            // hedge semi-wall
    drawSemiWall(px, py, tx, ty);
  } else if (ch === 'S' && zoneId === 'zone1') {      // zone 1: the two railed stair flights
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

// ---- gymnasium facade (J = sliding glass door, Q = poster + cabinet wall) ---------------------------------
// Drawn as a normal front view (top of the door at the top of the tile, threshold at the bottom), then the whole tile is
// rotated a quarter turn anticlockwise so it fits the WEST wall of a top-down map: door top -> wall side, threshold -> mat side.
function drawGymWall(ch, px, py, tx, ty) {
  ctx.save();
  ctx.beginPath(); ctx.rect(px, py, TILE, TILE); ctx.clip();
  ctx.translate(px + TILE / 2, py + TILE / 2); ctx.rotate(-Math.PI / 2); ctx.translate(-TILE / 2, -TILE / 2);   // now draw in 0..32 local coords
  ctx.fillStyle = '#6b6b72'; ctx.fillRect(0, 0, TILE, TILE);                         // lighter concrete than the plain wall
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
    ctx.fillStyle = '#44444d'; ctx.fillRect(0, TILE - 6, TILE, 6);                  // wall base shadow (like '#')
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
function drawLiftWall(ch, px, py, tx, ty) {
  ctx.save();
  ctx.beginPath(); ctx.rect(px, py, TILE, TILE); ctx.clip();
  ctx.translate(px + TILE / 2, py + TILE / 2); ctx.rotate(-Math.PI / 2); ctx.translate(-TILE / 2, -TILE / 2);
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
    const num = ty <= 14 ? '04' : '03';
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

// Brick pillar (L, 2 tiles wide, rows 13 and 17): rust-red tile blocks sticking out from the west wall; the north one carries the blue notice board.
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
  if (tx === 2 && ty === 12) {                                                    // notice board on the end of the north pillar
    R(22, 6, 8, 16, '#3bb4e0'); R(23, 8, 6, 6, '#e9f6fb'); R(23, 16, 6, 1, '#d4eef8'); R(23, 18, 4, 1, '#d4eef8');
  }
}

function drawArrow(glyph, px, py) {                   // exit marker on a path tile
  ctx.font = 'bold 20px monospace'; ctx.fillStyle = '#7ed957';
  ctx.fillText(glyph, px + 8, py + 23);
}

function drawLabel(text, x, y) {
  ctx.font = '14px monospace'; ctx.fillStyle = '#fff'; ctx.fillText(text, x, y);
}

export function render(game, time) {
  const { player, npc, debug } = game;
  updateCamera(player);
  ctx.clearRect(0, 0, VW, VH);
  if (skyline.any()) { ctx.fillStyle = '#a9b1b6'; ctx.fillRect(0, 0, VW, VH); }   // safety colour behind the skyline
  ctx.save();
  ctx.translate(-camera.x, -camera.y);               // everything below is in WORLD pixels
  drawSkyline(ctx, camera, VW, VH, time);            // the city beyond the rails (before the tiles, so the rail slats are see-through)

  // Only draw tiles that are on screen (cheap "culling"); max/min keep us inside the map when the camera slides past an edge
  const x0 = Math.max(0, Math.floor(camera.x / TILE)), x1 = Math.min(cols - 1, Math.floor((camera.x + VW) / TILE));
  const y0 = Math.max(0, Math.floor(camera.y / TILE)), y1 = Math.min(rows - 1, Math.floor((camera.y + VH) / TILE));
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++)
      drawTile(getTile(tx, ty), tx * TILE, ty * TILE, tx, ty, time);
  if (zoneId === 'zone1') drawEscalatorNose(x0, x1, y0, y1, time);
  if (zoneId === 'zone1') drawBasementBlock(camera);   // storage-room stairwell (k / z tiles)   // the escalator well + rounded end of the escalator railing
  drawGlassTops(ctx, time, camera, VW, VH);          // glass skylight + the students seen through it (after tiles, before characters)

  // Item (ID card): small white card with a bobbing motion
  for (const it of items) {
    if (it.collected) continue;
    const bob = Math.sin(time * 4) * 2;
    ctx.fillStyle = '#fff'; ctx.fillRect(it.x * TILE + 8, it.y * TILE + 10 + bob, 16, 12);
    ctx.fillStyle = '#d32f2f'; ctx.fillRect(it.x * TILE + 10, it.y * TILE + 12 + bob, 5, 5);
  }

  // Draw NPC and player in order of their feet (whoever is lower on screen is drawn on top)
  if (npc.zone !== zoneId) drawPlayer(player);        // NPC is in another zone
  else if (player.y + player.h < npc.footY) { drawPlayer(player); drawNPC(npc, player); }
  else { drawNPC(npc, player); drawPlayer(player); }

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
  const lean = skyline.bodyShift();                  // leaning out: the sprite shifts a few px toward the rail
  ctx.translate(lean.x, lean.y + (intro.active ? 0 : player.stairBob));   // on the stairs: the body lifts a little with every step
  if (!drawCharacter(ctx, player)) {                 // sprite not loaded yet -> blue box fallback
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
  y = wrap('Game: [YOUR NAMES HERE] - BRAC University, Dept. of CSE', 30, y, VW - 60, 20) + 8;
  y = wrap('Character sprite: made with the Universal LPC Spritesheet Character Generator.', 30, y, VW - 60, 20) + 8;
  y = wrap('Sprites contributed as part of the Liberated Pixel Cup project from OpenGameArt.org: http://opengameart.org/content/lpc-collection', 30, y, VW - 60, 20) + 8;
  y = wrap('License: Creative Commons Attribution-ShareAlike 3.0 (CC-BY-SA 3.0) http://creativecommons.org/licenses/by-sa/3.0/', 30, y, VW - 60, 20) + 8;
  y = wrap('Detailed per-artist credits: see CREDITS.md and assets/character-credits.txt', 30, y, VW - 60, 20);
  ctx.fillStyle = '#aaa'; ctx.fillText('[C] close', 30, VH - 24);
}