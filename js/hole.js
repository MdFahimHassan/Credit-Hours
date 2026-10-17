// hole.js - a "hole" in the roof floor: a capsule-shaped opening (a rectangle with fully rounded ends) that you can look down through,
// ringed by a balustrade. Copied from the photos of the real roof: a white concrete KERB with a rounded top at the foot of the fence, flat
// grey vertical BARS with gaps you can see through, stouter pale POSTS every few bars, a wide flat TOP CAP, and a round tubular HANDRAIL
// on the inner side of the posts, half way up.
//
// It reuses the glass skylight's component (glass.js): the same lower floor, the same little people down there and the same depth shading,
// but NO glass on top - and the balustrade below instead of the metal louvre faces.
//
// Define a hole in zones.js:   holes: [{ x: 6, y: 18, w: 4, h: 8, r: 1 }]    (tile units: left, top, width, height of the OUTER edge of the kerb, and
// r = the corner radius). r is optional: leave it out for a full capsule (radius = half of the shorter side, so the ends are half circles);
// a smaller r gives a rounded rectangle with straighter sides (r: 0.5 = hardly rounded, r: 2 on a 4-wide hole = the full capsule).
// Every hole is solid for the player (map.js asks holeBands() for thin rectangles that follow the curve exactly).
//
// This file has no imports on purpose (map.js and glass.js both import it): everything is in pixels.

export const RAIL_H = 11;        // height of the balustrade as drawn: how far (px) the top cap sits above its foot
export const KERB_W = 8;         // width of the white concrete kerb round the opening
export const RIM = 6;            // the see-through opening starts this far inside the outer edge

const PI = Math.PI;

// A rounded rectangle as a Path2D with corner radius r (default: the full capsule, r = half of the shorter side).
export function capsule(x, y, w, h, r = Math.min(w, h) / 2) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  const p = new Path2D();
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y);
  p.arc(x + w - r, y + r, r, -PI / 2, 0);                 // top-right corner
  p.lineTo(x + w, y + h - r);
  p.arc(x + w - r, y + h - r, r, 0, PI / 2);              // bottom-right
  p.lineTo(x + r, y + h);
  p.arc(x + r, y + h - r, r, PI / 2, PI);                 // bottom-left
  p.lineTo(x, y + r);
  p.arc(x + r, y + r, r, PI, 1.5 * PI);                   // top-left
  p.closePath();
  return p;
}

// the corner radius of a hole in px: o.r if given (never more than half of the shorter side), else the full capsule
export const holeR = (o) => Math.min(o.r ?? Infinity, Math.min(o.w, o.h) / 2);

const perimeter = (w, h, r) => 4 * (w / 2 - r) + 4 * (h / 2 - r) + 2 * PI * r;   // of a rounded rectangle with corner radius r

// the see-through part (inside the kerb)
export const holeInner = (o) => capsule(o.x + RIM, o.y + RIM, o.w - 2 * RIM, o.h - 2 * RIM, Math.max(0, holeR(o) - RIM));

// Solid thin rectangles that follow the OUTER edge of the capsule (the foot of the fence), 2px bands: the player stops right at the kerb.
// The fence is drawn in an oblique view: its bars and top cap stand UP the screen from the foot, so the picture of the hole reaches higher than its outline: the
// top of the cap is ~9px above the outer edge (the fence stands on the kerb, 4.5px inside the edge, and is RAIL_H + 1.5 + 0.75 tall). The solid area is therefore the capsule
// PLUS everything it sweeps when it is moved up by SOLID_UP px: the player's SOLES (map.js groundBox) stop right at the top of the cap, not short of it, and not on the grills.
// (Moving a shape up never changes its south edge, and the east / west edges only move where the curve does, so nothing else changes.)
export const SOLID_UP = 9;
export function holeBands(o, step = 2) {
  const out = [], r = holeR(o), ex = o.w / 2 - r, ey = o.h / 2 - r, cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  const halfAt = (yy) => {                                         // half width of the capsule at height yy (0 outside it)
    if (yy < o.y || yy >= o.y + o.h) return 0;
    const dy = Math.max(0, Math.abs(yy - cy) - ey);
    return ex + Math.sqrt(Math.max(0, r * r - dy * dy));
  };
  for (let yy = o.y - SOLID_UP; yy < o.y + o.h; yy += step) {
    const my = yy + step / 2;
    let half = 0;
    for (let u = 0; u <= SOLID_UP; u += 1) half = Math.max(half, halfAt(my + u));   // the capsule as seen from this row, after sliding it up by 0..SOLID_UP px
    if (half > 0.5) out.push({ x: cx - half, y: yy, w: 2 * half, h: step + 0.01 });
  }
  return out;
}

