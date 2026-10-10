// skyline.js - the city you can see beyond the rooftop rails ('R' tiles on the edge of a zone).
//
// HOW IT WORKS
//   * Each edge of a zone (north / east / south / west) that has rails gets its own PANORAMA: a long, thin picture of
//     the city, painted once (cached). In the picture, x = along the edge, y = distance away from the building.
//     Near the rail you look down on low roofs, trees and a street; further out are mid-rise blocks, a few landmarks,
//     then hazy far towers, and at the very end the sky.
//   * The closer the player gets to a rail, the more of that view the camera reveals past the edge of the map
//     ("over" = pixels revealed). The same picture is squashed into whatever space is revealed, so far away you see
//     a thin, hazy sliver of skyline and when you touch the rail it opens up to the full, clear view.
//   * [E] at a rail = lean out: the camera pushes a bit further and the view is at its clearest.
//
// TWEAK ME (all the numbers are in this block)
const EXT = 300;            // height (px) of a panorama = the biggest view it can show
const LIP = 24;             // width (px) of the rail band at the edge of the last tile (see renderer.js drawRail)
const OVER_MAX = 230;       // px revealed when touching a rail
const LEAN_EXTRA = 60;      // extra px revealed while leaning out
const LEAN_PUSH = 60;       // how far the camera is pushed toward the rail while leaning
const NEAR = 3 * 32;        // the view starts to appear when you are closer than this (3 tiles)
const HAZE_FAR = 0.58;      // haze strength when you are far from the rail (0-1)
const HAZE_NEAR = 0.10;     // haze strength when touching the rail

import { TILE, getTile, getExit, zoneId, cols, rows, widthPx, heightPx } from './map.js';
import { vineStrands, drawVines, drawVineLip } from './foliage.js';

const SIDES = ['n', 'e', 's', 'w'];
const FACE = { n: 'up', e: 'right', s: 'down', w: 'left' };
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------------------------------------
// Which rails are on the edges of this zone (cached per zone)
// ---------------------------------------------------------------------------------------------
let railZone = null, railList = null;
function rails() {
  if (railZone !== zoneId) {
    railZone = zoneId;
    railList = { n: [], e: [], s: [], w: [] };
    for (let x = 0; x < cols; x++) {
      if (getTile(x, 0) === 'R') railList.n.push(x);
      if (getTile(x, rows - 1) === 'R') railList.s.push(x);
    }
    for (let y = 0; y < rows; y++) {
      if (getTile(0, y) === 'R') railList.w.push(y);
      if (getTile(cols - 1, y) === 'R') railList.e.push(y);
    }
  }
  return railList;
}

