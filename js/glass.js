// glass.js - the raised glass skylight ('W' tiles) and the little people on the floor BELOW it.
//
// Drawing order for the glass (all inside a clip that only covers the glass tops):
//   1. the lower floor            (small tiles = it is far away)
//   2. people on it               (drawn small = far away, and they shift a bit when the camera moves = parallax)
//   3. a depth dimmer             (the floor below is in the shade)
//   4. the glass itself           (tint, sky reflection, glints, water drops, seams, metal frame)
// So it reads as a sheet of real glass, not as a hole.
//
// The crowd below has three kinds of people:
//   - wanderers      walk to random spots, pause, pick a new spot
//   - phone-checkers stand still looking at a phone (and sometimes put it away and wander off)
//   - gossip circles 3-5 people standing in a loose circle, facing each other (circles break up and re-form)
//
// Every block of 'W' tiles in a zone becomes one platform. The bottom row of a block shows a louvered front.
import { TILE, getTile, zoneId, cols, rows, holes } from './map.js';
import { holeInner, drawHoleInterior, drawHoleRail } from './hole.js';
import { drawStudent, prepareVariants, VARIANT_COUNT } from './sprites.js';

export const FRONT_H = 10;              // height (px) of the louvered FRONT face (bottom edge)
export const SIDE_W = 10;               // width (px) of the louvered LEFT face (left edge)

// ---------- TWEAK ME ----------------------------------------------------------------------
const STUDENT_SCALE = 0.32;             // size of people below (the player is 0.75) -> bigger = closer floor
const FLOOR_TILE = 13;                  // lower-floor tile size in px (the roof floor is 32) -> smaller = deeper
const PARALLAX = 0.30;                  // 0 = floor below is glued to the roof, higher = more depth when you move
const STUDENT_COUNT = 34;               // how many people are down there in total
const DIM = 0.16;                       // how dark the floor below is (0-1)
const GLASS_TINT = 0.18;                // how strongly the glass tints what's below (0-1)
// crowd mix
const PHONE_SHARE = 0.30;                                // ~30% stand on their phone (changes over time)
const HOLE_DENSITY = 0.5;                                // holes (hole.js): people per 1000 px^2 of the area they roam - every hole has its OWN crowd
const HOLE_MARGIN = 30;                                  // px of extra floor round a hole for people to roam in (the parallax slide reveals it)
let PHONE_COUNT = Math.round(STUDENT_COUNT * PHONE_SHARE);   // (set per crowd: the skylight and every hole each have their own)
let GROUP_SIZES = [5, 4, 3];                             // starting gossip circles (~35% of the crowd)
let GROUP_TARGET = GROUP_SIZES.length;                   // when a circle breaks up, a new one forms
const PERSONAL = 11;                                     // px: walkers steer away from anyone closer than this
// -------------------------------------------------------------------------------------------

const fract = (v) => v - Math.floor(v);
const hash = (a, b, c = 0) => fract(Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453);

