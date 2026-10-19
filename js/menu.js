// menu.js - the main menu (title, episode cards, Settings / Help / Credits) and the pause menu. Everything is drawn on the game canvas in the game's own pixel
// style; there is no HTML. Keyboard, mouse and touch all work: every clickable thing registers a "hit" rectangle while it is drawn (see `hits` below),
// so the pointer code never has to know what is on screen.
//
// Public API (used by main.js):
//   menu.init({ onPlay(episode), onResume(), onQuit() })   once, at start-up
//   menu.enter()                                          show the main menu (fades in from black)
//   menu.update(dt) / menu.draw()                         main menu, every frame while scene is 'menu'
//   menu.openPause() / menu.updatePause(dt) / menu.drawPause()   the pause menu, drawn over the frozen game while scene is 'paused'
//
// Performance: the background pictures are WebP, only the picture on screen and the next one are kept in memory, the dark/vignette/scanline layer is
// built once, and if frames get slow the menu drops its effects by itself (full -> no particles -> no pan/glitch). Settings > Menu effects = Reduced
// starts at the lowest level.
import { input } from './input.js';
import { toGame } from './display.js';
import { settings, setSetting, onSettingChange } from './settings.js';
import { EPISODES, TIMELINES } from './episodes.js';
import { save } from './save.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;
const UI = "'Pixelify Sans','Courier New',monospace";
const TITLE_FONT = "'Rubik Glitch'";
const TEAL = '#5ee7e0', INK = '#e8eef2', MUTE = '#8fa0ad', LINE = '#2a3743';
const VERSION = 'v0.1';

const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const R = (a, b) => a + Math.random() * (b - a);
const rng = (s) => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const LS = (px) => { if ('letterSpacing' in ctx) ctx.letterSpacing = px + 'px'; };
const pressed = (...codes) => codes.some((c) => input.wasPressed(c));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let hooks = { onPlay() {}, onResume() {}, onQuit() {} };
let mode = 'main';              // 'main' (the menu scene) | 'pause' (over the frozen game)
let screen = 'home';            // 'home' | 'settings' | 'help' | 'credits' | 'confirm'
let time = 0;
let fadeIn = 0, leaving = null; // fade from black when the menu opens; { ep, t } while fading out into an episode
let toast = { t: 0, text: '' };
const say = (text) => { toast = { t: 2.4, text }; };

// ------------------------------------------------------------------------------------------------------------------------------------------------
// Quality level: 0 = everything, 1 = no particles, 2 = still picture, no glitch. Drops by itself when frames are slow.
// ------------------------------------------------------------------------------------------------------------------------------------------------
let autoLevel = 0, ema = 0.016, slowFrames = 0;
const level = () => (settings.effects === 'reduced' ? 2 : autoLevel);

// ------------------------------------------------------------------------------------------------------------------------------------------------
// Background timelines
// ------------------------------------------------------------------------------------------------------------------------------------------------
const DWELL = 9, TRANS = 1.5;
const imgs = {};
function load(id) {
  if (imgs[id]) return imgs[id];
  const im = new Image(); im.decoding = 'async'; im.onload = () => { im.ok = true; }; im.src = 'assets/menu/' + id + '.webp';
  return (imgs[id] = im);
}
function release(id) { const im = imgs[id]; if (im) { im.src = ''; delete imgs[id]; } }
let cur = 0, nxt = -1, trans = false, tTrans = 0, age = { cur: 0, nxt: 0 }, fxIdx = -1;
const buf = mk(W, H), bctx = buf.getContext('2d');

function drawBG(c, idx, a, alpha) {
  const im = imgs[TIMELINES[idx].id];
  if (!im || !im.ok) return;
  const s = Math.max(H / im.height * 1.06, W / im.width), dw = im.width * s, dh = im.height * s;
  const p = level() >= 2 ? 0.5 : Math.min(1, a / (DWELL + 2 * TRANS)), dir = idx % 2 ? -1 : 1;
  c.globalAlpha = alpha; c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.drawImage(im, -(dw - W) * (dir > 0 ? p : 1 - p), -(dh - H) / 2, dw, dh);
  c.globalAlpha = 1;
}

