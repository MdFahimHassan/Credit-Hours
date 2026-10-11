// foliage.js - living hedges for the planted areas (H / Y / Z tiles). Modelled on the real rooftop photos.
//
// WHAT IT DOES
//   1. paintHedge()      the body of an 'H' tile. A noise field over the WHOLE map decides how dense each spot is, so the beds
//                        blend between two looks (the way the real ones do):
//                          sparse = planter bed with arching grass blades (liriope) and big lobed monstera leaves
//                          dense  = overgrown ivy hedge: a bumpy mass of small leaves
//   2. buildOverlay()    a layer painted ONCE per zone and stamped over the tiles (renderer.js). On every hedge edge that has a
//                        guard rail it makes plants come OUT of the rail:
//                          - blades / leaves poking through the gaps between the balusters (the rail is re-stamped over them)
//                          - leaves and ivy lying over the handrail, spilling onto the floor (more where the hedge is dense)
//                          - the odd monstera leaf draped over the rail
//                        Hedges that sit against the outer east wall also spill over that wall and send vine strands over its edge.
//   3. vineStrands() / drawVines() / drawVineLip()
//                        the vines that hang down over the edge of the building under the hedge. skyline.js draws them when you
//                        walk up to the rails on that side (see VINE_EDGES for where).
//
// TWEAK ME: the numbers marked (*) below.
import { TILE } from './map.js';
import { paintLeafMass } from './canopy.js';

// Where vines hang over the building edge: zone -> side -> [[first tile, last tile], ...] along that edge.
export const VINE_EDGES = { zone1: { e: [[8, 21]] }, zone2: { w: [[8, 21]] } };   // (*) the hedge bed in the middle of the east side (zone 1) / west side (zone 2)

const DENSE_SCALE = 150;     // (*) px: size of the big sparse / dense patches (bigger = longer stretches of the same look)
const REACH = 8;             // (*) px: how far leaves normally stick out past the rail