// ---- find the glass in the current zone (cached per zone) ----
let cachedZone = null, glass = [], bbox = null, holeClip = null;
function scan() {
  if (cachedZone === zoneId) return;
  cachedZone = zoneId; glass = []; bbox = null; holeClip = null;
  if (holes.length) {                              // holes (hole.js): the same lower floor + crowd, seen through capsule-shaped openings, no glass on top
    holeClip = new Path2D();
    let hx0 = Infinity, hy0 = Infinity, hx1 = -Infinity, hy1 = -Infinity;
    for (const h of holes) {
      holeClip.addPath(holeInner(h));
      hx0 = Math.min(hx0, h.x); hy0 = Math.min(hy0, h.y - 20); hx1 = Math.max(hx1, h.x + h.w); hy1 = Math.max(hy1, h.y + h.h);   // (20px above: the fence is drawn up there)
    }
    bbox = { x: hx0, y: hy0, w: hx1 - hx0, h: hy1 - hy0, cx: (hx0 + hx1) / 2, cy: (hy0 + hy1) / 2 };
    return;
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
    if (getTile(tx, ty) !== 'W') continue;
    const isW = (x, y) => getTile(x, y) === 'W';
    const n = isW(tx, ty - 1), s = isW(tx, ty + 1), w = isW(tx - 1, ty), e = isW(tx + 1, ty);
    const top = s ? TILE : TILE - FRONT_H;          // glass height inside this tile (the front face takes the rest)
    const lx = w ? 0 : SIDE_W;                      // glass starts this far right (the left face takes the rest)
    glass.push({ tx, ty, n, s, w, e, top, lx, tw: TILE - lx });
    x0 = Math.min(x0, tx * TILE + lx); y0 = Math.min(y0, ty * TILE);
    x1 = Math.max(x1, (tx + 1) * TILE); y1 = Math.max(y1, ty * TILE + top);
  }
  if (glass.length) bbox = { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

// ---- the lower floor: one small repeating pattern ----
let floorPattern = null;
function makeFloorPattern(ctx) {
  const T = FLOOR_TILE, c = document.createElement('canvas'); c.width = c.height = T * 2;
  const g = c.getContext('2d');
  g.fillStyle = '#5d6469'; g.fillRect(0, 0, T * 2, T * 2);
  g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, 0, T, T); g.fillRect(T, T, T, T);   // checker
  g.fillStyle = 'rgba(0,0,0,0.28)';                                                          // joints
  g.fillRect(0, 0, T * 2, 1); g.fillRect(0, T, T * 2, 1); g.fillRect(0, 0, 1, T * 2); g.fillRect(T, 0, 1, T * 2);
  return ctx.createPattern(c, 'repeat');
}

// ---- the crowd: wanderers, phone-checkers and gossip circles ----------------------------
// Positions are RELATIVE to the glass centre ("below" space), so they work wherever you put the glass.
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

let people = [], groups = [], world = null, formT = 0;
let crowdZone = null, lastTime = null;

function newPerson(mode) {
  return {
    x: 0, y: 0, vx: 0, vy: 0, mode,                       // mode: 'walk' | 'phone' | 'group' | 'join'
    variant: Math.floor(Math.random() * VARIANT_COUNT),
    facing: 'down', moving: false, t: rand(0, 5),
    speed: rand(26, 46), phase: rand(0, TAU),
    tx: null, ty: null, wait: 0, travel: 0,               // walking target / pause / time spent on this trip
    group: null, slot: null, look: null, lookTimer: rand(0, 3),
    phoneTimer: 0, glance: 0, nextGlance: rand(3, 8), bob: 0, nextBob: rand(2, 6),
  };
}

// A random spot on the lower floor that is not too close to anyone standing still.
function freeSpot(minDist, margin = 8) {
  let best = null, bestD = -1;
  for (let i = 0; i < 14; i++) {
    const x = rand(-world.hx + margin, world.hx - margin), y = rand(-world.hy + margin, world.hy - margin);
    let d = Infinity;
    for (const o of people) if (o.mode !== 'walk') d = Math.min(d, Math.hypot(o.x - x, o.y - y));
    if (d >= minDist) return { x, y };
    if (d > bestD) { bestD = d; best = { x, y }; }
  }
  return best;
}

function faceToward(p, x, y) {
  const dx = x - p.x, dy = y - p.y;
  p.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
}

// Give a set of people their place in a loose circle around (cx, cy).
function setupGroup(members, cx, cy) {
  const g = { cx, cy, members, life: rand(25, 55), speaker: 0, speakT: rand(2, 4) };
  const k = members.length, base = rand(0, TAU);
  members.forEach((m, i) => {
    const a = base + (i * TAU) / k + rand(-0.25, 0.25);        // uneven spacing = organic circle
    const r = 9 + k * 1.6 + rand(-2, 2);
    m.group = g; m.slot = { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
    m.look = members[0]; m.lookTimer = rand(0, 3);
  });
  groups.push(g);
  return g;
}

// New circle: the walkers nearest to a free spot walk over and join it.
function formGroup() {
  const walkers = people.filter((p) => p.mode === 'walk');
  const k = Math.min(walkers.length, 3 + Math.floor(Math.random() * 3));
  if (k < 3) return;
  const c = freeSpot(46, 24);
  walkers.sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y));
  const members = walkers.slice(0, k);
  setupGroup(members, c.x, c.y);
  for (const m of members) { m.mode = 'join'; m.tx = m.slot.x; m.ty = m.slot.y; m.travel = 0; m.wait = 0; }
}