// ---- particles: tiny squares, a few dozen at most ----
let parts = [];
function spawn(type, color, anywhere) {
  const p = { type, c: color, t: Math.random() * 10, x: R(0, W), y: R(0, H), vx: 0, vy: 0, s: 1, a: 1, ph: Math.random() * 6.28 };
  switch (type) {
    case 'spark': p.y = R(0, H * 0.4); p.s = Math.random() < 0.2 ? 2 : 1; break;
    case 'dust': p.vx = R(3, 10); p.vy = R(-3, 3); p.a = 0.28; break;
    case 'rain': p.vx = -34; p.vy = R(210, 320); p.a = 0.3; p.y = anywhere ? R(0, H) : -10; break;
    case 'snow': p.vy = R(18, 40); p.s = Math.random() < 0.3 ? 2 : 1; p.a = 0.85; break;
    case 'bubble': p.vy = -R(14, 40); p.y = anywhere ? R(0, H) : H + 6; p.s = Math.random() < 0.4 ? 4 : 3; break;
    case 'firefly': p.vx = R(-8, 8); p.vy = R(-8, 8); p.s = 2; break;
    case 'ember': p.vy = -R(12, 36); p.vx = R(-4, 6); p.y = anywhere ? R(0, H) : H + 4; p.s = Math.random() < 0.3 ? 2 : 1; break;
  }
  return p;
}
function initParts(idx) {
  parts = []; fxIdx = idx;
  if (level() >= 1) return;
  for (const [t, n, c] of TIMELINES[idx].fx) for (let i = 0; i < n; i++) parts.push(spawn(t, c, true));
}
function updParts(dt) {
  for (const p of parts) {
    p.t += dt;
    switch (p.type) {
      case 'dust': p.x += p.vx * dt; p.y += p.vy * dt; if (p.x > W) p.x = 0; break;
      case 'rain': p.x += p.vx * dt; p.y += p.vy * dt; if (p.y > H) { p.y = -10; p.x = R(0, W + 60); } break;
      case 'snow': p.y += p.vy * dt; p.x += Math.sin(p.t * 1.2 + p.ph) * 12 * dt; if (p.y > H) { p.y = -4; p.x = R(0, W); } break;
      case 'bubble': p.y += p.vy * dt; p.x += Math.sin(p.t * 2 + p.ph) * 10 * dt; if (p.y < -6) { p.y = H + 6; p.x = R(0, W); } break;
      case 'firefly':
        p.vx += R(-30, 30) * dt; p.vy += R(-30, 30) * dt; p.vx *= 0.97; p.vy *= 0.97; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0; if (p.y < 0) p.y = H; if (p.y > H) p.y = 0; break;
      case 'ember': p.y += p.vy * dt; p.x += (p.vx + Math.sin(p.t * 3 + p.ph) * 8) * dt; if (p.y < -4) { p.y = H + 4; p.x = R(0, W); } break;
    }
  }
}
function drawParts() {
  for (const p of parts) {
    let a = p.a;
    const x = Math.round(p.x), y = Math.round(p.y);
    if (p.type === 'spark') a = 0.15 + 0.85 * (0.5 + 0.5 * Math.sin(p.t * 2 + p.ph));
    else if (p.type === 'firefly') a = Math.max(0, Math.sin(p.t * 1.6 + p.ph)) * 0.95;
    else if (p.type === 'ember') a = 0.5 + 0.5 * Math.sin(p.t * 7 + p.ph);
    ctx.globalAlpha = a; ctx.fillStyle = p.c;
    if (p.type === 'rain') ctx.fillRect(x, y, 1, 7);
    else if (p.type === 'bubble') { ctx.strokeStyle = p.c; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, p.s - 1, p.s - 1); }
    else ctx.fillRect(x, y, p.s, p.s);
  }
  ctx.globalAlpha = 1;
}

// ---- static overlay: darkening, vignette and scanlines, painted once ----
const dim = mk(W, H);
{
  const dc = dim.getContext('2d');
  const g = dc.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(3,5,10,.52)'); g.addColorStop(0.36, 'rgba(3,5,10,.16)'); g.addColorStop(1, 'rgba(3,5,10,.5)');
  dc.fillStyle = g; dc.fillRect(0, 0, W, H);
  const v = dc.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.5)');
  dc.fillStyle = v; dc.fillRect(0, 0, W, H);
  dc.fillStyle = 'rgba(0,0,0,.13)'; for (let y = 0; y < H; y += 3) dc.fillRect(0, y, W, 1);
}
const fog = mk(W, 200);
{ const fc = fog.getContext('2d'), r = rng(7); for (let i = 0; i < 1400; i++) { fc.fillStyle = `rgba(${70 + r() * 40 | 0},${100 + r() * 50 | 0},${110 + r() * 50 | 0},${0.04 + r() * 0.12})`; fc.fillRect(r() * W | 0, r() * 200 | 0, 2 + (r() * 5 | 0), 2); } }

