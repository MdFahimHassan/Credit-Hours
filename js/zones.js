// zones.js - ALL zone maps live here. To add a zone, copy a block and give it a new id.
// Every row of a zone must be the SAME length. Markers (P spawn, N npc, I item) become floor when parsed.
//
// Tiles shared by all zones:
//   #  wall (solid)        R  railing (solid)      .  open floor (grey stone paving, see floor.js)
//   a  blue recycling bin (solid)   o  red non-recyclable bin (solid)  - zone 1, side by side above the left end of the escalator rail
//   c  steel-blue pillar on a concrete plinth (solid) - zone 1: two rows (9 and 21), 6 tiles above / below the escalator
//   p  old "path" tile (walkable). Zone 1 no longer uses it; in other zones it now just looks like the stone floor
//   X  exit path           U  "up" path            S  stairs            D  store room door (solid)
//   L  brick pillar beside the lifts (solid, zone 1: x0-2 on rows 12 and 18, one tile beyond the white wall strips; zone 2: x27-29 on rows 5 and 12, east wall)   f  white wall strip beside the lifts (rows 13 and 17)   d  same strip with the 'All Floor Directory' board (row 13)   l  lift door   A  steel panel with the '13 LEVEL' sign (both solid)
//   E/F escalators (solid, animated)             v  escalator well (solid)
//   W  raised glass skylight (solid, see-through to the floor below)
//   1-6    amphitheatre sitting tiers (solid), 1 = lowest step, 6 = highest - zone 1 upper section; corners are rounded where a block sticks out
//   q      semi-wall (solid): low board-formed concrete planter wall around the zone 1 hedge beds
//   m      flat base slab (solid): the one straight tile at the foot of each outer tier block (zone 1) - same look as the semi-wall; the stepped layers start on the row above it
//   7, 8   extra-high tiers (same as 1-6, just higher): they let every column of an outer tier block step down on the SAME rows
// New in zone 4:
//   C  concrete bench (solid)   T  tree in a grey planter box (solid)   b  bush (WALKABLE - you can walk into it)
// Basement stairwell block (zone 1, x 21-23, rows 0-2, copied from the real storage room: a concrete wedge, tall at the front):
//   k  block (solid): x21 and x23 are full wall tiles, x22 rows 0-2 is the roof + the solid portal. Drawn as ONE piece by drawBasementBlock() in renderer.js
//   The portal (x22 row 2) is solid like a wall: the player stops on the floor tile in front of it (x22 row 3).
//   z  (reserved, not used on the map right now) - the walkable-entry version of the portal. The way down is added later.
// Planted areas with a pale guard rail (all solid; the rail is drawn automatically on every edge that faces open floor):
//   H  clipped hedge    Y  bush mound    Z  tree     (mix them freely, e.g. HHYHZHHY)
// Gymnasium (zone 1, left wall, rows 24-27):
//   J  gym sliding glass door (solid)   Q  wall with the usage-rules poster + wooden cabinet (solid)   r  red gym mat (walkable, 3 tiles between the two doors)
//   e / j  glass doors on the zone 1 west wall (solid, 2 tiles long each): e = south door (rows 5-6, two panes), j = north door (rows 2-3, three panes)
//   H  dense hedge (SOLID - a bush you can NOT walk through; used for the hedge lanes in zone 1)
// New in zone 3:
//   g  grass (walkable lawn)   K  storage room block (solid)   S on the bottom row = stairs down to zone 1
// New in zone 2:
//   B  pool rim (solid)    ~  water (solid)        M  men's restroom door (solid)   G  women's restroom door (solid)
//
// exits: key is "x,y" of the exit tile.
//   to      = zone to fade into        spawn  = tile where the player appears there (NOT an exit tile!)
//   facing  = direction the player looks on arrival     label = text shown for exits that don't lead anywhere yet
export const ZONES = {
  // Zone 1 is 38 tiles wide and 30 tall.
  // UPPER SECTION (rows 0-6): an amphitheatre copied from the real rooftop. Hedge beds run all the way to the top edge (they are part of the lawn above).
  //   x1 walkway (the only up-path) | x2 semi-wall (q) | x3-4 left hedge | x5-16 amphitheatre | x17-19 right hedge | x20 semi-wall (q)
  //   x21-23 open in front of the storage room (grey block, DOOR in the middle at x22, grey block on each side; row 0) | x24-26 hedge bed
  //   Semi-wall (q): x2 and x20 run from row 0 down to row 6, and row 6 (x2-4, x17-20) closes the front of each hedge bed (hedges: rows 0-5).
  //   The outer tier blocks (x5-7, x14-16) end on row 6 with a flat base slab (m) so the wall and the steps share one straight front edge.
  //   Amphitheatre: tiers 1-6 are the big sitting steps (1 = lowest, 6 = highest). A tile's level = how many columns it is from the
  //   pit / flight + how many rows it is below row 5 (capped at 6), so the steps climb both outwards and towards the lawn.
  //   The pit is open to the south. Two small railed flights (S, x8-9 and x12-13, rows 0-4) climb from the back of the pit to the lawn;
  //   the handrail between the two lanes of each flight is solid (see map.js buildThinWalls). The block between the flights (x10-11)
  //   ends in a rounded tip on row 4, level with the bottom of the flights.
  // Pillars (c): rows 9 and 21, x = 3, 7, 11, 15, 19 and 28 (the hedge bed's left end). The row skips the skylight (x 21-26).
  // NOTE: all the stone paths (p) were removed from this zone - it is now one open stone floor. Exits (X / U / S) are unchanged.
  // The path notes below (x 7-8 path, x 27-28 walkway, 'path p' gaps...) still describe WHERE those lanes were, but they are plain floor now.
  //   - rows 9-20 (middle): the glass skylight (x 21-26) and the fenced bush bed (x 29-37) have the same height,
  //     so they sit side by side in the vertical middle of the map
  //   - rows 13-17 (left): escalator + lifts + the student. Exits to the pool zone are at x 0, rows 11 and 19
  //   - x 7-8: a stone path runs from the top paths down to the escalator landing
  //   - x 27-28: 2-tile walkway that runs the full height, between the glass and the right section
  //   - top sitting area (rows 1-7) and bottom sitting area (rows 22-28): a bench ring C around two trees T,
  //     walled off on the left by a 2-wide, 5-row hedge lane H. You enter through the 2-row gap (path p)
  //     between the hedge lane and the bush bed's railing (top: rows 6-7, bottom: rows 22-23)
  //   - x 22-26, rows 0-5: a small mixed hedge (H/Y/Z) right of the storage room. It has no rail on top, so it looks like
  //     it keeps going into the upper zone. The 2-wide path beside it (x 27-28, rows 0-7) will lead up to that zone
  //   - rows 21-23 on the left: open south area (the lost ID card lives here, at x 14, row 22)
  //   - rows 24-28, x 1-26: the long mixed hedge strip (H / Y / Z). The 2-wide walkway (x 27-28) runs along its right end
  //   - gymnasium: on the left wall (x 0, rows 24-27) with a 2-wide path (x 1-2, rows 24-28; the red mat covers x 1, rows 24-26, between the two doors) cut through
  //     the hedge strip. The opening at (0,28) will later connect to the pool zone
  //   - rows 8-21, x 29-36: the planted bed (same H / Y / Z mix), wall on x 37
  zone1: {
    name: 'Rooftop Entry',
    rows: [
    "#UqHYH876SS66SS678YHYqkkkZHUUHHRRRRRRR",
    "#.qYHH765SS55SS567HZHqkkkYH..HH......R",
    "j.qHHY654SS44SS456HYZqkkkHZ..HH..CCC.R",
    "j.qZHH543SS33SS345ZHHq...HY..HH..CTC.R",
    "#.qHYZ432SS22SS234HHYq...YZ..HH..CTC.R",
    "e.qYHH321......123YHHq...YH..HH..CCC.R",
    "e.qqqqmmm......mmmqqqq...............R",
    "#....................................R",
    "#............................HHYHYYHZ#",
    "#..c...c...c...c...c.WWWWWW.cYZHZHYHH#",
    "X....................WWWWWW..YHHHYHYH#",
    "X....................WWWWWW..HHZHHHZH#",
    "LLL......ao..........WWWWWW..HHHHHYHY#",
    "d........RRRRRRRRR...WWWWWW..ZYHZHHHH#",
    "l.........PEEEEEvvR..WWWWWW..YHYHHZHY#",
    "A.....N..RRvvvvvvvR..WWWWWW..HHHHYHYH#",
    "l..........FFFFFvvR..WWWWWW..ZYHHHHHH#",
    "f........RRRRRRRRR...WWWWWW..HHZHHHHH#",
    "LLL..................WWWWWW..HHYYHHYH#",
    "X....................WWWWWW..ZYYYHYZH#",
    "X....................WWWWWW..HYHHHHHY#",
    "#..c...c...c...c...c........cHHHYYHYH#",
    "#.............I......................R",
    "#....................................R",
    "Jr.HHYYHHYHYHZYHYYHHZHHYHZY..HH..CCC.R",
    "Qr.HHHHHHHZHHYYHHYHYHHZHYYY..HH..CTC.R",
    "Jr.HZHHHHHHHZHYHHZYHHYHHHYH..HH..CTC.R",
    "#..YYHHYYZYHHYHYYYYYYHYYHHY..HH..CCC.R",
    "X..HHHHHHYYHHHYHHYHHYYZYHZY..HH......R",
    "RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR",
    ],
    exits: {
      '0,11': { to: 'zone2', spawn: { x: 28, y: 4 },  facing: 'left', label: 'Right path' },
      '0,10': { to: 'zone2', spawn: { x: 28, y: 3 },  facing: 'left', label: 'Right path' },
      '0,19': { to: 'zone2', spawn: { x: 28, y: 13 }, facing: 'left', label: 'Left path' },
      '0,20': { to: 'zone2', spawn: { x: 28, y: 14 }, facing: 'left', label: 'Left path' },
      '1,0':  { to: 'zone3', spawn: { x: 2, y: 16 },  facing: 'up', label: 'Up path (left)' },
      // 2-wide path at the top right: will lead to the upper zone (no 'to' yet = just shows a hint)
      '27,0': { label: 'Upper zone path' },
      '28,0': { label: 'Upper zone path' },
      // bottom-left opening beside the gym: will link to the pool zone later (no 'to' yet = just shows a hint)
      '0,28': { label: 'Pool zone path' },
    },
  },

  zone2: {
    name: 'Pool Zone',
    spawn: { x: 28, y: 4 },
    rows: [
    "R#U###################MM######",
    "R.p....................pp....#",
    "R.p....................pp....#",
    "R.p..pppppppppppppppppppp....#",
    "R.p..pBBBBBBBBBBBBBBBBBBpppppX",
    "R.p..pB~~~~~~~~~~~~~~~~Bp..LLL",
    "R.p..pB~~~~~~~~~~~~~~~~Bp....f",
    "R.p..pB~~~~~~~~~~~~~~~~Bp....l",
    "R.p..pB~~~~~~~~~~~~~~~~Bp....A",
    "R.p..pB~~~~~~~~~~~~~~~~Bp....l",
    "R.p..pB~~~~~~~~~~~~~~~~Bp....d",
    "R.p..pB~~~~~~~~~~~~~~~~Bp..LLL",
    "R.p..pB~~~~~~~~~~~~~~~~Bp....#",
    "RpppppBBBBBBBBBBBBBBBBBBpppppX",
    "Rpppppppppppppppppppppppp....#",
    "R.....................ppp....#",
    "R.....................ppp....#",
    "R#####################GG######",
    ],
    exits: {
      '29,4':  { to: 'zone1', spawn: { x: 1, y: 11 }, facing: 'right', label: 'Right path' },
      '29,13': { to: 'zone1', spawn: { x: 1, y: 19 }, facing: 'right', label: 'Left path' },
      '2,0':   { to: 'zone4', spawn: { x: 2, y: 16 }, facing: 'up', label: 'Upper zone' },
    },
  },

  zone3: {
    name: 'Lawn Zone',
    spawn: { x: 14, y: 16 },
    rows: [
      "RRRRRRRRRRRRRRRRRRRRRRRRRRRRRR",
      "RppppppppppppppppppppppppppppR",
      "RDpBBBBBBBBBBBBBBBBBBBBBBBBppR",
      "RKpBggggggggggggggggggggggBpDR",
      "RKpBggggggggggggggggggggggBpKR",
      "XppBggggggggggggggggggggggBpKR",
      "R.pBggggggggggggggggggggggBpKR",
      "R.pBggggggggggggggggggggggBpKR",
      "R.pBggggggggggggggggggggggBp.R",
      "R.pBggggggggggggggggggggggBp.R",
      "RKpBggggggggggggggggggggggBp.R",
      "RKpBggggggggggggggggggggggBp.R",
      "RKpBggggggggggggggggggggggBp.R",
      "RDpBggggggggggggggggggggggBp.R",
      "XppBggggggggggggggggggggggBp.R",
      "R.pBggggggggggggggggggggggBp.R",
      "R.pBBggggggggggggggggggggBBp.R",
      "R.XXXSSSSSSSSSSSSSSSSSSSSXXX.R",
    ],
    exits: {
      // west paths lead to zone 4
      '0,5':  { to: 'zone4', spawn: { x: 28, y: 2 },  facing: 'left', label: 'West path (upper)' },
      '0,14': { to: 'zone4', spawn: { x: 28, y: 14 }, facing: 'left', label: 'West path (lower)' },
      // bottom row: left path (x 2-4), stairs (x 5-24) and right path (x 25-27) lead down to zone 1.
      // The stairs and the stairs exits in zone 1 are generated below.
    },
  },
};