function disperse(g) {
  groups = groups.filter((x) => x !== g);
  for (const m of g.members) {                                 // everyone wanders off in their own direction
    m.mode = 'walk'; m.group = null; m.slot = null;
    m.tx = null; m.wait = rand(0, 1.5);
  }
}

function buildCrowd(bb = bbox, count = STUDENT_COUNT, margin = 60) {
  people = []; groups = []; formT = rand(4, 8);
  PHONE_COUNT = Math.round(count * PHONE_SHARE);
  GROUP_SIZES = count >= 30 ? [5, 4, 3] : count >= 20 ? [4, 3] : [3];
  GROUP_TARGET = GROUP_SIZES.length;
  world = { hx: bb.w / 2 + margin, hy: bb.h / 2 + margin };       // area people can roam (a margin covers the parallax shift)

  for (const size of GROUP_SIZES) {                            // 1) gossip circles
    const c = freeSpot(46, 24);
    const members = Array.from({ length: size }, () => newPerson('group'));
    setupGroup(members, c.x, c.y);
    for (const m of members) { m.x = m.slot.x; m.y = m.slot.y; people.push(m); }
  }
  for (let i = 0; i < PHONE_COUNT; i++) {                      // 2) phone-checkers
    const p = newPerson('phone'), s = freeSpot(18);
    p.x = s.x; p.y = s.y; p.phoneTimer = rand(8, 35);
    people.push(p);
  }
  while (people.length < count) {                      // 3) wanderers (the rest)
    const p = newPerson('walk'), s = freeSpot(14);
    p.x = s.x; p.y = s.y; p.wait = rand(0, 3);
    people.push(p);
  }
}

// Walk one step toward (tx, ty), steering around other people. Returns true when arrived.
function steer(p, dt, tx, ty, arriveR) {
  const dx = tx - p.x, dy = ty - p.y, dist = Math.hypot(dx, dy);
  if (dist < arriveR) { p.moving = false; return true; }
  let ax = dx / dist, ay = dy / dist;
  for (const o of people) {                                    // gentle push away from anyone too close
    if (o === p || (p.group && o.group === p.group)) continue;
    const ex = p.x - o.x, ey = p.y - o.y, d = Math.hypot(ex, ey);
    if (d > 0 && d < PERSONAL) { const w = ((PERSONAL - d) / PERSONAL) * 1.8; ax += (ex / d) * w; ay += (ey / d) * w; }
  }
  const len = Math.hypot(ax, ay) || 1;
  const sp = p.speed * (dist < 20 ? 0.5 + dist / 40 : 1);     // slow down when close to the goal
  p.vx = (ax / len) * sp; p.vy = (ay / len) * sp;
  p.x = Math.max(-world.hx, Math.min(world.hx, p.x + p.vx * dt));
  p.y = Math.max(-world.hy, Math.min(world.hy, p.y + p.vy * dt));
  p.moving = true; p.t += dt;
  const avx = Math.abs(p.vx), avy = Math.abs(p.vy);           // keep the old facing when nearly diagonal (no flicker)
  if (avx > avy * 1.25) p.facing = p.vx < 0 ? 'left' : 'right';
  else if (avy > avx * 1.25) p.facing = p.vy < 0 ? 'up' : 'down';
  return false;
}

