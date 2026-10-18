// zones.js - ALL zone maps live here. To add a zone, copy a block and give it a new id.
// Every row of a zone must be the SAME length. Markers (P spawn, N npc, I item) become floor when parsed.
//
// Tiles shared by all zones:
//   #  wall (solid)        R  railing (solid)      .  open floor (grey stone paving, see floor.js)
//   V  street dustbin, blue plastic (solid) - zone 1: x36, rows 7 and 22, in the corners beside the east hedge bed; zone 2: x1, rows 7 and 22; zone 3: one in the corner where each sitting area meets the skyline rail
//   a  blue recycling bin (solid)   o  red non-recyclable bin (solid)  - zone 1, side by side above the left end of the escalator rail
//   c  steel-blue pillar on a concrete plinth (solid) - zone 1: two rows (9 and 21), 6 tiles above / below the escalator
//   p  old "path" tile (walkable). Zone 1 no longer uses it; in other zones it now just looks like the stone floor
//   X  exit path           U  "up" path            S  stairs            D  store room door (solid)
//   L  brick pillar beside the lifts (solid, zone 1: x0-2 on rows 12 and 18, one tile beyond the white wall strips; zone 2: x28-30 on rows 11 and 17, east wall)   f  white wall strip beside the lifts (rows 13 and 17)   d  same strip with the 'All Floor Directory' board (row 13)   l  lift door   A  steel panel with the '13 LEVEL' sign (both solid)
//   E/F escalators (solid, animated)             v  escalator well (solid)
//   W  raised glass skylight (solid, see-through to the floor below)
//   1-6    amphitheatre sitting tiers (solid), 1 = lowest step, 6 = highest - zone 1 upper section; corners are rounded where a block sticks out
//   q      semi-wall (solid): low board-formed concrete planter wall around the zone 1 hedge beds
//   m      flat base slab (solid): the one straight tile at the foot of each outer tier block (zone 1) - same look as the semi-wall; the stepped layers start on the row above it
//   7, 8   extra-high tiers (same as 1-6, just higher): they let every column of an outer tier block step down on the SAME rows
// Tiles that only the (removed) zone 4 used - kept in case they come back:
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
//   u  plain 2-wide flight of steps (walkable, slows you like stairs): zone 3's way up to the lawn (x14-15, rows 11-13 = 6 steps)
//   (zone 3) hedge bed (H/Y/Z, with the usual guard rail): an L round the west side of the landing and the storage room - x7-13 rows 8-10, then x7-10 down to row 15, right against the storage room
//   y  concrete landing at the top of those steps (walkable, the colour of the treads): x14-16, rows 8-10 - the 3-tile opening in the lawn's west border
//   k  (zone 3 too) the storage room block, x11-13 rows 11-15 (the 3x3 front at rows 13-15 + 2 rows of roof behind it), drawn mirrored so its louvered wall faces the stairs (renderer.js BLOCKS)
//   The white rail round the lawn is drawn automatically on the lawn's border wall (q) - renderer.js drawLawnRail()
// New in zone 2:
//   B  pool rim (solid)    ~  water (solid)        M  men's restroom door (solid)   G  women's restroom door (solid)
//      Each restroom is a PAIR of tiles: the left tile is the slatted steel gate, the right tile is the doorway (drawRestroomDoor in renderer.js).
//      The signs, lamp, mop bucket, plant and louvres are painted on the plaster tiles beside the pair. Press E in front of them: see restroom.js
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
    roundedCorners: [{ corner: 'ne', r: 1 }, { corner: 'se', r: 1 }],   // smooth rail corners (curverail.js): the north-east and south-east corners of the rail (the two west ones are the exit paths)
    rows: [
    "eUqHYH876SS66SS678YHYqUUkkkHHHHUURRRRR",
    "#.qYHH765SS55SS567HZHq..kkkYHHH......R",
    "j.qHHY654SS44SS456HYZq..kkkHHHH..CCC.R",
    "j.qZHH543SS33SS345ZHHq.....HYHH..CTC.R",
    "#.qHYZ432SS22SS234HHYq.....HHHH..CTC.R",
    "e.qYHH321......123YHHq.....YHHH..CCC.R",
    "e.qqqqmmm......mmmqqqq...............R",
    "#...................................VR",
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
    "#.............I.....................VR",
    "#....................................R",
    "Jr.HHYYHHYHYHZYHYYHHZHHYHZY..HH..CCC.R",
    "Qr.HHHHHHHZHHYYHHYHYHHZHYYY..HH..CTC.R",
    "Jr.HZHHHHHHHZHYHHZYHHYHHHYH..HH..CTC.R",
    "#..YYHHYYZYHHYHYYYYYYHYYHHY..HH..CCC.R",
    "X..HHHHHHYYHHHYHHYHHYYZYHZY..HH......R",
    "RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR",
    ],
    exits: {
      '0,11': { to: 'zone2', spawn: { x: 29, y: 11 },  facing: 'left', label: 'Right path' },
      '0,10': { to: 'zone2', spawn: { x: 29, y: 10 },  facing: 'left', label: 'Right path' },
      '0,19': { to: 'zone2', spawn: { x: 29, y: 19 }, facing: 'left', label: 'Left path' },
      '0,20': { to: 'zone2', spawn: { x: 29, y: 20 }, facing: 'left', label: 'Left path' },
      '1,0':  { to: 'zone3', spawn: { x: 10, y: 50 }, facing: 'up', label: 'Up path (left)' },
      // 2-wide path at the top right (x22-23, on the left of the storage room, which now stands at x24-26 against the hedge bed x27-30): leads up to zone 3, to the east path beside the lawn (its opening in the south wall at x58-59)
      '22,0': { to: 'zone3', spawn: { x: 58, y: 50 }, facing: 'up', label: 'Lawn path (right)' },
      '23,0': { to: 'zone3', spawn: { x: 59, y: 50 }, facing: 'up', label: 'Lawn path (right)' },
      // bottom-left opening beside the gym: the 1-tile path along row 28 of the pool zone
      // 2-wide path at the top right (x31-32, right of the hedge bed): leads up to zone 3, to the 2-tile path right of the east hedge bed (x66-67)
      '31,0': { to: 'zone3', spawn: { x: 66, y: 50 }, facing: 'up', label: 'Lawn path (far right)' },
      '32,0': { to: 'zone3', spawn: { x: 67, y: 50 }, facing: 'up', label: 'Lawn path (far right)' },
      '0,28': { to: 'zone2', spawn: { x: 29, y: 28 }, facing: 'left', label: 'Pool zone path' },
    },
  },

  // Zone 2 is 31 tiles wide and 30 tall.
  // WEST STRIP (x 0-8): a mirrored copy of zone 1's east strip (x 29-37), so the two zones echo each other.
  //   top sitting area (rows 1-7) | hedge band (rows 8-21) | bottom sitting area (rows 22-28)
  //   sitting areas: bench ring (C) round a tree planter (T) at x 2-4, and a 2-wide hedge lane (H) at x 7-8 on the pool side
  //   hedge band: a 4-wide hedge (x 1-4, 14 rows: zone 1's is 8 wide) against the west wall, then a 2-tile walkway (x 5-6), then the pool rim (x 7)
  //   x 0 is a rail (R) beside the sitting areas and a wall (#) behind the hedge - like zone 1's east side, the skyline window carries on behind the hedge
  //   and vines hang over the edge (see VINE_EDGES in foliage.js and WINDOW_FILL in skyline.js)
  // The pool, the lift wall (east) and the restrooms are the old zone 2 moved 1 tile right and 6 rows down.
  // SOUTH SIDE: a 1-tile path runs along row 28 from the west rail to the east exit (30,28), which meets zone 1's bottom-left opening.
  //   The bottom hedge lane ends on row 27; a 12x4 hedge (x10-21, rows 24-27) sits on the path's north side, then a plaster block (x22-29, rows 24-27)
  //   carries the women's restroom doors (G G at x23-24, row 24, on the pool-facing north side). The whole south wall (row 29) is a rail with the city skyline beyond.
  // NORTH SIDE: a 12x3 hedge (x11-22, rows 3-5) and a plaster block (x23-30, rows 3-5) with the men's restroom doors (M M at x24-25, row 5, on the pool-facing south side).
  // NORTH CORRIDOR: the 2-wide path at x 9-10 no longer fades to black at the top. It turns right (east) and runs along the top of the hedge and the block
  //   (rows 1-2, x 9-30), with a rail along its outer (north) side (row 0, x 9-29) and the city skyline beyond (the old wall is gone), and leaves the zone at
  //   x 30 (X, rows 1-2) with the normal black fade -> zone 3 (Lawn Zone). Zone 4 (the top-left zone) was removed: the real rooftop is L-shaped.
  zone2: {
    name: 'Pool Zone',
    roundedCorners: [{ corner: 'nw', r: 1 }, { corner: 'sw', r: 1 }],   // smooth rail corners (curverail.js): the two west corners (the east ones are open paths: the rail runs on beside them)
    spawn: { x: 29, y: 10 },
    rows: [
    "RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR",
    "R......HH.....................X",
    "R.CCC..HH.....................X",
    "R.CTC..HH..YYHHYYZYHHYH########",
    "R.CTC..HH..HHYYHHYHYHZY########",
    "R.CCC..HH..HYHHZHHYHHYH#MM#####",
    "R.............................#",
    "RV............................#",
    "#ZHYY.........................#",
    "#HHYH.........................#",
    "#HYHY..BBBBBBBBBBBBBBBBBB.....X",
    "#HZHH..B~~~~~~~~~~~~~~~~B.....X",
    "#YHYH..B~~~~~~~~~~~~~~~~B...LLL",
    "#HHHH..B~~~~~~~~~~~~~~~~B.....f",
    "#YHZH..B~~~~~~~~~~~~~~~~B.....l",
    "#HYHY..B~~~~~~~~~~~~~~~~B.....A",
    "#HHHH..B~~~~~~~~~~~~~~~~B.....l",
    "#HHHH..B~~~~~~~~~~~~~~~~B.....d",
    "#HYHH..B~~~~~~~~~~~~~~~~B...LLL",
    "#HZYH..BBBBBBBBBBBBBBBBBB.....X",
    "#YHHH.........................X",
    "#HYHY.........................#",
    "RV............................#",
    "R.............................#",
    "R.CCC..HH.HHYYHHYHYHZY#GG######",
    "R.CTC..HH.HHHHHHHZHHYY#########",
    "R.CTC..HH.HZHHHHHHHZHY#########",
    "R.CCC..HH.YYHHYYZYHHYH#########",
    "R.............................X",
    "RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR",
    ],
    exits: {
      '30,10': { to: 'zone1', spawn: { x: 1, y: 10 }, facing: 'right', label: 'Right path' },   // the two lift paths are 2 tiles wide, like zone 1's (rows 10-11 and 19-20)
      '30,11': { to: 'zone1', spawn: { x: 1, y: 11 }, facing: 'right', label: 'Right path' },
      '30,19': { to: 'zone1', spawn: { x: 1, y: 19 }, facing: 'right', label: 'Left path' },
      '30,20': { to: 'zone1', spawn: { x: 1, y: 20 }, facing: 'right', label: 'Left path' },
      // the north corridor (rows 1-2) runs east along the top of the hedge and leaves the zone at x 30 -> Lawn Zone (west path, lower)
      '30,1':  { to: 'zone3', spawn: { x: 1, y: 48 }, facing: 'right', label: 'Lawn zone path' },
      '30,2':  { to: 'zone3', spawn: { x: 1, y: 49 }, facing: 'right', label: 'Lawn zone path' },
      '30,28': { to: 'zone1', spawn: { x: 1, y: 28 }, facing: 'right', label: 'Pool zone path' },   // the 1-tile path along row 28 meets zone 1's bottom-left opening
    },
  },

  // Zone 3 (Lawn Zone) is 69 tiles wide and 42 tall (the top 12 rows - a copy of the bay + hole of the south-west corner - were added later): a big lawn (x14-49, rows 14-25) ringed by a hedge border (the same one as zone 1's hedge beds: semi-wall q + 2 hedge tiles)
  //   and, on the west, north and east, an EMPTY 10-tile-wide path all round it (x1-10, rows 1-10, x53-62) - stuff is added / the paths are narrowed later.
  //   The outer edge is a rail (R) with the city skyline beyond (west / north / east), the south side is the wall above zone 1 (plain wall, no skyline).
  //   ENTRY from zone 1: a 1-tile path at x1 (rows 28-29, exit at (1,29)) with a wall on each side, opening into the west path above.
  //   STAIRS: two small railed flights (2 lanes + a white handrail, rows 26-29) copied from zone 1's: x29-30 and x33-34, with a 2-tile block (x31-32) between them.
  zone3: {
    name: 'Lawn Zone',
    spawn: { x: 10, y: 50 },
    rows: [
      "RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR",
      "R.....HHY..HHHHY.............................................HHHHHYHHHHHHR",
      "R.CCC.HHH..HHHYH.............................................HYHHHHHHYHHHR",
      "R.CTC.HHH..HHHHHqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq...HHHHYHHHHHHYR",
      "R.CTC.HHH..YHHHYqggggggggggggggggggggggggggggggggggggggggq...YHHHHHHYHHHHR",
      "R.CCC.YHH..HHZHHqggggggggggggggggggggggggggggggggggggggggq...HHHYHHH.....R",
      "R.CTC.HHH..HYHHHqggggggggggggggggggggggggggggggggggggggggq...HHHHHHY.CCC.R",
      "R.CTC.HYH..YHHHHqggggggggggggggggggggggggggggggggggggggggq...HHYHHHH.CTC.R",
      "R.CCC...........qggggggggggggggggggggggggggggggggggggggggq...HHHHHYH.CTC.R",
      "RV..............qggggggggggggggggggggggggggggggggggggggggq...HYHHHHH.CCC.R",
      "R...............qggggggggggggggggggggggggggggggggggggggggq...HHHHYHH.CTC.R",
      "R...............qggggggggggggggggggggggggggggggggggggggggq...YHHHHHH.CTC.R",
      "R...............qggggggggggggggggggggggggggggggggggggggggq...HHHYHHH.CCC.R",
      "R...............qggggggggggggggggggggggggggggggggggggggggq..............VR",
      "R...............qggggggggggggggggggggggggggggggggggggggggq...............R",
      "R...............qggggggggggggggggggggggggggggggggggggggggq...............R",
      "R...............qggggggggggggggggggggggggggggggggggggggggq...............R",
      "R...............qggggggggggggggggggggggggggggggggggggggggq...............R",
      "R...............qggggggggggggggggggggggggggggggggggggggggq...............R",
      "R...............qggggggggggggggggggggggggggggggggggggggggq...............R",
      "R...............qggggggggggggggggggggggggggggggggggggggggq...............R",
      "R...............qggggggggggggggggggggggggggggggggggggggggq...............R",
      "R...............qggggggggggggggggggggggggggggggggggggggggq...............R",
      "R...............qggggggggggggggggggggggggggggggggggggggggq...............R",
      "RV..............qggggggggggggggggggggggggggggggggggggggggq...........CCC.R",
      "R......HHYHkkk..qggggggggggggggggggggggggggggggggggggggggyyykkkHHYHH.CTC.R",
      "R.CCC..HYHHkkk..qggggggggggggggggggggggggggggggggggggggggyyykkkHYHHY.CTC.R",
      "R.CTC..YHHYkkknnqggggggggggggggggggggggggggggggggggggggggyyykkkYHHYH.CCC.R",
      "R.CTC..HHYHkkknnqggggggggggggggggggggggggggggggggggggggggquukkkHHYHH.CTC.R",
      "R.CCC..HYHHkkknnqggggggggggggggggggggggggggggggggggggggggquukkkHYHHY.CTC.R",
      "R......HHYHHYHyyyggggggggggggggggggggggggggggggggggggggggquukkkHHYHH.CCC.R",
      "R.CCC..HYHHZHHyyyggggggggggggggggggggggggggggggggggggggggq..............VR",
      "R.CTC..YHHYHHYyyyggggggggggggggggggggggggggggggggggggggggq...............R",
      "R.CTC..HYHHkkkuuqggggggggggggggggggggggggggggggggggggggggq...............R",
      "R.CCC..YHHYkkkuuqggggggggggggggggggggggggggggggggggggggggq...............R",
      "R.CTC..HHZHkkkuuqggggggggggggggggggggggggggggggggggggggggq...............R",
      "R.CTC..HYHHkkk..qggggggggggggggggggggggggggggggggggggggggq...............R",
      "R.CCC..YHHYkkk..qggggggggggggggggggggggggggggggggggggggggq...............R",
      "RV..............qggggggggggggggggggggggggggggggggggggggggq...............R",
      "R...............qggggggggggggggggggggggggggggggggggggggggq...............R",
      "R...............qggggggggggggggggggggggggggggggggggggggggq...............R",
      "R...............qggggggggggggggggggggggggggggggggggggggggq..........R....R",
      "R...............qggggggggggggggggggggggggggggggggggggggggyyyHYHHYH..R....R",
      "R...............qggggggggggggggggggggggggggggggggggggggggyyyYHHYHH..R....R",
      "R...............qggggggggggggggggggggggggggggggggggggggggyyyHHYHHY..R....R",
      "R...............qggggggggggggggggggggggggggggggggggggggggquuHYHHZH..R....R",
      "R...............qggggggggggggggggggggggggggggggggggggggggquuYHHYHH..R....R",
      "R...............qggggggggggggggggggggggggggggggggggggggggquuHHYHHY..R....R",
      "X...............qggggggggggggggggqSSqqSSqggggggggggggggggq..HYHHYH..R....R",
      "X...............qggggggggggggggggqSSqqSSqggggggggggggggggq..YHHYHH..R....R",
      "#ww#ww#ww#.#####qqqqqqqqqqqqqqqqqqSSqqSSqqqqqqqqqqqqqqqqqq..HHYHHY..R....R",
      "##########X######################qSSqqSSq#################XXHYHHYHXXR....R",
    ],
    exits: {
      // the 1-tile entry path from zone 1 (zone 1's up-path at x 1) - it now runs at x 10, right beside the lawn's west border (x 11)
      '10,51': { to: 'zone1', spawn: { x: 1, y: 1 }, facing: 'down', label: 'Entry path' },
      // the 2-wide opening in the south wall at the foot of the east path (right of the lawn): back to zone 1's right-hand path beside the storage room
      '58,51': { to: 'zone1', spawn: { x: 22, y: 1 }, facing: 'down', label: 'Right path' },
      '59,51': { to: 'zone1', spawn: { x: 23, y: 1 }, facing: 'down', label: 'Right path' },
      // the 2-wide opening at the foot of the 2-tile path right of the east hedge bed: back to zone 1's far-right path (x31-32)
      '66,51': { to: 'zone1', spawn: { x: 31, y: 1 }, facing: 'down', label: 'Far right path' },
      '67,51': { to: 'zone1', spawn: { x: 32, y: 1 }, facing: 'down', label: 'Far right path' },
      // west path (zone 4 was removed - the rooftop is L-shaped). The upper west path (old exit at (0,5)) was removed: that tile is now plain rail. The lower one leads to zone 2's north corridor
      // the 2-wide railed path from zone 2's north corridor, in the bottom-left corner of the west edge (zone 2 rows 1-2 <-> rows 26-27 here)
      '0,48': { to: 'zone2', spawn: { x: 29, y: 1 }, facing: 'left', label: 'West path (lower)' },
      '0,49': { to: 'zone2', spawn: { x: 29, y: 2 }, facing: 'left', label: 'West path (lower)' },
    },
    // capsule-shaped holes you can look down through, ringed by a balustrade (hole.js). Tile units: x, y, w, h of the OUTER edge.
    // This one is 4 wide x 8 tall (x11-14, rows 18-25), 2 tiles of path in front of it (rows 26-27) and 1 tile between it and the lawn's west border (x15, border at x16).
    // r = corner radius in tiles (leave it out for the full capsule, r: 2 here).
    stairwells: [{ x: 6, y: 11, w: 8, h: 12, r: 1, sw: 8, len: 8 }],   // the big stairs down (stairwell.js): 2 tiles wide, open on the east (lawn) side, fading into black - the lower floor comes later
    holes: [{ x: 11, y: 40, w: 4, h: 8, r: 1 }, { x: 59, y: 33, w: 4, h: 8, r: 1 }, { x: 59, y: 15, w: 4, h: 8, r: 1 }],   // 3rd hole: inside the 2nd (north) east bay, x59-62 rows 15-22   // 2nd hole = a copy of the first on the EAST side, above the east lawn steps: x59-62, rows 33-40 = 1 tile from the lawn border (x57; free column x58) and 1 tile above the landing / hedge bed (free row 41)
    //   // the north hole was removed (the space is kept for the big stairs down)
    // curved rails (curverail.js): the west rail steps in 8 tiles beside the hole (straight at x8, rows 19-24, 2 tiles of floor between it and the hole) like the hole's own balustrade: straight runs with rounded
    // corners (r: 1 tile) only at the turns - across on rows 17 and 25, where the old walls were. The lower return runs straight into the rail of the path to zone 2.
    // The skyline stays one straight picture to the left of it. The x0 tiles of rows 17-25 are 'R' (solid) but are not drawn: the curve is.
    roundedCorners: [{ corner: 'nw', r: 1 }, { corner: 'ne', r: 1 }],   // the north-west and north-east corners of the rail are quarter circles (curverail.js cornerPath; the east one is the west one mirrored)
    curvedRails: [{ y0: 39, y1: 48, depth: 8, r: 1 }, { y0: 10, y1: 24, depth: 4, r: 1, closed: true },   // the 2nd (north) bay is CLOSED, only 4 tiles deep and 14 rows tall (rows 10-23, ONE free row 9 below the bench ring): it has no path at its end, so its rail curves back into the west edge
      // the EAST bay (side: 'e' = the mirror image of a west one), round the east hole (x59-62, rows 33-40). The zone's east edge is now x74 (5 columns were added above row 32: the upper right is 5 tiles wider),
      // so from row 32 down the rail leaves the NEW edge, turns left (west) across row 33, runs north-south with exactly ONE tile of floor between the hole's kerb (x63) and the rail's inner face (x64),
      // turns right (east) again on row 40 and then runs straight SOUTH along the OLD edge line (x69: `tail: 5` = 5 tiles in from the new edge) - the lower part of the zone (hedge, path, rows 41-51) is unchanged.
      // Everything between the rail and the new edge, from row 32 down, is outside (skyline). ret = the row of the bend into the tail; y1 = how far the rail runs on past the south edge (52 rows + 5 tiles, as far as the camera can slide).
      { y0: 32, ret: 41, y1: 57, depth: 9.25, r: 1, closed: true, side: 'e', tail: 5 },
      // the 2nd EAST bay (north): an EVEN U - it leaves the east edge at row 14, steps in (same depth as the lower one), runs straight and returns to the edge at row 23 (no tail). Same size as the lower bay (9 rows, hole 4x8). Row 23 stays free between its bottom rail and the bench ring (rows 24-30)
      { y0: 14, y1: 23, depth: 9.25, r: 1, closed: true, side: 'e' }],
    // white fences (map.js fences, drawn by renderer.js drawFence, solid): chains of points in tile units (x, y of the FOOT of the fence). This one closes the north side of the
    // landing at the top of the lawn steps (x14-16, row 8, to the lawn rail's end post at x16.5). The west side has no fence: the hedge bed (lifted to the landing's level on a semi-wall) is flush with it.
    fences: [
      { points: [[14.0625, 30], [14.0625, 33]] },                              // the landing's west side: keeps people out of the hedge bed (between the two storage rooms)
      { points: [[7.0625, 37.6875], [7.0625, 25], [10.9375, 25]] },   // the hedge bed now runs from the new storage room (rows 25-29) to the old one (rows 33-37): fence on its west side and across the new north end (x7-10)
      // the north hedge beds (x6-8 and x11-15, rows 1-7, split by the 2-tile path x9-10): the white fence runs all round each bed, in front of it too (on the floor, row 8's top edge)
      { points: [[6.0625, 1], [6.0625, 8], [8.9375, 8], [8.9375, 1]] },       // west bed: west side, front, east side (facing the path)
      { points: [[16.5, 8], [11.0625, 8], [11.0625, 1]] },                    // east bed: the lawn's west rail turns LEFT here (it starts at (16.5, 8)) and runs along the front of the bed, then up its west side (facing the path)
      { points: [[15.9375, 1], [15.9375, 3.5625], [16.5, 3.5625]] },          // east bed: its east side above the lawn, joined to the start of the lawn's north rail (16.5, 3.5625); along rows 3-7 the bed meets the lawn's wall and has no fence (the lawn's rail is left out there, renderer.js hedgeSide)
      // EAST lawn steps (a mirror image of the west ones): the white fence runs round the east hedge bed (x60-65, rows 42-49 = from the landing down to the south wall, 2 tiles of path x66-67 stay free beside it): along its west side (the landing's and the flights' hedge side), across the north end and down its east side
      { points: [[59.9375, 49.6875], [59.9375, 42], [65.9375, 42], [65.9375, 49.6875]] },
      { points: [[57.5, 42], [59.9375, 42]] },                                  // the landing's north side: joins the lawn's east rail (its end post at x57.5, row 42) to the hedge bed's fence, so nobody walks off the platform
      { points: [[57.5, 25], [59.9375, 25]] },                                  // the NEW landing's north side (x57-59, row 25, above the east hole): joins the lawn's east rail to the storage room, so nobody walks onto the platform from the path
    ],
  },
};

// ---- Zone 3 <-> zone 1 links -------------------------------------------------------------
// The 1-tile entry path ((10,29) in zone 3 <-> zone 1's up-path at (1,0)) is listed in the two zone blocks.
// Stairs: zone 3 has two railed flights (x 34-35 and x 38-39, rows 26-29) that match zone 1's two flights (x 9-10 and x 13-14, rows 0-4), lane for lane.
const FLIGHTS = [[9, 34], [10, 35], [13, 38], [14, 39]];       // [x in zone 1, x in zone 3]
for (const [x1, x3] of FLIGHTS) {
  ZONES.zone3.exits[x3 + ',51'] = { to: 'zone1', spawn: { x: x1, y: 1 }, facing: 'down', label: 'Stairs' };
  ZONES.zone1.exits[x1 + ',0']  = { to: 'zone3', spawn: { x: x3, y: 47 }, facing: 'up', label: 'Stairs' };
}
// The big stairs down (stairwell.js): the lower floor is not built yet. Standing at the dark end of the steps shows the 'coming soon' hint.
for (let y = 13; y <= 20; y++) for (const x of [9, 10]) ZONES.zone3.exits[x + ',' + y] = { label: 'Stairs down' };