// Zone 4 sits to the upper left. r = row 2 exit, L = row 14 exit (they match zone 3's west exits).
ZONES.zone4 = {
  name: 'Garden Zone',
  spawn: { x: 2, y: 16 },
  rows: [
    "RRRRRRRRRRRRRRRRRRRRRRRRRRRRRR",
    "RppppppppppppppppppppppppppppR",
    "RppppppppppppppppppppppppppppX",
    "RppCCCCCCpbbbbbbbbbbbbbbbbbbbR",
    "RppCTTTTCpbbbbbbbbbbbbbbbbbbbR",
    "RppCCCCCCpbbbbbbbbbbbbbbbbbbbR",
    "RppppppppppppppppppppppppppppR",
    "RpbbbbbbbbbbbbbbbbbbbbbbbbbbpR",
    "RpbbbbbbbbbbbbbbbbbbbbbbbbbbpR",
    "RpppppppppppppppppppppppppbbpR",
    "RppCCCCCCpbbbbbbbbbbbbbbbpbbpR",
    "RppCTTTTCpbbbbbbbbbbbbbbbpbbpR",
    "RppCCCCCCpbbbbbbbbbbbbbbbpbbpR",
    "RpppppppppppppppppppppppppbbpR",
    "RpppbbbbbpbbbbbbbbbbbbbbbbbbpX",
    "RpppbbbbbpbbbbbbbbbbbbbbbbbbpR",
    "RpppbbbbbppppppppppppppppppppR",
    "##XX##########################",
  ],
  exits: {
    '29,2':  { to: 'zone3', spawn: { x: 1, y: 5 },  facing: 'right', label: 'r path' },
    '29,14': { to: 'zone3', spawn: { x: 1, y: 14 }, facing: 'right', label: 'L path' },
    '2,17':  { to: 'zone2', spawn: { x: 2, y: 1 },  facing: 'down',  label: 'Down to the pool' },
    '3,17':  { to: 'zone2', spawn: { x: 3, y: 1 },  facing: 'down',  label: 'Down to the pool' },
  },
};