function updatePerson(p, dt) {
  p.moving = false;                                            // steer() sets it back to true while walking
  switch (p.mode) {
    case 'walk': {
      if (p.wait > 0) { p.wait -= dt; return; }                // standing around for a bit
      if (p.tx == null) { const s = freeSpot(18); p.tx = s.x; p.ty = s.y; p.travel = 0; }
      p.travel += dt;
      if (steer(p, dt, p.tx, p.ty, 4) || p.travel > 25) {      // arrived (or gave up on a blocked trip)
        p.tx = null;
        const phones = people.filter((q) => q.mode === 'phone').length;
        const chance = phones < PHONE_COUNT - 3 ? 0.6 : phones < PHONE_COUNT + 3 ? 0.3 : 0;
        if (Math.random() < chance) {                          // stop and check the phone
          p.mode = 'phone'; p.phoneTimer = rand(12, 35); p.facing = 'down';
          p.glance = 0; p.nextGlance = rand(3, 8); p.bob = 0; p.nextBob = rand(2, 6);
        } else p.wait = rand(0, 5);                            // just pause, then pick a new spot
      }
      return;
    }
    case 'phone': {
      p.phoneTimer -= dt;
      if (p.glance > 0) {                                      // looking away from the phone for a moment
        p.glance -= dt;
        if (p.glance <= 0) { p.facing = 'down'; p.nextGlance = rand(4, 10); }
      } else {
        p.nextGlance -= dt;
        if (p.nextGlance <= 0) { p.glance = rand(0.8, 1.6); p.facing = Math.random() < 0.5 ? 'left' : 'right'; }
      }
      if (p.bob > 0) p.bob -= dt;                              // little weight shift
      else { p.nextBob -= dt; if (p.nextBob <= 0) { p.bob = 0.35; p.nextBob = rand(3, 8); } }
      if (p.phoneTimer <= 0) { p.mode = 'walk'; p.wait = 0; p.tx = null; }   // phone away, walk off
      return;
    }
    case 'join': {
      p.travel += dt;
      if (steer(p, dt, p.tx, p.ty, 3) || p.travel > 30) { p.x = p.slot.x; p.y = p.slot.y; p.mode = 'group'; p.moving = false; }
      return;
    }
    case 'group': {
      const g = p.group;
      p.lookTimer -= dt;
      if (p.lookTimer <= 0) {                                  // turn to look at whoever is talking (or someone else)
        p.lookTimer = rand(2, 5);
        p.look = Math.random() < 0.65 ? g.members[g.speaker] : pick(g.members);
      }
      const t = p.look && p.look !== p && g.members.includes(p.look) ? p.look : { x: g.cx, y: g.cy };
      faceToward(p, t.x, t.y);
      return;
    }
  }
}

function stepCrowd(dt) {
  for (const g of groups.slice()) {
    g.speakT -= dt;
    if (g.speakT <= 0) { g.speaker = Math.floor(Math.random() * g.members.length); g.speakT = rand(2, 4.5); }
    g.life -= dt;
    if (g.life <= 0) disperse(g);
  }
  for (const p of people) updatePerson(p, dt);
  if (groups.length < GROUP_TARGET) {
    formT -= dt;
    if (formT <= 0) { formGroup(); formT = rand(4, 10); }
  }
}

// vertical offset in px: phone-checkers shift their weight, whoever is talking bobs a little
function bobOffset(p, time) {
  if (p.mode === 'phone') return p.bob > 0 ? -1 : 0;
  if (p.mode === 'group' && p.group.members[p.group.speaker] === p) {
    return Math.sin(time * 2.3 + p.phase) > -0.2 ? -Math.max(0, Math.sin(time * 12 + p.phase)) * 0.8 : 0;
  }
  return 0;
}