// ------------------------------------------------------------------------------------------------------------------------------------------------
// The wordmark: drawn once into three small canvases (white, red, cyan). The red/cyan copies are only shown in a short glitch burst now and then.
// ------------------------------------------------------------------------------------------------------------------------------------------------
const tB = mk(560, 96), tR = mk(560, 96), tC = mk(560, 96);
function buildTitle() {
  [[tB, INK], [tR, '#ff4d5e'], [tC, '#3ff0ff']].forEach(([cnv, col], k) => {
    const c = cnv.getContext('2d'); c.clearRect(0, 0, 560, 96);
    let size = 58; c.textAlign = 'center'; c.textBaseline = 'middle';
    const set = () => { c.font = `400 ${size}px ${TITLE_FONT},monospace`; if ('letterSpacing' in c) c.letterSpacing = '3px'; };
    set(); while (c.measureText('CREDIT HOURS').width > 520 && size > 20) { size -= 2; set(); }
    if (k === 0) { c.lineJoin = 'round'; c.strokeStyle = 'rgba(0,0,0,.85)'; c.lineWidth = 6; c.strokeText('CREDIT HOURS', 280, 50); }
    c.fillStyle = col; c.fillText('CREDIT HOURS', 280, 50);
  });
}
let burstAt = 2, burstEnd = 0, burstSeed = 1;
function burst(len) { burstEnd = time + len; burstSeed = (Math.random() * 1e6) | 0; }
function drawTitle() {
  const x = W / 2 - 280, y = 36;
  if (time > burstAt && time >= burstEnd && burstEnd < burstAt) burst(0.24);
  const on = time < burstEnd;
  if (!on) { if (time >= burstEnd && burstAt <= burstEnd) burstAt = time + R(2.8, 5.5); ctx.drawImage(tB, x, y); return; }
  if (level() >= 2) { ctx.drawImage(tB, x, y); return; }
  const r = rng(burstSeed + Math.floor(time * 30));
  ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.85;
  ctx.drawImage(tR, x - 3, y); ctx.drawImage(tC, x + 3, y);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  let yy = 0; while (yy < 96) { const h = 4 + (r() * 16 | 0), dx = r() < 0.5 ? (r() - 0.5) * 26 : 0; ctx.drawImage(tB, 0, yy, 560, h, x + dx, y + yy, 560, h); yy += h; }
}

// ------------------------------------------------------------------------------------------------------------------------------------------------
// Pointer: every drawn control pushes { x, y, w, h, hover(), click(p, e), drag(p) } into `hits`; the pointer code just looks them up.
// ------------------------------------------------------------------------------------------------------------------------------------------------
let hits = [];
let drag = null;
const hitAt = (px, py) => { for (let i = hits.length - 1; i >= 0; i--) { const h = hits[i]; if (px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h) return h; } return null; };
const active = () => (mode === 'main' ? (leaving ? false : true) : mode === 'pause');
function pointerPos(e) { return toGame(e.clientX, e.clientY); }
canvas.addEventListener('pointermove', (e) => {
  if (!active()) return;
  const p = pointerPos(e); if (!p) return;
  if (drag) { drag.drag(p); return; }
  const h = hitAt(p.x, p.y);
  canvas.style.cursor = h ? 'pointer' : '';
  if (h && e.pointerType === 'mouse' && h.hover) h.hover();
});
canvas.addEventListener('pointerleave', () => { canvas.style.cursor = ''; });
canvas.addEventListener('pointerdown', (e) => {
  if (!active()) return;
  const p = pointerPos(e); if (!p) return;
  const h = hitAt(p.x, p.y); if (!h) return;
  if (h.drag) { drag = h; h.drag(p); return; }
  if (h.hover && e.pointerType !== 'mouse') h.hover();      // a touch selects first...
  if (h.click) h.click(e);                                  // ...the click itself decides whether a second tap is needed (see cards)
});
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointercancel', () => { drag = null; });

