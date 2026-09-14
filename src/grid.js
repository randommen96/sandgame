import { E } from './elements.js';

// Flat typed-array cellular grid.
//  cells:     Uint8Array   element id per cell
//  life:      Uint16Array  per-particle timer (fire burn time, gas dissipation, ...)
//  variation: Uint8Array   random seed used for color/texture variation
//  updated:   Uint8Array   set when a particle moved this tick (prevents double moves)
export class Grid {
  constructor(w, h) {
    if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) {
      throw new RangeError(`grid dimensions must be positive integers, got ${w}x${h}`);
    }
    this.w = w;
    this.h = h;
    const n = w * h;
    this.cells = new Uint8Array(n);
    this.life = new Uint16Array(n);
    this.variation = new Uint8Array(n);
    this.updated = new Uint8Array(n);
  }

  idx(x, y) {
    return y * this.w + x;
  }

  inBounds(x, y) {
    return x >= 0 && x < this.w && y >= 0 && y < this.h;
  }

  get(x, y) {
    if (!this.inBounds(x, y)) throw new RangeError(`get out of bounds: (${x}, ${y})`);
    return this.cells[this.idx(x, y)];
  }

  set(x, y, id, life = 0, variation = 0) {
    if (!this.inBounds(x, y)) throw new RangeError(`set out of bounds: (${x}, ${y})`);
    const i = this.idx(x, y);
    this.cells[i] = id;
    this.life[i] = life & 0xffff;
    this.variation[i] = variation & 0xff;
  }

  // Swap all per-cell state between two indices.
  swap(i, j) {
    if (i === j) return;
    const c = this.cells[i]; this.cells[i] = this.cells[j]; this.cells[j] = c;
    const l = this.life[i]; this.life[i] = this.life[j]; this.life[j] = l;
    const v = this.variation[i]; this.variation[i] = this.variation[j]; this.variation[j] = v;
  }

  clear() {
    this.cells.fill(E.EMPTY);
    this.life.fill(0);
    this.variation.fill(0);
    this.updated.fill(0);
  }

  count(id) {
    let n = 0;
    const cells = this.cells;
    for (let i = 0; i < cells.length; i++) if (cells[i] === id) n++;
    return n;
  }
}