// ---- Zone 3 <-> zone 1 links -------------------------------------------------------------
// Left path: zone 3 (x 2-4, bottom row) -> zone 1 left up path (3,1). Right path: x 25-27 -> (17,1).
for (const x of [2, 3, 4])    ZONES.zone3.exits[x + ',17'] = { to: 'zone1', spawn: { x: 1,  y: 1 }, facing: 'down', label: 'Left path' };
// The right up-path in zone 1 was removed, so zone 3's right path now also arrives at the (only) left up-path
for (const x of [25, 26, 27]) ZONES.zone3.exits[x + ',17'] = { to: 'zone1', spawn: { x: 1, y: 1 }, facing: 'down', label: 'Right path' };

// Stairs: zone 3 has 20 stair tiles (x 5-24). Zone 1 has TWO railed flights (x 9-10 and x 13-14, rows 0-4).
// The left half of zone 3's stairs (x 5-14) leads down the left flight, the right half (x 15-24) down the right flight.
for (let x = 5; x <= 24; x++) {
  const left = x <= 14, k = left ? x - 5 : x - 15;              // k = 0..9 across that half
  ZONES.zone3.exits[x + ',17'] = { to: 'zone1', spawn: { x: (left ? 9 : 13) + (k >= 5 ? 1 : 0), y: 1 }, facing: 'down', label: 'Stairs' };
}
for (const fx of [9, 10, 13, 14]) {                             // top row of each flight in zone 1 -> back up to the lawn
  const left = fx < 12, sx = (left ? 5 : 15) + (fx - (left ? 9 : 13)) * 5 + 2;
  ZONES.zone1.exits[fx + ',0'] = { to: 'zone3', spawn: { x: sx, y: 16 }, facing: 'up', label: 'Stairs' };
}