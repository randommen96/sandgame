import { E, ELEMENTS } from './elements.js';

// One `step()` = one fixed simulation tick (60 Hz).
// Scan order: bottom-to-top so falling particles are not re-processed within the same tick.
// Row scan direction alternates per row/frame to cancel left/right bias in lateral moves.
// A per-cell `updated` flag prevents any particle from moving twice in one tick.
export class Engine {
  constructor(grid, rng) {
    this.grid = grid;
    this.rng = rng;
    this.frame = 0;
  }

  step() {
    const grid = this.grid;
    const w = grid.w;
    const h = grid.h;
    grid.updated.fill(0);

    for (let y = h - 1; y >= 0; y--) {
      const leftToRight = ((this.frame + y) & 1) === 0;
      for (let xi = 0; xi < w; xi++) {
        const x = leftToRight ? xi : w - 1 - xi;
        const i = grid.idx(x, y);
        const id = grid.cells[i];
        if (id === E.EMPTY || ELEMENTS[id].static) continue;
        if (grid.updated[i]) continue; // already moved this tick
        switch (id) {
          // Element updates are added incrementally in later tasks.
          default: break;
        }
      }
    }
    this.frame++;
  }

  // Can an element with id `id` occupy a cell currently holding `targetId`?
  // Yes if empty, or if the occupant is a gas/lighter liquid that can be displaced.
  canEnter(id, targetId) {
    if (targetId === E.EMPTY) return true;
    const t = ELEMENTS[targetId];
    return (t.gas || t.liquid) && ELEMENTS[id].density > t.density;
  }

  // Move (swap) particle at index i into index j, marking both as updated this tick.
  moveTo(i, j) {
    this.grid.swap(i, j);
    this.grid.updated[i] = 1;
    this.grid.updated[j] = 1;
  }
}
