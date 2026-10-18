// escalator.js - the escalator stairwell in zone 1 (the E / F / v tiles).
//
// Looking down the well you see:
//   - the two belts of THIS floor (top 'E' belt runs up/west towards you, bottom 'F' belt runs down/east). Their steps get
//     smaller and darker the further they go, until they vanish into the dark (a cheap perspective effect)
//   - through the gap between them, the escalator pairs of the floors BELOW: each one smaller and dimmer than the last, and
//     each one flipped left-right, so the flights zig-zag down like the real building (see the reference photo)
//
// Everything is drawn in one go by drawWell(), clipped to the well shape (a rectangle with the rounded nose of the railing).
// The same maths gives the opening cutscene its ride path: the rider emerges from the dark far end of the belt.
//
// Tweak the look with the constants below (LEVELS, F_FAR, RIDE_TIME ...).
import { TILE, grid, rows, cols } from './map.js';
import { drawStudent, VARIANT_COUNT } from './sprites.js';

// ---- where the well is (found by scanning the map, so moving the E/F tiles in zones.js just works) ----
let eRow = -1, fRow = -1, left = Infinity, right = -1;
for (let y = 0; y < rows; y++)
  for (let x = 0; x < cols; x++) {
    const c = grid[y][x];
    if (c !== 'E' && c !== 'F') continue;
    if (c === 'E') eRow = eRow < 0 ? y : Math.min(eRow, y);
    if (c === 'F') fRow = Math.max(fRow, y);
    left = Math.min(left, x); right = Math.max(right, x);
  }
if (right < 0) { eRow = 0; fRow = 0; left = 1; right = 1; }      // no escalator in the map: don't crash

export const geo = { eRow, fRow, left, right };
const X0 = left * TILE;                    // west edge of the well (where the comb plate starts)
const XE = (right + 1) * TILE;             // where the straight part ends and the rounded nose begins
const Y0 = eRow * TILE, Y1 = (fRow + 1) * TILE;
const YC = (Y0 + Y1) / 2 - 0.5;            // centre line of the well
const COMB = 8, XL = X0 + COMB;            // the belts start after the steel comb plate
const XT = XE + 60;                        // far end of the drawn belt (the dark swallows it before the clip does)
const D = XT - XL;

// ---- perspective along the belt: belt-space s (px at landing scale) -> screen x ----
const F_FAR = 0.36;                                          // step size at the far end, relative to the landing
const A = -Math.log(F_FAR) / D;
export const S_MAX = (1 / F_FAR - 1) / A;
const xOf = (s) => XL + Math.log(1 + A * s) / A;
const fOf = (s) => 1 / (1 + A * s);
const sOf = (x) => (Math.exp(A * (x - XL)) - 1) / A;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const uOf = (x) => Math.max(0, Math.min(1.15, (x - XL) / D));
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const fogK = (u) => 0.97 * smooth(0.28, 1.0, u);             // 0 = clear, ~1 = swallowed by the dark

// Edges of each belt at screen x: both belts narrow a little towards the far end (they converge on the vanishing line)
function edges(upper, x) {
  const u = uOf(x);
  return upper ? [Y0 + 10 * u, Y0 + TILE + 2 * u] : [Y1 - TILE - 2 * u, Y1 - 10 * u];
}

// ---- timing of the ride (also used by intro.js) ----
export const RIDE_TIME = 5.5;                                // seconds from the dark far end to the landing
const S_START = S_MAX * 0.93, S_END = 8;
export const SPEED = (S_START - S_END) / RIDE_TIME;          // belt speed in belt-space px / second

// Where the rider is during the ride: k runs 0 (far end, in the dark) -> 1 (landing).
// scale / alpha make him look like he is coming up out of the depths.
export function rideAt(k) {
  const s = S_START + (S_END - S_START) * k, x = xOf(s), u = uOf(x), f = fOf(s);
  return {
    cx: x,
    cy: Y0 + TILE / 2 + 6 * u,                               // centre line of the top belt at that x
    scale: 1 - 0.45 * (1 - f) / (1 - F_FAR),
    alpha: 1 - fogK(u),
  };
}