// ---------------------------------------------------------------------------------------------
// small helpers: hash, smooth value noise, colours
// ---------------------------------------------------------------------------------------------
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
function hash(a, b, c = 0) {                                    // deterministic 0..1 - no random flicker, same picture every run
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
// 0 = sparse (blades + monstera), 1 = dense (overgrown ivy). Looks the same everywhere you ask about the same pixel.
export function density(wx, wy) {
  const v = vnoise(wx / DENSE_SCALE, wy / DENSE_SCALE, 3) * 0.65 + vnoise(wx / 55, wy / 55, 7) * 0.35;
  return smooth((v - 0.47) / 0.26);                         // raw noise hovers around 0.55, so this gives roughly 45% sparse / 15% mixed / 40% dense
}
const pick = (arr, r) => arr[Math.floor(r * arr.length) % arr.length];

const LEAF = ['#2e7d32', '#388e3c', '#2a7030', '#43a047', '#25702c'];
const LEAF_LT = ['#5aab5e', '#6dbb70', '#7bc47f', '#8bd18f'];
const BLADE = ['#245f2b', '#2d7233', '#3a8a3e', '#4a9a4a'];
const DEEP = '#143d1a';

// ---- leaf shapes (all take a 2D context and draw around (x, y), rotated by `rot`) --------------------
function pointLeaf(g, x, y, len, wid, rot, col, vein, edge) {   // pointed oval leaf, base at (x, y), tip `len` away; edge = dark outline colour
  g.save(); g.translate(x, y); g.rotate(rot);
  const shape = (l, w) => { g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(l * 0.5, -w, l, 0); g.quadraticCurveTo(l * 0.5, w, 0, 0); g.fill(); };
  if (edge) { g.fillStyle = edge; shape(len + 1.4, wid + 1); }
  g.fillStyle = col; shape(len, wid);
  if (vein) { g.strokeStyle = vein; g.lineWidth = 0.8; g.beginPath(); g.moveTo(0, 0); g.lineTo(len * 0.85, 0); g.stroke(); }
  g.restore();
}
function ivyLeaf(g, x, y, s, rot, col, hi) {                    // small rounded ivy leaf with a pale glint
  g.save(); g.translate(x, y); g.rotate(rot);
  g.fillStyle = col; g.beginPath(); g.ellipse(0, 0, s * 0.95, s * 0.7, 0, 0, Math.PI * 2); g.fill();
  if (hi) { g.fillStyle = hi; g.fillRect(-s * 0.5, -s * 0.4, Math.max(1, s * 0.5), 1); }
  g.restore();
}
function monstera(g, x, y, r, rot, col, lt) {                   // big lobed leaf: a 6-lobe outline, pale lit half and veins
  g.save(); g.translate(x, y); g.rotate(rot);
  const N = 30, pts = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, lobe = 0.58 + 0.42 * Math.abs(Math.sin(a * 3 + 0.4));   // 6 lobes, deep notches between them
    pts.push([Math.cos(a) * r * lobe * 1.05, Math.sin(a) * r * lobe * 0.92]);
  }
  g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.closePath();
  g.strokeStyle = '#0f3016'; g.lineWidth = 1.6; g.lineJoin = 'round'; g.stroke();            // dark outline so it reads against the hedge
  g.fillStyle = col; g.fill();
  g.fillStyle = lt; g.beginPath();                              // lit half
  pts.slice(0, N / 2 + 1).forEach(([px, py], i) => (i ? g.lineTo(px * 0.8, py * 0.8) : g.moveTo(px * 0.8, py * 0.8))); g.closePath();
  g.globalAlpha = 0.5; g.fill(); g.globalAlpha = 1;
  g.strokeStyle = '#b6e6b4'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(-r * 0.9, 0); g.lineTo(r * 0.9, 0); g.stroke();   // midrib
  g.strokeStyle = 'rgba(166,220,168,0.55)'; g.lineWidth = 0.7;
  for (let k = -2; k <= 2; k++) if (k) { g.beginPath(); g.moveTo(k * r * 0.18, 0); g.lineTo(k * r * 0.42, -r * 0.55); g.moveTo(k * r * 0.18, 0); g.lineTo(k * r * 0.42, r * 0.55); g.stroke(); }
  g.restore();
}
function blade(g, x0, y0, x1, y1, bend, col, wid, edge) {       // one arching grass blade (liriope), root (x0,y0) -> tip (x1,y1)
  const mx = (x0 + x1) / 2 + bend, my = (y0 + y1) / 2;
  g.lineCap = 'round';
  for (const [c, w] of edge ? [[edge, wid + 1.4], [col, wid]] : [[col, wid]]) {
    g.strokeStyle = c; g.lineWidth = w;
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(mx, my, x1, y1); g.stroke();
  }
  g.lineCap = 'butt';
}

