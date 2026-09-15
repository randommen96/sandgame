// Client-side simulation safeguards (Track 4): array-bounds enforcement,
// fixed-size memory under sustained load, and game-loop pacing guarantees
// (no spiral of death, NaN/Infinity-safe). Runs under `node --test`.
import test from 'node:test';
import assert from 'node:assert/strict';

import { Grid } from '../src/grid.js';
import { Engine } from '../src/engine.js';
import { mulberry32 } from '../src/rng.js';
import { E } from '../src/elements.js';
import { advanceAccumulator, TICK_MS, MAX_STEPS_PER_FRAME } from '../src/pacing.js';

// --- Grid bounds enforcement (browser-crash prevention) -------------------

test('Grid.get throws RangeError on out-of-bounds coordinates', () => {
  const g = new Grid(4, 3);
  for (const [x, y] of [[-1, 0], [4, 0], [0, -1], [0, 3], [-2, -2]]) {
    assert.throws(() => g.get(x, y), RangeError);
  }
});

test('Grid.set throws RangeError on out-of-bounds coordinates', () => {
  const g = new Grid(4, 3);
  for (const [x, y] of [[-1, 0], [4, 0], [0, 3]]) {
    assert.throws(() => g.set(x, y, E.SAND), RangeError);
  }
});

test('Grid.swap throws RangeError on out-of-bounds indices', () => {
  const g = new Grid(4, 3); // 12 cells: valid raw indices are 0..11
  for (const [i, j] of [[-1, 0], [12, 0], [0, 99], [3.5, 0]]) {
    assert.throws(() => g.swap(i, j), RangeError);
  }
});

test('Grid.swap works within bounds and swaps all per-cell state', () => {
  const g = new Grid(2, 1);
  g.set(0, 0, E.SAND, 7, 42);
  g.set(1, 0, E.WATER, 3, 9);
  g.swap(0, 1);
  assert.equal(g.get(0, 0), E.WATER);
  assert.equal(g.life[g.idx(0, 0)], 3);
  assert.equal(g.variation[g.idx(0, 0)], 9);
  assert.equal(g.get(1, 0), E.SAND);
});

// --- Engine: bounded steps + fixed-size memory under sustained load --------

test('engine runs thousands of chaotic steps without growing memory', () => {
  const g = new Grid(50, 40);
  const eng = new Engine(g, mulberry32(1234));
  // Fill the world with a chaotic mix of every dynamic element.
  const mix = [E.SAND, E.WATER, E.FIRE, E.LAVA, E.SMOKE, E.STEAM];
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      g.set(x, y, mix[(x * 7 + y * 13) % mix.length], 90, x & 0xff);
    }
  }
  const before = { cells: g.cells.length, life: g.life.length };

  for (let n = 0; n < 2000; n++) eng.step();

  assert.equal(eng.frame, 2000);
  // Typed arrays are fixed-size: no reallocation or growth ever happens.
  assert.equal(g.cells.length, before.cells);
  assert.equal(g.life.length, before.life);
  // Particle count can never exceed the number of cells (one per cell).
  let total = 0;
  for (const id of [E.SAND, E.WATER, E.FIRE, E.LAVA, E.SMOKE, E.STEAM, E.CINDER, E.STONE]) {
    total += g.count(id);
  }
  assert.ok(total <= g.w * g.h);
});

// --- Loop pacing: no spiral of death, NaN/Infinity-safe --------------------

test('advanceAccumulator: normal frame takes exactly one step', () => {
  const r = advanceAccumulator(0, 16.67);
  assert.equal(r.steps, 1);
  assert.ok(r.accumulator >= 0 && r.accumulator < TICK_MS);
});

test('advanceAccumulator: huge dt (hidden tab) is clamped and capped', () => {
  const r = advanceAccumulator(0, 60_000); // e.g. tab hidden for a minute
  assert.equal(r.steps, MAX_STEPS_PER_FRAME);
  assert.equal(r.accumulator, 0); // backlog dropped — no debt carried over
});

test('advanceAccumulator: step count never exceeds the per-frame cap', () => {
  let acc = 0;
  for (let n = 0; n < 10_000; n++) {
    const r = advanceAccumulator(acc, Math.random() * 10_000);
    assert.ok(r.steps >= 0 && r.steps <= MAX_STEPS_PER_FRAME);
    assert.ok(r.accumulator === 0 || (Number.isFinite(r.accumulator) && r.accumulator >= 0 && r.accumulator < TICK_MS));
    acc = r.accumulator;
  }
});

test('advanceAccumulator: NaN/Infinity dt is treated as one tick, no crash', () => {
  for (const bad of [NaN, Infinity, -Infinity]) {
    const r = advanceAccumulator(0, bad);
    assert.equal(r.steps, 1);
    assert.ok(Number.isFinite(r.accumulator));
  }
});

test('advanceAccumulator: sustained 60 Hz frames lose no ticks', () => {
  let acc = 0;
  let total = 0;
  for (let n = 0; n < 120; n++) { // ~2 seconds of 16.67 ms frames
    const r = advanceAccumulator(acc, 16.67);
    acc = r.accumulator;
    total += r.steps;
  }
  assert.equal(total, 120); // exactly one tick per frame at nominal rate
});
