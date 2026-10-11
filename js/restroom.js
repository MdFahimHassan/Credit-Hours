// restroom.js - the restroom interaction in zone 2 (logic only, drawing is in renderer.js drawRestroomScene).
// You never walk INTO the restroom: you press E at the door, the screen fades to black, a few lines of text play out, and it fades back.
//   men's   -> the player is male, so he uses it: fade to BLACK, text, fade back in.
//   women's -> denied: the screen only dims (the door stays faintly visible), a rose-red "denied" card, then you are
//              nudged a few pixels back from the door. Trying again gets a different (more exasperated) line each time.
// To change the text, edit SCRIPT below. Each entry is one visit; after the last one it keeps repeating the last entry.
const FADE_OUT = 0.55;      // seconds: world -> dark
const FADE_IN = 0.55;       // seconds: dark -> world
const CPS = 42;             // typewriter speed, characters per second
const DIM = { men: 1, women: 0.86 };   // how dark the screen gets (1 = pure black)

const SCRIPT = {
  men: [
    ["You slip into the men's restroom...", '. . .', 'Ahh. Much better.', 'You wash your hands and head back out into the daylight.'],
    ['Another trip already?', '. . .', "Hand wash, quick check in the mirror. You're good."],
    ['Nature calls again.', '. . .', 'Drinking all that filtered water has consequences.'],
  ],
  women: [
    ["You reach for the women's restroom door...", 'The sign beside it shows a woman. Wrong door!', "You back away, trying to look like you were only reading the sign. The men's is on the north side of the pool."],
    ["The women's restroom. Again.", "It's still a no."],
    ['Seriously?', 'You are NOT getting in there. Men\'s restroom: north side of the pool, past the hedge.'],
  ],
};

export const restroom = {
  active: false,
  kind: null,          // 'men' | 'women'
  phase: 'out',        // 'out' (fading) -> 'text' -> 'in' (fading back)
  t: 0,                // seconds in the current phase
  lines: [], i: 0,     // the script being played and the line we are on
  typed: 0,            // characters of the current line revealed so far
  uses: { men: 0, women: 0 },

  start(kind) {
    const list = SCRIPT[kind];
    this.lines = list[Math.min(this.uses[kind]++, list.length - 1)];
    this.kind = kind; this.active = true; this.phase = 'out'; this.t = 0; this.i = 0; this.typed = 0;
  },

  update(dt, input, player) {
    this.t += dt;
    if (this.phase === 'out') {
      player.moving = false; player.animTime = 0;
      if (this.t >= FADE_OUT) { this.phase = 'text'; this.t = 0; }
    } else if (this.phase === 'text') {
      const full = this.lines[this.i].length;
      this.typed = Math.min(full, this.typed + CPS * dt);
      if (input.wasPressed('KeyE') || input.wasPressed('Space')) {
        if (this.typed < full) this.typed = full;                       // first press: finish the line
        else if (++this.i >= this.lines.length) {                       // last line done: fade back
          this.phase = 'in'; this.t = 0; this.i = this.lines.length - 1;
          if (this.kind === 'women') {                                  // turned away: step back from the door
            player.y += player.facing === 'down' ? -10 : 10;
            player.facing = player.facing === 'down' ? 'up' : 'down';
          }
        } else this.typed = 0;
      }
    } else if (this.t >= FADE_IN) {
      this.active = false;
    }
  },

  get dim() { return DIM[this.kind] ?? 1; },
  // 0 = clear ... dim = darkest, eased so the fade does not start/stop abruptly
  get alpha() {
    if (!this.active) return 0;
    const k = this.phase === 'out' ? Math.min(1, this.t / FADE_OUT) : this.phase === 'in' ? 1 - Math.min(1, this.t / FADE_IN) : 1;
    return this.dim * k * k * (3 - 2 * k);
  },
  // how visible the text card is (it appears just after the screen is dark and leaves as the fade-in starts)
  get cardAlpha() {
    return this.phase === 'text' ? Math.min(1, this.t / 0.3) : this.phase === 'in' ? Math.max(0, 1 - this.t / 0.18) : 0;
  },
  get text() { return this.lines[this.i]?.slice(0, Math.floor(this.typed)) ?? ''; },
  get lineDone() { return this.typed >= (this.lines[this.i]?.length ?? 0); },
};