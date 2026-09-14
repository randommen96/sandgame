# Falling Sand Physics Game — Progress Tracker

## Status Legend
- `[ ]` not started · `[x]` done & verified · `[-]` in progress

## Task 1: Core Simulation Engine & Grid Structure
- [x] Canvas at fixed 200×150 sim resolution, CSS-scaled to viewport (crisp pixels, no smoothing)
- [x] Flat typed-array grid (`Uint8Array` cell ids + `Uint16Array` life/property + variation bytes)
- [x] Fixed-timestep game loop (accumulator @ 60 Hz) with `update()` / `draw()` separation
- [x] Node-based unit tests for grid & loop invariants

## Task 2: Basic Particle Physics (Sand & Walls)
- [ ] Sand falls straight down, slides diagonally when blocked (randomized L/R priority)
- [ ] Static Wall element blocks all particles
- [ ] Mouse/touch paint interaction (click + drag spawns active element, line interpolation)

## Task 3: Liquids & Gaseous Elements
- [ ] Water flows down, spreads sideways, levels out; displaced by denser particles
- [ ] Smoke/steam gas rises, diffuses around obstacles, dissipates over lifetime
- [ ] Density-based swap so sand sinks through water/lava

## Task 4: Interactive Elements & Reactions (Fire, Wood, Cinder)
- [ ] Wood: static flammable solid
- [ ] Fire: ignites wood, emits smoke, finite lifetime, extinguished by water
- [ ] Burned-out fire can leave Cinder (ash) residue; cinder falls like sand
- [ ] Water + Fire → Steam / extinguish
- [ ] Lava element (slow glowing liquid) + Water → Stone (+ steam)

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

## Known Issues
(none yet)
