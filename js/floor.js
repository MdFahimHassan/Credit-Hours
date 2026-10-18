// floor.js - the rooftop's grey stone paving, painted ONCE per zone into an offscreen canvas.
// Modelled on the real floor photos: a perfectly regular grid of flat square slabs (one game tile each) with a
// thin, even, dark gap between them and a dark round smudge where four slabs meet. Each slab is one slightly
// different grey; a few have a faint damp patch. Everything is hashed from WORLD position, so it is
// deterministic (no flicker, no seams between tiles) and costs nothing per frame: renderer.js just
// copies a 32x32 piece of this canvas for every floor tile.
//
// Tweak the look in the PALETTE / SLAB block below.
import { TILE } from './map.js';

const SLAB = 32;                         // slab size in px = exactly one game tile, so the grid is perfectly regular
const GAP = 2;                           // width of the dark gap between slabs (px)
const PALETTE = {
  base: 134,                             // average stone brightness (0-255)
  slabVar: 6,                            // slight brightness difference from slab to slab (each slab is one even shade)
  tint: 3,                               // slight warm/cool difference from slab to slab
  gap: 62,                               // brightness of the dark gap
  blob: 66,                              // brightness of the dark round smudge where four slabs meet
  blobR: 6,                              // radius of that smudge (px)
};

// integer hash -> 0..1 (same input = same output, always)
function h(a, b, c = 0) {
  let n = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1103515245);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
// smooth value noise, feature size s px
function vnoise(x, y, s, seed) {
  const gx = x / s, gy = y / s, x0 = Math.floor(gx), y0 = Math.floor(gy);
  const fx = gx - x0, fy = gy - y0, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = h(x0, y0, seed), b = h(x0 + 1, y0, seed), c = h(x0, y0 + 1, seed), d = h(x0 + 1, y0 + 1, seed);
  return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
}
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

const slabs = new Map();                                 // per-slab shade, shared by all regions (hashed from the slab's position, so the order of painting never matters)
function paintRegion(g, X0, Y0, RW, RH) {
  const img = g.createImageData(RW, RH), d = img.data;
  function slab(sx, sy) {                                // one even shade per slab, nothing else random
    const key = sx * 4096 + sy;
    let s = slabs.get(key);
    if (!s) {
      const t = h(sx, sy, 2) - 0.5;
      s = { v: PALETTE.base + (h(sx, sy, 1) - 0.5) * PALETTE.slabVar * 2 - (h(sx, sy, 7) < 0.08 ? 8 : 0),
            r: t * PALETTE.tint * 2, b: -t * PALETTE.tint * 2,
            stain: h(sx, sy, 6) > 0.92 ? { x: 6 + h(sx, sy, 14) * 20, y: 6 + h(sx, sy, 15) * 20, r: 6 + h(sx, sy, 16) * 6 } : null };
      slabs.set(key, s);
    }
    return s;
  }
  for (let y = Y0; y < Y0 + RH; y++) {
    const sy = Math.floor(y / SLAB), ly = y - sy * SLAB;
    const uy = ly >= SLAB / 2 ? ly - SLAB : ly;          // signed distance to the nearest horizontal gap
    for (let x = X0; x < X0 + RW; x++) {
      const sx = Math.floor(x / SLAB), lx = x - sx * SLAB;
      const ux = lx >= SLAB / 2 ? lx - SLAB : lx;        // ...and to the nearest vertical gap
      const s = slab(sx, sy);
      const fine = h(x, y, 21) - 0.5;
      let v, r = 0, b = 0;
      if (lx < GAP || ly < GAP) {                        // dark gap: same width everywhere, straight lines
        v = PALETTE.gap + fine * 6;
        r = -2; b = 1;
      } else {                                           // flat stone face
        v = s.v + (vnoise(x, y, 70, 1) - 0.5) * 8 + (vnoise(x, y, 12, 2) - 0.5) * 3 + fine * 4;
        r = s.r - 2; b = s.b + 1;
        if (lx === GAP || ly === GAP) v -= 5;            // thin darker rim right next to the gap
        if (lx === SLAB - 1 || ly === SLAB - 1) v -= 4;
        if (s.stain) {                                   // faint damp patch on a few slabs
          const dd = Math.hypot(lx - s.stain.x, ly - s.stain.y);
          if (dd < s.stain.r) v -= (1 - dd / s.stain.r) * 8;
        }
      }
      // dark round smudge where four slabs meet (centre of the crossing of the two gaps)
      const dd = Math.hypot(ux + 0.5 - GAP / 2, uy + 0.5 - GAP / 2);
      if (dd < PALETTE.blobR) {
        const t = (PALETTE.blobR - dd) / PALETTE.blobR, f = t * t * (3 - 2 * t) * 0.75;   // soft falloff, like a dirty smudge
        v = v + (PALETTE.blob + fine * 5 - v) * f;
      }
      const i = ((y - Y0) * RW + (x - X0)) * 4;
      d[i] = clamp(v + r); d[i + 1] = clamp(v + r * 0.4 + 1); d[i + 2] = clamp(v + b + 2); d[i + 3] = 255;
    }
  }
  g.putImageData(img, X0, Y0);
}

// Painting the whole zone at once cost 0.5 s on a desktop (several seconds on a phone) and froze the game when a zone was entered. The canvas is now
// painted lazily in 256 px squares, only where the renderer actually asks for floor (every pixel is hashed from its WORLD position, so a square painted
// later is identical to one painted as part of a big canvas).
const CHUNK = 256;
const cache = {};

// The floor canvas for a zone. Pass the source rectangle you are about to read (sx, sy, sw, sh in px) and that part is painted first if needed;
// without a rectangle the whole canvas is painted.
export function getFloor(zoneId, cols, rows, sx = 0, sy = 0, sw = Infinity, sh = Infinity) {
  const key = zoneId + ':' + cols + 'x' + rows;
  let f = cache[key];
  if (!f) {
    const W = cols * TILE, H = rows * TILE, cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    f = cache[key] = { cv, g: cv.getContext('2d'), W, H, nx: Math.ceil(W / CHUNK), ny: Math.ceil(H / CHUNK), done: new Uint8Array(Math.ceil(W / CHUNK) * Math.ceil(H / CHUNK)) };
  }
  const cx0 = Math.max(0, Math.floor(sx / CHUNK)), cy0 = Math.max(0, Math.floor(sy / CHUNK));
  const cx1 = Math.min(f.nx - 1, Math.floor((Math.min(sx + sw, f.W) - 1) / CHUNK)), cy1 = Math.min(f.ny - 1, Math.floor((Math.min(sy + sh, f.H) - 1) / CHUNK));
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const i = cy * f.nx + cx;
    if (f.done[i]) continue;
    f.done[i] = 1;
    const x = cx * CHUNK, y = cy * CHUNK;
    paintRegion(f.g, x, y, Math.min(CHUNK, f.W - x), Math.min(CHUNK, f.H - y));
  }
  return f.cv;
}