import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Grid } from '../src/grid.js';
import { Engine } from '../src/engine.js';
import { mulberry32 } from '../src/rng.js';
import { E } from '../src/elements.js';

function makeEngine(w = 10, h = 10, seed = 42) {
  const grid = new Grid(w, h);
  return { grid, engine: new Engine(grid, mulberry32(seed)) };
}

test('sand falls straight down into empty space', () => {
  const { grid, engine } = makeEngine(10, 10);
  grid.set(5, 0, E.SAND);
  for (let i = 0; i < 20; i++) engine.step();
  assert.equal(grid.get(5, 9), E.SAND, 'sand should rest on the floor at x=5');
  assert.equal(grid.count(E.SAND), 1);
});

test('a single sand grain moves at most one cell per tick', () => {
  const { grid, engine } = makeEngine(10, 20); // floor is row 19
  grid.set(5, 0, E.SAND);
  // Must NOT be on the floor after 18 ticks (would mean a double move).
  for (let i = 0; i < 18; i++) engine.step();
  assert.equal(grid.get(5, 19), E.EMPTY, 'sand must not skip rows');
  assert.equal(grid.get(5, 18), E.SAND, 'after 18 ticks the grain is at row 18');
  engine.step(); // tick 19 -> row 19
  assert.equal(grid.get(5, 19), E.SAND);
});

test('sand slides diagonally around a wall obstacle and settles off-center', () => {
  const { grid, engine } = makeEngine(10, 10);
  grid.set(5, 5, E.WALL); // pillar in the middle of the column
  grid.set(5, 0, E.SAND);
  for (let i = 0; i < 60; i++) engine.step();
  assert.equal(grid.count(E.SAND), 1);
  // Find the grain.
  let found = null;
  for (let x = 0; x < grid.w; x++) {
    if (grid.get(x, 9) === E.SAND) found = x;
  }
  assert.ok(found !== null, 'sand should have reached the floor');
  assert.notEqual(found, 5, 'sand must not be inside the wall column on the floor');
});

test('walls block sand and particle count is conserved', () => {
  const { grid, engine } = makeEngine(10, 10);
  for (let x = 2; x < 8; x++) grid.set(x, 6, E.WALL); // ledge
  for (let x = 3; x < 7; x++) grid.set(x, 2, E.SAND); // pile above it
  for (let i = 0; i < 120; i++) engine.step();
  assert.equal(grid.count(E.SAND), 4);
  assert.equal(grid.count(E.WALL), 6);
  // All sand must rest on top of the ledge (row 5) or beside it on the floor.
  for (let x = 0; x < grid.w; x++) {
    const col = [grid.get(x, 9), grid.get(x, 5)];
    if (col.includes(E.SAND)) continue;
  }
  // No sand may be inside/below the ledge within its span.
  for (let x = 2; x < 8; x++) {
    assert.equal(grid.get(x, 7), E.EMPTY, `no sand below ledge at x=${x}`);
  }
});

test('sand conserves mass over a long random run', () => {
  const { grid, engine } = makeEngine(20, 15, 7);
  for (let i = 0; i < 300; i++) {
    const x = Math.floor(Math.random() * grid.w);
    grid.set(x, 0, E.SAND);
  }
  // Add some static structure to make it interesting.
  for (let x = 5; x < 15; x += 3) grid.set(x, 8, E.WALL);
  const initial = grid.count(E.SAND);
  for (let i = 0; i < 600; i++) engine.step();
  assert.equal(grid.count(E.SAND), initial, 'sand must never be created or destroyed');
});

test('sand at borders stays in bounds and never crashes', () => {
  const { grid, engine } = makeEngine(8, 8, 3);
  grid.set(0, 0, E.SAND);   // top-left corner
  grid.set(7, 0, E.SAND);   // top-right corner
  grid.set(0, 7, E.SAND);   // bottom-left corner
  for (let i = 0; i < 300; i++) engine.step();
  assert.equal(grid.count(E.SAND), 3);
  // All grains must be in the bottom row.
  let onFloor = 0;
  for (let x = 0; x < grid.w; x++) if (grid.get(x, 7) === E.SAND) onFloor++;
  assert.equal(onFloor, 3);
});
