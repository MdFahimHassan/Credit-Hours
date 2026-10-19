// episodes.js - the episodes as data. Add a new episode by adding one object here.
//   status: 'playable' | 'locked'   (locked = a "Coming soon" card)
//   startZone: the zone id from zones.js the episode begins in
//   art: file name (without .webp) in assets/menu/ used as the card picture
export const EPISODES = [
  { id: 'ep1', n: 1, title: 'Deadline', tagline: 'The rooftop. The guard. Something is wrong.', status: 'playable', startZone: 'zone1', art: 'ep1' },
  { id: 'ep2', n: 2, title: 'Coming soon', tagline: '', status: 'locked' },
  { id: 'ep3', n: 3, title: 'Coming soon', tagline: '', status: 'locked' },
];

// `accent` = the UI / title-glow colour that reads best on that picture (menu.js blends between them as the pictures change).
// The menu background rotates through these "timelines" (assets/menu/<id>.webp). `fx` = small code-drawn effects laid over the picture
// ([type, count, colour]); `wash` = two colours pulsed over it. Types are drawn by menu.js (spark, dust, rain, snow, bubble, firefly, ember).
export const TIMELINES = [
  { id: 'present',    accent: '#8ab8ff', fx: [['spark', 26, '#ffe9b0'], ['dust', 16, '#cfd8ff']] },
  { id: 'cyberpunk',  accent: '#35e8ff', fx: [['rain', 34, '#6fe7ff'], ['spark', 14, '#ff7ad9']], wash: ['#ff3df0', '#19e6ff'] },
  { id: 'snow',       accent: '#8fd6ff', fx: [['snow', 70, '#ffffff']] },
  { id: 'jungle',     accent: '#7df08a', fx: [['glow', 22, '#7dff7a'], ['glow', 10, '#d8ff7a'], ['dust', 10, '#9dffb0']] },
  { id: 'underwater', accent: '#4ff2e4', fx: [['bubble', 26, '#9ff6ff'], ['dust', 18, '#7fe3ff']], wash: ['#2bd4c8', '#1a6bff'] },
  { id: 'steampunk',  accent: '#ffa95c', fx: [['ember', 26, '#ffb15e'], ['dust', 10, '#ffd9a3']] },
  { id: 'cozy',       accent: '#ffc56e', fx: [['firefly', 24, '#ffd07a'], ['dust', 10, '#ffe8b8'], ['firework', 1, '#ffd27a']] },
  { id: 'medieval',   accent: '#ffb04a', fx: [['ember', 22, '#ffad4d'], ['spark', 10, '#ffe9b0']] },
  { id: 'fantasy',    accent: '#c9a6ff', fx: [['mote', 20, '#b98cff'], ['mote', 12, '#6ff0ff'], ['star', 16, '#fff0c0'], ['spark', 20, '#c9a6ff']], wash: ['#9b5cff', '#3df0ff'] },
  { id: 'apocalypse', accent: '#ff5d4d', fx: [['ember', 30, '#ff6a3d'], ['dust', 14, '#bfbfbf']], wash: ['#ff2a3a', '#ff2a3a'] },
];