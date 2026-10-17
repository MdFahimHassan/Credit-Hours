// nose.js - the shape of the escalator railing's rounded "hat" nose (zone 1, tiles x15-18, rows 13-17) as SOLID bands for the player.
// renderer.js buildNose() paints the nose from these same numbers, so the collision follows the drawn rail exactly (the old version blocked the
// whole tile rectangle round the curve, leaving visibly empty floor in the corners next to the diagonal rails that the player could not enter).
// No imports on purpose (map.js uses it): everything in pixels.
export const NOSE = { tx: 15, ty: 13, w: 4, h: 5 };                      // tiles covered by the nose picture
export const HAT_TOP = 14, HAT_BOT = 142, HAT_START = 27, HAT_TIP = 114, TIP_R = 26, HAT_ANGLE = 48, HAT_HANDLE = 10;
export const NOSE_X0 = 32;                                               // the nose proper starts at tile 16 (x 32 inside the picture); everything left of it is straight rail
const OUT_TOP = 8, OUT_BOT = 8, CHANNEL = 3;                             // how far the drawn rail reaches outwards of its centre line (bar 8px; the bottom rail also has a 3px steel channel on the outside)

// the outer outline of the whole nose, in picture pixels, clockwise: along the top rail, round the tip, back along the bottom rail
function outline() {
  const cy = (HAT_TOP + HAT_BOT) / 2, phi = HAT_ANGLE * Math.PI / 180, cx = HAT_TIP - TIP_R;
  const dirx = Math.cos(phi), diry = Math.sin(phi);
  const E = [cx + TIP_R * Math.sin(phi), cy - TIP_R * Math.cos(phi)];
  const B = [[HAT_START, HAT_TOP], [HAT_START + 22, HAT_TOP], [E[0] - HAT_HANDLE * dirx, E[1] - HAT_HANDLE * diry], E];
  const top = [];
  const add = (x, y, tx, ty) => top.push({ x, y, tx, ty });
  for (let x = 0; x < HAT_START; x += 1) add(x, HAT_TOP, 1, 0);
  for (let i = 0; i <= 240; i++) {
    const t = i / 240, u = 1 - t;
    const x = u*u*u*B[0][0] + 3*u*u*t*B[1][0] + 3*u*t*t*B[2][0] + t*t*t*B[3][0];
    const y = u*u*u*B[0][1] + 3*u*u*t*B[1][1] + 3*u*t*t*B[2][1] + t*t*t*B[3][1];
    const dx = 3 * (u*u*(B[1][0] - B[0][0]) + 2*u*t*(B[2][0] - B[1][0]) + t*t*(B[3][0] - B[2][0]));
    const dy = 3 * (u*u*(B[1][1] - B[0][1]) + 2*u*t*(B[2][1] - B[1][1]) + t*t*(B[3][1] - B[2][1]));
    const l = Math.hypot(dx, dy); add(x, y, dx / l, dy / l);
  }
  for (let i = 1; i <= 90; i++) { const a = phi + (Math.PI / 2 - phi) * i / 180 * 2; add(cx + TIP_R * Math.sin(a), cy - TIP_R * Math.cos(a), Math.cos(a), Math.sin(a)); }
  const pts = top.map((q) => [q.x + q.ty * OUT_TOP, q.y - q.tx * OUT_TOP]);             // outward normal of a point = (ty, -tx)
  for (let i = top.length - 1; i >= 0; i--) {                                             // the bottom rail is the mirror image (the steel channel makes it up to 3px thicker, fading out round the tip)
    const q = top[i], fk = Math.max(0, Math.min(1, Math.abs(q.tx) * 1.6)), o = OUT_BOT + CHANNEL * fk;
    pts.push([q.x + q.ty * o, 2 * cy - (q.y - q.tx * o)]);
  }
  return pts;
}

// Solid rows (2px bands, world pixels) covering everything inside the nose from tile 16 on: {x, y, w, h}. (tx0, ty0) = top-left tile of the picture.
export function noseBands(tx0 = NOSE.tx, ty0 = NOSE.ty, tile = 32, step = 2) {
  const P = outline(), out = [];
  let y0 = Infinity, y1 = -Infinity;
  for (const [, y] of P) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  for (let yy = Math.floor(y0); yy < y1; yy += step) {
    const lo = yy, hi = yy + step;                                                      // band = widest extent of the outline over the whole 2px row (never narrower than what is drawn)
    let xmax = -Infinity;
    for (let i = 0; i < P.length; i++) {
      const [xa, ya] = P[i], [xb, yb] = P[(i + 1) % P.length];
      const a = Math.max(Math.min(ya, yb), lo), b = Math.min(Math.max(ya, yb), hi);
      if (a > b) continue;
      const xAt = (y) => (yb === ya ? Math.max(xa, xb) : xa + (xb - xa) * (y - ya) / (yb - ya));
      xmax = Math.max(xmax, xAt(a), xAt(b));
    }
    if (xmax > NOSE_X0 + 0.5) out.push({ x: tx0 * tile + NOSE_X0, y: ty0 * tile + yy, w: xmax - NOSE_X0, h: step + 0.01 });
  }
  return out;
}