import { E, ELEMENTS, DEFAULT_LIFE } from './elements.js';

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
          case E.CINDER: this.updateSand(x, y, i); break; // cinder falls like sand
          case E.WATER: this.updateWater(x, y, i); break;
          case E.SMOKE:
          case E.STEAM: this.updateGas(x, y, i); break;
          case E.FIRE: this.updateFire(x, y, i); break;
          case E.LAVA: this.updateLava(x, y, i); break;
          default: break; // static (wall, wood, stone) or not-yet-implemented
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

  // The 8 surrounding offsets.
  static NEIGHBORS8 = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];

  updateFire(x, y, i) {
    const grid = this.grid;
    // Lifetime: burns out after DEFAULT_LIFE ticks.
    if (grid.life[i] > 0 && --grid.life[i] === 0) {
      // Burned-out fire sometimes leaves a cinder residue.
      if (this.rng() < 0.35) grid.set(x, y, E.CINDER, 0, grid.variation[i]);
      else grid.set(x, y, E.EMPTY);
      return;
    }
    // Water contact extinguishes the fire and puffs steam.
    if (this.neighborHas(x, y, E.WATER)) {
      grid.set(x, y, E.STEAM, DEFAULT_LIFE[E.STEAM], grid.variation[i]);
      return;
    }
    // Ignite flammable neighbors (wood).
    for (const [dx, dy] of Engine.NEIGHBORS8) {
      const nx = x + dx, ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const j = grid.idx(nx, ny);
      if (grid.cells[j] === E.WOOD) {
        grid.set(nx, ny, E.FIRE, DEFAULT_LIFE[E.FIRE], grid.variation[j]);
      }
    }
    // Emit a wisp of smoke upward now and then.
    if (y > 0 && grid.get(x, y - 1) === E.EMPTY && this.rng() < 0.2) {
      grid.set(x, y - 1, E.SMOKE, DEFAULT_LIFE[E.SMOKE], Math.floor(this.rng() * 256));
    }
  }

  updateLava(x, y, i) {
    const grid = this.grid;
    // Reactions with neighbors first (before any movement).
    for (const [dx, dy] of Engine.NEIGHBORS8) {
      const nx = x + dx, ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const j = grid.idx(nx, ny);
      if (grid.cells[j] === E.WATER) {
        // Lava + water -> stone; the water boils off as steam.
        grid.set(nx, ny, E.STEAM, DEFAULT_LIFE[E.STEAM], grid.variation[j]);
        grid.set(x, y, E.STONE, 0, grid.variation[i]);
        return;
      }
      if (grid.cells[j] === E.WOOD) {
        grid.set(nx, ny, E.FIRE, DEFAULT_LIFE[E.FIRE], grid.variation[j]);
      }
    }
    // Lava is a thick liquid: it only attempts to move on some ticks.
    if (this.rng() >= 0.25) return;
    const w = grid.w;
    if (y + 1 < grid.h) {
      const below = i + w;
      if (this.canEnter(E.LAVA, grid.cells[below])) {
        this.moveTo(i, below);
        return;
      }
      const dir = this.rng() < 0.5 ? -1 : 1;
      for (const d of [dir, -dir]) {
        const nx = x + d;
        if (nx < 0 || nx >= w) continue;
        const j = below + d;
        if (this.canEnter(E.LAVA, grid.cells[j])) {
          this.moveTo(i, j);
          return;
        }
      }
    }
    // Slow horizontal spread (thicker than water: max 2 cells/tick).
    const dir2 = this.rng() < 0.5 ? -1 : 1;
    for (const d of [dir2, -dir2]) {
      let target = -1;
      for (let s = 1; s <= 2; s++) {
        const nx = x + d * s;
        if (nx < 0 || nx >= w) break;
        if (grid.cells[i + d * s] !== E.EMPTY) break;
        target = i + d * s;
      }
      if (target !== -1) {
        this.moveTo(i, target);
        return;
      }
    }
  }

  // True if any of the 8 neighbors holds `id`.
  neighborHas(x, y, id) {
    const grid = this.grid;
    for (const [dx, dy] of Engine.NEIGHBORS8) {
      const nx = x + dx, ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      if (grid.cells[grid.idx(nx, ny)] === id) return true;
    }
    return false;
  }

  // Water: falls (displacing denser particles like sand), slides diagonally,
  // then spreads horizontally up to 4 cells per tick so pools level out.
  updateWater(x, y, i) {
    const grid = this.grid;
    const w = grid.w;
    if (y + 1 < grid.h) {
      const below = i + w;
      if (this.canEnter(E.WATER, grid.cells[below])) {
        this.moveTo(i, below);
        return;
      }
      const dir = this.rng() < 0.5 ? -1 : 1;
      for (const d of [dir, -dir]) {
        const nx = x + d;
        if (nx < 0 || nx >= w) continue;
        const j = below + d;
        if (this.canEnter(E.WATER, grid.cells[j])) {
          this.moveTo(i, j);
          return;
        }
      }
    }
    // Horizontal dispersion: slide into the farthest empty cell within 4.
    const dir2 = this.rng() < 0.5 ? -1 : 1;
    for (const d of [dir2, -dir2]) {
      let target = -1;
      for (let s = 1; s <= 4; s++) {
        const nx = x + d * s;
        if (nx < 0 || nx >= w) break;
        if (grid.cells[i + d * s] !== E.EMPTY) break;
        target = i + d * s;
      }
      if (target !== -1) {
        this.moveTo(i, target);
        return;
      }
    }
  }

  // Gas (smoke/steam): rises one cell per tick, drifts diagonally at
  // obstacles, slides sideways along the ceiling. Dissipates over lifetime.
  updateGas(x, y, i) {
    const grid = this.grid;
    const w = grid.w;
    // Lifetime: decrements once per tick regardless of movement.
    if (grid.life[i] > 0 && --grid.life[i] === 0) {
      grid.set(x, y, E.EMPTY);
      return;
    }
    if (y > 0 && grid.cells[i - w] === E.EMPTY) {
      this.moveTo(i, i - w);
      return;
    }
    const dir = this.rng() < 0.5 ? -1 : 1;
    for (const d of [dir, -dir]) {
      const nx = x + d;
      if (nx < 0 || nx >= w) continue;
      const j = i - w + d;
      if (y > 0 && grid.cells[j] === E.EMPTY) {
        this.moveTo(i, j);
        return;
      }
    }
    // Sideways drift along the ceiling.
    const dir2 = this.rng() < 0.5 ? -1 : 1;
    for (const d of [dir2, -dir2]) {
      const nx = x + d;
      if (nx < 0 || nx >= w) continue;
      const j = i + d;
      if (grid.cells[j] === E.EMPTY) {
        this.moveTo(i, j);
        return;
      }
    }
  }

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
