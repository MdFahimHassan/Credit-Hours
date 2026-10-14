// curverail.js - a railing that follows a smooth curve: a stretch of the WEST edge where the rail steps in towards the floor (zone 3, beside the hole)
// and back out again, as two quarter-circle "S" bends (no corners, no straight steps).
//
// Define one in zones.js:   curvedRails: [{ y0: 17, y1: 26, depth: 3, r: 1 }]      (tile units)
//   y0     the row where the rail leaves the straight edge (a tile boundary); it turns east with a rounded corner, runs across, and turns south again
//   depth  how far the rail steps in from the edge (tiles); the straight middle part runs at that distance
//   r      radius of the four rounded corners (tiles) - like the hole's balustrade: straight runs with proper curves only at the turns
//   y1     the first row of the open path the rail leads into: the rail turns west and runs STRAIGHT into the path's own rail (skyline.js paintExit), whose
//          outer face is 24px (RAIL_W) above y1, so the two rails are one piece
// Rows y0..y1-1 of x 0 must be 'R' in the map: those tiles stay solid and are NOT drawn as straight rail (renderer.js drawRail skips them),
// the curved rail (drawn by renderer.js drawCurvedRails) replaces them. Everything left of the curve is "outside": the skyline carries on there
// (skyline.js drawCurvedBays), and it is solid for the player (railBands below follow the curve exactly).
//
// This file has no imports on purpose (map.js, renderer.js and skyline.js all use it): everything is in pixels.

export const RAIL_W = 24;          // thickness of the rail (px): 16 of slats + 8 of parapet, the same as a straight edge rail tile
const PI = Math.PI;
const STEP = 0.5;                  // distance (px) between two sampled points of the path

// The outer face of the rail as a list of points with EXACT tangents: [{x, y, tx, ty}]. c is in pixels.
// It starts at (0, y0) heading south and ends at (0, y1 - RAIL_W) heading WEST, where the rail of the open path takes over.
// The inward normal (towards the floor) of a point is (ty, -tx).
export function railPath(c) {
  const D = c.depth, R = Math.min(c.r, D / 2), y0 = c.y0, yE = c.y1 - RAIL_W;
  const arc = (cx, cy, a0, a1) => ({ len: Math.abs(a1 - a0) * R, at: (u) => {
    const a = a0 + (a1 - a0) * u, sg = Math.sign(a1 - a0);
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), tx: -sg * Math.sin(a), ty: sg * Math.cos(a) };
  } });
  const line = (x0, y0_, x1, y1_) => { const l = Math.hypot(x1 - x0, y1_ - y0_); return { len: l, at: (u) => ({ x: x0 + (x1 - x0) * u, y: y0_ + (y1_ - y0_) * u, tx: (x1 - x0) / (l || 1), ty: (y1_ - y0_) / (l || 1) }) }; };
  const parts = [
    arc(R, y0, PI, PI / 2),                          // leaves the edge heading south, turns east
    line(R, y0 + R, D - R, y0 + R),                  // across (the "return")
    arc(D - R, y0 + 2 * R, -PI / 2, 0),              // turns south
    line(D, y0 + 2 * R, D, yE - R),                  // the straight part at full depth
    arc(D - R, yE - R, 0, PI / 2),                   // turns west
    line(D - R, yE, 0, yE),                          // and runs straight into the rail of the path
  ].filter((q) => q.len > 0.01);
  const total = parts.reduce((t, q) => t + q.len, 0), K = Math.max(2, Math.ceil(total / STEP)), pts = [];
  let pi = 0, acc = 0;
  for (let k = 0; k <= K; k++) {
    const s = k * total / K;
    while (pi < parts.length - 1 && s > acc + parts[pi].len + 1e-9) { acc += parts[pi].len; pi++; }
    pts.push(parts[pi].at(Math.max(0, Math.min(1, (s - acc) / (parts[pi].len || 1)))));
  }
  return { pts, len: total };
}

// x of the rail's outer face at height y (px), 0 outside the curve. (The face is monotone in y, so this is a binary search.)
export function faceX(c, y, path = railPath(c)) {
  const { pts } = path;
  if (y <= pts[0].y) return 0;
  if (y > pts[pts.length - 1].y) return 0;
  let a = 0, b = pts.length - 1;
  while (b - a > 1) { const m = (a + b) >> 1; if (pts[m].y <= y) a = m; else b = m; }
  return pts[a].x + (pts[b].x - pts[a].x) * ((y - pts[a].y) / ((pts[b].y - pts[a].y) || 1));
}

// Solid thin rectangles: everything from the edge up to the INNER face of the rail, in 2px rows (like hole.js holeBands) - the player stops right at the parapet.
export function railBands(c, step = 2) {
  const { pts } = railPath(c), n = Math.ceil((c.y1 - c.y0) / step), maxX = new Array(n).fill(0);
  for (const p of pts) for (let d = 0; d <= RAIL_W; d += 1) {
    const x = p.x + p.ty * d, y = p.y - p.tx * d, b = Math.floor((y - c.y0) / step);
    if (b >= 0 && b < n && x > maxX[b]) maxX[b] = x;
  }
  const out = [];
  for (let b = 0; b < n; b++) if (maxX[b] > 0.5) out.push({ x: 0, y: c.y0 + b * step, w: maxX[b] + 0.25, h: step + 0.01 });
  return out;
}

// the curve of a zone in pixels (from the zone's tile-unit definition)
export const curvedRailPx = (d, tile) => ({ y0: d.y0 * tile, y1: d.y1 * tile, depth: d.depth * tile, r: d.r * tile });