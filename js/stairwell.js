// stairwell.js - the big stairs going DOWN to the lower floor (zone 3, beside the lawn). Copied from the photos of the real roof: an opening in the floor edged by the
// same white concrete kerb + grey flat-bar balustrade as the holes (hole.js), rounded at the corners; two flights of steps side by side with ONE pipe handrail down the middle.
// The balustrade runs all round the opening, but at the OPEN end (east, the lawn side) the north rail curves SOUTH and the south rail curves NORTH and both stop at the sides of the
// stairs: the gap between the two rail ends is the way in, level with the floor. The lower floor is not built yet, so the steps fade into black, "COMING SOON" waits in the dark,
// and everything beside the stairs inside the rails is black void.
//
// Define one in zones.js:   stairwells: [{ x: 6, y: 10, w: 9, h: 14, r: 1, sw: 8, len: 4 }]   (tile units)
//   x, y, w, h   the OUTER edge of the kerb (the open end is the east side, x + w)
//   r            radius of the rounded corners (tiles)
//   sw           the width of the stairs, both flights together (tiles, centred on the opening); the rails end at its sides
//   len          the length of the stairs (tiles), counted from the open end
// Solid for the player (map.js asks stairwellBands()): the kerb ring, the void beside the stairs, and a barrier across the stairs where they are nearly black.
//
// This file imports only hole.js (everything is in pixels).
import { RIM, KERB_W, RAIL_H, SOLID_UP } from './hole.js';

const STEP = 16;               // one step = 16px (two per tile), like the zone 1 flights
const LIT_STEPS = 5;           // fully lit for this many steps (the near part of the stairs), then the fade runs to black towards the far end ...
const BLACK_STEPS = 3;         // ... and the last steps are completely black
const BARRIER_STEPS = 12;      // the barrier across the stairs stands this many steps in (they are nearly black by then)
const PI = Math.PI;
const VOID_DARK = 0.62;        // how dark the lower floor is seen from up here (0 = fully lit, 1 = pure black): "barely visible", not black
const FLOOR_TILE = 13;         // lower-floor tile size in px (same as the holes in glass.js)

// the lower floor seen at the bottom of the stairs and beside them: the same grey checker + joints as the floor under the holes (glass.js)
let floorPat = null;
function lowerFloor(ctx) {
  if (floorPat) return floorPat;
  const T = FLOOR_TILE, c = document.createElement('canvas'); c.width = c.height = T * 2;
  const g = c.getContext('2d');
  g.fillStyle = '#5d6469'; g.fillRect(0, 0, T * 2, T * 2);
  g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, 0, T, T); g.fillRect(T, T, T, T);
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.fillRect(0, 0, T * 2, 1); g.fillRect(0, T, T * 2, 1); g.fillRect(0, 0, 1, T * 2); g.fillRect(T, 0, 1, T * 2);
  return (floorPat = ctx.createPattern(c, 'repeat'));
}

const radius = (o) => Math.max(1, Math.min(o.r ?? 32, o.h / 2, o.w / 2));
const geo = (o) => {
  const sw = o.sw ?? 256, mid = o.y + o.h / 2, len = o.len ?? 128;
  return { xe: o.x + o.w, y0: mid - sw / 2, y1: mid + sw / 2, mid, len, steps: Math.round(len / STEP) };
};
export const darkX = (o) => geo(o).xe - BARRIER_STEPS * STEP;   // west of this (across the stairs) the player is stopped
// How far down the stairs a point is: -1 = not on the flight, else 0 (level with the floor, at the open end) .. 1 (at the barrier in the dark).
// player.js / renderer.js use it to make him sink, dim and dip with every step.
export function stairDepth(o, cx, cy) {
  const { xe, y0, y1, len } = geo(o);
  if (cy < y0 - 1 || cy > y1 + 1 || cx > xe || cx < xe - len) return -1;
  return Math.max(0, Math.min(1, (xe - cx) / (BARRIER_STEPS * STEP)));
}

