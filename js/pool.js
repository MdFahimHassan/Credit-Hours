// pool.js - the Robotics Lab test pool of zone 2.
// It is NOT a swimming pool: it is a tank where the Robotics Lab tests its small underwater vehicles (ROVs). This file holds
//   1. the WATER      - one big animated surface (clear blue, caustic light, sky sheen, ripples, glints, soft edges)
//   2. the ROBOTS     - two little ROVs that float slowly around; when they reach a wall they turn and head off another way
//   3. the SIGNBOARD  - "RESTRICTED AREA" board at the south rim. Press E next to it to read it up close
//   4. the OPERATORS  - two lab members standing beside the pool, each holding a remote control
// Where the sign and the operators stand is set in map.js (POOL_PROPS) because they also block the player.
// All the numbers worth tweaking are in the TWEAK block just below.
import { TILE, cols, rows, getTile, zoneId, POOL_PROPS, swim } from './map.js';
import { drawStudent, drawStudentPose, prepareVariants, drawCharacter } from './sprites.js';

// ---------------------------------------------------------------- TWEAK ----
const WATER = {
  tintA: 'rgba(30,125,205,0.42)',       // blue haze over the pool floor (drawn UNDER the robots)
  tintB: 'rgba(40,140,220,0.20)',       // second layer OVER the robots, so they look like they are just below the surface
  causticA: 0.28, causticB: 0.18,      // brightness of the two moving light-web layers
  sparkles: 46,                        // number of little glints on the surface
};
const ROBOT = {
  speed: [16, 22],                     // cruise speed in px/s (the big one, the small one) - slow on purpose
  turnRate: [1.35, 1.8],               // radians per second they can turn at
  wallPad: 4,                          // extra px kept between a robot and the wall
};
// ------------------------------------------------------------------------------

const TAU = Math.PI * 2;
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };   // shortest turn from a to b
function rr(ctx, x, y, w, h, r) {                         // rounded rectangle path
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// ================================================================ pool geometry =======================================
let rect = null;                                          // the water area in world pixels {x, y, w, h}
export function poolRect() {                              // scans the '~' tiles of zone 2 once
  if (rect) return rect;
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++)
    if (getTile(tx, ty) === '~') { x0 = Math.min(x0, tx); y0 = Math.min(y0, ty); x1 = Math.max(x1, tx); y1 = Math.max(y1, ty); }
  if (x1 < 0) return null;
  rect = { x: x0 * TILE, y: y0 * TILE, w: (x1 - x0 + 1) * TILE, h: (y1 - y0 + 1) * TILE };
  return rect;
}

// ================================================================ the concrete paths ==================================
// Two concrete walkways: the slab floor minus its grid lines (no joints), in a darker colour, with a subtle weathered-concrete texture (see paintConcrete).
//   south: x10-19, rows 20-23 (the band between the south rim and the south hedge)       north: x11-19, rows 6-9 (starts under the left edge of the north hedge)
export const POOL_PATHS = [
  { x0: 10, x1: 19, y0: 20, y1: 23 },
  { x0: 11, x1: 19, y0: 6,  y1: 9  },
];
const CONCRETE = [93, 96, 102];                                      // average colour (#5d6066): darker than the stone slabs (about #8a8d94). Lower the numbers for darker.
function hsh(a, b, c = 0) {
  let n = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1103515245); n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
function vnoise(x, y, sz, seed) {                                    // smooth value noise, feature size sz px
  const gx = x / sz, gy = y / sz, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hsh(x0, y0, seed), b = hsh(x0 + 1, y0, seed), c = hsh(x0, y0 + 1, seed), d = hsh(x0 + 1, y0 + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// Weathered concrete, kept subtle so the path still reads as one smooth surface: a fine grain with a few pits and pale specks, very soft
// patchy tone, a faintly paler worn line down the middle where people walk, slightly dirtier edges, a few hairline cracks and faint damp stains.
// Noise is hashed from WORLD position, so it is the same every time and needs no per-frame work (painted once per path).
function paintConcrete(P) {
  const W = (P.x1 - P.x0 + 1) * TILE, H = (P.y1 - P.y0 + 1) * TILE, ox = P.x0 * TILE, oy = P.y0 * TILE;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const wx = x + ox, wy = y + oy, i = (y * W + x) * 4;
    let v = (vnoise(wx, wy, 96, 11) - 0.5) * 9 + (vnoise(wx, wy, 30, 12) - 0.5) * 5 + (vnoise(wx, wy, 9, 13) - 0.5) * 3;   // soft patchy tone
    v += (hsh(wx, wy, 14) - 0.5) * 7;                                                  // fine grain
    const r = hsh(wx, wy, 15);
    if (r > 0.993) v -= 20; else if (r < 0.004) v += 15;                               // little pits and pale grains of aggregate
    v += 3.5 * Math.exp(-Math.pow((y - H / 2) / (H * 0.22), 2));                       // worn, slightly paler line along the middle
    const e = Math.min(y, H - 1 - y); if (e < 14) v -= (14 - e) * 0.45;                // dirtier along both long edges
    v -= Math.max(0, vnoise(wx * 0.55, wy, 40, 16) - 0.62) * 22;                       // faint damp / stained patches
    d[i] = CONCRETE[0] + v; d[i + 1] = CONCRETE[1] + v; d[i + 2] = CONCRETE[2] + v * 1.05; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.lineWidth = 1; g.lineCap = 'round';
  const crack = (x, y, n, dir, a) => {                                                 // a thin meandering hairline crack (+ a faint pale edge below it)
    const pts = [[x, y]];
    for (let k = 0; k < n; k++) { x += dir * (3 + hsh(x | 0, y | 0, k + ox) * 6); y += (hsh(y | 0, x | 0, k + 5) - 0.5) * 6; pts.push([x, y]); }
    g.strokeStyle = `rgba(28,30,34,${a})`; g.beginPath(); pts.forEach(([px, py], k) => (k ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke();
    g.strokeStyle = `rgba(150,154,160,${a * 0.35})`; g.beginPath(); pts.forEach(([px, py], k) => (k ? g.lineTo(px, py + 1) : g.moveTo(px, py + 1))); g.stroke();
  };
  crack(W * 0.18, H * 0.30, 11, 1, 0.30); crack(W * 0.52, H * 0.72, 14, -1, 0.26); crack(W * 0.74, H * 0.22, 9, 1, 0.24); crack(W * 0.86, H * 0.64, 6, -1, 0.22);
  return c;
}
const concreteImgs = new Map();
function drawPaths(ctx) {
  for (const P of POOL_PATHS) {
    if (!concreteImgs.has(P)) concreteImgs.set(P, paintConcrete(P));
    ctx.drawImage(concreteImgs.get(P), P.x0 * TILE, P.y0 * TILE);
  }
}

// ================================================================ the steel ladder ====================================
// A stainless-steel pool ladder on the NORTH rim, at tile x23 (the north-east corner of the pool, like the one at the right of your photo).
// It points SOUTH: two grab rails bolted to the deck with round flanges, running over the coping and down into the water, with steps between them.
const LADDER = { fromRight: 16, gap: 7 };                            // x = this many px left of the pool's east edge (16 = the middle of the last water column); half the distance between the rails
function ladderX(R) { return R.x + R.w - LADDER.fromRight; }
function drawLadderUnder(ctx, R) {                                   // the part below the surface: drawn BEFORE the water tint so it looks submerged
  const y = R.y, cx = ladderX(R), g = LADDER.gap;
  ctx.save(); ctx.lineCap = 'round';
  ctx.fillStyle = 'rgba(0,25,40,0.22)'; ctx.fillRect(cx - g - 2, y, g * 2 + 5, 24);                // soft shadow of the ladder on the pool wall
  for (const dx of [-g, g]) {                                                                      // the rails going down the wall
    ctx.strokeStyle = '#7f8c94'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx + dx, y + 1); ctx.lineTo(cx + dx, y + 22); ctx.stroke();
    ctx.strokeStyle = '#c9d3d9'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx + dx - 1, y + 1); ctx.lineTo(cx + dx - 1, y + 21); ctx.stroke();
  }
  for (const sy of [y + 8, y + 15, y + 22]) {                                                      // the steps between the rails
    ctx.fillStyle = '#6f7d85'; ctx.fillRect(cx - g, sy - 1, g * 2 + 1, 3);
    ctx.fillStyle = '#bfcad0'; ctx.fillRect(cx - g, sy - 1, g * 2 + 1, 1);
  }
  ctx.restore();
}
function drawLadderTop(ctx, R) {                                     // the part above the water: rails over the coping, bolted to the deck
  const y = R.y, cx = ladderX(R), g = LADDER.gap;
  ctx.save(); ctx.lineCap = 'round';
  for (const dx of [-g, g]) {
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx + dx + 3, y - 24); ctx.lineTo(cx + dx + 3, y - 1); ctx.stroke();   // shadow on the coping
    ctx.strokeStyle = '#8b959c'; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(cx + dx, y - 24); ctx.lineTo(cx + dx, y + 1); ctx.stroke();               // the rail
    ctx.strokeStyle = '#eef2f4'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(cx + dx - 1, y - 23); ctx.lineTo(cx + dx - 1, y - 1); ctx.stroke();       // bright left edge
    ctx.strokeStyle = '#5d676e'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx + dx + 1.6, y - 23); ctx.lineTo(cx + dx + 1.6, y - 1); ctx.stroke();     // dark right side
    ctx.fillStyle = '#7b858c'; ctx.beginPath(); ctx.arc(cx + dx, y - 25, 4, 0, TAU); ctx.fill();                                                          // round anchor flange on the deck
    ctx.strokeStyle = '#454d53'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#d6dde1'; ctx.beginPath(); ctx.arc(cx + dx - 1, y - 25.8, 1.3, 0, TAU); ctx.fill();                                                   // bolt glint
    ctx.strokeStyle = '#d3dbe0'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx + dx, y - 1, 2.6, 0, Math.PI); ctx.stroke();                              // the bend where the rail turns down into the water
  }
  ctx.restore();
}

