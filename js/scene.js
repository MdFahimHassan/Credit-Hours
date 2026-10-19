// scene.js - which screen the game is on: 'menu' (title + episode cards + settings/help/credits), 'playing', or 'paused' (Esc during play).
// main.js reads scene.name every frame and sends update + drawing to the right place. Nothing else decides this.
export const scene = {
  name: 'menu',
  set(name) {
    this.name = name;
    document.body.classList.toggle('in-game', name === 'playing');   // the on-screen touch controls show only while playing
  },
  is(name) { return this.name === name; },
};
