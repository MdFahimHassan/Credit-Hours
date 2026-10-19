// save.js - everything kept between visits lives in ONE localStorage key. Every read/write is wrapped: private windows and blocked storage
// throw, and the game must still run (it just forgets). The shape is versioned so a later change can migrate old saves.
//   { v: 1, episodes: { ep1: { started: bool, completed: bool, endings: [ids] } } }
const KEY = 'creditHours.save';
const blank = () => ({ v: 1, episodes: {} });
let data = null;

function load() {
  if (data) return data;
  try {
    const raw = localStorage.getItem(KEY);
    const d = raw ? JSON.parse(raw) : null;
    data = d && d.v === 1 && d.episodes && typeof d.episodes === 'object' ? d : blank();
  } catch { data = blank(); }
  return data;
}
function flush() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage unavailable: keep playing */ } }
const ep = (id) => (load().episodes[id] ??= { started: false, completed: false, endings: [] });

export const save = {
  get: (id) => ep(id),
  markStarted(id) { ep(id).started = true; flush(); },
  markCompleted(id) { ep(id).completed = true; flush(); },
  addEnding(id, ending) { const e = ep(id); if (!e.endings.includes(ending)) e.endings.push(ending); flush(); },
  reset() { data = blank(); flush(); },
};