// ================================================================ the water ===========================================
let floorImg = null, causticImg = null, patA = null, patB = null, sparks = null, dashes = null;

function buildFloor(W, H) {                               // the pool bottom: pale tiles, grout, lane lines (like the real pool, seen through the water)
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const T = 32;
  for (let y = 0; y < H; y += T) for (let x = 0; x < W; x += T) {
    const k = ((x * 7 + y * 13) % 5) / 5;
    g.fillStyle = `rgb(${176 + k * 10 | 0},${214 + k * 8 | 0},${232 + k * 6 | 0})`; g.fillRect(x, y, T, T);
    g.fillStyle = 'rgba(10,50,90,0.25)'; g.fillRect(x, y, T, 1); g.fillRect(x, y, 1, T);                   // grout
    g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(x + 1, y + 1, T - 1, 1);
  }
  g.fillStyle = 'rgba(14,50,110,0.55)';                    // lane lines with T-ends, like the markings on the real tank floor
  for (const ly of [H / 3, (2 * H) / 3]) {
    g.fillRect(40, ly - 3, W - 80, 6);
    g.fillRect(40, ly - 14, 6, 28); g.fillRect(W - 46, ly - 14, 6, 28);
  }
  g.fillRect(W * 0.5 - 3, H / 3 - 14, 6, H / 3 + 28);     // centre bar
  const v = g.createLinearGradient(0, 0, 0, H);           // the far (north) side looks deeper
  v.addColorStop(0, 'rgba(0,30,80,0.40)'); v.addColorStop(0.5, 'rgba(0,30,80,0.10)'); v.addColorStop(1, 'rgba(0,30,80,0.0)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
  return c;
}

function buildCaustics() {                                // a seamless 128x128 web of bright wobbly lines (light focused by the ripples)
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N), d = img.data;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = (x / N) * TAU, v = (y / N) * TAU;
    const a = Math.sin(2 * u + 1.7 * Math.sin(2 * v + 0.5) + Math.sin(v + u));
    const b = Math.sin(2 * v + 1.7 * Math.sin(2 * u + 1.3) - Math.sin(u));
    const s = (a + b) / 2;
    const l1 = Math.pow(1 - Math.abs(s), 9);
    const e = Math.sin(3 * u + 2 * Math.sin(2 * v + 2.2)) * 0.5 + Math.sin(3 * v + 2 * Math.sin(u + 0.7)) * 0.5;
    const l2 = Math.pow(1 - Math.abs(e), 12) * 0.7;
    const l = clamp(l1 + l2, 0, 1), i = (y * N + x) * 4;
    d[i] = 225; d[i + 1] = 248; d[i + 2] = 255; d[i + 3] = Math.round(l * 255);
  }
  g.putImageData(img, 0, 0);
  return c;
}

function initWater(ctx, R) {
  floorImg = buildFloor(R.w, R.h);
  causticImg = buildCaustics();
  patA = ctx.createPattern(causticImg, 'repeat'); patB = ctx.createPattern(causticImg, 'repeat');
  sparks = Array.from({ length: WATER.sparkles }, () => ({ x: rand(6, R.w - 6), y: rand(6, R.h - 6), sp: rand(0.6, 1.8), ph: rand(0, TAU), big: Math.random() < 0.25 }));
  dashes = Array.from({ length: 34 }, () => ({ x: rand(0, R.w), y: rand(4, R.h - 4), w: rand(6, 16), sp: rand(2, 6), ph: rand(0, TAU) }));
}

// ---- ripples + bubbles made by the robots ------------------------------------------------------------------------
const rings = [];                                          // {x, y, age, life, max, amp}
const bubbles = [];                                        // {x, y, vx, vy, age, life, r}
const addRing = (x, y, max, amp, life = 2.3) => { if (rings.length < 40) rings.push({ x, y, age: 0, life, max, amp }); };