// ------------------------------------------------------------------------------------------------------------------------------------------------
// Drawing helpers
// ------------------------------------------------------------------------------------------------------------------------------------------------
function chamfer(x, y, w, h, c) {
  ctx.beginPath(); ctx.moveTo(x + c, y); ctx.lineTo(x + w - c, y); ctx.lineTo(x + w, y + c); ctx.lineTo(x + w, y + h - c); ctx.lineTo(x + w - c, y + h); ctx.lineTo(x + c, y + h); ctx.lineTo(x, y + h - c); ctx.lineTo(x, y + c); ctx.closePath();
}
function arrow(x, y) { ctx.fillStyle = TEAL; ctx.fillRect(x, y - 4, 2, 8); ctx.fillRect(x + 2, y - 3, 2, 6); ctx.fillRect(x + 4, y - 2, 2, 4); ctx.fillRect(x + 6, y - 1, 2, 2); }
function text(str, x, y, font, color, align = 'left', spacing = 0) {
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; LS(spacing); ctx.fillText(str, x, y); LS(0);
}
function wrap(str, x, y, maxW, lineH) {
  let line = '';
  for (const word of str.split(' ')) {
    if (ctx.measureText(line + word).width > maxW) { ctx.fillText(line.trimEnd(), x, y); line = ''; y += lineH; }
    line += word + ' ';
  }
  ctx.fillText(line.trimEnd(), x, y);
  return y + lineH;
}
// A button: chamfered box, teal when focused. Registers its own hit rectangle.
function button(label, x, y, w, h, focused, onHover, onClick) {
  chamfer(x, y, w, h, 5); ctx.fillStyle = focused ? 'rgba(94,231,224,.14)' : 'rgba(8,12,20,.78)'; ctx.fill();
  ctx.strokeStyle = focused ? TEAL : LINE; ctx.lineWidth = focused ? 2 : 1; chamfer(x + 0.5, y + 0.5, w - 1, h - 1, 5); ctx.stroke();
  text(label, x + w / 2, y + h / 2 + 5, `600 14px ${UI}`, focused ? INK : '#b6c3cc', 'center', 1);
  if (focused) arrow(x - 14, y + h / 2);
  hits.push({ x, y, w, h, hover: onHover, click: onClick });
}
const PANEL = { x: 60, y: 138, w: 520, h: 308 };
function panel(title) {
  const { x, y, w, h } = PANEL;
  chamfer(x, y, w, h, 8); ctx.fillStyle = 'rgba(5,8,14,.9)'; ctx.fill();
  ctx.strokeStyle = TEAL; ctx.lineWidth = 2; chamfer(x + 1, y + 1, w - 2, h - 2, 8); ctx.stroke();
  text(title, x + 24, y + 34, `700 18px ${UI}`, INK, 'left', 3);
  ctx.fillStyle = LINE; ctx.fillRect(x + 24, y + 44, w - 48, 1);
}

// ------------------------------------------------------------------------------------------------------------------------------------------------
// Episode cards (home screen)
// ------------------------------------------------------------------------------------------------------------------------------------------------
const SEL_H = 132, OFF_H = 62, GAP = 10, CX = 60, CW = 520, CY = 142;
let sel = 0, area = 'cards', footSel = 0, lastTap = -1;
const hs = [SEL_H, OFF_H, OFF_H];
const cardY = [0, 0, 0];
const FOOT = [{ id: 'settings', label: 'Settings' }, { id: 'help', label: 'Help' }, { id: 'credits', label: 'Credits' }];