// tiny phone in the hand + a faint flickering screen glow (the sheet has no "holding a phone" frames)
function drawPhone(ctx, p, x, y, time) {
  if (p.facing === 'up') return;                               // back is turned: phone isn't visible
  const side = p.facing === 'left' ? -6 : p.facing === 'right' ? 4 : -1.5;
  const phx = Math.round(x + side), phy = Math.round(y - 9);
  const flick = 0.5 + 0.5 * Math.sin(time * 7 + p.phase) * Math.sin(time * 2.3 + p.phase);
  ctx.fillStyle = `rgba(150,215,255,${0.10 + 0.10 * flick})`;
  ctx.beginPath(); ctx.arc(phx + 1.5, phy + 2, 4.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#dff3ff'; ctx.fillRect(phx, phy, 3, 4);
}

// ---- the metal faces of the box (called by the normal tile loop) ----
// FRONT face = louvers with horizontal slats, on the bottom row.  LEFT face = louvers with vertical slats, on the left column.
export function drawGlassFront(ctx, px, py, tx, ty) {
  ctx.fillStyle = '#2f3b43'; ctx.fillRect(px, py, TILE, TILE);            // base (the glass pass paints over the top part)
  const isW = (x, y) => getTile(x, y) === 'W';
  const hasS = isW(tx, ty + 1), hasE = isW(tx + 1, ty), hasW = isW(tx - 1, ty), hasN = isW(tx, ty - 1);

  if (!hasW) {                                                            // left face
    const h = hasS ? TILE : TILE - FRONT_H;                               // the front face covers the bottom part
    ctx.fillStyle = "#b0b5b8"; ctx.fillRect(px, py, SIDE_W, h);
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    for (let i = 3; i < SIDE_W - 2; i += 3) ctx.fillRect(px + i, py, 1, h);   // vertical slats
    ctx.fillStyle = '#d6d9db'; ctx.fillRect(px, py, 2, h);                // bright outer post
    ctx.fillStyle = '#868b8f'; ctx.fillRect(px + SIDE_W - 2, py, 2, h);   // shadowed edge next to the glass
    if (hasN) { ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.fillRect(px, py, SIDE_W, 1); }   // joint between panels
    else      { ctx.fillStyle = '#d6d9db';          ctx.fillRect(px, py, SIDE_W, 2); }   // top cap
  }
  if (!hasS) {                                                            // front face (full tile width, so it also wraps the corner)
    const fy = py + TILE - FRONT_H;
    ctx.fillStyle = '#c9cdcf'; ctx.fillRect(px, fy, TILE, FRONT_H);
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    for (let i = 2; i < FRONT_H - 2; i += 3) ctx.fillRect(px, fy + i, TILE, 1);   // horizontal slats
    ctx.fillStyle = '#8d9296'; ctx.fillRect(px, fy + FRONT_H - 2, TILE, 2);       // shadowed base
    ctx.fillStyle = '#a2a7aa'; ctx.fillRect(px, fy, 2, FRONT_H);                  // vertical post
    if (!hasE) ctx.fillRect(px + TILE - 2, fy, 2, FRONT_H);
  }
}

// The lower floor + the people on it + the depth dimmer, seen through whatever clip is active (bb = the box round the opening).
function drawBelow(ctx, time, camera, VW, VH, bb, laneLines = true) {
  // parallax: the floor below is far away, so it slides less than the roof when the camera moves
  const px = (camera.x + VW / 2 - bb.cx) * PARALLAX, py = (camera.y + VH / 2 - bb.cy) * PARALLAX;
  const ox = bb.cx + px, oy = bb.cy + py;                             // origin of the "below" world

  // 1) lower floor
  const ex = bb.w / 2 + 150, ey = bb.h / 2 + 150;                      // how far the floor must extend (parallax margin)
  ctx.save();
  ctx.translate(Math.round(ox), Math.round(oy));
  ctx.fillStyle = floorPattern; ctx.fillRect(-ex, -ey, ex * 2, ey * 2);
  // painted lane lines (dashed), a tactile strip and a few hatches, like on the real floor
  if (laneLines) {                                                     // (the holes pass false: no dotted white line down there)
    ctx.fillStyle = 'rgba(235,235,235,0.55)';
    for (const ly of [-150, 58, 170]) for (let x = -ex; x < ex; x += 22) ctx.fillRect(x, ly, 12, 2);
  }
  ctx.fillStyle = 'rgba(205,200,170,0.5)'; ctx.fillRect(-62, -ey, 5, ey * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = -ey; y < ey; y += 4) ctx.fillRect(-61, y, 3, 1);
  for (const [hx, hy] of [[40, -70], [-30, 120], [30, 210], [-20, -200]]) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(hx, hy, 26, 26);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(hx + 2, hy + 2, 22, 2);
  }

  // 2) people (drawn small, sorted so the lower ones are on top)
  ctx.imageSmoothingEnabled = true;                                        // tiny sprites look better smoothed
  const list = [];
  for (const p of people) {
    if (Math.abs(p.x + px) > bb.w / 2 + 24 || Math.abs(p.y + py) > bb.h / 2 + 24) continue;   // not near the glass
    const wx = ox + p.x, wy = oy + p.y;                                                         // ...or not on the screen at all (a big skylight / hole only shows part of its crowd)
    if (wx < camera.x - 24 || wx > camera.x + VW + 24 || wy < camera.y - 24 || wy > camera.y + VH + 48) continue;
    list.push(p);
  }
  list.sort((a, b) => a.y - b.y);
  for (const p of list) {
    const off = bobOffset(p, time);
    drawStudent(ctx, p.variant, p.facing, p.moving, p.t, p.x, p.y + off, STUDENT_SCALE, 0.32 * p.speed);
    if (p.mode === 'phone') drawPhone(ctx, p, p.x, p.y + off, time);
  }
  ctx.imageSmoothingEnabled = false;
  ctx.restore();

  // 3) depth dimmer: the floor below is in shade
  ctx.fillStyle = `rgba(14,24,32,${DIM})`; ctx.fillRect(bb.x, bb.y, bb.w, bb.h);
}

