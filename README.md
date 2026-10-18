# University Adventures

A cozy top-down 2D pixel-art adventure inspired by a real university rooftop. No combat, no monsters: just exploring, talking to students and helping out.

> **Status:** early prototype (v0.1). One small map, one NPC, one quest.

<!-- Add a screenshot or GIF here, e.g. ![Gameplay](docs/screenshot.png) -->

## The story so far

You arrive on the rooftop by escalator, fading in from the floor below. A student near the elevators has lost their ID card. Find it on the lawn and bring it back.

## Features

- **Opening cutscene:** an animated escalator ride with a fade-in from black (press `E` or `Space` to skip)
- **Smooth movement:** 4-direction walking with a sprite walk cycle, using delta time so speed is the same on every monitor
- **Tile-based collision:** walls, water and hedges block you, and you slide along them. Only your feet collide (a strip under the shoes), so you can stand right at the foot of anything; rails, holes and curved rails use their exact drawn shape
- **Follow camera:** centers on the player and stops at the map edges
- **NPC with dialogue:** talk to a student, who turns to face you
- **Mini quest system:** a small state machine with an on-screen quest tracker
- **Text-based maps:** edit the world by changing characters in `js/map.js`
- **Skyline view:** rails on the edge of a zone reveal the city beyond: hazy and thin from a distance, wider and clearer as you get close, with a different view on each side (golden hour)
- **Lean out:** press `E` at a rail for the widest, clearest view
- **Debug mode:** press `F3` to see the tile grid, solid tiles and collision boxes

## Controls

| Key | Action |
|---|---|
| `W` `A` `S` `D` / Arrow keys | Move |
| `E` | Talk / advance dialogue / sit / lean out at a rail |
| `E` / `Space` | Skip the intro |
| `F3` | Toggle debug view |
| `C` | Show or hide credits |

**On a phone / tablet** the controls appear on screen automatically: a thumb stick on the left (walk), an **E** button on the right (talk / sit / lean / skip intro), and tapping `[C] Credits` opens the credits. Landscape gives the biggest view.

## Running the game

The game uses ES modules, which browsers block when you open `index.html` directly from disk. Use a local server:

```bash
cd rooftop-game
python -m http.server 8000      # on Windows you can also use: py -m http.server 8000
```

Then open **http://localhost:8000** in your browser.

If you use VS Code, the *Live Server* extension also works. After editing code, hard-refresh with `Ctrl + Shift + R` to bypass the cache.

## Tech

- HTML5 Canvas 2D with a `requestAnimationFrame` game loop
- Vanilla JavaScript (ES modules)
- Static pictures (tile chunks, fences, stairwell, escalator frames, skyline panoramas) are painted once and stamped each frame; only moving things are redrawn
- No frameworks, engines, libraries or build tools

## Project structure

```
rooftop-game/
├── index.html
├── assets/
│   ├── character-spritesheet.png   player sprites
│   ├── npc-spritesheet.png         NPC sprites
│   └── character-credits.txt
└── js/
    ├── main.js        game loop and wiring
    ├── map.js         text-grid map, parsing, collision queries
    ├── player.js      movement and X/Y-separated collision
    ├── npc.js         NPC data, talk range, facing
    ├── dialogue.js    dialogue box state
    ├── quest.js       quest state machine and NPC lines
    ├── intro.js       escalator opening cutscene
    ├── skyline.js     city view beyond the rails, camera reveal, lean out
    ├── sprites.js     spritesheet loading and drawing
    ├── input.js       keyboard + touch input (thumb stick, E button)
    ├── display.js     canvas sizing (whole-pixel scaling, phones)
    ├── warmup.js      paints a zone's heavy pictures behind the black screen
    └── renderer.js    all drawing, camera, HUD, debug view
```

### Editing the map

The map is a grid of characters in `js/map.js`. Every row must be the same length.

| Char | Tile |
|---|---|
| `#` | Wall / railing |
| `.` | Stone floor |
| `~` | Water |
| `h` | Hedge / planter |
| `g` | Grass |
| `1`-`6` | Amphitheatre sitting tiers (solid; 1 = lowest step, 6 = highest), zone 1 upper section |
| `q` | Semi-wall: low concrete planter wall around the zone 1 hedge beds (solid) |
| `S` | Stairs (walkable; zone 1 has two railed flights) |
| `E` / `r` | Escalator belt / rail |
| `P` / `N` / `I` | Player spawn / NPC / item |

## Roadmap

- [x] More zones: garden corner, overlook, covered area, amphitheater
- [ ] Locked gym door and follow-up quests
- [x] NPC collision and more NPCs
- [ ] Sound effects and music
- [ ] Save and load progress
- [x] Mobile touch controls
- [ ] Title screen and menu

## Credits

Character sprites were made with the **Universal LPC Spritesheet Character Generator**, using art from the Liberated Pixel Cup project on OpenGameArt.org. These assets are licensed under CC-BY-SA / GPL and require attribution. See [`CREDITS.md`](CREDITS.md) and [`assets/character-credits.txt`](assets/character-credits.txt) for the full list of authors and licenses.

## License

MIT License

## Authors

Built by Md. Fahim Hassan & Shahriar Islam Tawsif, CSE students of BracU as a passion project.