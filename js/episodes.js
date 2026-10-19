// episodes.js - the episodes as data. Add a new episode by adding one object here.
//   status: 'playable' | 'locked'   (locked = a "Coming soon" card)
//   startZone: the zone id from zones.js the episode begins in
//   art: file name (without .webp) in assets/menu/ used as the card picture
export const EPISODES = [
  { id: 'ep1', n: 1, title: 'Deadline', tagline: 'The rooftop. The guard. Something is wrong.', status: 'playable', startZone: 'zone1', art: 'ep1' },
  { id: 'ep2', n: 2, title: 'Coming soon', tagline: '', status: 'locked' },
  { id: 'ep3', n: 3, title: 'Coming soon', tagline: '', status: 'locked' },
];

// The menu background rotates through these "timelines" (assets/menu/<id>.webp). `fx` = small code-drawn effects laid over the picture
// ([type, count, colour]); `wash` = two colours pulsed over it. Types are drawn by menu.js (spark, dust, rain, snow, bubble, firefly, ember).
export const TIMELINES = [
  { id: 'present',    fx: [['spark', 26, '#ffe9b0'], ['dust', 16, '#cfd8ff']] },
  { id: 'cyberpunk',  fx: [['rain', 34, '#6fe7ff'], ['spark', 14, '#ff7ad9']], wash: ['#ff3df0', '#19e6ff'] },
  { id: 'snow',       fx: [['snow', 70, '#ffffff']] },
  { id: 'jungle',     fx: [['firefly', 26, '#d8ff7a'], ['dust', 10, '#9dffb0']] },
  { id: 'underwater', fx: [['bubble', 26, '#9ff6ff'], ['dust', 18, '#7fe3ff']], wash: ['#2bd4c8', '#1a6bff'] },
  { id: 'steampunk',  fx: [['ember', 26, '#ffb15e'], ['dust', 10, '#ffd9a3']] },
  { id: 'cozy',       fx: [['firefly', 24, '#ffd07a'], ['dust', 10, '#ffe8b8']] },
  { id: 'medieval',   fx: [['ember', 22, '#ffad4d'], ['spark', 10, '#ffe9b0']] },
  { id: 'fantasy',    fx: [['spark', 34, '#c9a6ff'], ['firefly', 16, '#6ff0ff']], wash: ['#9b5cff', '#3df0ff'] },
  { id: 'apocalypse', fx: [['ember', 30, '#ff6a3d'], ['dust', 14, '#bfbfbf']], wash: ['#ff2a3a', '#ff2a3a'] },
];