// Holes (hole.js): every hole looks down onto its OWN patch of lower floor with its own crowd (a single crowd spread over the whole zone would leave them empty).
let holeCrowds = [];
function ensureHoleCrowds() {
  if (crowdZone === zoneId) return;
  holeCrowds = holes.map((h) => {
    const bb = { x: h.x, y: h.y, w: h.w, h: h.h, cx: h.x + h.w / 2, cy: h.y + h.h / 2 };
    const count = Math.max(8, Math.round(((bb.w + 2 * HOLE_MARGIN) * (bb.h + 2 * HOLE_MARGIN) / 1000) * HOLE_DENSITY));
    buildCrowd(bb, count, HOLE_MARGIN);
    return { bb, phone: PHONE_COUNT, sizes: GROUP_SIZES, target: GROUP_TARGET, people, groups, world, formT };
  });
  crowdZone = zoneId; lastTime = null;
}
// builds the crowd + the lower-floor pattern ahead of time, behind the black screen (see warmup.js)
export function warmGlass(ctx) {
  scan();
  if (!bbox) return;
  if (!floorPattern) floorPattern = makeFloorPattern(ctx);
  if (holeClip) ensureHoleCrowds();
  else if (crowdZone !== zoneId) { buildCrowd(); crowdZone = zoneId; lastTime = null; }
}
function drawHoles(ctx, time, camera, VW, VH) {
  ensureHoleCrowds();
  const dt = lastTime == null ? 0 : Math.min(0.05, Math.max(0, time - lastTime));
  lastTime = time;
  holes.forEach((h, i) => {
    const c = holeCrowds[i], bb = c.bb;
    ({ people, groups, world, formT } = c); PHONE_COUNT = c.phone; GROUP_SIZES = c.sizes; GROUP_TARGET = c.target;   // switch to this hole's crowd
    stepCrowd(dt);
    c.groups = groups; c.formT = formT;
    if (h.x > camera.x + VW || h.x + h.w < camera.x || h.y - 20 > camera.y + VH || h.y + h.h < camera.y) return;   // off-screen: still simulated, not drawn
    ctx.save();
    ctx.clip(holeInner(h));
    drawBelow(ctx, time, camera, VW, VH, bb, false);
    drawHoleInterior(ctx, h);
    ctx.restore();
    drawHoleRail(ctx, h);
  });
}

