// main.js - creates everything and runs the game loop.
import { spawn, npcSpawn, items, getExitHint, getExit, findSeat, nearWaterFilter, zoneId, TILE } from './map.js';
import { transition } from './transition.js';
import { input } from './input.js';
import { Player } from './player.js';
import { NPC } from './npc.js';
import { dialogue } from './dialogue.js';
import { quest } from './quest.js';
import { render } from './renderer.js';
import { intro } from './intro.js';
import { skyline } from './skyline.js';

const game = {
  player: new Player(spawn.x, spawn.y),
  npc: new NPC(npcSpawn.x, npcSpawn.y),
  debug: false,
  showCredits: false,   // press C to toggle the credits screen
  hint: null,          // text shown when standing on an exit/stairs tile
};

function update(dt) {
  if (input.wasPressed('F3')) game.debug = !game.debug;
  if (input.wasPressed('KeyC')) game.showCredits = !game.showCredits;
  if (game.showCredits) return;                       // game is paused while credits are open

  // Opening cutscene: player is script-controlled. E or Space skips it.
  if (intro.active) {
    if (input.wasPressed('KeyE') || input.wasPressed('Space')) intro.skip(game.player);
    else intro.update(dt, game.player);
    return;                                          // nothing else runs during the intro
  }

  // Zone change: the fade runs, player can't move
  if (transition.active) { transition.update(dt, game.player); game.hint = null; return; }

  const npcHere = game.npc.zone === zoneId;          // the NPC lives in zone 1 only

  const p = game.player;
  if (dialogue.active) {
    // while talking: E advances text, player can't move
    if (input.wasPressed('KeyE')) dialogue.advance();
  } else if (p.sitting) {
    // sitting on a bench: E (or a walk key, after a short moment) gets you back on your feet
    p.sitTime += dt;
    if (input.wasPressed('KeyE') || (p.sitTime > 0.4 && (input.left() || input.right() || input.up() || input.down()))) p.standUp();
  } else if (skyline.leaning) {
    // leaning out over a rail: E or walking away lets go
    if (skyline.wantsRelease(input)) skyline.stopLean();
  } else if (input.wasPressed('KeyE')) {
    if (npcHere && game.npc.isNear(p)) {
      const t = quest.talk();
      dialogue.start(game.npc.name, t.lines, t.next);
    } else {
      const seat = findSeat(p.cx, p.cy);               // near a bench? E sits down
      if (seat) p.sitDown(seat);
      else if (nearWaterFilter(p.cx, p.cy, p.facing)) dialogue.start('You', ['You hold your cup under the tap and let the filter run...', 'Ahh. Cold, clean water. Much better!']);
      else if (skyline.canLean()) skyline.startLean(p); // touching a rail? E leans out for the full view
    }
  }
  p.update(dt, !dialogue.active && !p.sitting && !skyline.leaning);
  skyline.update(dt, p);                             // how much of the city beyond the rails is revealed
  if (npcHere) game.npc.facePlayer(game.player);     // NPC turns to look at you when you're near
  const tx = Math.floor(game.player.cx / TILE), ty = Math.floor(game.player.cy / TILE);
  const exit = getExit(tx, ty);
  if (exit && exit.to) { transition.start(exit); return; }   // stepped on an exit tile -> fade to the next zone
  game.hint = getExitHint(tx, ty);
  if (!game.hint && !dialogue.active) game.hint = p.sitting ? '[E] Stand up'
    : skyline.leaning ? '[E] Stop leaning'
    : findSeat(p.cx, p.cy) ? '[E] Sit down'
    : nearWaterFilter(p.cx, p.cy, p.facing) ? '[E] Drink water'
    : skyline.canLean() ? '[E] Lean out' : null;

  // Pick up the ID card by walking over it (only once the quest asks for it)
  if (quest.state === 'find') {
    for (const it of items) {
      if (!it.collected && Math.hypot(game.player.cx - (it.x * 32 + 16), game.player.cy - (it.y * 32 + 16)) < 24) {
        it.collected = true;
        quest.state = 'return';
        dialogue.start('You', ['You found an ID card! Better take it back to the student.']);
      }
    }
  }
}

// Game loop with delta time: dt = seconds since last frame.
let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05); // clamp so a lag spike can't teleport you through walls
  last = now;
  update(dt);
  render(game, now / 1000);
  input.endFrame();                                // clear "pressed this frame" keys
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);