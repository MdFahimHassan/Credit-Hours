// canopy.js - natural-looking bush mounds and tree crowns, built from hundreds of small leaves instead of round blobs.
// Everything is deterministic (hash of world position) so the picture is identical every run and neighbouring tiles line up.
import { TILE } from './map.js';
import { density } from './foliage.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
function hash(a, b, c = 0) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul((c * 7919) | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const hex = (n) => Math.round(n).toString(16).padStart(2, '0');
const mix = (c1, c2, t) => '#' + [1, 3, 5].map((i) => hex(parseInt(c1.slice(i, i + 2), 16) * (1 - t) + parseInt(c2.slice(i, i + 2), 16) * t)).join('');

// four tones of leaf, dark (in shadow, deep inside) -> light (sun-struck tips). Slightly yellower and calmer than the old flat greens.
const TONES = ['#1d4223', '#285c2e', '#34763a', '#478f43', '#62a851', '#86c264'];
const toneAt = (t) => { t = clamp01(t) * (TONES.length - 1); const i = Math.min(TONES.length - 2, Math.floor(t)); return mix(TONES[i], TONES[i + 1], t - i); };

// one small leaf: a pointed oval, slightly curved, with a darker underside edge - 3-6 px
function leaf(g, x, y, len, rot, col) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.fillStyle = col; g.beginPath(); g.moveTo(-len * 0.5, 0);
  g.quadraticCurveTo(0, -len * 0.42, len * 0.5, 0); g.quadraticCurveTo(0, len * 0.38, -len * 0.5, 0); g.fill();
  g.restore();
}

// ---------------------------------------------------------------------------------------------
// leaf mass for any hedge / bush tile: world-grid jittered leaves in three passes (shade, body, sun-lit tips), so there are no tile seams.
// lift = 0 for a plain clipped hedge, ~0.12 for a bush mound (a little lighter and fluffier, like it sits proud of the hedge)
// ---------------------------------------------------------------------------------------------
export function paintLeafMass(g, px, py, lift = 0) {
  const passes = [{ cell: 7, len: [6, 9], tone: [0.0, 0.32], seed: 11, keep: 1 },     // deep shade layer
                  { cell: 5, len: [5, 8], tone: [0.28, 0.62], seed: 23, keep: 1 },    // body of the foliage
                  { cell: 6, len: [4, 6.5], tone: [0.55, 0.95], seed: 37, keep: 0.62 }];   // sun-lit tips
  for (const P of passes) {
    const g0x = Math.floor((px - 8) / P.cell), g1x = Math.floor((px + TILE + 8) / P.cell);
    const g0y = Math.floor((py - 8) / P.cell), g1y = Math.floor((py + TILE + 8) / P.cell);
    for (let gy = g0y; gy <= g1y; gy++) for (let gx = g0x; gx <= g1x; gx++) {
      if (hash(gx, gy, P.seed + 1) > P.keep) continue;
      const x = gx * P.cell + P.cell / 2 + (hash(gx, gy, P.seed + 2) - 0.5) * P.cell * 1.1;
      const y = gy * P.cell + P.cell / 2 + (hash(gx, gy, P.seed + 3) - 0.5) * P.cell * 1.1;
      const patch = vnoise(x / 22, y / 22, 5);                               // big soft light / shade patches (not round)
      let t = P.tone[0] + (P.tone[1] - P.tone[0]) * (0.25 + 0.5 * hash(gx, gy, P.seed + 4) + 0.5 * (patch - 0.5)) + lift;
      t += (density(x, y) - 0.5) * 0.08;                                     // follow the dense / sparse look of the beds
      leaf(g, x, y, P.len[0] + (P.len[1] - P.len[0]) * hash(gx, gy, P.seed + 5), hash(gx, gy, P.seed + 6) * Math.PI * 2, toneAt(t));
    }
  }
}

// base colour under a hedge / bush tile (used to fill the tile before the leaves go on)
export const massBase = '#173d1e';

// ---------------------------------------------------------------------------------------------
// a tree crown seen from above, drawn onto its own small canvas (cached by the caller): ragged outline, branch glimpses, 3 layers of leaves,
// sun from the top left. size = canvas side, r = crown radius.
// ---------------------------------------------------------------------------------------------
export function makeCrown(seed, r) {
  const S = Math.ceil(r * 2 + 12), C = S / 2;
  const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const g = cv.getContext('2d');
  const edge = (a) => r * (0.70 + 0.32 * vnoise(Math.cos(a) * 2.4 + 5, Math.sin(a) * 2.4 + 5, seed) + 0.07 * Math.sin(a * 5 + seed));   // lumpy, never a circle
  // soft ground shadow (offset down-right)
  g.fillStyle = 'rgba(0,0,0,0.22)';
  for (let i = 0; i < 70; i++) {
    const a = hash(i, seed, 1) * 6.283, d = Math.sqrt(hash(i, seed, 2)) * edge(a) * 0.95;
    leaf(g, C + 3 + Math.cos(a) * d, C + 4 + Math.sin(a) * d, 8, hash(i, seed, 3) * 6.28, 'rgba(0,0,0,0.20)');
  }
  const layers = [{ n: 150, len: [7, 10], rad: 1.0, lo: 0.0, hi: 0.3 },                // underside / shade
                  { n: 190, len: [5.5, 8.5], rad: 0.95, lo: 0.25, hi: 0.6 },          // body
                  { n: 110, len: [4.5, 7], rad: 0.78, lo: 0.5, hi: 0.95 }];           // sunlit upper crown, pulled toward the light
  layers.forEach((L, li) => {
    for (let i = 0; i < L.n; i++) {
      const a = hash(i, seed, 10 + li) * 6.283, rr = Math.pow(hash(i, seed, 20 + li), li === 0 ? 0.5 : 0.62) * edge(a) * L.rad;
      let x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (li === 2) { x -= r * 0.14; y -= r * 0.16; }                                 // lit side = top left
      const lit = clamp01(0.5 - (x + y) / (r * 2.2));                                // 1 toward the sun, 0 away from it
      const t = L.lo + (L.hi - L.lo) * clamp01(0.35 * hash(i, seed, 30 + li) + 0.65 * lit + 0.12 * (vnoise((x + C) / 7, (y + C) / 7, seed + 3) - 0.5));
      leaf(g, C + x, C + y, L.len[0] + (L.len[1] - L.len[0]) * hash(i, seed, 40 + li), hash(i, seed, 50 + li) * 6.283, toneAt(t));
    }
    if (li === 0) {                                                                  // a few dark branch glimpses through the shade layer
      g.strokeStyle = '#3a2d22'; g.lineWidth = 1.3; g.lineCap = 'round';
      for (let b = 0; b < 5; b++) { const a = hash(b, seed, 60) * 6.283; g.beginPath(); g.moveTo(C, C); g.lineTo(C + Math.cos(a) * r * 0.55, C + Math.sin(a) * r * 0.55); g.stroke(); }
    }
  });
  return { cv, S };
}
const crowns = {};
export function drawCrown(g, cx, cy, tx, ty, r) {                                    // cx, cy = world centre of the crown
  const k = tx + ',' + ty + ',' + r;
  if (!crowns[k]) crowns[k] = makeCrown(tx * 31 + ty * 17 + 5, r);
  const c = crowns[k]; g.drawImage(c.cv, Math.round(cx - c.S / 2), Math.round(cy - c.S / 2));
}