function drawWater(ctx, time, R) {
  if (!floorImg) initWater(ctx, R);
  const t = time;
  ctx.save();
  ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(floorImg, R.x, R.y);                       // 1. the pool bottom
  ctx.fillStyle = WATER.tintA; ctx.fillRect(R.x, R.y, R.w, R.h);
  drawLadderUnder(ctx, R);                                 // the ladder's submerged part

  drawRobots(ctx, time);                                   // 2. the robots, resting a little below the surface

  ctx.fillStyle = WATER.tintB; ctx.fillRect(R.x, R.y, R.w, R.h);   // 3. the water above them
  const depth = ctx.createLinearGradient(0, R.y, 0, R.y + R.h);
  depth.addColorStop(0, 'rgba(6,40,110,0.32)'); depth.addColorStop(0.55, 'rgba(6,40,110,0.08)'); depth.addColorStop(1, 'rgba(170,225,255,0.12)');
  ctx.fillStyle = depth; ctx.fillRect(R.x, R.y, R.w, R.h);

  // 4. caustics: two copies of the light web sliding past each other at different speeds and sizes (so it never looks like a loop)
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.globalCompositeOperation = 'lighter';
  patA.setTransform(new DOMMatrix().translate(R.x + t * 5.5, R.y + t * 3.2 + Math.sin(t * 0.7) * 6).scale(1));
  ctx.globalAlpha = WATER.causticA * (0.8 + 0.2 * Math.sin(t * 0.9)); ctx.fillStyle = patA; ctx.fillRect(R.x, R.y, R.w, R.h);
  patB.setTransform(new DOMMatrix().translate(R.x - t * 3.6 + 40, R.y - t * 4.4 + Math.cos(t * 0.5) * 8).scale(1.55));
  ctx.globalAlpha = WATER.causticB * (0.8 + 0.2 * Math.cos(t * 0.7)); ctx.fillStyle = patB; ctx.fillRect(R.x, R.y, R.w, R.h);
  ctx.restore();

  // 5. soft sky sheen: broad pale bands drifting across the surface
  for (let i = 0; i < 3; i++) {
    const span = R.w + 360, bx = R.x - 180 + ((t * (9 + i * 3) + i * 230) % span);
    const g = ctx.createLinearGradient(bx, R.y + R.h, bx + 150, R.y);
    g.addColorStop(0, 'rgba(235,250,245,0)'); g.addColorStop(0.5, `rgba(235,250,245,${0.075 + 0.03 * Math.sin(t * 0.6 + i)})`); g.addColorStop(1, 'rgba(235,250,245,0)');
    ctx.fillStyle = g; ctx.fillRect(R.x, R.y, R.w, R.h);
  }

  // 6. short wavelets drifting along the surface
  for (const d of dashes) {
    const a = 0.5 + 0.5 * Math.sin(t * 0.9 + d.ph);
    if (a < 0.12) continue;
    const x = R.x + ((d.x + t * d.sp) % R.w), y = R.y + d.y + Math.sin(t * 0.8 + d.ph) * 1.5;
    ctx.fillStyle = `rgba(225,250,240,${0.20 * a})`; ctx.fillRect(Math.round(x), Math.round(y), Math.round(d.w), 1);
    ctx.fillStyle = `rgba(0,40,40,${0.10 * a})`; ctx.fillRect(Math.round(x + 2), Math.round(y + 1), Math.round(d.w * 0.7), 1);
  }

  // 7. ripple rings and bubbles from the robots
  for (const r of rings) {
    const k = r.age / r.life, rad = 3 + r.max * (1 - (1 - k) * (1 - k)), a = r.amp * Math.pow(1 - k, 1.6);
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(235,255,248,${a})`; ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, TAU); ctx.stroke();
    ctx.strokeStyle = `rgba(235,255,248,${a * 0.55})`; ctx.beginPath(); ctx.arc(r.x, r.y, rad * 0.68, 0, TAU); ctx.stroke();
    ctx.strokeStyle = `rgba(0,45,45,${a * 0.35})`; ctx.beginPath(); ctx.arc(r.x + 1, r.y + 1, rad, 0, TAU); ctx.stroke();
  }
  for (const b of bubbles) {
    const k = b.age / b.life, a = Math.sin(k * Math.PI);
    ctx.strokeStyle = `rgba(240,255,250,${0.75 * a})`; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (0.7 + 0.5 * k), 0, TAU); ctx.stroke();
    ctx.fillStyle = `rgba(255,255,255,${0.5 * a})`; ctx.fillRect(Math.round(b.x - b.r * 0.4), Math.round(b.y - b.r * 0.5), 1, 1);
  }

  // 8. glints
  for (const s of sparks) {
    const a = Math.pow(Math.max(0, Math.sin(t * s.sp + s.ph)), 14);
    if (a < 0.05) continue;
    const x = Math.round(R.x + s.x + Math.sin(t * 0.3 + s.ph) * 3), y = Math.round(R.y + s.y);
    ctx.fillStyle = `rgba(255,255,255,${0.9 * a})`; ctx.fillRect(x, y, 1, 1);
    if (s.big && a > 0.35) { ctx.fillStyle = `rgba(255,255,255,${0.55 * a})`; ctx.fillRect(x - 2, y, 5, 1); ctx.fillRect(x, y - 2, 1, 5); }
  }

  // 9. edges: the rim shades the water a little (north and west most), a thin bright waterline against the tiles
  const edge = (x0, y0, x1, y1, rx, ry, rw, rh, a) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, `rgba(0,30,80,${a})`); g.addColorStop(1, 'rgba(0,30,80,0)');
    ctx.fillStyle = g; ctx.fillRect(rx, ry, rw, rh);
  };
  edge(0, R.y, 0, R.y + 16, R.x, R.y, R.w, 16, 0.50);
  edge(R.x, 0, R.x + 14, 0, R.x, R.y, 14, R.h, 0.34);
  edge(R.x + R.w, 0, R.x + R.w - 14, 0, R.x + R.w - 14, R.y, 14, R.h, 0.26);
  edge(0, R.y + R.h, 0, R.y + R.h - 10, R.x, R.y + R.h - 10, R.w, 10, 0.20);
  ctx.fillStyle = `rgba(230,250,244,${0.20 + 0.06 * Math.sin(t * 1.3)})`;
  ctx.fillRect(R.x, R.y + R.h - 1, R.w, 1); ctx.fillRect(R.x, R.y, R.w, 1); ctx.fillRect(R.x, R.y, 1, R.h); ctx.fillRect(R.x + R.w - 1, R.y, 1, R.h);
  ctx.restore();
}

// ================================================================ the robots ==========================================
// Each robot: moves slowly along its heading `ang`. Now and then it picks a new heading (or hovers for a second). When it touches a
// wall it picks a heading that is the bounce of its old one (plus a random tilt) and swings round to it, slowing down while it turns.
export const robots = [];                                   // (exported only so tests can look at them)
function makeRobot(x, y, scale, kind, i) {
  const ang = rand(0, TAU);
  return { x, y, ang, target: ang, speed: 0, cruise: ROBOT.speed[i], turnRate: ROBOT.turnRate[i], scale, kind,
    wander: rand(2, 5), hover: 0, ringT: rand(0, 0.8), bubT: rand(0, 0.4), ph: rand(0, TAU), prop: 0, thrust: 0, cd: 0 };
}
function initRobots(R) {
  robots.length = 0;
  robots.push(makeRobot(R.x + R.w * 0.30, R.y + R.h * 0.42, 1.0, 'grey', 0));
  robots.push(makeRobot(R.x + R.w * 0.72, R.y + R.h * 0.66, 0.74, 'orange', 1));
}

function steerAway(rb, ang) { rb.target = ang + rand(-0.4, 0.4); rb.wander = rand(3, 6); rb.hover = 0; rb.speed *= 0.4; }

let swimRingT = 0;
export function updatePool(dt, swimmer = null) {
  if (zoneId !== 'zone2') return;
  const R = poolRect(); if (!R) return;
  if (!robots.length) initRobots(R);
  if (swimmer?.swimming && !ladder.active) {                // the player in the water: ripples round him, and the robots keep out of his way
    swimRingT -= dt;
    if (swimRingT <= 0) { swimRingT = swimmer.moving ? 0.45 : 1.7; addRing(swimmer.cx, swimmer.y + swimmer.h - 4, swimmer.moving ? 26 : 16, swimmer.moving ? 0.38 : 0.2, 1.9); }
    for (const rb of robots) {
      rb.avoidCd = Math.max(0, (rb.avoidCd || 0) - dt);
      const d = Math.hypot(rb.x - swimmer.cx, rb.y - swimmer.cy);
      if (d < 50 && rb.avoidCd <= 0) { steerAway(rb, Math.atan2(rb.y - swimmer.cy, rb.x - swimmer.cx)); rb.avoidCd = 1.3; }
    }
  }
  for (const r of rings) r.age += dt;
  for (let i = rings.length - 1; i >= 0; i--) if (rings[i].age >= rings[i].life) rings.splice(i, 1);
  for (const b of bubbles) { b.age += dt; b.x += b.vx * dt; b.y += b.vy * dt; }
  for (let i = bubbles.length - 1; i >= 0; i--) if (bubbles[i].age >= bubbles[i].life) bubbles.splice(i, 1);

  for (const rb of robots) {
    rb.cd = Math.max(0, rb.cd - dt);
    rb.wander -= dt;
    if (rb.wander <= 0) {                                    // every few seconds: drift to a new heading, or hover for a moment
      rb.wander = rand(3, 7);
      if (Math.random() < 0.28) rb.hover = rand(1.2, 2.6); else rb.target = rb.target + rand(-0.9, 0.9);
    }
    const diff = angDiff(rb.ang, rb.target);
    const want = rb.hover > 0 ? 0 : rb.cruise * clamp(1 - Math.abs(diff) / 1.3, 0.12, 1);   // slows down while it swings round
    if (rb.hover > 0) rb.hover -= dt;
    rb.speed += (want - rb.speed) * Math.min(1, dt * 1.6);
    rb.ang += clamp(diff, -rb.turnRate * dt, rb.turnRate * dt);
    rb.thrust = clamp(rb.speed / rb.cruise + Math.abs(diff) * 0.25, 0, 1);
    rb.prop += dt * (4 + 26 * rb.thrust);

    const vx = Math.cos(rb.ang), vy = Math.sin(rb.ang);
    let nx = rb.x + vx * rb.speed * dt, ny = rb.y + vy * rb.speed * dt;
    const m = 17 * rb.scale + ROBOT.wallPad;
    const minX = R.x + m, maxX = R.x + R.w - m, minY = R.y + m, maxY = R.y + R.h - m;
    let hx = 0, hy = 0;                                      // -1 / +1 = which wall was touched
    if (nx < minX) { nx = minX; hx = 1; } else if (nx > maxX) { nx = maxX; hx = -1; }
    if (ny < minY) { ny = minY; hy = 1; } else if (ny > maxY) { ny = maxY; hy = -1; }
    if ((hx || hy) && rb.cd <= 0) {                          // reached a wall: bounce
      let bx = hx ? -vx : vx, by = hy ? -vy : vy;            // mirror the heading off the wall...
      const j = rand(-0.45, 0.45), c = Math.cos(j), s = Math.sin(j);
      [bx, by] = [bx * c - by * s, bx * s + by * c];         // ...and tilt it a little, so it never retraces its path
      if (hx) bx = hx * Math.max(Math.abs(bx), 0.35);        // make sure it really points away from the wall
      if (hy) by = hy * Math.max(Math.abs(by), 0.35);
      rb.target = Math.atan2(by, bx); rb.hover = 0; rb.wander = rand(3, 6); rb.cd = 1.2;
      rb.speed *= 0.35;
      addRing(nx + (hx ? -hx * 6 : 0), ny + (hy ? -hy * 6 : 0), 30 * rb.scale + 6, 0.55, 2.6);   // a bigger splash where it touched
    }
    rb.x = nx; rb.y = ny;

    rb.ringT -= dt;                                          // a small ring of ripples every so often while it moves
    if (rb.ringT <= 0 && rb.speed > 3) { rb.ringT = rand(0.7, 1.2); addRing(rb.x - vx * 8 * rb.scale, rb.y - vy * 8 * rb.scale, 20 * rb.scale + 4, 0.28); }
    rb.bubT -= dt;                                           // bubbles from the thrusters
    if (rb.bubT <= 0 && rb.thrust > 0.35 && bubbles.length < 36) {
      rb.bubT = rand(0.18, 0.4);
      bubbles.push({ x: rb.x - vx * 13 * rb.scale + rand(-4, 4), y: rb.y - vy * 13 * rb.scale + rand(-4, 4), vx: rand(-3, 3), vy: rand(-3, 3), age: 0, life: rand(0.9, 1.6), r: rand(1, 1.9) });
    }
  }
  // keep the two apart: if they come close, both steer away from each other
  const [a, b] = robots;
  if (b) {
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (d < 46 && a.cd <= 0.3 && b.cd <= 0.3) {
      const away = Math.atan2(dy, dx);
      steerAway(b, away); steerAway(a, away + Math.PI); a.cd = b.cd = 1.5;
    }
  }
}

const PAL = {
  grey:   { hull: '#6f7a82', hullHi: '#929ea6', hullLo: '#4a5359', frame: '#2a2e32', frameHi: '#4c555b', thr: '#15181b', ring: '#b9953f', latch: '#d5352d', latchHi: '#ff7a6c' },
  orange: { hull: '#ff7a00', hullHi: '#ffc44d', hullLo: '#b34700', frame: '#25282b', frameHi: '#454c52', thr: '#14171a', ring: '#f2f6f8', latch: '#f4f6f7', latchHi: '#ffffff' },
};

function drawRobot(ctx, rb, time) {
  const P = PAL[rb.kind], k = rb.scale, bob = Math.sin(time * 1.6 + rb.ph);
  ctx.save();
  ctx.translate(rb.x, rb.y);
  // shadow on the pool floor (offset, so the robot looks like it hovers above it)
  ctx.save(); ctx.rotate(rb.ang); ctx.fillStyle = 'rgba(0,25,25,0.30)'; ctx.beginPath(); ctx.ellipse(3, 5, 17 * k, 11 * k, 0, 0, TAU); ctx.fill(); ctx.restore();
  ctx.rotate(rb.ang + Math.sin(time * 1.1 + rb.ph) * 0.03);   // a tiny sway, like it is being nudged by the water
  const s = k * (1 + bob * 0.025);
  ctx.scale(s, s); ctx.translate(0, bob * 0.5);

  // light cone from the front lights (additive, so it glows a little)
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const cone = ctx.createRadialGradient(14, 0, 2, 38, 0, 34);
  cone.addColorStop(0, 'rgba(210,255,235,0.20)'); cone.addColorStop(1, 'rgba(210,255,235,0)');
  ctx.fillStyle = cone; ctx.beginPath(); ctx.moveTo(14, -4); ctx.lineTo(46, -18); ctx.lineTo(46, 18); ctx.lineTo(14, 4); ctx.closePath(); ctx.fill();
  ctx.restore();

  // skids / frame rails
  ctx.fillStyle = P.frame; ctx.fillRect(-16, -13, 31, 3.2); ctx.fillRect(-16, 9.8, 31, 3.2); ctx.fillRect(-16, -13, 3, 26); ctx.fillRect(12, -13, 3, 26);
  ctx.fillStyle = P.frameHi; ctx.fillRect(-16, -13, 31, 1); ctx.fillRect(-16, 9.8, 31, 1);
  // corner thrusters (angled pods)
  ctx.fillStyle = P.thr;
  for (const [x, y, a] of [[-14, -11, -0.6], [-14, 11, 0.6], [13, -11, 0.6], [13, 11, -0.6]]) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); rr(ctx, -5, -2.6, 10, 5.2, 2); ctx.fill();
    ctx.fillStyle = '#3d444a'; ctx.fillRect(3, -2, 2, 4); ctx.fillStyle = P.thr; ctx.restore();
  }
  // side thruster cages (the round props seen in the photo), with spinning blades
  for (const y of [-14, 14]) {
    ctx.fillStyle = P.thr; ctx.beginPath(); ctx.arc(-2, y, 6.2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2d3338'; ctx.beginPath(); ctx.arc(-2, y, 4.6, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(200,225,230,${0.35 + 0.45 * rb.thrust})`; ctx.lineWidth = 1.2;
    for (let j = 0; j < 3; j++) { const a = rb.prop + (j * TAU) / 3 + (y > 0 ? 1 : 0); ctx.beginPath(); ctx.moveTo(-2, y); ctx.lineTo(-2 + Math.cos(a) * 4.2, y + Math.sin(a) * 4.2); ctx.stroke(); }
    ctx.fillStyle = '#aab4ba'; ctx.beginPath(); ctx.arc(-2, y, 1.2, 0, TAU); ctx.fill();
  }
  // hull
  rr(ctx, -13, -9.5, 28, 19, 4.5); ctx.fillStyle = P.hull; ctx.fill(); ctx.lineWidth = 1.1; ctx.strokeStyle = P.hullLo; ctx.stroke();
  ctx.fillStyle = P.hullHi; rr(ctx, -11.5, -8.5, 25, 5, 2.5); ctx.fill();               // lit upper edge
  ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(-11, 5.5, 24, 3);                    // shaded lower edge
  // top hatch with a brass ring
  ctx.fillStyle = '#a3adb3'; ctx.beginPath(); ctx.arc(-2, 0, 5.6, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#c29a44'; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.fillStyle = '#7f8a91'; ctx.beginPath(); ctx.arc(-2, 0, 2.2, 0, TAU); ctx.fill();
  // red latches along both sides of the top
  ctx.fillStyle = P.latch;
  for (const x of [-10, -5, 0, 5, 10]) { ctx.fillRect(x - 1, -8.8, 2.2, 3.4); ctx.fillRect(x - 1, 5.4, 2.2, 3.4); }
  ctx.fillStyle = P.latchHi; for (const x of [-10, -5, 0, 5, 10]) { ctx.fillRect(x - 1, -8.8, 2.2, 0.8); ctx.fillRect(x - 1, 5.4, 2.2, 0.8); }
  // name patch
  ctx.fillStyle = '#2f73d6'; ctx.fillRect(4, 1.2, 6, 2.6); ctx.fillStyle = '#d7e6ff'; ctx.fillRect(5, 2, 3, 0.8);
  // front camera dome (gold ring around dark glass)
  ctx.fillStyle = P.ring; ctx.beginPath(); ctx.arc(15, 0, 5.2, 0, TAU); ctx.fill();
  ctx.fillStyle = '#0b1317'; ctx.beginPath(); ctx.arc(15, 0, 3.5, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(130,230,255,0.8)'; ctx.fillRect(14, -1.8, 1.4, 1.4);
  // front lights
  const pulse = 0.75 + 0.25 * Math.sin(time * 3 + rb.ph);
  ctx.fillStyle = `rgba(255,255,235,${pulse})`; ctx.fillRect(15, -8, 2, 2); ctx.fillRect(15, 6, 2, 2);
  ctx.restore();
}
function drawRobots(ctx, time) { for (const rb of robots) drawRobot(ctx, rb, time); }

export function drawPool(ctx, time) {
  const R = poolRect(); if (!R) return;
  if (!robots.length) initRobots(R);
  prepareVariants();
  drawPaths(ctx);                                          // the two concrete walkways, on top of the slab floor
  drawWater(ctx, time, R);
  drawLadderTop(ctx, R);                                   // the steel rails over the north rim, on top of the water and the rim tiles
}

// ================================================================ the signboard =======================================
// The board is drawn on a 100 x 64 unit grid; `s` = pixels per unit (0.42 in the world, ~5 on the reading card).
const SIGN_W = 100, SIGN_H = 64;
function ctr(ctx, text, x, y, size, s) { ctx.font = `bold ${size * s}px "Arial Narrow", Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x * s, y * s); }
function textBars(ctx, y, widths, h, s) { for (let i = 0; i < widths.length; i++) ctx.fillRect(((SIGN_W - widths[i]) / 2) * s, (y + i * (h + 2)) * s, widths[i] * s, h * s); }   // stand-in for small text at world scale

function drawSignArt(ctx, x, y, s) {                       // x, y = top-left of the board
  ctx.save(); ctx.translate(x, y);
  const detail = s >= 1.5, W = SIGN_W * s, H = SIGN_H * s;
  ctx.fillStyle = '#e9e7e2'; ctx.fillRect(-1 * s, -1 * s, W + 2 * s, H + 2 * s);        // thin grey frame
  ctx.fillStyle = '#fbfaf7'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#b3262d'; ctx.fillRect(0, 0, W, 10 * s);                              // red header
  const og = ctx.createLinearGradient(0, 10 * s, 0, 23 * s); og.addColorStop(0, '#f5c585'); og.addColorStop(1, '#e8a252');
  ctx.fillStyle = og; ctx.fillRect(0, 10 * s, W, 13 * s);                                 // orange band
  ctx.fillStyle = '#1d1b3a'; ctx.fillRect(0, 56 * s, W, 8 * s);                           // dark label strip
  if (detail) {
    ctx.fillStyle = '#fff'; ctr(ctx, 'RESTRICTED AREA', 50, 5.3, 6.2, s);
    ctx.fillStyle = '#3b2312'; ctr(ctx, 'THIS FACILITY IS FOR UNDERWATER VEHICLE', 50, 14.2, 3.7, s); ctr(ctx, 'TESTING ONLY BY THE ROBOTICS LAB', 50, 19.6, 3.7, s);
    ctx.fillStyle = '#2c2c34'; ctr(ctx, 'SWIMMING, UNAUTHORIZED ENTRY (HUMAN OR ANIMAL),', 50, 28.6, 3.0, s); ctr(ctx, 'OR ANY OTHER ACTIVITIES ARE STRICTLY PROHIBITED', 50, 33.4, 3.0, s);
    ctx.fillStyle = '#ff7b7b'; ctr(ctx, 'NO SWIMMING', 20, 60, 3.2, s); ctr(ctx, 'NO ENTRY', 50, 60, 3.2, s); ctr(ctx, 'NO TRESPASSING', 80, 60, 3.2, s);
  } else {
    ctx.fillStyle = '#fff'; ctx.fillRect(22 * s, 3.2 * s, 56 * s, 3.4 * s);
    ctx.fillStyle = '#4a3320'; textBars(ctx, 12.5, [72, 56], 3, s);
    ctx.fillStyle = '#4a4a55'; textBars(ctx, 27, [84, 78], 2.4, s);
    ctx.fillStyle = '#ff7b7b'; for (const cx of [20, 50, 80]) ctx.fillRect((cx - 8) * s, 59 * s, 16 * s, 2 * s);
  }
  // the three pictograms
  const ring = (cx, cy, r, slash) => {
    ctx.strokeStyle = '#c92b33'; ctx.lineWidth = Math.max(1, 1.8 * s); ctx.beginPath(); ctx.arc(cx * s, cy * s, r * s, 0, TAU); ctx.stroke();
    if (slash) { ctx.beginPath(); ctx.moveTo((cx - r * 0.7) * s, (cy - r * 0.7) * s); ctx.lineTo((cx + r * 0.7) * s, (cy + r * 0.7) * s); ctx.stroke(); }
  };
  ctx.fillStyle = '#26262e'; ctx.strokeStyle = '#26262e';
  // swimmer
  ring(20, 47, 8, true);
  ctx.beginPath(); ctx.arc(22.6 * s, 43.6 * s, 1.5 * s, 0, TAU); ctx.fill();
  ctx.lineWidth = Math.max(1, 1.5 * s); ctx.beginPath(); ctx.moveTo(15.5 * s, 49.6 * s); ctx.quadraticCurveTo(19 * s, 45.5 * s, 24.5 * s, 47.4 * s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(15 * s, 51.6 * s); ctx.quadraticCurveTo(18 * s, 50 * s, 20 * s, 51.6 * s); ctx.quadraticCurveTo(22 * s, 53 * s, 25 * s, 51.4 * s); ctx.stroke();
  // person + dog
  ring(50, 47, 8, true);
  ctx.fillStyle = '#26262e'; ctx.beginPath(); ctx.arc(46.8 * s, 42.8 * s, 1.5 * s, 0, TAU); ctx.fill();
  ctx.fillRect(45.6 * s, 44.6 * s, 2.5 * s, 5 * s); ctx.fillRect(45.4 * s, 49.4 * s, 1.2 * s, 3.6 * s); ctx.fillRect(47.3 * s, 49.4 * s, 1.2 * s, 3.6 * s);
  ctx.fillRect(49.6 * s, 49 * s, 5.8 * s, 2 * s); ctx.fillRect(49.6 * s, 50.6 * s, 1 * s, 2.4 * s); ctx.fillRect(54.2 * s, 50.6 * s, 1 * s, 2.4 * s); ctx.fillRect(54.8 * s, 47.8 * s, 2 * s, 2 * s);
  // warning triangle
  ctx.fillStyle = '#f1b51f'; ctx.strokeStyle = '#26262e'; ctx.lineWidth = Math.max(1, 1.2 * s);
  ctx.beginPath(); ctx.moveTo(80 * s, 39 * s); ctx.lineTo(89 * s, 54.5 * s); ctx.lineTo(71 * s, 54.5 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#26262e'; ctx.fillRect(79.2 * s, 44 * s, 1.6 * s, 5.4 * s); ctx.fillRect(79.2 * s, 50.6 * s, 1.6 * s, 1.6 * s);
  ctx.restore();
}

const SIGN_SCALE = 0.42;                                    // world size of the board: 42 x 27 px before it is turned
const SIGN_YAW = 0.80;                                     // how much the board is squeezed sideways (1 = facing the camera, smaller = turned more)
const SIGN_TILT = -0.20;                                   // slope of its top edge: negative = right end higher = turned ANTICLOCKWISE (towards the pool)
function signPos() {                                        // cx = middle of the board, base = y of its feet
  const { tx, ty } = POOL_PROPS.sign;
  return { cx: tx * TILE + TILE / 2, base: ty * TILE + 28 };
}
// The board stays HORIZONTAL (landscape, like in your photo) but is turned a little anticlockwise, so it looks angled towards the pool.
function drawSignWorld(ctx) {
  const { cx, base } = signPos(), S = SIGN_SCALE, W = SIGN_W * S, H = SIGN_H * S;
  const w = W * SIGN_YAW, rise = Math.abs(SIGN_TILT) * W;      // on-screen width, and how much higher the right end is than the left
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(cx, base - rise / 2 - 1, w / 2 + 2, rise / 2 + 3, SIGN_TILT * 0.6, 0, TAU); ctx.fill();   // shadow on the floor
  ctx.fillStyle = '#33343b';                                // feet of the A-frame
  ctx.fillRect(Math.round(cx - w / 2 + 2), Math.round(base - 3), 4, 3); ctx.fillRect(Math.round(cx + w / 2 - 6), Math.round(base - rise - 3), 4, 3);
  ctx.save();
  ctx.translate(Math.round(cx - w / 2), Math.round(base - 3 - H));       // top-left corner of the board (left end = the low end)
  ctx.transform(SIGN_YAW, SIGN_TILT, 0, 1, 0, 0);                       // squeeze + tilt: x -> right and UP
  ctx.fillStyle = '#9a9aa2'; ctx.fillRect(-1, -3, W + 2, 3);            // top of the frame (the back leaf)
  drawSignArt(ctx, 0, 0, S);
  ctx.restore();
}

// ================================================================ the operators =======================================
// Two lab members who stand beside the pool and steer the robots with a remote control. They are recoloured copies of the existing
// student sprites (see VARIANTS in sprites.js). Their remote is drawn here, over the sprite.
const OPS = POOL_PROPS.operators.map((o, i) => ({
  ...o, name: ['Rafi', 'Nabila'][i], variant: [2, 4][i], talk: 0, talking: false,
  cx: o.tx * TILE + TILE / 2, footY: o.ty * TILE + 26,
}));
const OP_LINES = [
  [
    ["Careful, that's not a swimming pool! It's the Robotics Lab's test tank.", "We run our underwater vehicles in there. The little orange one is autonomous: it turns by itself when it senses a wall.", "The water stays crystal clear so the cameras can see. Please don't throw anything in."],
    ["Still watching the robots? Good. Nobody gets in the water except them."],
  ],
  [
    ["Shh... I'm trying to steer the big grey one without bumping the wall again.", "That's the third bump today. The wall started it.", "If it floats off to a corner, don't worry. It always finds its way back."],
    ["Battery's at sixty percent. Perfect. Another ten minutes of testing."],
  ],
];

function drawRemote(ctx, op, time) {
  // The operator is drawn in the 'hands held up at the chest' pose (see drawStudentPose in sprites.js). The remote is drawn right over those
  // hands, so it looks held at chest height, and no extra hands or arms are drawn here.
  const { cx, footY } = op, face = op.facing, blink = Math.sin(time * 5 + op.cx) > 0.2;
  const sx = Math.sin(time * 1.3 + op.cx) * 0.7, sy = Math.cos(time * 1.1 + op.cx) * 0.7;          // the thumbs nudge the sticks
  const body = '#2b3036', hi = '#5a626b', y = footY - 16;                  // chest height: right over the hands of the pose
  const w = (face === 'down') ? 16 : 12;
  const x = (face === 'down') ? cx - 8 : face === 'left' ? cx - 10 : cx - 2;
  ctx.save();
  const ax = (face === 'left') ? x + 2 : x + w - 2, dx = (face === 'left') ? -3 : 3;                          // antenna: a thick angled rod with a red tip
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#0d0f11'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ax, y + 1); ctx.lineTo(ax + dx, y - 10); ctx.stroke();
  ctx.strokeStyle = '#d3d8dc'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(ax, y + 1); ctx.lineTo(ax + dx, y - 10); ctx.stroke();
  ctx.fillStyle = '#e24b3f'; ctx.fillRect(Math.round(ax + dx - 1), y - 12, 2, 3);
  ctx.fillStyle = '#4a5158'; ctx.fillRect(ax - 1, y - 1, 3, 2);                                                  // the antenna's base
  rr(ctx, x, y, w, 8, 2); ctx.fillStyle = body; ctx.fill(); ctx.strokeStyle = '#0d0f11'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = hi; ctx.fillRect(x + 2, y + 1, w - 4, 1);
  ctx.fillStyle = '#7fd4ff'; ctx.fillRect(x + Math.floor(w / 2) - 2, y + 2, 4, 3);                // little screen
  ctx.fillStyle = '#e8ecef'; ctx.fillRect(Math.round(x + 1.5 + sx), Math.round(y + 3 + sy), 2, 2); ctx.fillRect(Math.round(x + w - 3.5 - sx), Math.round(y + 3 - sy), 2, 2);   // two sticks
  ctx.fillStyle = blink ? '#5fe07a' : '#1d5a2a'; ctx.fillRect(x + Math.floor(w / 2) - 1, y + 6, 2, 1);   // status LED
  ctx.restore();
}
function drawRemoteBack(ctx, op, time) {                   // seen from behind: the remote is hidden by the body, only the antenna and its edges stick out
  const { cx, footY } = op, blink = Math.sin(time * 5 + op.cx) > 0.2;
  ctx.fillStyle = '#9aa0a6'; ctx.fillRect(cx + 6, footY - 27, 1, 12); ctx.fillStyle = '#e24b3f'; ctx.fillRect(cx + 6, footY - 28, 1, 2);
  ctx.fillStyle = '#2b3036'; ctx.fillRect(cx - 9, footY - 14, 3, 5); ctx.fillRect(cx + 6, footY - 14, 3, 5);
  ctx.fillStyle = blink ? '#5fe07a' : '#1d5a2a'; ctx.fillRect(cx + 7, footY - 13, 1, 1);
}
function drawOperator(ctx, op, time) {
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(op.cx, op.footY - 1, 9, 3, 0, 0, TAU); ctx.fill();
  if (op.facing === 'up') {                                                      // seen from behind: the remote is mostly hidden by the body
    drawStudent(ctx, op.variant, 'up', false, 0, op.cx, op.footY, 0.75);
    drawRemoteBack(ctx, op, time);
  } else {                                                                       // front / side: the "hands held up at the chest" pose, with the remote drawn right over the hands
    drawStudentPose(ctx, op.variant, op.facing, op.cx, op.footY, 0.75);
    drawRemote(ctx, op, time);
  }
}

// everything in zone 2 that has to be drawn in the same depth order as the player: [{y, draw}]
export function poolEntities(ctx, time) {
  const out = [{ y: signPos().base, draw: () => drawSignWorld(ctx) }];
  for (const op of OPS) out.push({ y: op.footY, draw: () => drawOperator(ctx, op, time) });
  return out;
}

// ================================================================ interaction =========================================
// What is the player standing next to? { kind: 'sign' } | { kind: 'op', op } | null   (sign: read it, operators: talk to them)
export function nearPoolThing(p) {
  if (zoneId !== 'zone2') return null;
  let best = null, bd = 50;
  const { cx, base } = signPos(), ds = Math.hypot(p.cx - cx, p.cy - (base - 10));
  if (ds < 54) { best = { kind: 'sign' }; bd = ds; }
  for (const op of OPS) { const d = Math.hypot(p.cx - op.cx, p.cy - (op.footY - 10)); if (d < bd) { best = { kind: 'op', op }; bd = d; } }
  return best;
}
export function talkTo(op, p, dialogue) {                   // the operator turns to you for the chat, then back to the pool
  const home = op.facing, dx = p.cx - op.cx, dy = p.cy - op.cy;
  op.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
  const list = OP_LINES[OPS.indexOf(op)], lines = list[Math.min(op.talk++, list.length - 1)];
  dialogue.start(op.name, lines, () => { op.facing = home; });
}

// ---- the reading card (press E at the sign) ------------------------------------------------------------------------
export const signView = {
  active: false, t: 0,
  open() { this.active = true; this.t = 0; },
  update(dt, input) {
    this.t += dt;
    if (this.t > 0.15 && (input.wasPressed('KeyE') || input.wasPressed('Space') || input.wasPressed('Escape'))) { this.active = false; return true; }
    return false;
  },
};
export function drawSignCard(ctx, VW, VH) {
  const a = Math.min(1, signView.t / 0.2), s = 5.0, w = SIGN_W * s, h = SIGN_H * s, x = (VW - w) / 2, y = 44;
  ctx.save(); ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(6,8,14,0.78)'; ctx.fillRect(0, 0, VW, VH);
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x + 6, y + 8, w, h);                    // drop shadow
  drawSignArt(ctx, x, y, s);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.font = '14px monospace'; ctx.fillStyle = '#ffd54f'; ctx.fillText('Robotics Lab test pool - no public access', VW / 2, y + h + 38);
  ctx.font = '12px monospace'; ctx.fillStyle = '#9a9aa6'; ctx.fillText('[E] Close', VW / 2, VH - 24);
  ctx.restore();
  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}
export const SIGN_AFTER = ["So it isn't a swimming pool at all. It's a test tank for the Robotics Lab's underwater robots.", "Better keep out of the water, and leave the robots to their work."];

// ================================================================ the steel ladder: the ONLY way in (and out) ==========
// Stand on the deck at the north-east corner of the pool, by the ladder, and press E to climb down; swim about (the water tiles are walkable
// while player.swimming, see map.js `swim`); press E near the ladder again to climb out. Nothing else lets you in: the rim stays solid.
// STORY SWITCH: set poolAccess.allowed = false (e.g. until a quest step) and E at the ladder shows deniedLines instead of climbing down.
export const poolAccess = {
  allowed: true,
  deniedLines: ["This ladder leads down into the Robotics Lab's test tank.", "Better not go in right now."],
};
// 'in' = on the deck beside the ladder (can climb down) | 'out' = in the water near the ladder (can climb out) | null
export function nearLadder(p) {
  if (zoneId !== 'zone2') return null;
  const R = poolRect(); if (!R) return null;
  if (Math.abs(p.cx - ladderX(R)) > 26) return null;
  if (p.swimming) return p.cy < R.y + 48 ? 'out' : null;
  return p.cy > R.y - 70 && p.cy < R.y - 12 ? 'in' : null;
}
const ease = (k) => k * k * (3 - 2 * k);
const placeCentre = (p, cx, cy) => { p.x = cx - p.w / 2; p.y = cy - p.h / 2; };
export const ladder = {
  active: false, dir: 'in', t: 0, pts: [], durs: [], splashed: false,
  start(dir, p) {
    const R = poolRect(), lx = ladderX(R);
    const top = { x: lx, y: R.y - 42 }, bottom = { x: lx, y: R.y + 26 }, from = { x: p.cx, y: p.cy };
    this.active = true; this.dir = dir; this.t = 0; this.splashed = false;
    if (dir === 'in') { this.pts = [from, top, bottom, bottom]; this.durs = [0.4, 1.15, 0.3]; }                         // walk to the top rung, climb down backwards, settle
    else { this.pts = [from, bottom, top, { x: lx, y: R.y - 58 }]; this.durs = [0.35, 1.15, 0.35]; swim.on = true; }    // swim to the foot, climb up, step onto the deck
    p.moving = false; p.animTime = 0;
  },
  update(dt, p) {
    const R = poolRect(); this.t += dt;
    let t = this.t, seg = 0;
    while (seg < this.durs.length - 1 && t >= this.durs[seg]) { t -= this.durs[seg]; seg++; }
    const k = Math.min(1, t / this.durs[seg]), A = this.pts[seg], B = this.pts[seg + 1], e = ease(k);
    const cx = A.x + (B.x - A.x) * e, cy = A.y + (B.y - A.y) * e;
    placeCentre(p, cx, cy);
    const climbing = seg === 1, walking = this.dir === 'in' ? seg < 2 : true;
    p.facing = climbing || (this.dir === 'out' && seg === 2) ? 'up' : (Math.abs(B.x - A.x) > Math.abs(B.y - A.y) ? (B.x < A.x ? 'left' : 'right') : (B.y < A.y ? 'up' : 'down'));
    p.moving = walking && k < 1 && (B.x !== A.x || B.y !== A.y); p.animTime = p.moving ? p.animTime + dt * (climbing ? 0.5 : 1) : 0;
    if (!this.splashed && climbing && (this.dir === 'in' ? cy + 10 > R.y : cy + 10 < R.y + 6)) {   // the feet cross the waterline
      this.splashed = true; addRing(cx, R.y + 8, 26, 0.6, 2.2); addRing(cx, R.y + 8, 14, 0.5, 1.5);
    }
    if (this.t >= this.durs.reduce((a, b) => a + b, 0)) {                                         // done
      this.active = false; p.moving = false; p.animTime = 0;
      if (this.dir === 'in') { p.swimming = true; swim.on = true; p.facing = 'down'; placeCentre(p, B.x, B.y); addRing(B.x, R.y + 26, 28, 0.45, 2.4); }
      else { p.swimming = false; swim.on = false; p.facing = 'up'; placeCentre(p, B.x, B.y); }
    }
  },
};

// How deep the player is in the water right now, in px of his body (0 = dry). Fixed to the pool edge while he climbs in or out.
export function swimDepth(p) {
  if (zoneId !== 'zone2' || !(p.swimming || ladder.active)) return 0;
  const R = poolRect(); if (!R) return 0;
  return clamp(p.y + p.h - R.y, 0, 17);
}
// Draws the player standing in the water: the body above the waterline as usual, the legs below it faint and bluish, rings round the waist.
export function drawSwimmer(ctx, p, wet, time) {
  const footY = p.y + p.h, wl = footY - wet, bob = ladder.active ? 0 : Math.round(Math.sin(time * 2.4) * 1);
  ctx.save(); ctx.beginPath(); ctx.rect(p.cx - 40, footY - 90, 80, wl - (footY - 90)); ctx.clip();
  ctx.translate(0, bob); drawCharacter(ctx, p); ctx.restore();                              // above the water
  ctx.save(); ctx.beginPath(); ctx.rect(p.cx - 40, wl, 80, 70); ctx.clip();
  ctx.globalAlpha = 0.30; ctx.translate(0, bob); drawCharacter(ctx, p); ctx.restore();       // below the water, seen through it
  ctx.save();
  ctx.fillStyle = 'rgba(70,160,225,0.55)'; ctx.beginPath(); ctx.ellipse(p.cx, wl + 1, 11, 3.6, 0, 0, TAU); ctx.fill();   // water closing round the waist (hides the cut)
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(235,255,248,0.65)'; ctx.beginPath(); ctx.ellipse(p.cx, wl + 1, 11, 3.6, 0, 0, TAU); ctx.stroke();
  const k = (time * 1.4) % 1;
  ctx.strokeStyle = `rgba(235,255,248,${0.45 * (1 - k)})`; ctx.beginPath(); ctx.ellipse(p.cx, wl + 1, 11 + k * 9, 3.6 + k * 3.2, 0, 0, TAU); ctx.stroke();   // a ring that keeps spreading out
  ctx.restore();
}