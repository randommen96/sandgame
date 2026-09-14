import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Grid } from '../src/grid.js';
import { Engine } from '../src/engine.js';
import { mulberry32 } from '../src/rng.js';
import { E, ELEMENTS } from '../src/elements.js';

function makeEngine(w = 20, h = 15, seed = 42) {
  const grid = new Grid(w, h);
  return { grid, engine: new Engine(grid, mulberry32(seed)) };
}

test('stepping an empty grid is stable and advances the frame counter', () => {
  const { grid, engine } = makeEngine();
  for (let i = 0; i < 120; i++) engine.step();
  assert.equal(engine.frame, 120);
  assert.equal(grid.count(E.EMPTY), grid.w * grid.h);
});

test('static elements (walls) never move', () => {
  const { grid, engine } = makeEngine(8, 8);
  for (let x = 0; x < 8; x++) grid.set(x, 4, E.WALL);
  for (let y = 0; y < 4; y++) grid.set(3, y, E.WOOD);
  engine.step();
  assert.equal(grid.count(E.WALL), 8);
  assert.equal(grid.count(E.WOOD), 4);
  for (let x = 0; x < 8; x++) assert.equal(grid.get(x, 4), E.WALL);
});

test('the updated flag is cleared at the start of every tick', () => {
  const { grid, engine } = makeEngine(5, 5);
  grid.updated.fill(1);
  engine.step();
  assert.equal(grid.updated.reduce((a, b) => a + b, 0), 0);
});

test('canEnter: empty always accepted', () => {
  const { engine } = makeEngine();
  for (const id of Object.values(E)) {
    if (id === E.EMPTY) continue;
    assert.ok(engine.canEnter(id, E.EMPTY), `${ELEMENTS[id].name} should enter empty`);
  }
});

test('canEnter: denser particles displace lighter fluids and gases', () => {
  const { engine } = makeEngine();
  assert.ok(engine.canEnter(E.SAND, E.WATER));   // sand sinks in water
  assert.ok(engine.canEnter(E.LAVA, E.WATER));   // lava sinks in water
  assert.ok(engine.canEnter(E.SAND, E.SMOKE));   // sand pushes through gas
  assert.ok(!engine.canEnter(E.WATER, E.SAND));  // water cannot push sand
  assert.ok(!engine.canEnter(E.WATER, E.LAVA));  // water floats on lava
  assert.ok(!engine.canEnter(E.SMOKE, E.WATER)); // gas cannot push liquid
  assert.ok(!engine.canEnter(E.SAND, E.WALL));   // nothing enters statics
});

test('moveTo swaps cells and marks both as updated', () => {
  const { grid, engine } = makeEngine(2, 2);
  grid.set(0, 1, E.SAND, 5, 9);
  grid.set(0, 0, E.EMPTY);
  engine.moveTo(grid.idx(0, 1), grid.idx(0, 0));
  assert.equal(grid.get(0, 0), E.SAND);
  assert.equal(grid.life[grid.idx(0, 0)], 5);
  assert.equal(grid.get(0, 1), E.EMPTY);
  assert.equal(grid.updated[grid.idx(0, 0)], 1);
  assert.equal(grid.updated[grid.idx(0, 1)], 1);
});

test('rng is deterministic for a given seed', () => {
  const a = mulberry32(7);
  const b = mulberry32(7);
  for (let i = 0; i < 50; i++) assert.equal(a(), b());
  const c = mulberry32(8);
  let same = 0;
  for (let i = 0; i < 50; i++) if (a() === c()) same++;
  assert.ok(same < 10, 'different seeds should diverge');
});
