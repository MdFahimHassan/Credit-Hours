// main.js - creates everything and runs the game loop.
import { spawn, npcSpawn, items, getExitHint, getExit, findSeat, nearWaterFilter, nearRestroom, zoneId, TILE } from './map.js';
import { transition } from './transition.js';
import { input } from './input.js';
import { Player } from './player.js';
import { NPC } from './npc.js';
import { dialogue } from './dialogue.js';
import { restroom } from './restroom.js';
import { quest } from './quest.js';
import { render } from './renderer.js';
import { intro } from './intro.js';
import { skyline } from './skyline.js';
import { updatePool, nearPoolThing, talkTo, signView, SIGN_AFTER, ladder, nearLadder, poolAccess } from './pool.js';

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

  // Restroom visit: fade, text, fade back. The player can't move meanwhile.
  if (restroom.active) { restroom.update(dt, input, game.player); game.hint = null; return; }

  // Climbing the pool ladder (in or out): scripted, the player can't move meanwhile
  if (ladder.active) { ladder.update(dt, game.player); updatePool(dt); skyline.update(dt, game.player); game.hint = null; return; }

  // Reading the pool signboard: the player can't move, E / Space closes it, then he comments on it
  if (signView.active) {
    if (signView.update(dt, input)) dialogue.start('You', SIGN_AFTER);
    updatePool(dt); game.hint = null; return;
  }

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
    const lad = nearLadder(p);                       // the steel ladder of the pool: the only way in and out
    if (lad) {
      if (lad === 'out' || poolAccess.allowed) ladder.start(lad, p);
      else dialogue.start('You', poolAccess.deniedLines);
    } else if (p.swimming) {
      // nothing to talk to or sit on in the water
    } else if (npcHere && game.npc.isNear(p)) {
      const t = quest.talk();
      dialogue.start(game.npc.name, t.lines, t.next);
    } else {
      const seat = findSeat(p.cx, p.cy);               // near a bench? E sits down
      if (seat) p.sitDown(seat);
      else if (nearPoolThing(p)) { const t = nearPoolThing(p); if (t.kind === 'sign') signView.open(); else talkTo(t.op, p, dialogue); }
      else if (nearRestroom(p.cx, p.cy, p.facing)) restroom.start(nearRestroom(p.cx, p.cy, p.facing));   // men's: use it, women's: denied
      else if (nearWaterFilter(p.cx, p.cy, p.facing)) dialogue.start('You', ['You hold your cup under the tap and let the filter run...', 'Ahh. Cold, clean water. Much better!']);
      else if (skyline.canLean()) skyline.startLean(p); // touching a rail? E leans out for the full view
    }
  }
  p.update(dt, !dialogue.active && !p.sitting && !skyline.leaning);
  updatePool(dt, p);                                 // zone 2: the water's robots swim about, ripples spread
  skyline.update(dt, p);                             // how much of the city beyond the rails is revealed
  if (npcHere) game.npc.facePlayer(game.player);     // NPC turns to look at you when you're near
  const tx = Math.floor(game.player.cx / TILE), ty = Math.floor(game.player.cy / TILE);
  const exit = getExit(tx, ty);
  if (exit && exit.to) { transition.start(exit); return; }   // stepped on an exit tile -> fade to the next zone
  game.hint = getExitHint(tx, ty);
  const lad2 = nearLadder(p);
  if (!game.hint && !dialogue.active) game.hint = p.sitting ? '[E] Stand up'
    : lad2 === 'in' ? '[E] Climb down into the pool'
    : lad2 === 'out' ? '[E] Climb out of the pool'
    : p.swimming ? null
    : skyline.leaning ? '[E] Stop leaning'
    : findSeat(p.cx, p.cy) ? '[E] Sit down'
    : nearPoolThing(p) ? (nearPoolThing(p).kind === 'sign' ? '[E] Read sign' : '[E] Talk')
    : nearRestroom(p.cx, p.cy, p.facing) ? '[E] Use restroom'
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