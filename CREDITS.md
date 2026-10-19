# Credits

## Game
Credit Hours - made by **Md. Fahim Hassan & Shahriar Islam Tawsif**, CSE students, as a passion project.
The map is inspired by a real university rooftop.

## Character art - Universal LPC Spritesheet Character Generator
The player sprite (`assets/character-spritesheet.png`) and the NPC sprite (`assets/npc-spritesheet.png`)
were created with the **Universal LPC Spritesheet Character Generator**, which combines art from the
**Liberated Pixel Cup (LPC)** community collection:

- Generator: https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator
- LPC collection: http://opengameart.org/content/lpc-collection

Statement (as asked for by the LPC project):

> Sprites contributed as part of the Liberated Pixel Cup project from OpenGameArt.org:
> http://opengameart.org/content/lpc-collection
> License: Creative Commons Attribution-ShareAlike 3.0 (CC-BY-SA 3.0)
> http://creativecommons.org/licenses/by-sa/3.0/

### Detailed per-layer credits
Every layer of each character (body, hair, clothes, shoes, ...) has its own authors, licenses and source links,
exported straight from the generator:

- Player: [`assets/character-credits.txt`](assets/character-credits.txt)
- NPC: [`assets/npc-credits.txt`](assets/npc-credits.txt)

Please keep both files with the project, and keep the in-game Credits screen (main menu > Credits).

### Licenses
The layers are offered under OGA-BY 3.0, CC-BY-SA 3.0 and/or GPL 3.0 (see the files above for each layer).
We distribute the character art under **CC-BY-SA 3.0**, with attribution to all the artists listed.
Share-alike means edited versions of the art (including the recoloured student variants made in `js/sprites.js`)
should be shared under the same license. The game code is under the MIT License (see `LICENSE`).

## Sound and music
All three sounds come from [Pixabay](https://pixabay.com) and are used under the **Pixabay Content License** (https://pixabay.com/service/license-summary/). They are edited for the game (cut and looped) and live in `assets/audio/`:

- **Menu music** - "Slow downtempo chillwave" by Elisaveta_Stoycheva (`menu-loop.ogg` / `menu-loop.mp3`: a 24-bar section with its end crossfaded into its start so it loops)
- **UI click** - "Mouse click" by MatthewVakaliuk73627 (`click.mp3`)
- **Menu glitch** - "Glitch Sound Effect HD" by Virtual_Vibes (`glitch-short.mp3`, `glitch-long.mp3`: two short clips cut from the original)

The hover tick in the menus is generated in code (`js/audio.js`), not a recording.

## Fonts
The menu uses two fonts from Google Fonts, both under the **SIL Open Font License 1.1** (the full licence texts are in `assets/fonts/`):

- **Rubik Glitch** (title) - copyright 2020 The Rubik Filtered Project Authors
- **Pixelify Sans** (menu text) - copyright 2021 The Pixelify Sans Project Authors