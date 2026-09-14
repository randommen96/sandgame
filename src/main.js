import { Grid } from './grid.js';
import { Engine } from './engine.js';
import { mulberry32 } from './rng.js';
import { Renderer } from './renderer.js';
import { buildToolbar } from './ui.js';
import { E, DEFAULT_LIFE } from './elements.js';

// Fixed simulation resolution; CSS scales it up crisply (image-rendering: pixelated).
export const SIM_W = 200;
export const SIM_H = 150;
const TICK_MS = 1000 / 60; // fixed 60 Hz timestep
const MAX_STEPS_PER_FRAME = 5; // avoid spiral of death on slow frames

const canvas = document.getElementById('sim');
const fpsEl = document.getElementById('fps');
const toolbarEl = document.getElementById('toolbar');

const grid = new Grid(SIM_W, SIM_H);
const engine = new Engine(grid, mulberry32((Date.now() & 0x7fffffff) | 1));
const renderer = new Renderer(canvas, grid);

// UI state (brush size is added in the polish task).
const state = { element: E.SAND, brushRadius: 1 };
buildToolbar(toolbarEl, state);

let running = true;
let accumulator = 0;
let lastTime = performance.now();

// --- Painting -------------------------------------------------------------

let painting = false;
let lastPt = null;

function toGrid(e) {
  const r = canvas.getBoundingClientRect();
  const x = Math.floor(((e.clientX - r.left) / r.width) * SIM_W);
  const y = Math.floor(((e.clientY - r.top) / r.height) * SIM_H);
  return {
    x: Math.max(0, Math.min(SIM_W - 1, x)),
    y: Math.max(0, Math.min(SIM_H - 1, y)),
  };
}

function stampBrush(cx, cy) {
  const r = state.brushRadius;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (!grid.inBounds(x, y)) continue;
      const cur = grid.get(x, y);
      if (state.element === E.EMPTY) {
        if (cur !== E.EMPTY) grid.set(x, y, E.EMPTY);
      } else if (cur === E.EMPTY) {
        const life = DEFAULT_LIFE[state.element] ?? 0;
        grid.set(x, y, state.element, life, Math.floor(Math.random() * 256));
      }
    }
  }
}

// Bresenham line so fast drags don't leave gaps.
function stampLine(a, b) {
  let x0 = a.x, y0 = a.y;
  const x1 = b.x, y1 = b.y;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    stampBrush(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  painting = true;
  canvas.setPointerCapture(e.pointerId);
  lastPt = toGrid(e);
  stampLine(lastPt, lastPt);
});
canvas.addEventListener('pointermove', (e) => {
  const p = toGrid(e);
  if (painting && lastPt) {
    stampLine(lastPt, p);
    lastPt = p;
  }
});
for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  canvas.addEventListener(t, () => { painting = false; lastPt = null; });
}

// --- Main loop -------------------------------------------------------------

// FPS meter: count rendered frames, refresh the readout twice a second.
let fpsFrames = 0;
let fpsLast = performance.now();

function loop(now) {
  requestAnimationFrame(loop);

  let dt = now - lastTime;
  lastTime = now;
  if (dt > 250) dt = 250; // tab was hidden — don't fast-forward the world

  if (running) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= TICK_MS && steps < MAX_STEPS_PER_FRAME) {
      engine.step();
      accumulator -= TICK_MS;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) accumulator = 0; // drop backlog
  }

  // Keep pouring while the pointer is held (works even while paused).
  if (painting && lastPt) stampBrush(lastPt.x, lastPt.y);

  renderer.render(engine.frame);

  fpsFrames++;
  const elapsed = now - fpsLast;
  if (elapsed >= 500) {
    fpsEl.textContent = `${Math.round((fpsFrames * 1000) / elapsed)} FPS`;
    fpsFrames = 0;
    fpsLast = now;
  }
}

requestAnimationFrame(loop);

// Debug/test handle (used by the headless-browser tests).
window.__sand = { grid, engine, state };