// ---------------------------------------------------------------------------------------------
// 1. the body of one hedge tile (called by renderer.js drawPlanted, already clipped to the tile)
// ---------------------------------------------------------------------------------------------
// base tone under the leaves; blends smoothly with density. Bush mounds / trees use it too so neighbouring tiles have no seams.
export function hedgeBase(px, py) {
  const dd = density(px + TILE / 2, py + TILE / 2), bc = (a, b) => Math.round(lerp(a, b, dd)).toString(16).padStart(2, '0');
  return '#' + bc(0x17, 0x1b) + bc(0x42, 0x4a) + bc(0x1f, 0x23);
}
export function paintHedge(g, px, py, tx, ty) {
  const dd = density(px + TILE / 2, py + TILE / 2);
  g.fillStyle = '#173d1e'; g.fillRect(px, py, TILE, TILE);   // base tone blends smoothly with density (no per-tile flip)

  paintLeafMass(g, px, py, 0);                                  // leaf mass underneath: small leaves on a WORLD grid, so neighbouring tiles share them (no tile seams)

  if (dd < 0.55) {                                              // ---- sparse: planter bed (blades + monstera) ----
    const k = 1 - dd;
    const hubs = 1 + Math.round(k * 1.4);
    for (let hb = 0; hb < hubs; hb++) {
      const hx = px + 10 + hash(tx, ty, 20 + hb) * 12, hy = py + 10 + hash(tx, ty, 30 + hb) * 12;
      const n = 6 + Math.floor(hash(tx, ty, 40 + hb) * 5);
      for (let b = 0; b < n; b++) {
        const a = hash(tx, ty, 50 + hb * 10 + b) * Math.PI * 2, len = 5 + hash(tx, ty, 70 + hb * 10 + b) * 5;
        blade(g, hx, hy, hx + Math.cos(a) * len, hy + Math.sin(a) * len, (hash(tx, ty, 90 + b) - 0.5) * 6, pick(BLADE, hash(tx, ty, 110 + hb * 10 + b)), 1.6);
      }
    }
    if (hash(tx, ty, 130) < 0.6 * k) {                          // a monstera leaf in the bed
      const r = 6 + hash(tx, ty, 131) * 2.5;
      monstera(g, px + 10 + hash(tx, ty, 132) * 12, py + 10 + hash(tx, ty, 133) * 12, r, hash(tx, ty, 134) * 6.28, '#2c8a36', '#5fb865');
    }
  } else {                                                      // ---- dense: ivy leaves all over ----
    const n = 10 + Math.floor(dd * 14);
    for (let i = 0; i < n; i++) {
      const x = px + 2 + hash(tx, ty, 200 + i) * 28, y = py + 2 + hash(tx, ty, 300 + i) * 28;
      ivyLeaf(g, x, y, 2.4 + hash(tx, ty, 400 + i) * 1.6, hash(tx, ty, 500 + i) * 6.28, pick(LEAF, hash(tx, ty, 600 + i)), hash(tx, ty, 700 + i) < 0.35 ? '#a6dca8' : null);
    }
  }
  g.fillStyle = '#7bc47f';                                      // a few bright highlights
  for (let i = 0; i < 3; i++) g.fillRect(px + 3 + Math.floor(hash(tx, ty, 800 + i) * 24), py + 3 + Math.floor(hash(tx, ty, 900 + i) * 22), 3, 2);
  g.fillStyle = DEEP;                                           // a couple of deep gaps between the leaves (different spots on every tile)
  for (let i = 0; i < 2; i++) g.fillRect(px + 3 + Math.floor(hash(tx, ty, 950 + i) * 24), py + 3 + Math.floor(hash(tx, ty, 960 + i) * 24), 3, 2);
}

// ---------------------------------------------------------------------------------------------
// 2. the overlay: plants coming out of the rails
// ---------------------------------------------------------------------------------------------
// One entry per face of a tile. Local frame of a face: x runs ALONG the rail (0-32), y runs OUTWARDS from the outer
// edge of the rail (0) into the open floor (+y). The rail itself therefore occupies y -7..0 and the hedge is at y < -7.
const FACES = {
  N: { d: [0, -1], m: (px, py) => [1, 0, 0, -1, px, py] },
  S: { d: [0, 1], m: (px, py) => [1, 0, 0, 1, px, py + TILE] },
  W: { d: [-1, 0], m: (px, py) => [0, 1, -1, 0, px, py] },
  E: { d: [1, 0], m: (px, py) => [0, 1, 1, 0, px + TILE, py] },
};
const toWorld = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

