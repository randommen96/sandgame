# Falling Sand Physics Game — Progress Tracker

## Status Legend
- `[ ]` not started · `[x]` done & verified · `[-]` in progress

## Task 1: Core Simulation Engine & Grid Structure
- [x] Canvas at fixed 200×150 sim resolution, CSS-scaled to viewport (crisp pixels, no smoothing)
- [x] Flat typed-array grid (`Uint8Array` cell ids + `Uint16Array` life/property + variation bytes)
- [x] Fixed-timestep game loop (accumulator @ 60 Hz) with `update()` / `draw()` separation
- [x] Node-based unit tests for grid & loop invariants

## Task 2: Basic Particle Physics (Sand & Walls)
- [x] Sand falls straight down, slides diagonally when blocked (randomized L/R priority)
- [x] Static Wall element blocks all particles
- [x] Mouse/touch paint interaction (click + drag spawns active element, line interpolation)

## Task 3: Liquids & Gaseous Elements
- [x] Water flows down, spreads sideways, levels out; displaced by denser particles
- [x] Smoke/steam gas rises, diffuses around obstacles, dissipates over lifetime
- [x] Density-based swap so sand sinks through water/lava

## Task 4: Interactive Elements & Reactions (Fire, Wood, Cinder)
- [x] Wood: static flammable solid
- [x] Fire: ignites wood, emits smoke, finite lifetime, extinguished by water
- [x] Burned-out fire can leave Cinder (ash) residue; cinder falls like sand
- [x] Water + Fire → Steam / extinguish
- [x] Lava element (slow glowing liquid) + Water → Stone (+ steam); lava also ignites wood

## Task 5: UI, Controls & Polish
- [ ] Toolbar: element buttons (Sand, Water, Wood, Fire, Wall, Lava, Eraser), brush size control
- [ ] Controls: Clear canvas, Pause/Step, FPS counter overlay
- [ ] Keyboard shortcuts (1-7 elements, [ ] brush, Space pause/step, C clear)
- [ ] Color variation per particle for organic texture; fire/lava flicker + glow pass
- [ ] Final verification: 60 FPS, zero console errors, all interactions reliable

## Verification Log
| Date | Check | Result |
|------|-------|--------|
| 2026-09-14 | Task 1: `npm test` (15 unit tests) | PASS |
| 2026-09-14 | Task 1: headless Chrome smoke (canvas, 60 FPS, zero console errors) | PASS — screenshot assets/screenshots/task1-initial.png |
| 2026-09-14 | Task 2: `npm test` (21 unit tests incl. sand gravity / no-double-move / border safety) | PASS |
| 2026-09-14 | Task 2: browser interaction — painted sand line falls to floor row 149, mass conserved, zero errors | PASS — screenshot assets/screenshots/task2-sand.png |
| 2026-09-14 | Task 3: `npm test` (26 unit tests incl. water leveling, density sink, gas rise/dissipate) | PASS |
| 2026-09-14 | Task 3: browser interaction — sand + water phases, conserved counts, zero errors | PASS — screenshot assets/screenshots/task3-water.png |
| 2026-09-14 | Task 4: `npm test` (34 unit tests incl. fire burnout/spread, extinguish, lava reactions) | PASS |
| 2026-09-14 | Task 4: browser interaction — sand + water + fire phases (wood plank ignites, smoke emits), zero errors | PASS — screenshot assets/screenshots/task4-fire.png |

## Known Issues
(none yet)
