import { Grid } from './grid.js';
import { Engine } from './engine.js';
import { mulberry32 } from './rng.js';
import { Renderer } from './renderer.js';

// Fixed simulation resolution; CSS scales it up crisply (image-rendering: pixelated).
export const SIM_W = 200;
export const SIM_H = 150;
const TICK_MS = 1000 / 60; // fixed 60 Hz timestep
const MAX_STEPS_PER_FRAME = 5; // avoid spiral of death on slow frames

const canvas = document.getElementById('sim');
const fpsEl = document.getElementById('fps');

const grid = new Grid(SIM_W, SIM_H);
const engine = new Engine(grid, mulberry32((Date.now() & 0x7fffffff) | 1));
const renderer = new Renderer(canvas, grid);

let running = true;
let accumulator = 0;
let lastTime = performance.now();

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