// broad leaves and a few blades that come THROUGH the gaps between the balusters (the rail is stamped back over them afterwards)
function throughGaps(g, f) {
  const { m, tx, ty, id } = f;
  for (let slot = 0; slot < TILE; slot += 4) {
    const key = tx * 8 + slot / 4, [wx, wy] = toWorld(m, slot + 2, 0), dd = density(wx, wy);
    if (hash(key, ty, 1000 + id) > lerp(0.15, 0.62, dd)) continue;                 // sparse: a tuft every ~25px, dense: nearly continuous
    const cx = slot + hash(key, ty, 1010 + id) * 4;
    const reach = 4 + hash(key, ty, 1030 + id) * 5 + dd * 5;                       // how far past the rail the tips get
    const pal = dd > 0.55 ? LEAF : BLADE;
    const nLeaf = 1 + (hash(key, ty, 1020 + id) < 0.5 ? 1 : 0) + (dd > 0.5 ? 1 : 0);
    for (let l = 0; l < nLeaf; l++) {                                             // strap / pointed leaves leaning out
      const ang = Math.PI / 2 + (hash(key, ty + l * 5, 1060 + id) - 0.5) * 1.5;
      pointLeaf(g, cx + (hash(key, ty + l * 5, 1065 + id) - 0.5) * 3, -9, reach + 9 + hash(key, ty + l * 5, 1070 + id) * 4, 2.2 + hash(key, ty + l * 5, 1075 + id) * 1.2,
                ang, pick(pal, hash(key, ty + l * 5, 1080 + id)), 'rgba(160,220,150,0.6)', DEEP);
    }
    const nBlade = Math.floor(hash(key, ty, 1040 + id) * 2 + dd * 1.6);
    for (let b = 0; b < nBlade; b++) {                                            // and the odd arching blade
      const r = hash(key, ty + b * 37, 1050 + id), spread = (r - 0.5) * 9;
      blade(g, cx, -9, cx + spread, reach * (0.7 + 0.3 * r), (r - 0.5) * 6, pick(BLADE, r * 7.3), 1.7, DEEP);
    }
  }
}

// ivy / leaves lying OVER the handrail (dense stretches) and the odd monstera draped over it (anywhere)
function overRail(g, f) {
  const { m, tx, ty, id } = f;
  for (let x = 1; x < TILE; x += 3) {
    const [wx, wy] = toWorld(m, x, 0), dd = density(wx, wy);
    const h = hash(tx * 11 + x, ty, 2000 + id);
    if (dd < 0.45 || h > (dd - 0.35) * 0.95) continue;                                   // none in sparse stretches
    const y = -6 + hash(tx * 11 + x, ty, 2010 + id) * (2 + dd * 8), s = 2.8 + hash(tx * 11 + x, ty, 2020 + id) * 1.8;
    g.fillStyle = 'rgba(0,0,0,0.20)'; g.beginPath(); g.ellipse(x + 1, y + 1.5, s, s * 0.75, 0, 0, Math.PI * 2); g.fill();   // soft shadow on the rail / floor
    ivyLeaf(g, x + (hash(tx, ty, 2030 + x) - 0.5) * 2, y, s, hash(tx * 3 + x, ty, 2040 + id) * 6.28, pick(LEAF, h * 9.1), hash(tx * 3 + x, ty, 2050) < 0.4 ? '#a6dca8' : null);
  }
  if (hash(tx, ty, 2100 + id) < 0.15) {                                                  // a draped monstera
    const x = 7 + hash(tx, ty, 2110 + id) * 18, r = 6 + hash(tx, ty, 2120 + id) * 2.5;
    const rot = Math.PI / 2 + (hash(tx, ty, 2130 + id) - 0.5) * 1.0;
    g.strokeStyle = '#1f5a28'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x - 1, -10); g.lineTo(x, 1); g.stroke();   // stalk coming over the rail
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.ellipse(x + 1.5, 3 + r * 0.7 + 1.5, r * 0.8, r * 0.9, 0, 0, Math.PI * 2); g.fill();
    monstera(g, x, 2 + r * 0.7, r, rot, '#25782e', '#4aa552');
  }
}

