// settings.js - player options, remembered in localStorage (separate key from the save so wiping progress never resets the options).
//   volume  0..1   master volume. There is no sound yet; the value is stored so the audio code can use it later.
//   touch   'auto' | 'on' | 'off'   on-screen controls: auto = phones/tablets (or after the first touch), on = always, off = never
//   effects 'full' | 'reduced'      menu animation: reduced = no moving background, particles or glitch
const KEY = 'creditHours.settings';
const defaults = {
  volume: 0.8,
  touch: 'auto',
  effects: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full',
};
export const settings = { ...defaults };
const listeners = [];
try {
  const s = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (s && typeof s === 'object') {
    if (typeof s.volume === 'number') settings.volume = Math.min(1, Math.max(0, s.volume));
    if (['auto', 'on', 'off'].includes(s.touch)) settings.touch = s.touch;
    if (['full', 'reduced'].includes(s.effects)) settings.effects = s.effects;
  }
} catch { /* ignore */ }

export function setSetting(key, value) {
  settings[key] = value;
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  for (const f of listeners) f(key, value);
}
export const onSettingChange = (f) => listeners.push(f);