function drawCard(i) {
  const ep = EPISODES[i], x = CX, y = cardY[i], w = CW, h = Math.round(hs[i]);
  const e = clamp((h - OFF_H) / (SEL_H - OFF_H), 0, 1), isSel = area === 'cards' && i === sel, playable = ep.status === 'playable';
  ctx.save(); chamfer(x, y, w, h, 6); ctx.clip();
  ctx.fillStyle = playable ? '#080c14' : 'rgba(6,10,18,.72)'; ctx.fillRect(x, y, w, h);
  if (playable) {
    const im = ep.art ? imgs[ep.art] : null;
    if (im && im.ok) {
      const sw = 680, sh = sw * h / w, sy = Math.max(0, Math.min(im.height - sh, 0.70 * im.height - sh / 2));
      ctx.imageSmoothingEnabled = true; ctx.drawImage(im, 600, sy, sw, sh, x, y, w, h);
    }
    ctx.fillStyle = `rgba(5,8,14,${0.5 - 0.5 * e})`; ctx.fillRect(x, y, w, h);
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, 'rgba(5,8,14,.95)'); g.addColorStop(0.36, 'rgba(5,8,14,.78)'); g.addColorStop(0.8, 'rgba(5,8,14,0)');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  } else {
    const off = (time * 5 + i * 90) % W;
    ctx.drawImage(fog, 0, 0, W, 200, x - off, y - 20, W, 200); ctx.drawImage(fog, 0, 0, W, 200, x - off + W, y - 20, W, 200);
    ctx.fillStyle = 'rgba(5,8,14,.25)'; ctx.fillRect(x, y, w, h);
    ctx.font = `700 ${Math.round(44 + 30 * e)}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(143,160,173,${0.14 + 0.07 * Math.sin(time * 1.6 + i)})`; ctx.fillText('?', x + w - 64, y + h / 2 + 2);
  }
  ctx.restore();
  ctx.strokeStyle = isSel ? TEAL : LINE; ctx.lineWidth = isSel ? 2 : 1; chamfer(x + 0.5, y + 0.5, w - 1, h - 1, 6); ctx.stroke();
  if (isSel) arrow(x - 14 + Math.round(Math.sin(time * 5) * 2), y + Math.round(h / 2));
  const tx = x + 22, lerp = (a, b) => a + (b - a) * e;
  text('EPISODE ' + ep.n, tx, Math.round(y + lerp(23, 34)), `600 10px ${UI}`, playable ? TEAL : MUTE, 'left', 3);
  text(ep.title, tx, Math.round(y + lerp(46, 68)), `600 ${Math.round(lerp(17, 27))}px ${UI}`, playable ? INK : '#9aa8b3');
  if (e > 0.15) {
    ctx.globalAlpha = e;
    if (ep.tagline) text(ep.tagline, tx, y + 92, `400 12px ${UI}`, '#c4d0d8');
    const lab = playable ? 'PLAY' : 'LOCKED', pw = playable ? 54 : 70, py = y + h - 30;
    ctx.strokeStyle = playable ? TEAL : '#4a5864'; ctx.lineWidth = 1; ctx.strokeRect(tx + 0.5, py + 0.5, pw, 18);
    text(lab, tx + 9, py + 13, `600 10px ${UI}`, playable ? TEAL : '#6f7f8b', 'left', 2);
    ctx.globalAlpha = 1;
  }
  hits.push({
    x, y, w, h,
    hover: () => { area = 'cards'; sel = i; },
    click: (e2) => { area = 'cards'; if (e2.pointerType === 'mouse' || (sel === i && lastTap === i)) activateCard(i); else sel = i; lastTap = i; },
  });
}
function activateCard(i) {
  const ep = EPISODES[i];
  if (ep.status !== 'playable') { say('Coming soon'); return; }
  leaving = { ep, t: 0 }; burst(0.45);
}
function drawFooter() {
  ctx.font = `600 12px ${UI}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  let x = CX; const y = 456;
  for (let i = 0; i < FOOT.length; i++) {
    LS(2); const w = ctx.measureText(FOOT[i].label).width; LS(0);
    const f = area === 'foot' && footSel === i;
    text(FOOT[i].label, x, y, `600 12px ${UI}`, f ? TEAL : MUTE, 'left', 2);
    if (f) { ctx.fillStyle = TEAL; ctx.fillRect(x, y + 3, w, 1); }
    const id = FOOT[i].id, idx = i;
    hits.push({ x: x - 6, y: y - 16, w: w + 12, h: 26, hover: () => { area = 'foot'; footSel = idx; }, click: () => go(id) });
    x += w + 34;
  }
  text(VERSION, CX + CW, y, `400 10px ${UI}`, '#55636f', 'right');
}

// ------------------------------------------------------------------------------------------------------------------------------------------------
// Screens: settings, help, credits, confirm
// ------------------------------------------------------------------------------------------------------------------------------------------------
let row = 0;                      // focused row on the current screen (settings rows, pause items, confirm buttons)
function go(s) { screen = s; row = 0; hits = []; }
const backTo = () => go(mode === 'pause' ? 'pausemenu' : 'home');

const SET_ROWS = [
  { id: 'volume', label: 'Volume', type: 'slider', note: 'no sound in the game yet' },
  { id: 'touch', label: 'Touch controls', type: 'choice', opts: ['auto', 'on', 'off'], names: ['Auto', 'On', 'Off'] },
  { id: 'effects', label: 'Menu effects', type: 'choice', opts: ['full', 'reduced'], names: ['Full', 'Reduced'] },
  { id: 'back', label: 'Back', type: 'button' },
];
function adjust(r, dir) {
  if (r.type === 'slider') setSetting(r.id, clamp(Math.round((settings[r.id] + dir * 0.1) * 10) / 10, 0, 1));
  else if (r.type === 'choice') { const i = r.opts.indexOf(settings[r.id]); setSetting(r.id, r.opts[(i + dir + r.opts.length) % r.opts.length]); }
}
function drawSettings() {
  panel('SETTINGS');
  const x0 = PANEL.x + 24, vx = PANEL.x + 250;
  SET_ROWS.forEach((r, i) => {
    const y = PANEL.y + 60 + i * 48, focused = row === i;
    if (r.type === 'button') { button('Back', PANEL.x + PANEL.w / 2 - 70, PANEL.y + PANEL.h - 56, 140, 34, focused, () => { row = i; }, backTo); return; }
    text(r.label, x0, y + 20, `600 14px ${UI}`, focused ? INK : '#b6c3cc');
    if (focused) arrow(x0 - 14, y + 15);
    if (r.type === 'slider') {
      const bw = 150, v = settings[r.id];
      ctx.fillStyle = '#16202a'; ctx.fillRect(vx, y + 12, bw, 8);
      ctx.fillStyle = TEAL; ctx.fillRect(vx, y + 12, Math.round(bw * v), 8);
      ctx.fillStyle = INK; ctx.fillRect(vx + Math.round(bw * v) - 2, y + 8, 4, 16);
      text(Math.round(v * 100) + '%', vx + bw + 14, y + 20, `600 12px ${UI}`, MUTE);
      if (r.note) text(r.note, vx, y + 38, `400 10px ${UI}`, '#66737e');
      hits.push({ x: vx - 6, y: y + 4, w: bw + 12, h: 26, hover: () => { row = i; }, drag: (p) => setSetting(r.id, clamp(Math.round((p.x - vx) / bw * 10) / 10, 0, 1)) });
    } else {
      const name = r.names[r.opts.indexOf(settings[r.id])];
      text('<', vx, y + 20, `700 14px ${UI}`, focused ? TEAL : '#55636f');
      text(name, vx + 70, y + 20, `600 14px ${UI}`, INK, 'center');
      text('>', vx + 140, y + 20, `700 14px ${UI}`, focused ? TEAL : '#55636f', 'right');
      hits.push({ x: vx - 6, y: y + 2, w: 160, h: 28, hover: () => { row = i; }, click: (e) => { row = i; adjust(r, 1); } });
    }
  });
}
function updateSettings() {
  if (pressed('ArrowUp', 'KeyW')) row = (row + SET_ROWS.length - 1) % SET_ROWS.length;
  if (pressed('ArrowDown', 'KeyS')) row = (row + 1) % SET_ROWS.length;
  const r = SET_ROWS[row];
  if (r.type !== 'button') { if (pressed('ArrowLeft', 'KeyA')) adjust(r, -1); if (pressed('ArrowRight', 'KeyD')) adjust(r, 1); if (pressed('Enter', 'Space', 'KeyE')) adjust(r, 1); }
  else if (pressed('Enter', 'Space', 'KeyE')) backTo();
  if (pressed('Escape', 'Backspace')) backTo();
}

const HELP = [
  ['Move', 'W A S D or the arrow keys'],
  ['Talk / use / sit / read', 'E'],
  ['Next line, skip the intro', 'E or Space'],
  ['Pause menu', 'Esc  (or tap the MENU label)'],
  ['On a phone', 'left stick to walk, E button to act'],
];
function drawHelp() {
  panel('HELP');
  HELP.forEach(([k, v], i) => {
    const y = PANEL.y + 78 + i * 36;
    text(k, PANEL.x + 24, y, `600 13px ${UI}`, TEAL);
    text(v, PANEL.x + 24, y + 17, `400 13px ${UI}`, '#d3dde4');
  });
  button('Back', PANEL.x + PANEL.w / 2 - 70, PANEL.y + PANEL.h - 50, 140, 32, true, () => {}, backTo);
}
function drawCredits() {
  panel('CREDITS');
  ctx.font = `400 11px ${UI}`; ctx.fillStyle = '#d3dde4'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const x = PANEL.x + 24, w = PANEL.w - 48;
  let y = PANEL.y + 68;
  for (const p of [
    'Credit Hours - made by Md. Fahim Hassan & Shahriar Islam Tawsif, CSE students. A passion project.',
    'Player and NPC sprites: made with the Universal LPC Spritesheet Character Generator. Sprites contributed as part of the Liberated Pixel Cup project from OpenGameArt.org: http://opengameart.org/content/lpc-collection',
    'License: Creative Commons Attribution-ShareAlike 3.0 (CC-BY-SA 3.0) http://creativecommons.org/licenses/by-sa/3.0/',
    'Per-artist credits: CREDITS.md, assets/character-credits.txt (player), assets/npc-credits.txt (NPC).',
    'Fonts: Rubik Glitch and Pixelify Sans, SIL Open Font License 1.1 (see assets/fonts).',
    'Menu and episode artwork: made by the authors with AI image tools.',
  ]) y = wrap(p, x, y, w, 15) + 5;
  button('Back', PANEL.x + PANEL.w / 2 - 70, PANEL.y + PANEL.h - 46, 140, 32, true, () => {}, backTo);
}
function updatePanel() { if (pressed('Escape', 'Backspace', 'Enter', 'Space', 'KeyE')) backTo(); }

// ---- pause menu items + the "really quit?" step ----
const PAUSE_ITEMS = [{ id: 'resume', label: 'Resume' }, { id: 'settings', label: 'Settings' }, { id: 'quit', label: 'Quit to Menu' }];
function pickPause(id) { if (id === 'resume') hooks.onResume(); else if (id === 'settings') go('settings'); else go('confirm'); }
function drawPauseList() {
  const w = 260, x = (W - w) / 2, y0 = 190;
  text('PAUSED', W / 2, 150, `700 30px ${UI}`, INK, 'center', 6);
  PAUSE_ITEMS.forEach((it, i) => button(it.label, x, y0 + i * 48, w, 36, row === i, () => { row = i; }, () => pickPause(it.id)));
}
function updatePauseList() {
  if (pressed('ArrowUp', 'KeyW')) row = (row + PAUSE_ITEMS.length - 1) % PAUSE_ITEMS.length;
  if (pressed('ArrowDown', 'KeyS')) row = (row + 1) % PAUSE_ITEMS.length;
  if (pressed('Enter', 'Space', 'KeyE')) pickPause(PAUSE_ITEMS[row].id);
  if (pressed('Escape')) hooks.onResume();
}
function drawConfirm() {
  const w = 340, h = 150, x = (W - w) / 2, y = 170;
  chamfer(x, y, w, h, 8); ctx.fillStyle = 'rgba(5,8,14,.94)'; ctx.fill();
  ctx.strokeStyle = TEAL; ctx.lineWidth = 2; chamfer(x + 1, y + 1, w - 2, h - 2, 8); ctx.stroke();
  text('Quit to the menu?', W / 2, y + 40, `700 18px ${UI}`, INK, 'center', 1);
  text('Your progress in this run will be lost.', W / 2, y + 64, `400 12px ${UI}`, MUTE, 'center');
  button('No, keep playing', x + 18, y + 90, 140, 36, row === 0, () => { row = 0; }, () => go('pausemenu'));
  button('Yes, quit', x + w - 158, y + 90, 140, 36, row === 1, () => { row = 1; }, () => hooks.onQuit());
}
function updateConfirm() {
  if (pressed('ArrowLeft', 'KeyA', 'ArrowUp', 'KeyW')) row = 0;
  if (pressed('ArrowRight', 'KeyD', 'ArrowDown', 'KeyS')) row = 1;
  if (pressed('Enter', 'Space', 'KeyE')) { if (row === 1) hooks.onQuit(); else go('pausemenu'); }
  if (pressed('Escape')) go('pausemenu');
}

// ------------------------------------------------------------------------------------------------------------------------------------------------
// Home-screen keyboard
// ------------------------------------------------------------------------------------------------------------------------------------------------
function updateHome() {
  const up = pressed('ArrowUp', 'KeyW'), down = pressed('ArrowDown', 'KeyS'), left = pressed('ArrowLeft', 'KeyA'), right = pressed('ArrowRight', 'KeyD');
  if (area === 'cards') {
    if (up) sel = (sel + EPISODES.length - 1) % EPISODES.length;
    if (down) { if (sel === EPISODES.length - 1) area = 'foot'; else sel++; }
    if (pressed('Enter', 'Space', 'KeyE')) activateCard(sel);
  } else {
    if (up) { area = 'cards'; sel = EPISODES.length - 1; }
    if (left) footSel = (footSel + FOOT.length - 1) % FOOT.length;
    if (right) footSel = (footSel + 1) % FOOT.length;
    if (pressed('Enter', 'Space', 'KeyE')) go(FOOT[footSel].id);
  }
}

// ------------------------------------------------------------------------------------------------------------------------------------------------
// Frame entry points
// ------------------------------------------------------------------------------------------------------------------------------------------------
function track(dt) {
  ema = ema * 0.96 + dt * 0.04;
  if (++slowFrames > 150 && ema > 0.025 && autoLevel < 2) { autoLevel++; slowFrames = 0; ema = 0.016; initParts(trans ? nxt : cur); }
}
function startTrans() { nxt = (cur + 1) % TIMELINES.length; trans = true; tTrans = 0; age.nxt = 0; load(TIMELINES[(nxt + 1) % TIMELINES.length].id); }

export const menu = {
  init(h) {
    hooks = { ...hooks, ...h };
    for (const ep of EPISODES) if (ep.art) load(ep.art);          // card pictures: assets/menu/<art>.webp
    onSettingChange((k) => { if (k === 'effects') initParts(trans ? nxt : cur); });
    buildTitle();
    if (document.fonts && document.fonts.load) {
      Promise.race([Promise.all([`58px ${TITLE_FONT}`, `14px ${UI}`, `700 14px ${UI}`].map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 3000))])
        .then(buildTitle).catch(() => {});
    }
    initParts(0);
  },

  enter() {
    mode = 'main'; screen = 'home'; area = 'cards'; sel = 0; row = 0; leaving = null; fadeIn = 0.6; hits = []; toast.t = 0;
    for (let i = 0; i < 3; i++) hs[i] = i === 0 ? SEL_H : OFF_H;
    load(TIMELINES[cur].id); load(TIMELINES[(cur + 1) % TIMELINES.length].id);
  },

  update(dt) {
    time += dt;
    age.cur += dt;
    if (!trans && age.cur > DWELL) { const im = imgs[TIMELINES[(cur + 1) % TIMELINES.length].id]; if (im && im.ok) startTrans(); }
    else if (trans) {
      tTrans += dt; age.nxt += dt;
      if (tTrans > TRANS / 2 && fxIdx !== nxt) initParts(nxt);
      if (tTrans >= TRANS) { release(TIMELINES[cur].id); cur = nxt; nxt = -1; trans = false; age.cur = age.nxt; load(TIMELINES[(cur + 1) % TIMELINES.length].id); }
    }
    updParts(dt);
    for (let i = 0; i < 3; i++) { const t = area === 'cards' && i === sel ? SEL_H : OFF_H; hs[i] += (t - hs[i]) * (1 - Math.exp(-dt * 13)); }
    if (toast.t > 0) toast.t -= dt;
    if (fadeIn > 0) fadeIn -= dt;
    track(dt);
    if (leaving) { leaving.t += dt; if (leaving.t >= 0.5) { const ep = leaving.ep; leaving = null; save.markStarted(ep.id); hooks.onPlay(ep); } return; }
    if (screen === 'home') updateHome();
    else if (screen === 'settings') updateSettings();
    else updatePanel();
  },

  draw() {
    hits = [];
    ctx.save();
    ctx.fillStyle = '#04060a'; ctx.fillRect(0, 0, W, H);
    if (trans) {
      const u = Math.min(1, tTrans / TRANS), e = u * u * (3 - 2 * u), amt = Math.sin(Math.PI * u);
      bctx.globalAlpha = 1; bctx.fillStyle = '#04060a'; bctx.fillRect(0, 0, W, H);
      drawBG(bctx, cur, age.cur, 1); drawBG(bctx, nxt, age.nxt, e);
      if (level() >= 2) ctx.drawImage(buf, 0, 0);
      else {
        const r = rng(Math.floor(tTrans * 14) + 99); let y = 0;
        while (y < H) { const h = 6 + (r() * 34 | 0), dx = r() < 0.55 ? (r() - 0.5) * 44 * amt : 0; ctx.drawImage(buf, 0, y, W, h, Math.round(dx), y, W, h); y += h; }
        ctx.fillStyle = `rgba(180,255,250,${0.07 * amt * r()})`; ctx.fillRect(0, 0, W, H);
      }
    } else drawBG(ctx, cur, age.cur, 1);
    const B = TIMELINES[trans && tTrans > TRANS / 2 ? nxt : cur];
    if (B.wash && level() < 2) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.035 + 0.035 * Math.sin(time * 1.3); ctx.fillStyle = B.wash[0]; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.035 + 0.035 * Math.sin(time * 1.3 + 2.4); ctx.fillStyle = B.wash[1]; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    drawParts();
    ctx.drawImage(dim, 0, 0);
    drawTitle();
    text('AN EPISODIC STORY GAME', W / 2 + 2, 122, `600 11px ${UI}`, MUTE, 'center', 5);
    if (screen === 'home') {
      let y = CY; for (let i = 0; i < 3; i++) { cardY[i] = Math.round(y); y += hs[i] + GAP; }
      for (let i = 0; i < EPISODES.length; i++) drawCard(i);
      drawFooter();
    } else if (screen === 'settings') drawSettings();
    else if (screen === 'help') drawHelp();
    else if (screen === 'credits') drawCredits();
    if (toast.t > 0) {
      ctx.globalAlpha = Math.min(1, toast.t * 2); ctx.font = `600 12px ${UI}`; ctx.textAlign = 'center';
      const w = ctx.measureText(toast.text).width + 24;
      ctx.fillStyle = 'rgba(5,8,14,.92)'; ctx.fillRect(W / 2 - w / 2, 418, w, 22);
      ctx.strokeStyle = TEAL; ctx.lineWidth = 1; ctx.strokeRect(W / 2 - w / 2 + 0.5, 418.5, w - 1, 21);
      text(toast.text, W / 2, 433, `600 12px ${UI}`, INK, 'center'); ctx.globalAlpha = 1;
    }
    const fade = leaving ? Math.min(1, leaving.t / 0.5) : Math.max(0, fadeIn / 0.6);
    if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  },

  // ---- pause (over the frozen game picture) ----
  openPause() { mode = 'pause'; screen = 'pausemenu'; row = 0; hits = []; },
  updatePause(dt) {
    time += dt;
    if (screen === 'pausemenu') updatePauseList();
    else if (screen === 'settings') updateSettings();
    else if (screen === 'confirm') updateConfirm();
  },
  drawPause() {
    hits = [];
    ctx.save();
    ctx.fillStyle = 'rgba(3,5,10,.68)'; ctx.fillRect(0, 0, W, H);
    if (screen === 'pausemenu') drawPauseList();
    else if (screen === 'settings') drawSettings();
    else if (screen === 'confirm') drawConfirm();
    ctx.restore();
  },
};