// ---- colours: [r, g, b], mixed towards the dark of the well ----
const FOG = [4, 5, 9];
const C = {
  tread: [92, 92, 102], dark: [58, 58, 67], light: [125, 125, 138], rail: [42, 42, 49], dash: [74, 74, 84],
  yellow: [224, 160, 48], plate: [143, 143, 156], teeth: [85, 85, 95], slab: [112, 108, 96], slabLine: [80, 77, 68],
};
function col(c, m) {                                        // m = how much of the dark to mix in (0..1)
  return `rgb(${Math.round(c[0] + (FOG[0] - c[0]) * m)},${Math.round(c[1] + (FOG[1] - c[1]) * m)},${Math.round(c[2] + (FOG[2] - c[2]) * m)})`;
}
// m for a colour at screen x: dim = brightness of this floor (1 = full, lower = dimmer), fog = how strongly the far-end dark applies
const mixAt = (x, dim, fog) => 1 - dim * (1 - fog * fogK(uOf(x)));

// ---- one belt (local = landing-scale coordinates; deeper floors just scale this with a canvas transform) ----
// Only the steps move. The belt body (tread, handrails, yellow lines, all fading into the dark) never changes, so it is painted ONCE per
// (belt, brightness, fog) into a small offscreen image, and the per-pixel edges / colours of the steps are worked out once too.
// (This used to rebuild ~100 slices with 5 colour strings each, 14 times per frame.)
const beltCache = new Map();
function beltData(upper, dim, fog) {
  const key = (upper ? 'u' : 'l') + '|' + dim + '|' + fog;
  let d = beltCache.get(key);
  if (d) return d;
  const h5 = 5, h2 = 2, PADY = 2;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(XT - XL) + 3; cv.height = TILE + 2 * PADY + 4;
  const g = cv.getContext('2d'), oy = Math.floor(upper ? Y0 : Y1 - TILE - 2) - PADY;
  for (let x = XL; x < XT; x += 2) {                       // belt body in thin vertical slices so the colour fades towards the far end
    const [t, b] = edges(upper, x + 1), m = mixAt(x + 1, dim, fog);
    const T = Math.round(t), B = Math.round(b), X = x - XL;
    g.fillStyle = col(C.tread, m); g.fillRect(X, T - oy, 3, B - T);
    g.fillStyle = col(C.rail, m);  g.fillRect(X, T - oy, 3, h5); g.fillRect(X, B - h5 - oy, 3, h5);          // handrails (outer edges)
    g.fillStyle = col(C.yellow, m); g.fillRect(X, T + h5 - oy, 3, h2); g.fillRect(X, B - h5 - h2 - oy, 3, h2);  // yellow safety lines
  }
  const n = Math.ceil(XT - XL) + 2, steps = new Array(n);  // per screen pixel x (relative to XL): where the step bars go, and their colours
  for (let i = 0; i < n; i++) {
    const xm = XL + i, [t, b] = edges(upper, xm), m = mixAt(xm, dim, fog), T = Math.round(t), B = Math.round(b);
    steps[i] = { i0: T + h5 + h2, i1: B - h5 - h2, T, B, dark: col(C.dark, m), light: col(C.light, m), dash: col(C.dash, m) };
  }
  return (beltCache.set(key, d = { cv, oy, steps }), d);
}
function drawBelt(g, upper, o, dim, fog) {                  // o = step phase in belt-space px (0..8)
  const { cv, oy, steps } = beltData(upper, dim, fog);
  g.drawImage(cv, XL, oy);
  // steps: dark groove + light edge every 8 belt px, squeezed by the perspective; moving handrail dashes on the rails
  for (let s = o - 8; s < S_MAX; s += 8) {
    const xa = Math.round(xOf(Math.max(0, s))), xb = Math.round(xOf(Math.max(0, s + 2))), xc = Math.round(xOf(Math.max(0, s + 4)));
    if (xa >= XT) break;
    const st = steps[Math.max(0, Math.min(steps.length - 1, xa + 1 - XL))];
    if (xb > xa) { g.fillStyle = st.dark;  g.fillRect(xa, st.i0, Math.max(1, xb - xa), st.i1 - st.i0); }
    if (xc > xb) { g.fillStyle = st.light; g.fillRect(xb, st.i0, Math.max(1, xc - xb), st.i1 - st.i0); }
    g.fillStyle = st.dash;                                                                          // handrail dash
    g.fillRect(xa, st.T + 1, Math.max(1, xc - xa), 1); g.fillRect(xa, st.B - 2, Math.max(1, xc - xa), 1);
  }
}