// distance (px) from the player's hitbox to the nearest edge rail on one side
function railDist(side, p, list) {
  let perp, lc;
  if (side === 'e') { perp = (cols - 1) * TILE - (p.x + p.w); lc = p.cy; }
  else if (side === 'w') { perp = p.x - TILE; lc = p.cy; }
  else if (side === 'n') { perp = p.y - TILE; lc = p.cx; }
  else { perp = (rows - 1) * TILE - (p.y + p.h); lc = p.cx; }
  perp = Math.max(0, perp);
  let best = Infinity;
  for (const i of list) {
    const lat = Math.max(0, Math.abs(lc - (i * TILE + TILE / 2)) - TILE / 2);
    best = Math.min(best, Math.hypot(perp, lat));
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// State: how much of the view is revealed on each side, and the lean-out
// ---------------------------------------------------------------------------------------------
export const skyline = {
  over: { n: 0, e: 0, s: 0, w: 0 },     // px of view revealed past each edge (the camera uses this)
  close: { n: 0, e: 0, s: 0, w: 0 },    // smoothed 0..1 closeness to the rail on each side
  lean: 0,                              // 0..1 how far we are leaning out
  leaning: false, leanSide: null, leanTime: 0,
  touch: null,                          // side whose rail the player is touching right now (or null)
  _zone: null,

  // forget everything when the zone changes
  sync() {
    if (this._zone === zoneId) return;
    this._zone = zoneId;
    for (const s of SIDES) { this.over[s] = 0; this.close[s] = 0; }
    this.lean = 0; this.leaning = false; this.leanSide = null; this.leanTime = 0; this.touch = null;
  },

  update(dt, p) {
    this.sync();
    const r = rails();
    this.touch = null;
    let best = Infinity;
    for (const s of SIDES) {
      const d = r[s].length ? railDist(s, p, r[s]) : Infinity;
      let target = clamp01(1 - d / NEAR);
      if (this.leaning && s === this.leanSide) target = 1;
      this.close[s] += (target - this.close[s]) * Math.min(1, dt * 5);
      if (d < NEAR * 1.8) { panorama(s); wallPanorama(s); }   // paint them a little early so there is no hitch
      if (d <= 10 && d < best) { best = d; this.touch = s; }
    }
    this.lean += ((this.leaning ? 1 : 0) - this.lean) * Math.min(1, dt * 7);
    if (!this.leaning && this.lean < 0.01) { this.lean = 0; this.leanSide = null; }
    if (this.leaning) this.leanTime += dt;
    for (const s of SIDES) {
      const c = this.close[s];
      let o = c > 0.001 ? OVER_MAX * smooth(c) + 18 * Math.min(1, c * 8) : 0;
      if (s === this.leanSide) o += LEAN_EXTRA * this.lean;
      this.over[s] = Math.min(o, EXT);                 // never more than the panorama holds
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
// Little helpers: seeded random, colours
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

// ---------------------------------------------------------------------------------------------
// One composition per side. Same city, four different views.
//   e = the view from your photos (white high-rise, mesh building, mast, blue building, busy road)
//   n = tall hazy towers far off, a river on the horizon, a temple gate
//   s = a dense sea of low blocks, big trees, a highway
//   w = golden hour: the sun glow, dark silhouettes against it
// ---------------------------------------------------------------------------------------------
const COMP = {
  e: { haze: '#cdc6b8', glow: '#efd3a0', skyTop: '#9db0c6', warm: 0.10, sil: 0,    silCol: '#5a5560', lit: 0.05, tall: 0.10, road: { d: 44, h: 10, speed: 14, cars: 1.0 }, river: false, sun: false },
  n: { haze: '#c4c9ca', glow: '#e9d8b8', skyTop: '#a4b7cb', warm: 0.07, sil: 0,    silCol: '#5a5560', lit: 0.04, tall: 0.30, road: null,                                  river: true,  sun: false },
  s: { haze: '#cfc4b0', glow: '#f0cf94', skyTop: '#9fb0c0', warm: 0.12, sil: 0,    silCol: '#5a5560', lit: 0.06, tall: 0.08, road: { d: 50, h: 15, speed: 22, cars: 1.6 }, river: false, sun: false },
  w: { haze: '#e0c597', glow: '#f8d088', skyTop: '#7f93ad', warm: 0.22, sil: 0.42, silCol: '#4b4658', lit: 0.22, tall: 0.22, road: null,                                  river: false, sun: true },
};

const FACADES = ['#cdbfa3', '#e1d8c4', '#a8654a', '#8a6e58', '#a7a39b', '#e8e6df', '#9db4c6', '#cdbfa3', '#b8a88c', '#a8654a', '#c98f86', '#d9b74a', '#7fa07a'];
const ROOFS = ['#8f8577', '#a2634a', '#6f8290', '#b7ab97', '#7d7468', '#9aa3a8', '#b4786a', '#a39a86'];

// ---- one ordinary building seen from the rail: facade + sunlit roof edge + windows + rooftop clutter ----
function building(g, rnd, u, base, w, h, col, o) {
  const dark = mix(col, '#1a1a22', 0.22), light = mix(col, '#ffffff', 0.32);
  R(g, u, base, w, h, col);
  R(g, u + w * 0.72, base, w * 0.28, h, dark);               // shaded side
  R(g, u, base + h, w, 3, light);                            // roof top
  R(g, u, base, w, 1.5, mix(col, '#1a1a22', 0.35));          // where it meets the ground
  if (o.win && w >= 10 && h >= 14) {
    const cw = 4, ch = 5, nx = Math.floor((w - 2) / cw), ny = Math.floor((h - 4) / ch);
    const glass = mix(col, '#26333f', 0.45);
    for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
      if (rnd() < 0.2) continue;
      R(g, u + 2 + ix * cw, base + 3 + iy * ch, cw - 2, ch - 2.5, rnd() < o.lit ? '#f5cd7a' : glass);
    }
  }
  if (rnd() < 0.45) {                                         // water tank / stair head / antenna
    const x = u + 1 + rnd() * Math.max(1, w - 6), k = rnd();
    if (k < 0.45) R(g, x, base + h + 3, 4, 4, mix(col, '#2a2a30', 0.45));
    else if (k < 0.8) R(g, x, base + h + 3, 5, 3, mix(col, '#ffffff', 0.15));
    else R(g, x, base + h + 3, 1, 8, '#5b5b60');
  }
}

// a row of buildings along the whole edge
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

// ---- landmarks (all from your photos; the billboard has NO real logo) ----
function whiteTower(g, rnd, u, base, w, h, hz) {
  const col = mix('#e6e2d6', hz, 0.08);
  R(g, u, base, w, h, col);
  R(g, u + w * 0.76, base, w * 0.24, h, mix(col, '#222222', 0.16));
  for (let iy = 0; iy < Math.floor((h - 8) / 7); iy++) for (let ix = 0; ix < Math.floor((w - 4) / 6); ix++) {
    R(g, u + 3 + ix * 6, base + 4 + iy * 7, 3, 4, '#4a525a');
    R(g, u + 2 + ix * 6, base + 8 + iy * 7, 5, 1, '#b8b4a6');                 // balcony
  }
  R(g, u - 1, base + h, w + 2, 4, '#f4f1e8');
  R(g, u + 4, base + h + 4, w - 10, 6, '#cfcabb'); R(g, u + 7, base + h + 10, 6, 4, '#a9a595');
  const sw = 14;                                                              // dark glass slab next to it
  R(g, u + w, base, sw, h - 10, mix('#2a3550', hz, 0.1));
  for (let k = 0; k < 3; k++) R(g, u + w + 3 + k * 4, base, 1, h - 10, '#6b7b96');
  R(g, u + w - 1, base + h - 10, sw + 1, 3, '#d8d4c6');
}
function mast(g, u, base, h) {
  g.lineWidth = 1;
  const half = (y) => 1.5 + 6 * (1 - y / h);
  for (let y = 0; y < h; y += 10) {
    const y1 = Math.min(h, y + 10), seg = Math.floor(y / 20) % 2 ? '#e9e6de' : '#c9473e';
    R(g, u - half(y), base + y, 1.5, 10, seg); R(g, u + half(y) - 1, base + y, 1.5, 10, seg);
    g.strokeStyle = '#cfc9c0'; g.beginPath();
    g.moveTo(u - half(y), base + y); g.lineTo(u + half(y1), base + y1);
    g.moveTo(u + half(y), base + y); g.lineTo(u - half(y1), base + y1); g.stroke();
  }
  R(g, u - 4, base + h, 8, 2, '#9a958c');
}
function meshBuilding(g, rnd, u, base, w, h, hz) {
  const col = mix('#3f8553', hz, 0.18);
  R(g, u, base, w, h - 14, col);
  R(g, u + w * 0.75, base, w * 0.25, h - 14, mix(col, '#10281a', 0.3));
  g.fillStyle = mix('#2b6140', hz, 0.1);
  for (let y = 3; y < h - 14; y += 6) g.fillRect(Math.round(u), Math.round(base + y), Math.round(w), 1);
  for (let x = 2; x < w; x += 5) g.fillRect(Math.round(u + x), Math.round(base), 1, Math.round(h - 14));
  for (let f = 0; f < 3; f++) {                                               // unfinished top floors: just columns and slabs
    R(g, u, base + h - 14 + f * 5, w, 1, '#aeb6a8');
    for (let x = 1; x < w; x += 6) R(g, u + x, base + h - 14 + f * 5, 2, 5, '#8f9a8c');
  }
  R(g, u + 4, base + h, 3, 6, '#7d7d78');
}
function blueBuilding(g, u, base, w, h, hz) {
  const col = mix('#2d86d6', hz, 0.12);
  R(g, u, base, w, h, col); R(g, u + w * 0.72, base, w * 0.28, h, mix(col, '#0a2a50', 0.28));
  for (let y = 5; y < h - 3; y += 6) { R(g, u + 2, base + y, w - 4, 2, 'rgba(255,255,255,0.55)'); }
  R(g, u + 2, base + h, w - 4, 4, '#7ec0f2'); R(g, u + 5, base + h + 4, 8, 3, '#4f9ee0');
}
function billboard(g, u, base, w, h) {
  R(g, u + 4, base, 2, 8, '#55555a'); R(g, u + w - 6, base, 2, 8, '#55555a');
  R(g, u, base + 8, w, h, '#d6343c');
  g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.beginPath(); g.moveTo(u + 6, base + 8 + h - 4); g.lineTo(u + w - 6, base + 8 + 4); g.stroke();
}
function yellowBlock(g, rnd, u, base, w, h, hz) {
  const a = mix('#d8b542', hz, 0.1), b = mix('#a9d36b', hz, 0.1);
  R(g, u, base, w, h, a); R(g, u + w, base, w * 0.7, h - 4, b);
  for (let y = 4; y < h - 2; y += 6) { R(g, u + 2, base + y, w * 1.7 - 4, 1, 'rgba(60,50,20,0.25)'); }
  R(g, u, base + h, w * 1.7, 3, '#efe3a8');
}
function pagodaGate(g, u, base) {
  R(g, u + 2, base, 4, 9, '#b8632a'); R(g, u + 12, base, 4, 9, '#b8632a'); R(g, u, base + 9, 18, 3, '#d7a23c');
  g.fillStyle = '#d89a3a'; g.beginPath(); g.moveTo(u - 3, base + 12); g.lineTo(u + 21, base + 12); g.lineTo(u + 9, base + 22); g.fill();
  g.fillStyle = '#c9742f'; g.beginPath(); g.moveTo(u + 3, base + 20); g.lineTo(u + 15, base + 20); g.lineTo(u + 9, base + 27); g.fill();
}
function bigTree(g, rnd, x, d, r, hz) {
  disc(g, x + 1, d - 1, r, 'rgba(0,0,0,0.22)');
  disc(g, x, d, r, mix('#3a6a3a', hz, 0.1));
  disc(g, x - r * 0.3, d + r * 0.25, r * 0.6, mix('#4f8a4a', hz, 0.1));
  R(g, x - 2, d + r * 0.4, 3, 2, mix('#8bd18f', hz, 0.2));
}
function silhouetteTowers(g, rnd, cfg, u, base) {             // golden-hour towers (west) / modern towers (north)
  for (let i = 0; i < 5; i++) {
    const w = 10 + rnd() * 10, h = 60 + rnd() * 42, x = u + i * (w + 3 + rnd() * 6);
    const col = mix(mix('#7f8c9a', cfg.haze, 0.4), cfg.silCol, cfg.sil);
    R(g, x, base, w, h, col); R(g, x + w * 0.7, base, w * 0.3, h, mix(col, '#101018', 0.25));
    R(g, x, base + h, w, 2, mix(col, '#ffffff', 0.3));
    for (let y = 6; y < h - 4; y += 6) R(g, x + 2, base + y, w - 4, 1, 'rgba(255,255,255,0.12)');
  }
}

// ---- the low roofs right below the rail (seen from above): roofs, tanks, trees ----
function roofsPass(g, rnd, u0, u1, dMin, dMax, hazeCol) {
  for (let u = u0; u < u1;) {
    const w = 10 + rnd() * 22, h = 7 + rnd() * 14;
    const d = dMin + rnd() * Math.max(1, dMax - dMin - h);
    const col = mix(rnd() < 0.08 ? '#3d78c4' : pickOf(ROOFS, rnd), hazeCol, 0.05);
    R(g, u + 1, d - 1, w, h, 'rgba(0,0,0,0.22)');
    R(g, u, d, w, h, col);
    R(g, u, d + h - 1, w, 1, mix(col, '#ffffff', 0.3));
    if (rnd() < 0.35) disc(g, u + w * rnd(), d + h * 0.5, 2.5, '#3f5a66');                    // water tank
    if (rnd() < 0.25) bigTree(g, rnd, u + w * rnd(), d + h * 0.5, 4 + rnd() * 5, hazeCol);   // tree
    u += w + rnd() * 9;
  }
}

// ---------------------------------------------------------------------------------------------
// Landmark clusters (placed every ~520px along the edge so there is always one in view)
// ---------------------------------------------------------------------------------------------
function cluster(side, g, rnd, cfg, u, k) {
  const hz = cfg.haze;
  if (side === 'e') {
    mast(g, u + 24, 128 + (k % 2) * 6, 138);
    meshBuilding(g, rnd, u - 78, 114, 34, 82, hz);
    billboard(g, u - 36, 118, 28, 14);
    blueBuilding(g, u - 18, 94, 30, 34, hz);
    whiteTower(g, rnd, u + 26, 112, 44, 118 - (k % 2) * 14, hz);
    yellowBlock(g, rnd, u + 118, 104, 22, 40, hz);
  } else if (side === 'n') {
    silhouetteTowers(g, rnd, cfg, u - 60, 196);
    mast(g, u + 130, 140, 110);
    whiteTower(g, rnd, u + 20, 118, 36, 92 + (k % 2) * 18, hz);
    pagodaGate(g, u - 42, 74);
    blueBuilding(g, u + 92, 100, 28, 30, hz);
  } else if (side === 's') {
    yellowBlock(g, rnd, u - 70, 106, 24, 46, hz);
    mast(g, u + 80, 120, 112);
    meshBuilding(g, rnd, u + 100, 112, 30, 70, hz);
    whiteTower(g, rnd, u - 8, 114, 40, 96, hz);
    blueBuilding(g, u + 56, 92, 26, 28, hz);
    for (let i = 0; i < 3; i++) bigTree(g, rnd, u - 40 + i * 70, 88 + (i % 2) * 6, 11 + rnd() * 5, hz);
  } else {
    silhouetteTowers(g, rnd, cfg, u - 40, 150);
    silhouetteTowers(g, rnd, cfg, u + 90, 176);
    mast(g, u + 60, 132, 120);
    whiteTower(g, rnd, u - 100, 120, 34, 80 + (k % 2) * 16, hz);
  }
}

// ---------------------------------------------------------------------------------------------
// Paint one panorama (once per zone and side)
// ---------------------------------------------------------------------------------------------
const cache = {};
function panorama(side) {
  const key = zoneId + '|' + side;
  if (cache[key]) return cache[key];
  const len = side === 'n' || side === 's' ? widthPx : heightPx;
  return (cache[key] = buildPanorama(side, len, zoneId));
}

function buildPanorama(side, len, zid) {
  const cfg = COMP[side], rnd = rng(hashStr(zid + side));
  const span = len + EXT * 2;
  const c = document.createElement('canvas'); c.width = span; c.height = EXT;
  const g = c.getContext('2d');
  g.translate(EXT, 0);                                         // from here on x = real position along the edge
  const u0 = -EXT, u1 = len + EXT;
  const road = cfg.road;

  // sky / ground gradient (ground near the rail, sky at the far end)
  const grd = g.createLinearGradient(0, 0, 0, EXT);
  grd.addColorStop(0, '#5f5a52'); grd.addColorStop(0.2, '#7b7466'); grd.addColorStop(0.5, mix(cfg.haze, '#9a9486', 0.3));
  grd.addColorStop(0.72, cfg.glow); grd.addColorStop(0.86, mix(cfg.glow, cfg.skyTop, 0.55)); grd.addColorStop(1, cfg.skyTop);
  g.fillStyle = grd; g.fillRect(u0, 0, span, EXT);

  if (cfg.sun) {                                                // golden-hour glow spots
    for (let u = u0 + 120; u < u1; u += 480) {
      const rg = g.createRadialGradient(u, 226, 0, u, 226, 190);
      rg.addColorStop(0, 'rgba(255,236,170,0.75)'); rg.addColorStop(0.4, 'rgba(255,205,120,0.35)'); rg.addColorStop(1, 'rgba(255,190,100,0)');
      g.fillStyle = rg; g.fillRect(u - 190, 40, 380, 260);
    }
  }
  if (cfg.river) {                                              // thin river on the horizon
    R(g, u0, 222, span, 6, mix('#9fb7c4', cfg.glow, 0.3));
    for (let u = u0; u < u1; u += 17) R(g, u, 224, 9, 1, 'rgba(255,255,255,0.45)');
  }

  // far -> near
  layer(g, rnd, cfg, { u0, u1, base: [212, 226], w: [10, 26], h: [26, 62], tallH: [62, 92], tall: cfg.tall, haze: 0.78, win: false });
  layer(g, rnd, cfg, { u0, u1, base: [186, 204], w: [10, 28], h: [24, 70], tallH: [70, 96], tall: cfg.tall * 0.6, haze: 0.60, win: false });
  layer(g, rnd, cfg, { u0, u1, base: [128, 150], w: [10, 26], h: [22, 56], haze: 0.30, win: true });
  for (let u = u0 + 160, k = 0; u < u1; u += 520 + rnd() * 80, k++) cluster(side, g, rnd, cfg, u, k);
  layer(g, rnd, cfg, { u0, u1, base: [90, 112], w: [12, 30], h: [18, 46], haze: 0.12, win: true });

  // low roofs, trees and the street right below the rail
  const hz = cfg.haze;
  if (road) {
    roofsPass(g, rnd, u0, u1, road.d + road.h + 3, road.d + road.h + 30, hz);
    R(g, u0, road.d, span, road.h, '#4f5256');
    R(g, u0, road.d, span, 1, '#8b8d8f'); R(g, u0, road.d + road.h - 1, span, 1, '#3a3c3f');
    for (let u = u0; u < u1; u += 14) R(g, u, road.d + road.h / 2, 7, 1, '#d8d4c8');
    roofsPass(g, rnd, u0, u1, 4, road.d - 2, hz);
  } else {
    roofsPass(g, rnd, u0, u1, 34, 72, hz);
    roofsPass(g, rnd, u0, u1, 4, 40, hz);
  }
  const shade = g.createLinearGradient(0, 0, 0, 40);            // the building's own shadow along the foot
  shade.addColorStop(0, 'rgba(10,10,14,0.45)'); shade.addColorStop(1, 'rgba(10,10,14,0)');
  g.fillStyle = shade; g.fillRect(u0, 0, span, 40);

  g.fillStyle = rgba('#ffb86e', cfg.warm); g.fillRect(u0, 0, span, EXT);   // golden-hour tint over everything

  // things that move (drawn every frame by drawStrip)
  const cars = [];
  if (road) for (let i = 0; i < Math.floor(span / 110 * road.cars); i++)
    cars.push({ u: rnd() * span, v: range([8, 26], rnd()) * (rnd() < 0.5 ? -1 : 1) * (road.speed / 18), lane: rnd() < 0.5 ? 0.25 : 0.65, col: pickOf(['#d9d4c6', '#b23a3a', '#e0b13a', '#35618c', '#2e2e32', '#d0d0d0'], rnd) });
  const clouds = [];
  for (let i = 0; i < 6; i++) clouds.push({ u: rnd() * span, d: range([232, 288], rnd()), w: range([60, 140], rnd()), h: range([9, 20], rnd()), v: range([1.5, 4], rnd()), a: range([0.16, 0.30], rnd()) });
  const birds = [];
  for (let i = 0; i < 3; i++) birds.push({ u: rnd() * span, d: range([225, 282], rnd()), v: range([10, 22], rnd()) * (rnd() < 0.5 ? -1 : 1), ph: rnd() * 6 });
  return { canvas: c, len, span, cfg, road, cars, clouds, birds, runs: windowRuns(side, len) };
}

// ---------------------------------------------------------------------------------------------
// WALLS: what is beside the skyline window. The rail is a window in the building's edge; everywhere else the edge
// is a tall board-formed concrete wall (like the wall block next to the rail in the photos).
//   'concrete' = plain wall.   'terrace' = the wall of the level above, with a planter, trees and vines spilling over.
// Exits (stairs / paths) on an edge become a dark passage in the wall. Change WALL_STYLE to restyle a side.
// ---------------------------------------------------------------------------------------------
const WALL_STYLE = { zone1: { n: 'terrace' } };                 // anything not listed = 'concrete'
const wallStyle = (zid, side) => WALL_STYLE[zid]?.[side] ?? 'concrete';

// tiles on this edge that are exits (stairs / paths), grouped into runs: [{a, b, stairs}]
function exitRuns(side) {
  const n = side === 'n' || side === 's' ? cols : rows, runs = [];
  let cur = null;
  for (let i = 0; i < n; i++) {
    const [x, y] = side === 'n' ? [i, 0] : side === 's' ? [i, rows - 1] : side === 'w' ? [0, i] : [cols - 1, i];
    if (getExit(x, y)) {
      const st = getTile(x, y) === 'S';
      if (!cur) cur = { a: i, b: i, stairs: st }; else { cur.b = i; cur.stairs = cur.stairs || st; }
    } else if (cur) { runs.push(cur); cur = null; }
  }
  if (cur) runs.push(cur);
  return runs;
}

// a dark passage: the stairs / path carries on into the shadow, framed by concrete piers and a lintel
function passage(g, u0, u1, stairs) {
  const h = 66, w = u1 - u0;
  const og = g.createLinearGradient(0, 0, 0, h);
  og.addColorStop(0, '#4a453d'); og.addColorStop(0.35, '#1d1b19'); og.addColorStop(1, '#050505');
  g.fillStyle = og; g.fillRect(u0, 0, w, h);
  if (stairs) {
    for (let k = 0; k < 9; k++) {                               // steps fade into the dark as they climb
      R(g, u0 + 3, 2 + k * 6.5, w - 6, 1.5, `rgba(214,208,192,${0.5 - k * 0.05})`);
      R(g, u0 + 3, 3.5 + k * 6.5, w - 6, 2, `rgba(0,0,0,${0.18 + k * 0.04})`);
    }
  } else R(g, u0 + 3, 0, w - 6, 12, 'rgba(160,152,136,0.25)');
  for (let u = u0 + 128; u < u1 - 24; u += 128) {                // pillars inside wide passages
    R(g, u - 4, 0, 8, h, '#8f8c83'); R(g, u - 4, 0, 1, h, '#aaa79c'); R(g, u + 2, 0, 2, h, 'rgba(0,0,0,0.30)');
  }
  R(g, u0 - 4, 0, 5, h + 7, '#8e8b82'); R(g, u1 - 1, 0, 5, h + 7, '#8e8b82');            // jambs
  R(g, u0 - 4, 0, 1, h + 7, '#aaa79c'); R(g, u1 + 3, 0, 1, h + 7, 'rgba(0,0,0,0.3)');
  R(g, u0 - 4, h, w + 8, 7, '#9d9a90'); R(g, u0 - 4, h + 6, w + 8, 1, '#c2bfb4'); R(g, u0 - 4, h, w + 8, 1, 'rgba(0,0,0,0.35)');   // lintel
}

const wallCache = {};
function wallPanorama(side) {
  const key = zoneId + '|' + side;
  if (wallCache[key]) return wallCache[key];
  const len = side === 'n' || side === 's' ? widthPx : heightPx;
  return (wallCache[key] = buildWall(side, len, zoneId));
}

function buildWall(side, len, zid) {
  const cfg = COMP[side], rnd = rng(hashStr(zid + side + 'wall')), style = wallStyle(zid, side);
  const span = len + EXT * 2, u0 = -EXT, u1 = len + EXT;
  const c = document.createElement('canvas'); c.width = span; c.height = EXT;
  const g = c.getContext('2d'); g.translate(EXT, 0);
  const grd = g.createLinearGradient(0, 0, 0, EXT);
  grd.addColorStop(0, '#85827a'); grd.addColorStop(0.5, '#908d84'); grd.addColorStop(1, '#6f6c66');
  g.fillStyle = grd; g.fillRect(u0, 0, span, EXT);
  for (let u = u0; u < u1;) {                                    // vertical boards: seam + slightly different tone each
    const bw = 10 + Math.floor(rnd() * 4);
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)'; g.fillRect(u, 0, bw, EXT);
    g.fillStyle = 'rgba(0,0,0,0.20)'; g.fillRect(u, 0, 1, EXT);
    g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(u + 1, 0, 1, EXT);
    u += bw;
  }
  for (let d = 44; d < EXT; d += 46) {                           // pour joints
    g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(u0, d, span, 1);
    g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(u0, d + 1, span, 1);
  }
  for (let i = 0; i < span / 22; i++) {                          // water stains running down the wall
    const u = u0 + rnd() * span, d = rnd() * EXT * 0.8, l = 20 + rnd() * 60;
    const sg = g.createLinearGradient(0, d, 0, d + l);
    sg.addColorStop(0, 'rgba(30,26,20,0)'); sg.addColorStop(0.3, `rgba(30,26,20,${0.10 + rnd() * 0.10})`); sg.addColorStop(1, 'rgba(30,26,20,0)');
    g.fillStyle = sg; g.fillRect(u, d, 2 + rnd() * 3, l);
  }
  for (let u = u0 + 6; u < u1; u += 22) for (let d = 22; d < EXT; d += 46) if (rnd() < 0.6) R(g, u + rnd() * 4, d + rnd() * 3, 2, 2, 'rgba(20,18,16,0.35)');   // tie holes
  const foot = g.createLinearGradient(0, 0, 0, 26);              // dark where the wall meets the roof
  foot.addColorStop(0, 'rgba(0,0,0,0.38)'); foot.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = foot; g.fillRect(u0, 0, span, 26);

  if (style === 'terrace') {
    const top = 196;
    const sg = g.createLinearGradient(0, top, 0, EXT);           // sky behind the trees
    sg.addColorStop(0, mix(cfg.glow, cfg.skyTop, 0.35)); sg.addColorStop(1, cfg.skyTop);
    g.fillStyle = sg; g.fillRect(u0, top, span, EXT - top);
    R(g, u0, top + 10, span, 2, '#d6dadd');                       // pale guard rail on the level above
    for (let u = u0; u < u1; u += 4) R(g, u, top + 10, 1, 7, '#98a0a5');
    for (let u = u0; u < u1; u += 28 + rnd() * 26) {             // tree canopies behind
      const r = 14 + rnd() * 12, d = top + 26 + rnd() * 44;
      disc(g, u + 1, d - 1, r, 'rgba(0,0,0,0.20)');
      disc(g, u, d, r, pickOf(['#2e6b34', '#2a5f30', '#37793c'], rnd));
      disc(g, u - r * 0.3, d + r * 0.3, r * 0.6, '#4a9a4a');
      disc(g, u - r * 0.35, d + r * 0.45, r * 0.25, '#8bd18f');
    }
    R(g, u0, top, span, 10, '#9c998f'); R(g, u0, top + 8, span, 2, 'rgba(0,0,0,0.30)'); R(g, u0, top, span, 2, '#c4c1b6');   // planter beam
    for (let u = u0; u < u1; u += 9 + rnd() * 9) {               // foliage hanging over the beam
      const r = 5 + rnd() * 6;
      disc(g, u, top + 1 + rnd() * 10 - 6, r, pickOf(['#2e7d32', '#388e3c', '#1f5a28', '#43a047'], rnd));
    }
    for (let u = u0; u < u1; u += 22 + rnd() * 30) {             // vines hanging down the wall
      const l = 14 + rnd() * 52, vx = u + rnd() * 6;
      R(g, vx, top - l, 1, l, '#2f5a2c');
      for (let d = top - l; d < top - 3; d += 6) disc(g, vx + (rnd() < 0.5 ? -1.5 : 2.5), d, 1.7, '#3f8a3c');
    }
  } else {
    R(g, u0, EXT - 8, span, 5, '#aaa79d'); R(g, u0, EXT - 8, span, 2, '#c4c1b6'); R(g, u0, EXT - 3, span, 3, 'rgba(0,0,0,0.30)');   // wall cap
  }

  g.fillStyle = rgba('#ffb86e', cfg.warm * 0.8); g.fillRect(u0, 0, span, EXT);   // golden-hour tint
  for (const r of exitRuns(side)) passage(g, r.a * TILE, (r.b + 1) * TILE, r.stairs);
  return { canvas: c, span };
}

// the stretches of this edge that have rails = where the skyline window is. A window that reaches the end of the
// edge carries on into the corner (the corner is blended with the neighbouring side, see drawSkyline).
// WINDOW_FILL: tile ranges on an edge that show the skyline even though they have no rail, so the window is not
// interrupted (here: the solid wall behind the hedge bed on the east side of zone 1, rows 8-21).
const WINDOW_FILL = { zone1: { e: [[8, 21]] } };
function windowRuns(side, len) {
  const set = new Set(rails()[side]);
  for (const [a, b] of WINDOW_FILL[zoneId]?.[side] ?? []) for (let i = a; i <= b; i++) set.add(i);
  const list = [...set].sort((x, y) => x - y), runs = [], last = Math.round(len / TILE) - 1;
  let cur = null;
  for (const i of list) {
    if (cur && i === cur.b + 1) cur.b = i; else { if (cur) runs.push(cur); cur = { a: i, b: i }; }
  }
  if (cur) runs.push(cur);
  return runs.map((r) => ({ u0: r.a === 0 ? -EXT : r.a * TILE, u1: r.b === last ? len + EXT : (r.b + 1) * TILE,
                            capA: r.a !== 0, capB: r.b !== last }));
}

// ---------------------------------------------------------------------------------------------
// Drawing (called by renderer.js BEFORE the tiles, inside the camera transform)
// ---------------------------------------------------------------------------------------------
const FEATHER = 56;                                          // px: how wide the soft blend is where two sides meet at a corner
let scratch = null;
const D = Math.SQRT1_2;
// For a masked side: the corner point and the direction that points INTO that side's own territory.
const CORNERS = {
  e: [{ nb: 'n', at: () => [widthPx, 0],          dir: [D, D] },   { nb: 's', at: () => [widthPx, heightPx], dir: [D, -D] }],
  w: [{ nb: 'n', at: () => [0, 0],                dir: [-D, D] },  { nb: 's', at: () => [0, heightPx],       dir: [-D, -D] }],
};

export function drawSkyline(ctx, camera, VW, VH, time) {
  skyline.sync();
  const r = rails(), W = widthPx, H = heightPx;
  // the dark "drop" you see between the rail slats (always there, even when no skyline is revealed)
  const lip = (x, y, w, h, gx0, gy0, gx1, gy1) => {
    const g = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
    g.addColorStop(0, '#34332f'); g.addColorStop(1, '#5f5a52');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  };
  if (r.e.length && camera.x + VW > W - LIP) lip(W - LIP, 0, LIP, H, W - LIP, 0, W, 0);
  if (r.w.length && camera.x < LIP) lip(0, 0, LIP, H, LIP, 0, 0, 0);
  if (r.n.length && camera.y < LIP) lip(0, 0, W, LIP, 0, LIP, 0, 0);
  if (r.s.length && camera.y + VH > H - LIP) lip(0, H - LIP, W, LIP, 0, H - LIP, 0, H);

  const on = (s) => skyline.over[s] >= 0.5 && r[s].length > 0;
  if (on('n')) drawSide(ctx, 'n', time);
  if (on('s')) drawSide(ctx, 's', time);
  for (const side of ['e', 'w']) {
    if (!on(side)) continue;
    const corners = CORNERS[side].filter((c) => on(c.nb));
    if (!corners.length) { drawSide(ctx, side, time); continue; }
    // two sides meet at a corner: draw this side on its own layer, fade it out along the diagonal, lay it over the other
    if (!scratch) { scratch = document.createElement('canvas'); scratch.width = VW; scratch.height = VH; }
    const g = scratch.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, VW, VH);
    g.translate(-camera.x, -camera.y);
    drawSide(g, side, time);
    g.globalCompositeOperation = 'destination-out';
    for (const c of corners) {
      const [cx, cy] = c.at(), F = FEATHER / 2, big = EXT + FEATHER;
      const gr = g.createLinearGradient(cx - c.dir[0] * F, cy - c.dir[1] * F, cx + c.dir[0] * F, cy + c.dir[1] * F);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.25, 'rgba(0,0,0,0.85)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.5)');
      gr.addColorStop(0.75, 'rgba(0,0,0,0.15)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(cx - big, cy - big, big * 2, big * 2);
    }
    g.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.translate(camera.x, camera.y); ctx.drawImage(scratch, 0, 0); ctx.restore();
  }
}

// One side: wall everywhere, skyline through the window(s), concrete piers at the window ends.
function drawSide(g, side, time) {
  const P = panorama(side), WL = wallPanorama(side), cfg = P.cfg;
  const over = skyline.over[side], s = over / EXT, ds = over, W = widthPx, H = heightPx;
  g.save();
  g.beginPath();                                               // only the area beyond this edge (corners included)
  if (side === 'e') g.rect(W, -EXT, ds, H + EXT * 2);
  else if (side === 'w') g.rect(-ds, -EXT, ds, H + EXT * 2);
  else if (side === 'n') g.rect(-EXT, -ds, W + EXT * 2, ds);
  else g.rect(-EXT, H, W + EXT * 2, ds);
  g.clip();
  const m = { e: [0, 1, s, 0, W, 0], w: [0, 1, -s, 0, 0, 0], n: [1, 0, 0, -s, 0, 0], s: [1, 0, 0, s, 0, H] }[side];
  g.transform(m[0], m[1], m[2], m[3], m[4], m[5]);             // local x = along the edge, local y = away from it
  g.imageSmoothingEnabled = true;
  g.drawImage(WL.canvas, -EXT, 0);

  const span = P.span;
  const wrap = (v) => ((v % span) + span) % span - EXT;
  g.save();                                                    // ---- the skyline, only inside the window(s) ----
  g.beginPath();
  for (const w of P.runs) g.rect(w.u0, 0, w.u1 - w.u0, EXT);
  g.clip();
  g.drawImage(P.canvas, -EXT, 0);
  g.fillStyle = cfg.sun ? '#ffd9a0' : '#ffffff';              // clouds
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
  if (side === 'e') {                                          // a small kite
    const ku = wrap(0.31 * span + Math.sin(time * 0.4) * 30), kd = 262 + Math.sin(time * 0.9) * 4;
    g.fillStyle = '#e24a5a'; g.beginPath(); g.moveTo(ku, kd - 6); g.lineTo(ku + 4, kd); g.lineTo(ku, kd + 6); g.lineTo(ku - 4, kd); g.fill();
    g.strokeStyle = 'rgba(40,40,40,0.5)'; g.beginPath(); g.moveTo(ku, kd - 6); g.quadraticCurveTo(ku + 6, kd - 30, ku + 2, kd - 54); g.stroke();
  }
  // haze: thick when you are far from the rail, thin when you are touching it
  const k = smooth(skyline.close[side]);
  const a = Math.max(0.04, lerp(HAZE_FAR, HAZE_NEAR, k) - (side === skyline.leanSide ? 0.05 * skyline.lean : 0));
  const hg = g.createLinearGradient(0, 0, 0, EXT);
  hg.addColorStop(0, rgba(cfg.haze, a * 0.3)); hg.addColorStop(1, rgba(cfg.haze, a));
  g.fillStyle = hg; g.fillRect(-EXT, 0, span, EXT);
  g.restore();

  const vines = vineStrands(zoneId, side);                     // hedge vines hanging over the edge (foliage.js VINE_EDGES): in front of the haze
  if (vines.length) { drawVines(g, vines, time); drawVineLip(g, vines); }

  for (const w of P.runs) {                                    // concrete piers where the window meets the wall
    for (const [x, lit] of [[w.u0, true], [w.u1 - 9, false]]) {
      if ((lit && !w.capA) || (!lit && !w.capB)) continue;
      R(g, x, 0, 9, EXT, '#8f8c83'); R(g, lit ? x : x + 8, 0, 1, EXT, lit ? '#aaa79c' : 'rgba(0,0,0,0.30)');
      R(g, lit ? x + 7 : x, 0, 2, EXT, 'rgba(0,0,0,0.22)');
      for (let d = 44; d < EXT; d += 46) R(g, x, d, 9, 1, 'rgba(0,0,0,0.18)');
      R(g, x, EXT - 8, 9, 5, '#aaa79d');
    }
  }
  g.imageSmoothingEnabled = false;
  g.restore();
}