// Hedge tiles standing against the outer east wall of a vine edge: leaves spill over the top of that wall and a few strands run
// across it, so they carry on seamlessly into the vines that hang past the edge (drawVines, same u positions).
function wallSpill(g, f, strands) {
  const { m, tx, ty, px, py } = f;
  for (let x = 1; x < TILE; x += 3) {
    const [wx, wy] = toWorld(m, x, 0), dd = density(wx, wy);
    const reach = 5 + vnoise(wy / 20, 3, 5) * 10 + dd * 9;
    for (let y = 0; y < reach; y += 3.5) {
      if (hash(tx * 13 + x, ty * 17 + y, 3000) > 0.8 - y / (reach + 4) * 0.45) continue;
      ivyLeaf(g, x + (hash(x, y, 3001 + ty) - 0.5) * 3, y, 2.5 + hash(x, y, 3002 + ty) * 1.8, hash(x, y, 3003 + ty) * 6.28, pick(LEAF, hash(x, y, 3004 + ty)), hash(x, y, 3005 + ty) < 0.3 ? '#a6dca8' : null);
    }
  }
  for (const s of strands) {                                                            // lead-in of each hanging vine across the wall top
    if (s.u < py || s.u >= py + TILE) continue;
    const x = s.u - py;
    g.strokeStyle = '#2c5a2c'; g.lineWidth = s.thick; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + s.lean, TILE); g.stroke();
    for (let y = 6; y < TILE; y += s.gap) ivyLeaf(g, x + s.lean * (y / TILE) + ((y / s.gap) % 2 ? -2 : 2), y, s.sz, ((y / s.gap) % 2 ? 0.7 : -0.7), pick(LEAF, hash(s.u, y, 3100)), null);
  }
}

// Hedges that sit against a low wall or a block of steps (isSpill tiles, e.g. the semi-wall and the big tiers): no rail to grow through,
// so the plants simply overgrow the edge - ivy leaves lying over it, the odd monstera, and on south faces vines hanging down the wall.
function spillOver(g, f) {
  const { m, tx, ty, id, name } = f;
  for (let x = 1; x < TILE; x += 3) {
    const [wx, wy] = toWorld(m, x, 0), dd = density(wx, wy);
    const key = tx * 11 + x;
    if (hash(key, ty, 5000 + id) > 0.35 + dd * 0.5) continue;
    const reach = 2 + hash(key, ty, 5010 + id) * 4 + dd * 6;                   // how far over the edge the leaves lie
    const n = 1 + Math.floor(hash(key, ty, 5020 + id) * 2 + dd * 1.5);
    for (let i = 0; i < n; i++) {
      const y = -2 + hash(key, ty + i * 7, 5030 + id) * reach, sz = 2.6 + hash(key, ty + i * 7, 5040 + id) * 1.8;
      g.fillStyle = 'rgba(0,0,0,0.20)'; g.beginPath(); g.ellipse(x + 1, y + 1.5, sz, sz * 0.75, 0, 0, Math.PI * 2); g.fill();
      ivyLeaf(g, x + (hash(key, ty + i, 5050) - 0.5) * 2, y, sz, hash(key, ty + i * 3, 5060 + id) * 6.28, pick(LEAF, hash(key, ty + i, 5070 + id)), hash(key, ty + i, 5080) < 0.35 ? '#a6dca8' : null);
    }
  }
  if (hash(tx, ty, 5100 + id) < 0.2) {                                         // a monstera leaf lying over the edge
    const x = 7 + hash(tx, ty, 5110 + id) * 18, r = 6 + hash(tx, ty, 5120 + id) * 2;
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.ellipse(x + 1.5, r * 0.6 + 2, r * 0.8, r * 0.9, 0, 0, Math.PI * 2); g.fill();
    monstera(g, x, r * 0.55, r, Math.PI / 2 + (hash(tx, ty, 5130 + id) - 0.5), '#25782e', '#4aa552');
  }
  if (name !== 'S') return;
  for (let x = 3; x < TILE - 2; x += 4) {                                      // vines hanging down the face of the wall
    const [wx, wy] = toWorld(m, x, 0), dd = density(wx, wy), key = tx * 9 + x;
    if (hash(key, ty, 5200) > lerp(0.25, 0.75, dd)) continue;
    const len = 12 + hash(key, ty, 5210) * 18 + dd * 8, vx = x + (hash(key, ty, 5220) - 0.5) * 3, lean = (hash(key, ty, 5230) - 0.5) * 3;
    g.strokeStyle = '#2c5a2c'; g.lineWidth = 1 + hash(key, ty, 5240) * 0.7;
    g.beginPath(); g.moveTo(vx, -1); g.lineTo(vx + lean, len); g.stroke();
    let side = 1;
    for (let y = 4; y < len; y += 5, side = -side)
      ivyLeaf(g, vx + lean * (y / len) + side * 1.8, y, 2.2 + hash(key, y, 5250) * 1.1, side * 0.8, pick(LEAF, hash(key, y, 5260)), null);
    ivyLeaf(g, vx + lean, len, 2.6, 0.3, '#43a047', null);
  }
}

