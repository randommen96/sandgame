import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Grid } from '../src/grid.js';
import { E } from '../src/elements.js';

test('grid uses flat typed arrays of the right size', () => {
  const g = new Grid(20, 15);
  assert.equal(g.cells.length, 300);
  assert.equal(g.life.length, 300);
  assert.equal(g.variation.length, 300);
  assert.equal(g.updated.length, 300);
  assert.ok(g.cells instanceof Uint8Array);
  assert.ok(g.life instanceof Uint16Array);
  assert.ok(g.variation instanceof Uint8Array);
});

test('grid rejects invalid dimensions', () => {
  assert.throws(() => new Grid(0, 15), RangeError);
  assert.throws(() => new Grid(20, -1), RangeError);
  assert.throws(() => new Grid(20.5, 15), RangeError);
});

test('idx and inBounds math', () => {
  const g = new Grid(4, 3);
  assert.equal(g.idx(0, 0), 0);
  assert.equal(g.idx(3, 0), 3);
  assert.equal(g.idx(0, 2), 8);
  assert.equal(g.idx(3, 2), 11);
  assert.ok(g.inBounds(0, 0));
  assert.ok(g.inBounds(3, 2));
  assert.ok(!g.inBounds(-1, 0));
  assert.ok(!g.inBounds(4, 0));
  assert.ok(!g.inBounds(0, 3));
});

test('set/get round-trips id, life and variation', () => {
  const g = new Grid(5, 5);
  g.set(2, 3, E.SAND, 1234, 77);
  assert.equal(g.get(2, 3), E.SAND);
  assert.equal(g.life[g.idx(2, 3)], 1234);
  assert.equal(g.variation[g.idx(2, 3)], 77);
});

test('out-of-bounds set/get throw RangeError', () => {
  const g = new Grid(4, 4);
  assert.throws(() => g.set(-1, 0, E.SAND), RangeError);
  assert.throws(() => g.set(4, 0, E.SAND), RangeError);
  assert.throws(() => g.get(0, 4), RangeError);
});

test('swap exchanges all per-cell state', () => {
  const g = new Grid(2, 1);
  g.set(0, 0, E.SAND, 10, 1);
  g.set(1, 0, E.WATER, 20, 2);
  g.swap(g.idx(0, 0), g.idx(1, 0));
  assert.equal(g.get(0, 0), E.WATER);
  assert.equal(g.life[g.idx(0, 0)], 20);
  assert.equal(g.variation[g.idx(0, 0)], 2);
  assert.equal(g.get(1, 0), E.SAND);
  assert.equal(g.life[g.idx(1, 0)], 10);
});

test('clear resets every buffer', () => {
  const g = new Grid(3, 3);
  g.set(1, 1, E.FIRE, 50, 9);
  g.updated[4] = 1;
  g.clear();
  assert.equal(g.count(E.EMPTY), 9);
  assert.equal(g.life[g.idx(1, 1)], 0);
  assert.equal(g.variation[g.idx(1, 1)], 0);
  assert.equal(g.updated[4], 0);
});

test('count tallies a single element', () => {
  const g = new Grid(4, 2);
  for (let x = 0; x < 4; x++) g.set(x, 0, E.WALL);
  assert.equal(g.count(E.WALL), 4);
  assert.equal(g.count(E.SAND), 0);
});