// steel comb plate where the steps slide under the landing floor
function drawComb(g, dim) {
  for (const upper of [true, false]) {
    const [t, b] = edges(upper, XL), q = (b - t) / TILE, m = 1 - dim;
    const T = Math.round(t + 7 * q), B = Math.round(b - 7 * q);
    g.fillStyle = col(C.plate, m); g.fillRect(X0, T, COMB, B - T);
    g.fillStyle = col(C.teeth, m); for (let y = T; y < B; y += 4) g.fillRect(X0, y, COMB - 2, 1);
  }
}

// one pair of belts + its comb plate + the landing slab it comes out of
function drawPair(g, ph, dim, fog) {                        // ph = 0..8: how far the steps have moved. The upper belt runs the other way round, so its phase is 8 - ph
  if (dim < 1) {                                            // lower floors: a strip of landing floor beside the comb plate
    const m = 1 - dim * 0.8;
    g.fillStyle = col(C.slab, m); g.fillRect(X0 - 14, Y0, 14, Y1 - Y0);
    g.fillStyle = col(C.slabLine, m); g.fillRect(X0 - 14, Y0, 14, 2); g.fillRect(X0 - 14, Y1 - 2, 14, 2); g.fillRect(X0 - 14, Y0, 2, Y1 - Y0);
  }
  drawBelt(g, true, (8 - ph) % 8, dim, fog);
  drawBelt(g, false, ph, dim, fog);
  drawComb(g, dim);
}

// ---- the floors below the gap: each is a smaller, dimmer, left-right flipped copy of the pair --------------------------
// sx / sy = how much smaller it is along / across the well (stretched along the well so you can read the belts through the gap),
// vx = where it is centred (they alternate, so the flights zig-zag down like the real building), dim = brightness, flip = mirrored.
const LEVELS = [
  { sx: 0.80, sy: 0.42, vx: 452, dim: 0.66, flip: true },
  { sx: 0.58, sy: 0.28, vx: 492, dim: 0.68, flip: false },
  { sx: 0.40, sy: 0.19, vx: 456, dim: 0.77, flip: true },
  { sx: 0.28, sy: 0.13, vx: 486, dim: 0.85, flip: false },
  { sx: 0.19, sy: 0.09, vx: 462, dim: 0.91, flip: true },
  { sx: 0.13, sy: 0.06, vx: 482, dim: 0.95, flip: false },
];

