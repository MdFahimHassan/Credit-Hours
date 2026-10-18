// display.js - sizes the canvas on screen.
// The game is always drawn at 640 x 480 and scaled up by CSS. The old CSS (width:min(100vw, 133vh)) gave a fractional scale on most screens, and with
// image-rendering:pixelated that makes some game pixels 2 screen pixels wide and others 3: wobbling edges and shimmer while the map scrolls (worst on phones,
// whose screens have 2-3 device pixels per CSS pixel). Here the size is chosen so that one game pixel is a WHOLE number of device pixels whenever that
// costs less than 15% of the screen; otherwise the canvas is simply as big as it can be.
const canvas = document.getElementById('game');
const GW = canvas.width, GH = canvas.height;

function fit() {
  const vv = window.visualViewport;
  const availW = vv ? vv.width : window.innerWidth, availH = vv ? vv.height : window.innerHeight;
  const dpr = window.devicePixelRatio || 1;
  let s = Math.min(availW / GW, availH / GH);               // CSS px per game px that fills the screen
  const dev = s * dpr;                                      // device px per game px
  if (dev >= 1) {
    const whole = Math.floor(dev);
    if (whole / dev >= 0.85) s = whole / dpr;               // a whole number of device pixels: perfectly even pixels
    canvas.style.imageRendering = 'pixelated';
  } else {
    canvas.style.imageRendering = 'auto';                   // shrinking (small screens): smooth it, nearest-neighbour would drop pixel rows and flicker
  }
  canvas.style.width = GW * s + 'px'; canvas.style.height = GH * s + 'px';
}
fit();
window.addEventListener('resize', fit);
window.addEventListener('orientationchange', () => setTimeout(fit, 150));   // (iOS reports the new size a moment late)
if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);

// The game coordinates (0..640 / 0..480) of a touch / click on the page, or null if it is outside the canvas.
export function toGame(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  const x = (clientX - r.left) * GW / r.width, y = (clientY - r.top) * GH / r.height;
  return x >= 0 && y >= 0 && x < GW && y < GH ? { x, y } : null;
}