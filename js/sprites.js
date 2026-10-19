// sprites.js - draws characters from LPC spritesheets (64x64 frames).
// Both sheets use the same layout, so ONE draw function handles the player AND the NPC.
// WALK animation = rows 8-11 (one row per direction), 9 frames each.
// Frame 0 = standing still, frames 1-8 = the walking cycle.
const FRAME = 64;                                   // frame size in the sheet
const WALK_ROW = { up: 8, left: 9, down: 10, right: 11 };
const SIT_ROW = { up: 30, left: 31, down: 32, right: 33 };   // sitting rows of the PLAYER sheet
const SIT_FRAME = 2;                                // frame 2 = seated on a bench/chair (frames 0-1 sit on the ground)
const CLIMB_ROW = 21;                               // climbing row of the PLAYER sheet: seen from behind, 6 frames (hand over hand, foot over foot)
const CLIMB_FRAMES = 6;
// The sheet has no climbing row seen from the FRONT (needed for the south pool ladder, where you face the camera), so we build one once from
// frames that exist: legs from the walk-down row, head + torso from a spellcast frame, and each ARM from a spellcast frame with the arm held low
// (fists at the waist, like gripping the rails of a ladder you are climbing down). One arm is out a little more than the other and they swap
// half way round the cycle (hand over hand) while the legs step one after the other.
let frontClimbCanvas = null;
function buildFrontClimb(sheet) {
  const CUT = 42, X0 = 22, X1 = 42, ARM_Y = 52;                            // CUT = waist line; X0..X1 = body (arms are outside it); ARM_Y = how far down the arms are copied
  const OUT = 3, IN = 1;                                                    // spellcast frames: 3 = hand a little out to the side, 1 = elbow tucked in
  const c = document.createElement('canvas'); c.width = FRAME * CLIMB_FRAMES; c.height = FRAME;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  for (let f = 0; f < CLIMB_FRAMES; f++) {
    g.save(); g.translate(f * FRAME, 0);
    const leg = 1 + Math.floor(f * 8 / CLIMB_FRAMES);
    g.drawImage(sheet, leg * FRAME + X0, 10 * FRAME + CUT, X1 - X0, FRAME - CUT, X0, CUT, X1 - X0, FRAME - CUT);       // legs
    g.drawImage(sheet, IN * FRAME + X0, 2 * FRAME, X1 - X0, CUT, X0, 0, X1 - X0, CUT);                                   // head + torso
    const [L, R] = f < CLIMB_FRAMES / 2 ? [OUT, IN] : [IN, OUT];
    g.drawImage(sheet, L * FRAME, 2 * FRAME, X0, ARM_Y, 0, 0, X0, ARM_Y);                                                // left arm
    g.drawImage(sheet, R * FRAME + X1, 2 * FRAME, FRAME - X1, ARM_Y, X1, 0, FRAME - X1, ARM_Y);                          // right arm
    g.restore();
  }
  return c;
}
const WALK_FPS = 12;                                // walking animation speed
const FEET_X = 32, FEET_Y = 56;                     // where the feet are inside a 64x64 frame
const SCALE = 0.75;   // 1 = original 64px, 0.5 = 32px. 

// Load each sheet once. Paths are relative to index.html.
function load(src) { const img = new Image(); img.src = src; return img; }
const sheets = {
  player: load('assets/character-spritesheet.png'),
  npc:    load('assets/npc-spritesheet.png'),
};