// the outline of the rails at inset d (px) from the outer edge, `up` px higher up the screen: an OPEN path that starts at the south end of the north rail's east piece (the side of
// the stairs), runs north, turns west along the north side, round the west end, east along the south side, and turns north up the east piece to the other side of the stairs
function railPath(o, d, up = 0) {
  const { xe, y0, y1 } = geo(o), R = radius(o), rad = Math.max(0.5, R - d), p = new Path2D();
  const L = o.x + d, T = o.y + d - up, B = o.y + o.h - d - up, E = xe - d;
  p.moveTo(E, y0 - up);
  p.lineTo(E, T + rad);                                  // north piece of the east side, running away from the stairs...
  p.arc(E - rad, T + rad, rad, 0, -PI / 2, true);        // ...turns west (the north rail curving round, towards the stairs)
  p.lineTo(L + rad, T);
  p.arc(L + rad, T + rad, rad, -PI / 2, PI, true);       // north-west corner
  p.lineTo(L, B - rad);
  p.arc(L + rad, B - rad, rad, PI, PI / 2, true);        // south-west corner
  p.lineTo(E - rad, B);
  p.arc(E - rad, B - rad, rad, PI / 2, 0, true);         // turns north (the south rail curving round)
  p.lineTo(E, y1 - up);
  return p;
}
function railLength(o, d) {                              // the length of that path (for spacing the bars)
  const { y0, y1 } = geo(o), rad = Math.max(0.5, radius(o) - d), w = o.w - 2 * d - 2 * rad, h = o.h - 2 * d - 2 * rad;
  return Math.max(0, y0 - (o.y + d + rad)) + Math.max(0, o.y + o.h - d - rad - y1) + 2 * w + h + 2 * PI * rad;
}

// the see-through part (inside the kerb): the rounded rectangle inset RIM, plus the way in (between the rail ends)
function innerPath(o) {
  const { xe, y0, y1 } = geo(o), R = radius(o), p = new Path2D(), rad = Math.max(0, R - RIM);
  const x = o.x + RIM, y = o.y + RIM, w = o.w - 2 * RIM, h = o.h - 2 * RIM;
  p.moveTo(x + rad, y); p.lineTo(x + w - rad, y); p.arc(x + w - rad, y + rad, rad, -PI / 2, 0);
  p.lineTo(x + w, y + h - rad); p.arc(x + w - rad, y + h - rad, rad, 0, PI / 2);
  p.lineTo(x + rad, y + h); p.arc(x + rad, y + h - rad, rad, PI / 2, PI);
  p.lineTo(x, y + rad); p.arc(x + rad, y + rad, rad, PI, 1.5 * PI); p.closePath();
  p.rect(xe - RIM - 1, y0, RIM + 1, y1 - y0);
  return p;
}

// Solid thin rectangles (2px rows): the kerb ring + fence (SOLID_UP above the north edge), the black void beside the stairs, the west wall and a barrier across the stairs in the dark.
// The way in (the rows of the stairs, at the east end) is open and the steps are walkable.
export function stairwellBands(o, step = 2) {
  const { xe, y0, y1 } = geo(o), R = radius(o), cx = o.x + o.w / 2, cy = o.y + o.h / 2, xb = darkX(o);
  const half = (yy, inset) => {                          // half width of the rounded rectangle inset by `inset`, at height yy (0 outside)
    const rad = Math.max(0, R - inset), top = o.y + inset, bot = o.y + o.h - inset;
    if (yy < top || yy >= bot) return 0;
    const exx = o.w / 2 - inset - rad, eyy = o.h / 2 - inset - rad, dy = Math.max(0, Math.abs(yy - cy) - eyy);
    return exx + Math.sqrt(Math.max(0, rad * rad - dy * dy));
  };
  const out = [];
  for (let yy = o.y - SOLID_UP; yy < o.y + o.h; yy += step) {
    const my = yy + step / 2;
    let outer = 0;
    for (let u = 0; u <= SOLID_UP; u++) outer = Math.max(outer, half(my + u, 0));
    if (outer <= 0.5) continue;
    const add = (a, b) => { if (b - a > 0.5) out.push({ x: a, y: yy, w: b - a, h: step + 0.01 }); };
    const inner = half(my, RIM);
    if (my >= y0 && my < y1 && inner > 0) { add(cx - outer, cx - inner); add(cx - inner, xb); }   // the way in: the west wall, and the barrier across the stairs
    else add(cx - outer, cx + outer);                                                              // kerb / void beside the stairs / the east pieces of the rails
  }
  return out;
}

