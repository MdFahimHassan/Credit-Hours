// audio.js - all the game's sound: the looping menu music and the UI click.
//
// Public API:
//   audio.init()                  once at start-up: starts downloading the sounds and waits for the first tap / key press (browsers refuse to play
//                                 any sound before the player has done something, so music requested earlier simply starts at that first moment)
//   audio.playMusic()             fade the menu music in (safe to call any time, any number of times)
//   audio.stopMusic(seconds)      fade it out and stop it
//   audio.click()                 the UI click (slightly different pitch each time so it never sounds robotic)
//   audio.hover()                 a soft tick when the highlighted menu item changes (made in code, no file)
//   audio.glitch('short'|'long', delay)   a quiet digital glitch to go with the menu's glitch pictures; `delay` in seconds so it can line up with the picture
//
// Volume: Settings > Volume is the master volume. It is applied live. Music has its own level below (MUSIC_LEVEL) so it sits under sound effects.
// Everything here fails quietly: if a file is missing or the browser has no Web Audio, the game just stays silent.
import { settings, onSettingChange } from './settings.js';

const MUSIC_LEVEL = 0.7, SFX_LEVEL = 0.8, FADE_IN = 1.6;
// The loop is a pre-made 24-bar section with its end crossfaded into its start (see assets/audio). Ogg Vorbis plays gaplessly in browsers; MP3 is the fallback
// for the few that cannot decode Ogg (it may have a tiny gap at the loop point).
const canOgg = (() => { try { return !!new Audio().canPlayType('audio/ogg; codecs="vorbis"'); } catch { return false; } })();
const MUSIC_URL = 'assets/audio/menu-loop.' + (canOgg ? 'ogg' : 'mp3');
const CLICK_URL = 'assets/audio/click.mp3';
const GLITCH_URLS = { short: 'assets/audio/glitch-short.mp3', long: 'assets/audio/glitch-long.mp3' };
const GLITCH_LEVEL = 0.4;                      // the glitch is meant to be felt more than heard

let ctx = null, master = null, musicBus = null, sfxBus = null;
let musicBuf = null, clickBuf = null;
const glitchBuf = {};
let lastHover = 0;
let wantMusic = false, music = null;           // music = { src, gain } while playing
let pendingClick = false;                      // a click asked for before the first tap: played the moment sound unlocks
let started = false;

function ensureCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = settings.volume; master.connect(ctx.destination);
  musicBus = ctx.createGain(); musicBus.gain.value = MUSIC_LEVEL; musicBus.connect(master);
  sfxBus = ctx.createGain(); sfxBus.gain.value = SFX_LEVEL; sfxBus.connect(master);
  return ctx;
}

async function fetchBuffer(url) {
  const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status);
  return ctx.decodeAudioData(await r.arrayBuffer());
}
function loadAll() {
  if (!ensureCtx()) return;
  if (!musicBuf) fetchBuffer(MUSIC_URL).then((b) => { musicBuf = b; syncMusic(); }).catch((e) => console.warn('menu music not loaded', e));
  if (!clickBuf) fetchBuffer(CLICK_URL).then((b) => { clickBuf = b; }).catch((e) => console.warn('click sound not loaded', e));
  for (const k in GLITCH_URLS) if (!glitchBuf[k]) fetchBuffer(GLITCH_URLS[k]).then((b) => { glitchBuf[k] = b; }).catch((e) => console.warn('glitch sound not loaded', e));
}

// Start or stop the music so that it matches `wantMusic` (called whenever the wish, the unlock or the download changes).
function syncMusic() {
  if (!ctx || ctx.state !== 'running') return;
  if (wantMusic && !music && musicBuf) {
    const src = ctx.createBufferSource(); src.buffer = musicBuf; src.loop = true;
    const gain = ctx.createGain(); gain.gain.value = 0;
    src.connect(gain); gain.connect(musicBus); src.start();
    gain.gain.setTargetAtTime(1, ctx.currentTime, FADE_IN / 4);
    music = { src, gain };
  }
}

function unlock() {
  if (!ensureCtx()) return;
  const done = () => {
    if (ctx.state !== 'running') return;
    removeEventListener('pointerup', unlock, true); removeEventListener('keydown', unlock, true); removeEventListener('touchend', unlock, true);
    loadAll(); syncMusic();
    if (pendingClick) { pendingClick = false; audio.click(); }
  };
  if (ctx.state === 'running') done(); else ctx.resume().then(done).catch(() => {});
}

export const audio = {
  init() {
    if (started) return; started = true;
    onSettingChange((k, v) => { if (k === 'volume' && master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.03); });
    // pointerup / keydown / touchend are the events browsers count as "the player did something"
    addEventListener('pointerup', unlock, true); addEventListener('keydown', unlock, true); addEventListener('touchend', unlock, true);
    // sound off while the tab is hidden (saves battery on phones, and nobody wants menu music from a background tab)
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.hidden) ctx.suspend().catch(() => {}); else if (started) ctx.resume().catch(() => {});
    });
    loadAll();       // the context is created now but stays "suspended" until the first tap; downloading already works, so the music is ready by then
  },

  playMusic() { wantMusic = true; syncMusic(); },

  stopMusic(seconds = 0.6) {
    wantMusic = false;
    if (!music || !ctx) return;
    const { src, gain } = music; music = null;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + seconds);
    src.stop(ctx.currentTime + seconds + 0.05);
  },

  click() {
    if (!ctx || ctx.state !== 'running') { pendingClick = true; return; }
    if (!clickBuf) return;
    const src = ctx.createBufferSource(); src.buffer = clickBuf; src.playbackRate.value = 0.96 + Math.random() * 0.08;
    src.connect(sfxBus); src.start();
  },

  // A very short, soft square-wave blip that drops in pitch: the classic menu "tick". Skipped (not queued) if sound is not unlocked yet.
  hover() {
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    if (t - lastHover < 0.035) return;           // never machine-gun when the pointer sweeps over several items
    lastHover = t;
    const osc = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    osc.type = 'square'; osc.frequency.setValueAtTime(1500, t); osc.frequency.exponentialRampToValueAtTime(900, t + 0.04);
    lp.type = 'lowpass'; lp.frequency.value = 3200;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.07, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(lp); lp.connect(g); g.connect(sfxBus); osc.start(t); osc.stop(t + 0.06);
  },

  glitch(kind = 'short', delay = 0) {
    if (!ctx || ctx.state !== 'running') return;
    const buf = glitchBuf[kind]; if (!buf) return;
    const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = 0.94 + Math.random() * 0.12;
    const g = ctx.createGain(); g.gain.value = GLITCH_LEVEL;
    src.connect(g); g.connect(sfxBus); src.start(ctx.currentTime + delay);
  },
};