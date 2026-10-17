// glassdoor.js - the glass room door of zone 1's west wall (renderer.js drawGlassDoor) painted as a flat 64x32 front view onto any canvas context.
// x runs along the door (0-64), y from the wall (0) out to the floor (32). Used by skyline.js for the doors beside the open paths.
export function paintDoorFront(g, ch) {
  const panes = ch === 'e' ? [[5, 27], [29, 27]] : [[5, 17], [24, 17], [43, 16]];   // [x, width] of each pane
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  R(0, 0, 64, 32, '#d9d7d0'); R(0, 0, 64, 3, '#eceae4');           // pale plaster wall + lit lintel edge
  R(0, 26, 64, 6, '#c2c0b8');                                      // wall base
  R(2, 4, 60, 24, '#4d5156');                                      // opening: dark inner reveal
  R(3, 5, 58, 22, '#8a9096');                                      // thin aluminium frame
  for (const [x, w] of panes) {
    R(x, 6, w, 20, '#dcebee');
    R(x, 6, w, 7, '#eef7f8'); R(x, 19, w, 7, '#b9ced3');
    R(x + 2, 8, 2, 16, 'rgba(255,255,255,0.55)');
    R(x + w - 3, 9, 1, 14, 'rgba(120,150,160,0.35)');
  }
  for (let i = 1; i < panes.length; i++) R(panes[i][0] - 2, 5, 2, 22, '#6f757b');   // stiles between panes
  if (ch === 'e') { R(30, 13, 1, 7, '#1b1b22'); R(33, 13, 1, 7, '#1b1b22'); }
  else { R(20, 14, 1, 6, '#1b1b22'); R(23, 14, 1, 6, '#1b1b22'); }
  R(2, 27, 60, 2, '#3a3d42');                                      // threshold
}