// ---- what you see through the opening (called by glass.js INSIDE the clip of the opening, after the lower floor + people + dimmer) ----
export function drawHoleInterior(ctx, o) {
  const inner = holeInner(o);
  // soft dark rim: the shaft walls swallow the light near the edge
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(8,12,18,0.30)'; ctx.lineWidth = 18; ctx.stroke(inner);
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 8; ctx.stroke(inner);
  // the far (north) wall of the shaft, seen from the south: grey vertical louvre fins - a crescent that is thickest at the top and fades out
  // towards the sides (the same fins as the louvres of the glass skylight, but standing)
  const FIN_H = 17, band = new Path2D();
  band.rect(o.x - 4, o.y - 4, o.w + 8, o.h + 8);
  band.addPath(capsule(o.x + RIM, o.y + RIM + FIN_H, o.w - 2 * RIM, o.h - 2 * RIM, Math.max(0, holeR(o) - RIM)));
  ctx.save();
  ctx.clip(band, 'evenodd');
  ctx.fillStyle = '#4d565d'; ctx.fillRect(o.x, o.y, o.w, FIN_H + RIM + 40);
  for (let xx = o.x; xx < o.x + o.w; xx += 5) {
    ctx.fillStyle = '#2b3237'; ctx.fillRect(xx, o.y, 2, FIN_H + RIM + 40);          // dark gap between two fins
    ctx.fillStyle = '#7a848b'; ctx.fillRect(xx + 3, o.y, 1, FIN_H + RIM + 40);      // lit edge of the next fin
  }
  const sh = ctx.createLinearGradient(0, o.y + RIM, 0, o.y + RIM + FIN_H + 2);       // darker towards the bottom of the wall, and a shadow under the top cap
  sh.addColorStop(0, 'rgba(0,0,0,0.55)'); sh.addColorStop(0.35, 'rgba(0,0,0,0.12)'); sh.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = sh; ctx.fillRect(o.x, o.y, o.w, FIN_H + RIM + 40);
  ctx.restore();
}

// ---- the balustrade + kerb (called by glass.js after the clip is gone) ----------------------------------------------------------------
// Everything is the capsule outline stroked again and again, each copy one pixel higher than the last (an oblique view: a fence of height H
// is its outline shifted up by up to H). Dashed strokes give the bars: the dash pattern starts at the same place on every copy, so the
// dashes line up into vertical bars and the gaps between them stay see-through. Round capsule = the fence follows the curve for free.
export function drawHoleRail(ctx, o) {
  const { x, y, w, h } = o, cy = y + h / 2, H = RAIL_H;
  const R0 = holeR(o);
  const at = (d, up = 0) => capsule(x + d, y + d - up, w - 2 * d, h - 2 * d, Math.max(0.5, R0 - d));   // outline moved d px inwards and `up` px up the screen
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'butt';

  // kerb: white painted concrete with a rounded top, a lit crown and a shadowed inner foot
  ctx.strokeStyle = 'rgba(25,25,32,0.30)'; ctx.lineWidth = 3; ctx.stroke(at(-0.5, -1));        // contact shadow just outside (on the floor)
  ctx.strokeStyle = '#c9c7c0'; ctx.lineWidth = KERB_W; ctx.stroke(at(KERB_W / 2));
  ctx.strokeStyle = '#e6e5e0'; ctx.lineWidth = 5; ctx.stroke(at(KERB_W / 2 - 1, 1));
  ctx.strokeStyle = '#f4f3ef'; ctx.lineWidth = 1.5; ctx.stroke(at(KERB_W / 2 - 2, 2));
  ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 1; ctx.stroke(at(KERB_W - 0.5));

  // spacing: the same number of bars all the way round (so the pattern closes), a post every 4th bar
  const RD = KERB_W / 2 + 0.5;                                    // the fence stands on the kerb
  const L = perimeter(w - 2 * RD, h - 2 * RD, Math.max(0.5, R0 - RD)), posts = Math.max(4, Math.round(L / 30)), bars = posts * 4, pitch = L / bars;
  const BAR = 3, rail = (up) => at(RD, up);

  // the tubular handrail on the inner side of the posts: BEHIND the bars on the near (south) half, in FRONT of them on the far (north) half
  const handrail = () => {
    ctx.strokeStyle = '#4d4e54'; ctx.lineWidth = 1.5; ctx.stroke(at(RD + 4, 4));               // shadow under the tube
    ctx.strokeStyle = '#c7c8cc'; ctx.lineWidth = 2.5; ctx.stroke(at(RD + 4, 5));               // the tube
    ctx.strokeStyle = '#f2f2f4'; ctx.lineWidth = 1;   ctx.stroke(at(RD + 4, 5.7));             // highlight
  };
  ctx.save(); ctx.beginPath(); ctx.rect(x - 20, cy, w + 40, h); ctx.clip(); handrail(); ctx.restore();

  // flat vertical bars (grey, a little lighter higher up) - the gaps between the dashes are see-through
  ctx.setLineDash([BAR, pitch - BAR]);
  for (let k = 2; k <= H - 2; k++) {
    const t = (k - 2) / (H - 4), g = Math.round(126 + t * 52);
    ctx.strokeStyle = `rgb(${g},${g + 1},${g + 6})`; ctx.lineWidth = 3; ctx.stroke(rail(k));
  }
  // posts: stouter and paler, full height, every 4th bar (they sit on bar number 0 = the start of the outline)
  ctx.setLineDash([BAR + 2, pitch * 4 - (BAR + 2)]); ctx.lineDashOffset = 1;
  for (let k = 0; k <= H; k++) { ctx.strokeStyle = k > H - 2 ? '#eeeef0' : '#d9d9dd'; ctx.lineWidth = 4; ctx.stroke(rail(k)); }
  ctx.lineDashOffset = 0; ctx.setLineDash([]);

  // top cap: a wide flat band with a lit top edge and a shadowed underside
  ctx.strokeStyle = 'rgba(44,46,54,0.55)'; ctx.lineWidth = 1.5; ctx.stroke(rail(H - 2.5));
  ctx.strokeStyle = '#c4c5c9'; ctx.lineWidth = 4;   ctx.stroke(rail(H));
  ctx.strokeStyle = '#f1f1f3'; ctx.lineWidth = 1.5; ctx.stroke(rail(H + 1.5));

  // handrail in front of the bars on the far half
  ctx.save(); ctx.beginPath(); ctx.rect(x - 20, y - 30, w + 40, cy - y + 30); ctx.clip(); handrail(); ctx.restore();

  ctx.restore();
}