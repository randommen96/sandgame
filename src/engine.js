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
          case E.SAND: this.updateSand(x, y, i); break;
          default: break; // static or not-yet-implemented elements do nothing
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

  // --- Element updates ---

  // Sand: falls straight down; if blocked, slides diagonally into an open
  // below-left/below-right cell (randomized priority to avoid bias).
  updateSand(x, y, i) {
    const grid = this.grid;
    const w = grid.w;
    if (y + 1 >= grid.h) return; // resting on the floor
    const below = i + w;
    if (this.canEnter(E.SAND, grid.cells[below])) {
      this.moveTo(i, below);
      return;
    }
    const dir = this.rng() < 0.5 ? -1 : 1;
    for (const d of [dir, -dir]) {
      const nx = x + d;
      if (nx < 0 || nx >= w) continue;
      const j = below + d;
      if (this.canEnter(E.SAND, grid.cells[j])) {
        this.moveTo(i, j);
        return;
      }
    }
  }
}