// ---- what you see inside the opening ----
function paintInterior(ctx, o) {
  const { xe, y0, y1, mid, len, steps } = geo(o), inner = innerPath(o), LANE_H = y1 - y0, xs = xe - len;
  ctx.save();
  ctx.clip(inner);
  ctx.fillStyle = lowerFloor(ctx); ctx.fillRect(o.x, o.y, o.w + 8, o.h);                    // the lower floor beside / below the stairs (the same floor as under the holes) ...
  ctx.fillStyle = `rgba(6,8,12,${VOID_DARK})`; ctx.fillRect(o.x, o.y, o.w + 8, o.h);          // ... deep in the shade, so it is only barely visible
  // the north wall of the shaft: grey vertical louvre fins, as in the holes (dark here: the lower floor does not exist yet)
  const FIN_H = 17;
  ctx.fillStyle = '#3a4248'; ctx.fillRect(o.x, o.y, o.w, RIM + FIN_H);
  for (let xx = o.x; xx < xe; xx += 5) { ctx.fillStyle = '#20262a'; ctx.fillRect(xx, o.y, 2, RIM + FIN_H); ctx.fillStyle = '#5c666d'; ctx.fillRect(xx + 3, o.y, 1, RIM + FIN_H); }
  const sh = ctx.createLinearGradient(0, o.y + RIM, 0, o.y + RIM + FIN_H + 2);
  sh.addColorStop(0, 'rgba(0,0,0,0.6)'); sh.addColorStop(1, 'rgba(0,0,0,0.75)');
  ctx.fillStyle = sh; ctx.fillRect(o.x, o.y, o.w, RIM + FIN_H + 2);
  // the two flights (going down WEST): tread i is 16px wide; each one a little further down, so a little darker
  for (let i = 0; i < steps - BLACK_STEPS; i++) {         // (the last steps are the lower floor, not treads)
    const xr = xe - i * STEP, xl = xr - STEP;
    ctx.fillStyle = i % 2 ? '#c0beb5' : '#cac8bf'; ctx.fillRect(xl, y0, STEP, LANE_H);
    ctx.fillStyle = '#d8d6cd'; ctx.fillRect(xl, y0, 2, LANE_H);                     // the lit nosing at the west edge of the tread
    ctx.fillStyle = 'rgba(40,40,46,0.34)'; ctx.fillRect(xr - 4, y0, 4, LANE_H);     // shadow of the step above, on this tread
  }
  const xt = xs + BLACK_STEPS * STEP;                                                 // where the treads end (west of it is the lower floor: no joints, no handrail)
  for (let yy = y0 + 32; yy < y1; yy += 32) { ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.fillRect(xt, yy, len - BLACK_STEPS * STEP, 1); }   // faint slab joints along the treads
  // the concrete side walls of the stairs (a low parapet with a pale top, as in the photos)
  ctx.fillStyle = '#8f8d86'; ctx.fillRect(xs + BLACK_STEPS * STEP, y0 - 5, len - BLACK_STEPS * STEP, 5); ctx.fillRect(xs + BLACK_STEPS * STEP, y1, len - BLACK_STEPS * STEP, 5);
  ctx.fillStyle = '#b4b2aa'; ctx.fillRect(xs + BLACK_STEPS * STEP, y0 - 5, len - BLACK_STEPS * STEP, 2); ctx.fillRect(xs + BLACK_STEPS * STEP, y1, len - BLACK_STEPS * STEP, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fillRect(xs + BLACK_STEPS * STEP, y0, len - BLACK_STEPS * STEP, 3); ctx.fillRect(xs + BLACK_STEPS * STEP, y1 - 3, len - BLACK_STEPS * STEP, 3);
  // the single pipe handrail between the two flights: round tube on posts
  const ry = mid - 9;
  ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fillRect(xt, mid + 1, xe - 2 - xt, 2);
  for (let px = xe - 6; px > xt; px -= 32) { ctx.fillStyle = '#9ea1a6'; ctx.fillRect(px - 1, ry, 3, 10); ctx.fillStyle = '#dcdde0'; ctx.fillRect(px - 1, ry, 1, 10); ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(px - 1, mid, 3, 2); }
  ctx.fillStyle = '#7b7d82'; ctx.fillRect(xt, ry + 2, xe - 2 - xt, 1);
  ctx.fillStyle = '#c9cacd'; ctx.fillRect(xt, ry, xe - 2 - xt, 2);
  ctx.fillStyle = '#f2f2f4'; ctx.fillRect(xt, ry - 1, xe - 2 - xt, 1);

  // the dark: the steps fade into black
  const gx0 = xe - LIT_STEPS * STEP, gx1 = xs + BLACK_STEPS * STEP;
  const g = ctx.createLinearGradient(gx0, 0, gx1, 0);
  g.addColorStop(0, 'rgba(6,8,12,0)'); g.addColorStop(0.45, 'rgba(6,8,12,0.5)'); g.addColorStop(1, `rgba(6,8,12,${VOID_DARK})`);
  ctx.fillStyle = g; ctx.fillRect(xs + BLACK_STEPS * STEP, y0 - 6, len - BLACK_STEPS * STEP, LANE_H + 12);

  // soft dark rim: the walls swallow the light near the edge
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(8,12,18,0.30)'; ctx.lineWidth = 18; ctx.stroke(inner);
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 8; ctx.stroke(inner);

  ctx.restore();
}

// ---- the kerb + balustrade: the hole's (hole.js drawHoleRail), but along an open outline that curves in to the sides of the stairs ----
function paintRail(ctx, o) {
  const { xe, y0, y1, mid } = geo(o), H = RAIL_H, R0 = radius(o);
  const at = (d, up = 0) => railPath(o, d, up);
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'butt';

  // kerb: white painted concrete with a rounded top, a lit crown and a shadowed inner foot
  ctx.strokeStyle = 'rgba(25,25,32,0.30)'; ctx.lineWidth = 3; ctx.stroke(at(-0.5, -1));
  ctx.strokeStyle = '#c9c7c0'; ctx.lineWidth = KERB_W; ctx.stroke(at(KERB_W / 2));
  ctx.strokeStyle = '#e6e5e0'; ctx.lineWidth = 5; ctx.stroke(at(KERB_W / 2 - 1, 1));
  ctx.strokeStyle = '#f4f3ef'; ctx.lineWidth = 1.5; ctx.stroke(at(KERB_W / 2 - 2, 2));
  ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 1; ctx.stroke(at(KERB_W - 0.5));

  // spacing: a post every 4th bar
  const RD = KERB_W / 2 + 0.5, L = railLength(o, RD), posts = Math.max(4, Math.round(L / 30)), bars = posts * 4, pitch = L / bars;
  const BAR = 3, rail = (up) => at(RD, up);
  const handrail = () => {
    ctx.strokeStyle = '#4d4e54'; ctx.lineWidth = 1.5; ctx.stroke(at(RD + 4, 4));
    ctx.strokeStyle = '#c7c8cc'; ctx.lineWidth = 2.5; ctx.stroke(at(RD + 4, 5));
    ctx.strokeStyle = '#f2f2f4'; ctx.lineWidth = 1;   ctx.stroke(at(RD + 4, 5.7));
  };
  ctx.save(); ctx.beginPath(); ctx.rect(o.x - 20, mid, o.w + 40, o.h); ctx.clip(); handrail(); ctx.restore();   // behind the bars on the near (south) half

  ctx.setLineDash([BAR, pitch - BAR]);
  for (let k = 2; k <= H - 2; k++) {
    const t = (k - 2) / (H - 4), g = Math.round(126 + t * 52);
    ctx.strokeStyle = `rgb(${g},${g + 1},${g + 6})`; ctx.lineWidth = 3; ctx.stroke(rail(k));
  }
  ctx.setLineDash([BAR + 2, pitch * 4 - (BAR + 2)]); ctx.lineDashOffset = 1;
  for (let k = 0; k <= H; k++) { ctx.strokeStyle = k > H - 2 ? '#eeeef0' : '#d9d9dd'; ctx.lineWidth = 4; ctx.stroke(rail(k)); }
  ctx.lineDashOffset = 0; ctx.setLineDash([]);

  ctx.strokeStyle = 'rgba(44,46,54,0.55)'; ctx.lineWidth = 1.5; ctx.stroke(rail(H - 2.5));
  ctx.strokeStyle = '#c4c5c9'; ctx.lineWidth = 4;   ctx.stroke(rail(H));
  ctx.strokeStyle = '#f1f1f3'; ctx.lineWidth = 1.5; ctx.stroke(rail(H + 1.5));

  ctx.save(); ctx.beginPath(); ctx.rect(o.x - 20, o.y - 30, o.w + 40, mid - o.y + 30); ctx.clip(); handrail(); ctx.restore();   // in front of the bars on the far (north) half

  ctx.restore();
}
// ---- cached pictures --------------------------------------------------------------------------------------------------------------------
// The opening, its steps and the balustrade never change, but they cost a few hundred path strokes and fills. They are painted ONCE into
// an offscreen image (1 image pixel = 1 world pixel, so the result is identical) and stamped every frame. Only the pulsing text is live.
const PAD = 48;                                          // room for the rail's lift (RAIL_H) and line widths round the opening
const baked = new Map();
function bake(o, kind, paint) {
  const key = kind + '|' + o.x + ',' + o.y + ',' + o.w + ',' + o.h + ',' + o.r + ',' + o.sw + ',' + o.len;
  let b = baked.get(key);
  if (!b) {
    const c = document.createElement('canvas'); c.width = Math.ceil(o.w + 2 * PAD + 8); c.height = Math.ceil(o.h + 2 * PAD);
    const g = c.getContext('2d'); g.translate(PAD - o.x, PAD - o.y);
    paint(g, o);
    baked.set(key, b = c);
  }
  return b;
}
export function drawStairwellInterior(ctx, o, time) {
  ctx.drawImage(bake(o, 'in', paintInterior), o.x - PAD, o.y - PAD);
  const { xe, y0, y1, mid, len } = geo(o), xs = xe - len;      // COMING SOON, waiting in the dark at the foot of the steps
  const pulse = 0.55 + 0.25 * Math.sin(time * 2.2);
  ctx.save();
  ctx.beginPath(); ctx.rect(o.x, o.y, o.w, o.h); ctx.clip();
  ctx.textAlign = 'center'; ctx.font = 'bold 10px monospace';
  ctx.fillStyle = `rgba(190,205,215,${pulse})`;
  const tx = xs + 36, ty = mid - 22;
  ctx.fillText('COMING', tx, ty - 3); ctx.fillText('SOON', tx, ty + 9);
  ctx.restore();
}
export function drawStairwellRail(ctx, o) {
  ctx.drawImage(bake(o, 'rail', paintRail), o.x - PAD, o.y - PAD);
}
// paints both pictures ahead of time (called while the screen is black, see warmup)
export function warmStairwell(o) { bake(o, 'in', paintInterior); bake(o, 'rail', paintRail); }