// ---- the glass tops + everything seen through them (called once per frame, after the tiles) ----
export function drawGlassTops(ctx, time, camera, VW, VH) {
  scan();
  if (!bbox) return;
  prepareVariants();                                                      // builds one recoloured student per frame
  // skip if the platform is off-screen
  if (bbox.x > camera.x + VW || bbox.x + bbox.w < camera.x || bbox.y > camera.y + VH || bbox.y + bbox.h < camera.y) return;
  if (!floorPattern) floorPattern = makeFloorPattern(ctx);

  if (holeClip) { drawHoles(ctx, time, camera, VW, VH); return; }          // holes: each one gets its own crowd below

  // run the crowd simulation (rebuilt whenever the zone changes)
  if (crowdZone !== zoneId) { buildCrowd(); crowdZone = zoneId; lastTime = null; }
  const dt = lastTime == null ? 0 : Math.min(0.05, Math.max(0, time - lastTime));
  lastTime = time;
  stepCrowd(dt);

  ctx.save();
  const clip = new Path2D(); for (const t of glass) clip.rect(t.tx * TILE + t.lx, t.ty * TILE, t.tw, t.top);
  ctx.clip(clip);
  drawBelow(ctx, time, camera, VW, VH, bbox);

  // 4) the glass ------------------------------------------------------------
  ctx.fillStyle = `rgba(170,208,222,${GLASS_TINT})`; ctx.fillRect(bbox.x, bbox.y, bbox.w, bbox.h);   // blue-green tint
  const sky = ctx.createLinearGradient(bbox.x, bbox.y, bbox.x + bbox.w * 0.55, bbox.y + bbox.h);      // sky reflection
  sky.addColorStop(0, 'rgba(240,248,252,0.38)'); sky.addColorStop(0.55, 'rgba(240,248,252,0.14)'); sky.addColorStop(1, 'rgba(240,248,252,0.04)');
  ctx.fillStyle = sky; ctx.fillRect(bbox.x, bbox.y, bbox.w, bbox.h);

  // reflection of the roof beams: a soft dark diagonal band, plus drifting bright glints
  ctx.save();
  ctx.translate(bbox.x, bbox.y);
  ctx.fillStyle = 'rgba(25,35,45,0.15)';
  for (const bx0 of [bbox.w * 0.1, bbox.w * 0.1 - bbox.h * 0.6]) {         // two soft dark bands (reflected roof beams)
    ctx.beginPath(); ctx.moveTo(bx0, 0); ctx.lineTo(bx0 + 30, 0); ctx.lineTo(bx0 + 30 + bbox.h, bbox.h); ctx.lineTo(bx0 + bbox.h, bbox.h); ctx.fill();
  }
  const shift = (time * 6) % 80;
  for (let c = -bbox.h - 80 + shift; c < bbox.w + 80; c += 80) {
    ctx.beginPath(); ctx.moveTo(c, 0); ctx.lineTo(c + bbox.h, bbox.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 16; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.17)'; ctx.lineWidth = 3; ctx.stroke();
  }
  ctx.restore();

  // per-panel details: water drops, dust, seams, metal frame
  for (const t of glass) {
    const x = t.tx * TILE + t.lx, y = t.ty * TILE, tw = t.tw;               // x,y,tw,top = the glass rectangle of this panel
    // water drops (fixed random spots)
    for (let i = 0; i < 3; i++) {
      const dx = x + 3 + hash(t.tx, t.ty, i) * (tw - 8), dy = y + 3 + hash(t.tx, t.ty, i + 9) * (t.top - 8);
      const r = 0.6 + hash(t.tx, t.ty, i + 20) * 0.9;
      ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.ellipse(dx, dy, r * 1.3, r, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(Math.round(dx - 1), Math.round(dy - 1), 1, 1);
    }
    // a faint scratch / dust streak on some panels
    if (hash(t.tx, t.ty, 33) > 0.55) {
      ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 1; ctx.beginPath();
      const sx = x + hash(t.tx, t.ty, 40) * 14, sy = y + hash(t.tx, t.ty, 41) * (t.top - 12);
      ctx.moveTo(sx, sy); ctx.lineTo(sx + 10, sy + 8); ctx.stroke();
    }
    // seams between panels: dark gap with a light metal edge
    if (t.e) { ctx.fillStyle = 'rgba(12,18,24,0.55)'; ctx.fillRect(x + tw - 1, y, 2, t.top); ctx.fillStyle = 'rgba(215,224,229,0.55)'; ctx.fillRect(x + tw - 2, y, 1, t.top); }
    if (t.s) { ctx.fillStyle = 'rgba(12,18,24,0.55)'; ctx.fillRect(x, y + TILE - 1, tw, 2); ctx.fillStyle = 'rgba(215,224,229,0.55)'; ctx.fillRect(x, y + TILE - 2, tw, 1); }
    // metal frame on the outer edges + green glass edge + inner shadow
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    if (!t.n) ctx.fillRect(x, y + 3, tw, 3);
    if (!t.w) ctx.fillRect(x + 3, y, 3, t.top);
    ctx.fillStyle = 'rgba(120,200,190,0.45)';
    if (!t.n) ctx.fillRect(x, y + 3, tw, 1);
    if (!t.w) ctx.fillRect(x + 3, y, 1, t.top);
    ctx.fillStyle = '#b4babd';
    if (!t.n) ctx.fillRect(x, y, tw, 3);
    if (!t.w) ctx.fillRect(x, y, 3, t.top);
    if (!t.e) ctx.fillRect(x + tw - 3, y, 3, t.top);
    if (!t.s) { ctx.fillRect(x, y + t.top - 3, tw, 3); ctx.fillStyle = '#7d8387'; ctx.fillRect(x, y + t.top - 1, tw, 1); }
  }
  ctx.restore();
}