// Paint the overlay for a whole zone. opt = { zoneId, cols, rows, widthPx, heightPx, getTile, isPlanted, isOpen, isSpill, paintRail }
//   isSpill(x, y) = a solid tile a hedge may overgrow (low walls, steps)
//   paintRail(g, 'N'|'S'|'W'|'E', px, py) must draw that face's rail onto g WITHOUT its translucent shadow (see renderer.js).
export function buildOverlay(opt) {
  const { zoneId, cols, rows, widthPx, heightPx, getTile, isPlanted, isOpen, isSpill, paintRail } = opt;
  const c = document.createElement('canvas'); c.width = widthPx; c.height = heightPx;
  const g = c.getContext('2d');
  const faces = [], spills = [];
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
    if (!isPlanted(tx, ty)) continue;
    const px = tx * TILE, py = ty * TILE;
    Object.entries(FACES).forEach(([name, F], id) => {
      const nx = tx + F.d[0], ny = ty + F.d[1];
      if (isOpen(nx, ny, tx, ty)) faces.push({ name, id, tx, ty, px, py, m: F.m(px, py) });
      else if (isSpill?.(nx, ny)) spills.push({ name, id, tx, ty, px, py, m: F.m(px, py) });
    });
  }
  for (const f of faces) {                                      // pass 1: through the gaps, then the rail back on top of it
    g.save(); g.transform(...f.m); throughGaps(g, f); g.restore();
    paintRail(g, f.name, f.px, f.py);
  }
  for (const f of faces) { g.save(); g.transform(...f.m); overRail(g, f); g.restore(); }   // pass 2: over the rail
  for (const f of spills) { g.save(); g.transform(...f.m); spillOver(g, f); g.restore(); }   // pass 2b: over walls / steps

  for (const side of ['e', 'w']) {                              // pass 3: hedge against the east / west wall of a vine edge
    const edge = VINE_EDGES[zoneId]?.[side];
    if (!edge) continue;
    const strands = vineStrands(zoneId, side), tx = side === 'e' ? cols - 2 : 1, wallX = side === 'e' ? tx + 1 : tx - 1;
    for (const [a, b] of edge) for (let ty = a; ty <= b; ty++) {
      if (!isPlanted(tx, ty) || getTile(wallX, ty) !== '#') continue;
      const px = tx * TILE, py = ty * TILE, F = side === 'e' ? FACES.E : FACES.W, f = { tx, ty, px, py, m: F.m(px, py) };
      g.save(); g.transform(...f.m); wallSpill(g, f, strands); g.restore();
    }
  }
  return c;
}