// Soft ground shadow under a character's feet. The new generator sheets have NO baked-in shadow, so we draw one here (two stacked ellipses =
// a soft edge with a darker core). (cx, footY) = feet position, scale = sprite scale. TWEAK ME: the radii (px at scale 1) and the alphas.
function drawShadow(ctx, cx, footY, scale) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.24)'; ctx.beginPath(); ctx.ellipse(cx, footY + 0.5 * scale, 15 * scale, 6.2 * scale, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.beginPath(); ctx.ellipse(cx, footY + 0.5 * scale, 10.5 * scale, 4.2 * scale, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Draws one character. `who` needs: cx (feet x), facing, moving, animTime and footY (or y + h).
// `which` picks the sheet: 'player' or 'npc'.
// Returns true if it drew the sprite, false if the image isn't loaded yet (caller draws a fallback box).
export function drawCharacter(ctx, who, which = 'player') {
  const sheet = sheets[which];
  if (!sheet.complete || sheet.naturalWidth === 0) return false;
  const sit = who.sitting && which === 'player';
  const climb = who.climbing && which === 'player';   // on the pool ladder (pool.js sets climbing + climbFrame)
  const frame = climb ? ((who.climbFrame | 0) % CLIMB_FRAMES + CLIMB_FRAMES) % CLIMB_FRAMES
    : sit ? SIT_FRAME : who.moving ? 1 + (Math.floor(who.animTime * WALK_FPS) % 8) : 0;
  const row = climb ? CLIMB_ROW : sit ? (SIT_ROW[who.facing] ?? SIT_ROW.down) : (WALK_ROW[who.facing] ?? WALK_ROW.down);
  const footY = who.footY ?? (who.y + who.h);       // players use their hitbox bottom
  const size = FRAME * SCALE;                       // drawn size on screen
  const dx = Math.round(who.cx - FEET_X * SCALE);   // feet stay at the bottom-center
  const dy = Math.round(footY - FEET_Y * SCALE);
  if (!climb && !who.swimming) drawShadow(ctx, who.cx, footY, SCALE);   // no shadow on the pool ladder wall or in the water
  if (climb && who.climbFront) {                    // climbing while facing us (south pool ladder)
    frontClimbCanvas ??= buildFrontClimb(sheet);
    ctx.drawImage(frontClimbCanvas, frame * FRAME, 0, FRAME, FRAME, dx, dy, size, size);
    return true;
  }
  ctx.drawImage(sheet, frame * FRAME, row * FRAME, FRAME, FRAME, dx, dy, size, size);
  return true;
}

// ======================================================================================
// STUDENT VARIANTS (used for the people you see walking on the floor below the glass)
// We reuse YOUR two spritesheets and recolour them once, so there are no extra assets.
// To add a student, add a line to VARIANTS. Later, real extra spritesheets can replace this.
//   sheet = 'player' | 'npc'      hue  = shift clothes colours (degrees, 0-360)
//   tint  = colour for WHITE clothes (degrees) or null      skin = skin lightness (1 = unchanged)
//   hair  = 'brown' | 'blond' | null (null = keep original black)
// Skin and shoes are protected from the hue shift so people don't turn green or purple.
// ======================================================================================
const VARIANTS = [
  { sheet: 'npc',    hue: 0,   tint: 205,  skin: 1.00, hair: null    },
  { sheet: 'player', hue: 0,   tint: null, skin: 1.00, hair: null    },
  { sheet: 'player', hue: 150, tint: null, skin: 1.12, hair: 'brown' },
  { sheet: 'npc',    hue: 200, tint: 350,  skin: 0.90, hair: null    },
  { sheet: 'player', hue: 235, tint: null, skin: 0.85, hair: null    },
  { sheet: 'npc',    hue: 60,  tint: 140,  skin: 1.15, hair: 'brown' },
  { sheet: 'player', hue: 300, tint: null, skin: 1.05, hair: 'blond' },
  { sheet: 'npc',    hue: 100, tint: 40,   skin: 0.95, hair: null    },
  { sheet: 'player', hue: 45,  tint: null, skin: 0.92, hair: 'brown' },
  { sheet: 'npc',    hue: 270, tint: 280,  skin: 1.08, hair: null    },
];
export const VARIANT_COUNT = VARIANTS.length;
const STU_ROW = { up: 0, left: 1, down: 2, right: 3 };     // row order inside a variant canvas
const built = [];                                          // built[i] = canvas (only the 4 walk rows x 9 frames)

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function buildVariant(v) {
  const src = sheets[v.sheet];
  const c = document.createElement('canvas'); c.width = 9 * FRAME; c.height = 8 * FRAME;   // rows 0-3: walking | rows 4-7: the 'spellcast' pose (hands held up in front), see drawStudentPose
  const g = c.getContext('2d');
  for (let r = 0; r < 4; r++) g.drawImage(src, 0, (8 + r) * FRAME, 9 * FRAME, FRAME, 0, r * FRAME, 9 * FRAME, FRAME);
  for (let r = 0; r < 4; r++) g.drawImage(src, 0, r * FRAME, 7 * FRAME, FRAME, 0, (4 + r) * FRAME, 7 * FRAME, FRAME);   // spellcast rows (up, left, down, right), 7 frames
  try {                                                      // recolour pixel by pixel
    const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 200) continue;                          // leave the soft baked shadow alone
      const yInFrame = ((i / 4) / c.width | 0) % FRAME;      // 0 = top of the 64px frame
      let [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
      const warm = h <= 42 || h >= 348;                         // orange/pink hues = skin, shoes
      if (warm && ((s >= 0.12 && s <= 0.9 && l >= 0.5 && l <= 0.95) ||                 // light skin
                   (h >= 8 && h <= 42 && s >= 0.15 && s <= 0.8 && l >= 0.25 && l < 0.5))) {   // brown skin / shoes
        l = clamp01(l * v.skin);
      } else if (yInFrame < 28 && l < 0.2 && s < 0.4 && v.hair) {                  // hair (head area only)
        if (v.hair === 'brown') { h = 25; s = 0.45; l = clamp01(l * 1.9 + 0.05); }
        else                    { h = 45; s = 0.6;  l = clamp01(l * 2.8 + 0.12); }
      } else if (yInFrame >= 28 && s < 0.2 && l > 0.6 && v.tint != null) {         // white shirt -> coloured shirt
        h = v.tint; s = 0.5; l *= 0.9;
      } else if (s > 0.15) {
        h += v.hue;
      } else continue;
      const [r, gg, b] = hslToRgb(h, s, l);
      d[i] = r; d[i + 1] = gg; d[i + 2] = b;
    }
    g.putImageData(img, 0, 0);
  } catch (e) { /* canvas can't be read (e.g. opened from file://): keep the original colours */ }
  return c;
}