// ---- people using the escalators of the floors below (not the rooftop pair) ----------------------------------------------
// Each rider stands on a step and travels at the belt speed; when he reaches the end he steps off, and after a random pause a
// new one gets on, so there are always a few people about but never in a pattern. Fixed seed = the same crowd every visit.
function rng(seed) { let a = seed; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const RIDERS_PER_BELT = [3, 3, 2, 2];                                    // for the first floors below (deeper ones are too tiny to see people)
const RIDER_ALPHA = [0.95, 0.85, 0.75, 0.65];                           // deeper = fainter
const RIDERS = LEVELS.map((L, i) => {
  const r = rng(1234 + i * 77), list = [];
  for (const upper of [true, false])
    for (let k = 0; k < (RIDERS_PER_BELT[i] ?? 0); k++)
      list.push({ upper, s0: r() * 1000, cyc: S_MAX + 140 + r() * 320, variant: Math.floor(r() * VARIANT_COUNT) });
  return list;
});
function drawRiders(g, time, L, list, alpha) {
  for (const p of list) {
    const dir = p.upper ? -1 : 1;                                        // same direction as the steps of his belt
    const s = (((p.s0 + dir * SPEED * time) % p.cyc) + p.cyc) % p.cyc;   // position along the belt (wraps = he got off / a new one got on)
    // fade in / out at both ends of the belt instead of popping: they melt out of the dark at the far end and dissolve at the landing
    const env = smooth(8, 60, s) * (1 - smooth(S_MAX - 150, S_MAX - 10, s));
    if (env < 0.02) continue;
    const x = xOf(s), [t, b] = edges(p.upper, x), f = fOf(s);
    const sx = L.vx + (L.flip ? -1 : 1) * (x - L.vx) * L.sx;             // through the same squeeze / flip as that floor's belts
    const sy = YC + ((t + b) / 2 + 7 - YC) * L.sy;                       // feet a little below the belt's centre line
    const k = 0.9 * L.sy * (1 - 0.45 * (1 - f) / (1 - F_FAR));          // same size rule as the rider in the intro
    g.globalAlpha = alpha * env * (1 - 0.85 * fogK(uOf(x)));
    drawStudent(g, p.variant, dir * (L.flip ? -1 : 1) < 0 ? 'left' : 'right', false, 0, sx, sy, k);
  }
  g.globalAlpha = 1;
}

// The box the renderer paints the well into (the straight part + the 4-tile-wide nose). renderer.js masks it with the nose's void shape.
export const wellBox = { x: X0, y: Y0, w: (right + 4) * TILE - X0, h: Y1 - Y0 };
export const wellTiles = { x0: left, x1: right + 3, y0: eRow, y1: fRow };

// Paints the whole well (no outline: the caller masks it).
// ---- the pairs of belts as pre-painted frames ----------------------------------------------------------------------------------
// The steps repeat every 8 belt px, so a pair of belts is one of only PH_N different pictures. Each is painted once (the first time it is needed, or
// ahead of time by warmWell()) and the animation just picks the right one. Before, all 7 pairs were repainted from scratch, every frame.
const PH_N = 16;
const frames = new Map();                                   // 'top' | level index -> [PH_N canvases]
const PADL = 16;                                            // the landing slab of a lower floor sticks out west of the well (and a flipped floor mirrors it inside)
function pairFrame(key, dim, fog, time) {
  const k = Math.floor((((time * SPEED) % 8) + 8) % 8 / 8 * PH_N) % PH_N;
  let arr = frames.get(key);
  if (!arr) frames.set(key, arr = new Array(PH_N));
  if (!arr[k]) {
    const c = document.createElement('canvas'); c.width = wellBox.w + PADL; c.height = wellBox.h;
    const g = c.getContext('2d'); g.translate(PADL - wellBox.x, -wellBox.y);
    drawPair(g, k * 8 / PH_N, dim, fog);
    arr[k] = c;
  }
  return arr[k];
}
export function warmWell() {                                // paints every frame of every pair (called once while the screen is black)
  for (let k = 0; k < PH_N; k++) {
    const t = k * 8 / PH_N / SPEED;
    pairFrame('top', 1, 1, t);
    LEVELS.forEach((L, i) => pairFrame(i, L.dim, 0.4, t));
  }
}

export function drawWell(g, time) {
  g.save();
  g.fillStyle = col([4, 5, 9], 0); g.fillRect(wellBox.x, wellBox.y, wellBox.w, wellBox.h);          // the deep dark
  g.beginPath(); g.rect(wellBox.x, wellBox.y, wellBox.w, wellBox.h); g.clip();                      // landing slabs of lower floors must not leak west
  for (let i = LEVELS.length - 1; i >= 0; i--) {                                                   // deepest first
    const L = LEVELS[i];
    // These floors are squashed across the well but stretched along it, so at full speed the tiny people would seem to RUN
    // (several body-heights per second). Slow the whole floor (steps + people) by sy/sx so the pace looks like a normal ride.
    const tl = time * (L.sy / L.sx);
    g.save();
    g.translate(L.vx, YC); g.scale(L.flip ? -L.sx : L.sx, L.sy); g.translate(-L.vx, -YC);
    g.drawImage(pairFrame(i, L.dim, 0.4, tl), wellBox.x - PADL, wellBox.y);
    g.restore();
    drawRiders(g, tl, L, RIDERS[i], RIDER_ALPHA[i] ?? 0.5);                                        // people on that floor (hidden where the floor above covers them)
  }
  g.drawImage(pairFrame('top', 1, 1, time), wellBox.x - PADL, wellBox.y);                                                                          // this floor, on top
  g.restore();
}