// ---------------------------------------------------------------------------------------------
// 3. hanging vines (used by skyline.js, drawn in the skyline's local frame: x = along the edge = world y, y = away from the edge)
// ---------------------------------------------------------------------------------------------
const vineCache = {};
export function vineStrands(zoneId, side) {
  const key = zoneId + '|' + side;
  if (vineCache[key]) return vineCache[key];
  const ranges = VINE_EDGES[zoneId]?.[side] ?? [], out = [], lip = [];
  let seed = 0;
  const r = () => hash(seed++, 77, 4000);
  for (const [a, b] of ranges) {
    const u0 = a * TILE, u1 = (b + 1) * TILE;
    let u = u0 + 5;
    while (u < u1 - 5) {
      const roll = r();
      const kind = roll < 0.34 ? 'curtain' : roll < 0.80 ? 'single' : 'tuft';           // dense curtain / lone trailing vine / short bushy tuft
      const n = kind === 'curtain' ? 3 + Math.floor(r() * 3) : kind === 'single' ? 1 : 2 + Math.floor(r() * 2);
      const base = kind === 'curtain' ? 45 + r() * 75 : kind === 'single' ? 22 + r() * 85 : 10 + r() * 22;
      for (let i = 0; i < n; i++) {
        const len = Math.max(8, base * (0.6 + r() * 0.5));
        out.push({ u: Math.min(u1 - 3, u + i * (3 + r() * 4)), len, ph: r() * 6.28, amp: 1.5 + r() * 3, thick: kind === 'tuft' ? 1.3 : 1 + r() * 0.8,
                   gap: 5 + r() * 4, sz: kind === 'tuft' ? 3.4 + r() * 1.4 : 2.3 + r() * 1.3, lean: (r() - 0.5) * 3, big: kind !== 'curtain' && r() < 0.5 });
      }
      u += (kind === 'curtain' ? n * 5 : 0) + 11 + r() * 22;
    }
    for (let x = u0; x < u1; x += 3 + r() * 3)               // the leafy lip of the hedge the vines grow from
      lip.push({ u: x, d: 1 + r() * 8, s: 3 + r() * 2.4, rot: r() * 6.28, col: pick(LEAF, r()), hi: r() < 0.3 });
  }
  out.lip = lip;
  return (vineCache[key] = out);
}

export function drawVines(g, strands, time) {
  for (const s of strands) {
    const sway = (d) => Math.sin(time * 1.25 + s.ph + d * 0.045) * s.amp * Math.pow(d / s.len, 0.9) + Math.sin(time * 0.5 + s.u * 0.012) * 1.4 * (d / s.len) + s.lean * (d / s.len);
    g.strokeStyle = '#2c5a2c'; g.lineWidth = s.thick; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(s.u, 0);
    for (let d = 4; d < s.len; d += 4) g.lineTo(s.u + sway(d), d);
    g.lineTo(s.u + sway(s.len), s.len); g.stroke();
    let side = 1;
    for (let d = s.gap; d < s.len - 2; d += s.gap, side = -side) {                     // leaves alternate left / right down the strand
      const x = s.u + sway(d), sz = s.sz * (1 - 0.25 * (d / s.len));
      ivyLeaf(g, x + side * sz * 0.8, d, sz, side * 0.9 + Math.sin(time * 1.6 + d) * 0.12, pick(LEAF, hash(s.u, d, 4100)), hash(s.u, d, 4200) < 0.35 ? '#a6dca8' : null);
    }
    const tx = s.u + sway(s.len);                                                      // the tip: a small bunch of leaves
    ivyLeaf(g, tx - 1.5, s.len, s.sz * 0.9, 0.5, '#388e3c', null); ivyLeaf(g, tx + 1.5, s.len + 1, s.sz * 0.9, -0.5, '#43a047', null);
    if (s.big) pointLeaf(g, tx, s.len, s.sz * 3.2, s.sz * 0.9, Math.PI / 2 + Math.sin(time * 1.3 + s.ph) * 0.18, '#3f9a47', '#8bd18f');   // bigger drooping leaf
  }
}

export function drawVineLip(g, strands) {                       // call AFTER drawVines so the lip covers where the strands start
  for (const l of strands.lip ?? []) {
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(l.u + 1, l.d + 1.5, l.s, l.s * 0.75, 0, 0, Math.PI * 2); g.fill();
    ivyLeaf(g, l.u, l.d, l.s, l.rot, l.col, l.hi ? '#a6dca8' : null);
  }
}