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

test('a lone fire burns out and leaves nothing or a cinder', () => {
  const { grid, engine } = makeEngine(10, 15);
  grid.set(5, 7, E.FIRE, DEFAULT_LIFE[E.FIRE]);
  for (let i = 0; i < DEFAULT_LIFE[E.FIRE] + 5; i++) engine.step();
  assert.equal(grid.count(E.FIRE), 0, 'fire must burn out');
  const residue = grid.get(5, 7);
  assert.ok(residue === E.EMPTY || residue === E.CINDER, `residue should be empty or cinder, got ${residue}`);
});

test('fire spreads to adjacent wood and consumes it', () => {
  const { grid, engine } = makeEngine(10, 15, 7);
  // A small wood plank with a fire touching its left end.
  for (let x = 3; x < 7; x++) grid.set(x, 8, E.WOOD);
  grid.set(2, 8, E.FIRE, DEFAULT_LIFE[E.FIRE]);
  for (let i = 0; i < 600 && (grid.count(E.WOOD) > 0 || grid.count(E.FIRE) > 0); i++) engine.step();
  assert.equal(grid.count(E.WOOD), 0, 'all wood should burn away');
  assert.equal(grid.count(E.FIRE), 0, 'fire should be gone once fuel is exhausted');
});

test('water extinguishes fire and produces steam', () => {
  const { grid, engine } = makeEngine(10, 15);
  grid.set(5, 8, E.FIRE, DEFAULT_LIFE[E.FIRE]);
  grid.set(6, 8, E.WATER); // water touching the fire
  const waterBefore = grid.count(E.WATER);
  for (let i = 0; i < 10; i++) engine.step();
  assert.equal(grid.count(E.FIRE), 0, 'fire must be extinguished');
  assert.ok(grid.count(E.STEAM) > 0, 'extinguishing should puff steam');
  assert.equal(grid.count(E.WATER), waterBefore, 'the water itself is not consumed by fire');
});

test('cinder falls like sand and settles on the floor', () => {
  const { grid, engine } = makeEngine(10, 15);
  grid.set(4, 0, E.CINDER);
  for (let i = 0; i < 30; i++) engine.step();
  assert.equal(grid.get(4, 14), E.CINDER, 'cinder should rest on the floor');
});

test('lava plus water produces stone and steam', () => {
  const { grid, engine } = makeEngine(10, 15);
  // A lava pool with a water droplet sitting on top of it.
  for (let x = 2; x < 8; x++) grid.set(x, 13, E.LAVA);
  grid.set(4, 12, E.WATER);
  const lavaBefore = grid.count(E.LAVA);
  const waterBefore = grid.count(E.WATER);
  for (let i = 0; i < 60; i++) engine.step();
  assert.ok(grid.count(E.STONE) > 0, 'lava+water should produce stone');
  assert.ok(grid.count(E.LAVA) < lavaBefore, 'some lava must have solidified');
  assert.ok(grid.count(E.WATER) < waterBefore, 'the contacting water boils away');
  assert.ok(grid.count(E.STEAM) > 0, 'boiling should produce steam');
});

test('lava flows slowly (much slower than sand)', () => {
  const { grid, engine } = makeEngine(10, 20);
  grid.set(5, 0, E.LAVA);
  // Sand would reach the floor in 19 ticks; lava must be clearly slower.
  for (let i = 0; i < 40; i++) engine.step();
  assert.equal(grid.get(5, 19), E.EMPTY, 'lava should not have reached the floor yet');
  for (let i = 0; i < 600 && grid.get(5, 19) !== E.LAVA; i++) engine.step();
  // The lava must eventually reach the floor row somewhere.
  let onFloor = false;
  for (let x = 0; x < grid.w; x++) if (grid.get(x, 19) === E.LAVA) onFloor = true;
  assert.ok(onFloor, 'lava should eventually flow to the floor');
});

test('lava ignites adjacent wood', () => {
  const { grid, engine } = makeEngine(10, 15, 3);
  for (let x = 3; x < 7; x++) grid.set(x, 8, E.WOOD);
  grid.set(2, 8, E.LAVA);
  let sawFire = false;
  for (let i = 0; i < 120; i++) {
    engine.step();
    if (grid.count(E.FIRE) > 0) sawFire = true;
  }
  assert.ok(sawFire, 'lava should ignite the wood');
});

test('fire emits smoke while burning', () => {
  const { grid, engine } = makeEngine(10, 15, 11);
  grid.set(5, 8, E.FIRE, DEFAULT_LIFE[E.FIRE]);
  let sawSmoke = false;
  for (let i = 0; i < DEFAULT_LIFE[E.FIRE]; i++) {
    engine.step();
    if (grid.count(E.SMOKE) > 0) sawSmoke = true;
  }
  assert.ok(sawSmoke, 'burning fire should emit smoke');
});
