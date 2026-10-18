// input.js - remembers which keys are held, and which were pressed THIS frame. Works with the keyboard AND with touch controls (phones / tablets).
// The game only ever asks "is KeyA held?" / "was KeyE pressed?", so the touch controls simply act like those keys.
import { toGame } from './display.js';

const held = new Set();     // keys currently down (for movement)
const pressed = new Set();  // keys that went down this frame (for E, F3)
const taps = [];            // screen taps in game coordinates [{x, y}], read once per frame by main.js

const GAME_KEYS = new Set(['Space', 'KeyE', 'KeyC', 'F3']);

window.addEventListener('keydown', (e) => {
  if (!e.repeat) pressed.add(e.code);   // ignore auto-repeat when holding a key
  held.add(e.code);
  // stop arrow keys / space from scrolling the page
  if (e.code.startsWith('Arrow') || GAME_KEYS.has(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => held.delete(e.code));
// A key released while the window was not looking (alt-tab, a notification, switching apps on a phone) would stay "held" forever: the player would keep walking.
const releaseAll = () => { held.clear(); stick.release(); };
window.addEventListener('blur', releaseAll);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Touch controls: a thumb stick (left) that holds the four walk keys, and an E button (right). Both use pointer events with pointer capture, so two
// thumbs work at the same time and a finger that slides off its control keeps controlling it.
// ---------------------------------------------------------------------------------------------------------------------------------------------
const DIRS = { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS' };
const stick = {
  el: document.getElementById('stick'), knob: document.getElementById('knob'), id: null, cx: 0, cy: 0, r: 64,
  dead: 0.28,                                   // fraction of the radius where nothing happens (a resting thumb should not walk)
  set(code, on) { if (on) held.add(code); else held.delete(code); },
  move(e) {
    let vx = (e.clientX - this.cx) / this.r, vy = (e.clientY - this.cy) / this.r;
    const len = Math.hypot(vx, vy);
    if (len > 1) { vx /= len; vy /= len; }
    this.knob.style.transform = `translate(${vx * this.r * 0.55}px, ${vy * this.r * 0.55}px)`;
    const on = len > this.dead;                 // 8 directions: a diagonal is when both axes pass 0.38 (the angle is within ~22 degrees of 45)
    this.set(DIRS.left, on && vx < -0.38); this.set(DIRS.right, on && vx > 0.38);
    this.set(DIRS.up, on && vy < -0.38);   this.set(DIRS.down, on && vy > 0.38);
  },
  release() {
    this.id = null;
    if (!this.el) return;
    for (const k of Object.values(DIRS)) held.delete(k);
    this.knob.style.transform = ''; this.el.classList.remove('down');
  },
};
function setupTouch() {
  document.body.classList.add('touch');
  if (setupTouch.done) return;
  setupTouch.done = true;
  const { el } = stick;
  el.addEventListener('pointerdown', (e) => {
    if (stick.id !== null) return;
    stick.id = e.pointerId; el.setPointerCapture(e.pointerId); el.classList.add('down');
    const r = el.getBoundingClientRect(); stick.cx = r.left + r.width / 2; stick.cy = r.top + r.height / 2; stick.r = r.width / 2;
    stick.move(e); e.preventDefault();
  });
  el.addEventListener('pointermove', (e) => { if (e.pointerId === stick.id) { stick.move(e); e.preventDefault(); } });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(t, (e) => { if (e.pointerId === stick.id) stick.release(); });

  const btn = document.getElementById('btnE');
  btn.addEventListener('pointerdown', (e) => { pressed.add('KeyE'); held.add('KeyE'); btn.classList.add('down'); btn.setPointerCapture(e.pointerId); e.preventDefault(); });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(t, () => { held.delete('KeyE'); btn.classList.remove('down'); });

  // a tap on the game itself (credits label, closing the credits, advancing a dialogue): see main.js
  document.getElementById('game').addEventListener('pointerdown', (e) => {
    const p = toGame(e.clientX, e.clientY);
    if (p) taps.push(p);
  });
  window.addEventListener('contextmenu', (e) => e.preventDefault());           // no long-press menu on the controls
}
// Show the controls on phones / tablets straight away, and on any other device the first time a finger touches the screen.
if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) setupTouch();
else window.addEventListener('touchstart', setupTouch, { once: true, passive: true });

export const input = {
  left:  () => held.has('KeyA') || held.has('ArrowLeft'),
  right: () => held.has('KeyD') || held.has('ArrowRight'),
  up:    () => held.has('KeyW') || held.has('ArrowUp'),
  down:  () => held.has('KeyS') || held.has('ArrowDown'),
  wasPressed: (code) => pressed.has(code),
  press: (code) => pressed.add(code),   // act as if the key had just been pressed (used for taps)
  takeTaps: () => (taps.length ? taps.splice(0) : taps),   // the taps since the last call
  endFrame: () => pressed.clear(),      // call once at the end of every frame
};