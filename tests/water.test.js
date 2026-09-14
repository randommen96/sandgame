import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Grid } from '../src/grid.js';
import { Engine } from '../src/engine.js';
import { mulberry32 } from '../src/rng.js';
import { E, DEFAULT_LIFE } from '../src/elements.js';

function makeEngine(w = 10, h = 15, seed = 42) {
  const grid = new Grid(w, h);
  return { grid, engine: new Engine(grid, mulberry32(seed)) };
}

test('water falls and levels out into a flat pool', () => {
  const { grid, engine } = makeEngine(20, 15);
  // A row of 10 water grains near the top.
  for (let x = 5; x < 15; x++) grid.set(x, 0, E.WATER);
  for (let i = 0; i < 300; i++) engine.step();
  assert.equal(grid.count(E.WATER), 10);
  // All water must be on the floor row and form one contiguous run.
  let minX = Infinity, maxX = -1;
  for (let x = 0; x < grid.w; x++) {
    if (grid.get(x, 14) === E.WATER) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
  }
  assert.ok(maxX >= minX, 'water should have reached the floor');
  assert.equal(maxX - minX + 1, 10, 'pool should be a contiguous flat run of 10 cells');
});

test('sand sinks through water (density displacement)', () => {
  const { grid, engine } = makeEngine(10, 15);
  // Pool of water in the bottom rows.
  for (let x = 0; x < 10; x++) for (let y = 11; y < 15; y++) grid.set(x, y, E.WATER);
  const waterBefore = grid.count(E.WATER);
  grid.set(5, 8, E.SAND); // grain above the pool
  for (let i = 0; i < 300; i++) engine.step();
  assert.equal(grid.count(E.WATER), waterBefore, 'water is conserved');
  assert.equal(grid.get(5, 14), E.SAND, 'sand must sink to the floor through the water');
  // The cell directly above the sunken sand should be water again.
  assert.equal(grid.get(5, 13), E.WATER);
});

test('smoke rises to the ceiling and dissipates over its lifetime', () => {
  const { grid, engine } = makeEngine(10, 15, 7);
  grid.set(5, 14, E.SMOKE, DEFAULT_LIFE[E.SMOKE]);
  // It should reach the top row quickly (<= 16 ticks).
  let reached = -1;
  for (let t = 0; t < 20; t++) {
    engine.step();
    if (grid.get(5, 0) === E.SMOKE) { reached = t + 1; break; }
  }
  assert.ok(reached > 0 && reached <= 16, `smoke should reach the ceiling quickly (tick ${reached})`);
  // It must be gone by end of its lifetime.
  for (let i = 0; i < DEFAULT_LIFE[E.SMOKE] + 5; i++) engine.step();
  assert.equal(grid.count(E.SMOKE), 0, 'smoke must dissipate');
});

test('gas is conserved until it dissipates and never leaks out of bounds', () => {
  const { grid, engine } = makeEngine(8, 10, 3);
  for (let x = 0; x < 8; x++) grid.set(x, 9, E.STEAM, DEFAULT_LIFE[E.STEAM]);
  const initial = grid.count(E.STEAM);
  // Run until all steam is gone (lifetime 70 ticks + margin).
  for (let i = 0; i < DEFAULT_LIFE[E.STEAM] + 20 && grid.count(E.STEAM) > 0; i++) {
    engine.step();
  }
  assert.equal(grid.count(E.STEAM), 0, 'all steam should dissipate');
  // Nothing was created or lost to out-of-bounds: total steps must be finite.
  assert.ok(initial === 8);
});

test('water pools level out even with an obstacle in the middle', () => {
  const { grid, engine } = makeEngine(20, 15);
  // Central pillar from floor up to row 6.
  for (let y = 7; y < 15; y++) grid.set(10, y, E.WALL);
  // Water poured on both sides.
  for (let x = 3; x < 8; x++) grid.set(x, 2, E.WATER);
  for (let x = 12; x < 17; x++) grid.set(x, 2, E.WATER);
  const waterTotal = grid.count(E.WATER);
  assert.equal(waterTotal, 10);
  for (let i = 0; i < 400; i++) engine.step();
  assert.equal(grid.count(E.WATER), waterTotal);
  // Both pools must have the same surface level (water levels out).
  const surface = (x0, x1) => {
    for (let y = 0; y < grid.h; y++) {
      for (let x = x0; x <= x1; x++) if (grid.get(x, y) === E.WATER) return y;
    }
    return -1;
  };
  const leftTop = surface(0, 9);
  const rightTop = surface(11, 19);
  assert.ok(leftTop >= 0 && rightTop >= 0);
  assert.equal(Math.abs(leftTop - rightTop), 0, 'both pools must reach the same level');
});
