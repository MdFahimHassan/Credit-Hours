// settings.js - player options, remembered in localStorage (separate key from the save so wiping progress never resets the options).
//   volume  0..1   master volume (music and sound effects), applied live by audio.js.
//   touch   'auto' | 'on' | 'off'   on-screen controls: auto = phones/tablets (or after the first touch), on = always, off = never
//   effects 'full' | 'reduced'      menu animation: reduced = no moving background, particles, glitch or bobbing arrows.
//                                   Until the player picks one themselves it follows the system's "reduce motion" setting, live.
// Only the options the player actually changed are saved, so an untouched option keeps following its default (this is what lets "effects" follow the system).
const KEY = 'creditHours.settings';
const motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const systemEffects = () => (motionQuery && motionQuery.matches ? 'reduced' : 'full');
const defaults = { volume: 0.8, touch: 'auto', effects: systemEffects() };
export const settings = { ...defaults };
const chosen = {};                               // which options the player has set themselves
const listeners = [];
try {
  const s = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (s && typeof s === 'object') {
    if (typeof s.volume === 'number') { settings.volume = Math.min(1, Math.max(0, s.volume)); chosen.volume = true; }
    if (['auto', 'on', 'off'].includes(s.touch)) { settings.touch = s.touch; chosen.touch = true; }
    if (['full', 'reduced'].includes(s.effects)) { settings.effects = s.effects; chosen.effects = true; }
  }
} catch { /* ignore */ }

export function setSetting(key, value) {
  settings[key] = value; chosen[key] = true;
  try { const out = {}; for (const k in chosen) out[k] = settings[k]; localStorage.setItem(KEY, JSON.stringify(out)); } catch { /* ignore */ }
  for (const f of listeners) f(key, value);
}
export const onSettingChange = (f) => listeners.push(f);

// The system's "reduce motion" switch was flipped while the game is open: follow it, unless the player has chosen for themselves.
if (motionQuery) {
  const follow = () => { if (!chosen.effects) { settings.effects = systemEffects(); for (const f of listeners) f('effects', settings.effects); } };
  if (motionQuery.addEventListener) motionQuery.addEventListener('change', follow); else if (motionQuery.addListener) motionQuery.addListener(follow);
}