// Builds ONE missing variant per call (spreads the work over frames so there's no hitch).
export function warmSprites() {                            // builds every recoloured student now (each one reads the sheet back from the canvas, which stalls a phone)
  for (let i = 0; i < VARIANTS.length; i++) {
    if (built[i]) continue;
    const s = sheets[VARIANTS[i].sheet];
    if (!s.complete || s.naturalWidth === 0) return false;   // sheet not loaded yet: try again
    built[i] = buildVariant(VARIANTS[i]);
  }
  return true;
}
export function prepareVariants() {
  for (let i = 0; i < VARIANTS.length; i++) {
    if (built[i]) continue;
    const s = sheets[VARIANTS[i].sheet];
    if (!s.complete || s.naturalWidth === 0) return;         // sheet not loaded yet
    built[i] = buildVariant(VARIANTS[i]);
    return;
  }
}

// Draw a small student. (cx, footY) = where the feet are, scale = size (the player is 0.75).
// Returns false if this variant isn't ready yet.
export function drawStudent(ctx, variant, facing, moving, animTime, cx, footY, scale, fps = WALK_FPS) {
  const c = built[variant];
  if (!c) return false;
  const frame = moving ? 1 + (Math.floor(animTime * fps) % 8) : 0;
  const size = FRAME * scale;
  drawShadow(ctx, cx, footY, scale);
  ctx.drawImage(c, frame * FRAME, (STU_ROW[facing] ?? 2) * FRAME, FRAME, FRAME,
    Math.round(cx - FEET_X * scale), Math.round(footY - FEET_Y * scale), size, size);
  return true;
}

// A student standing in the "hands held up in front of the chest" pose (the spellcast row of the LPC sheet, frame 2). Used by the pool
// operators (pool.js), who hold a remote control there. Same arguments as drawStudent, minus the walking ones.
export function drawStudentPose(ctx, variant, facing, cx, footY, scale, frame = 2) {
  const c = built[variant];
  if (!c) return false;
  const size = FRAME * scale;
  drawShadow(ctx, cx, footY, scale);
  ctx.drawImage(c, frame * FRAME, (4 + (STU_ROW[facing] ?? 2)) * FRAME, FRAME, FRAME,
    Math.round(cx - FEET_X * scale), Math.round(footY - FEET_Y * scale), size, size);
  return true;
}