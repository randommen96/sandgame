// Fixed-timestep pacing for the game loop. Pure and DOM-free so it can be
// unit-tested in Node (see tests/safeguards.test.js).
//
// Safety properties enforced here:
//  * At most MAX_STEPS_PER_FRAME simulation steps per rendered frame — a slow
//    or stalled frame can never trigger an unbounded catch-up loop
//    ("spiral of death").
//  * dt is clamped to [0, MAX_FRAME_DT_MS] so a hidden/background tab (huge
//    rAF gap) cannot fast-forward the world in one burst.
//  * Non-finite dt (NaN/Infinity from clock anomalies) is treated as exactly
//    one tick instead of crashing or spinning.
//  * When the step cap is hit, the backlog accumulator is dropped to zero so
//    memory/time debt never accumulates across frames.

export const TICK_MS = 1000 / 60; // fixed 60 Hz simulation timestep
export const MAX_STEPS_PER_FRAME = 5; // hard cap on catch-up steps per frame
export const MAX_FRAME_DT_MS = 250; // clamp: ~4 frames of backlog max

/**
 * Advance the fixed-timestep accumulator by `dt` milliseconds.
 * Returns { accumulator, steps } where `steps` is how many engine.step()
 * calls the caller should perform this frame (0..MAX_STEPS_PER_FRAME).
 */
export function advanceAccumulator(accumulator, dt) {
  let acc = Number.isFinite(accumulator) ? Math.max(accumulator, 0) : 0;
  if (!Number.isFinite(dt)) dt = TICK_MS; // NaN/Infinity guard
  dt = Math.min(Math.max(dt, 0), MAX_FRAME_DT_MS);
  acc += dt;

  let steps = 0;
  while (acc >= TICK_MS && steps < MAX_STEPS_PER_FRAME) {
    acc -= TICK_MS;
    steps++;
  }
  if (steps === MAX_STEPS_PER_FRAME) acc = 0; // drop backlog: never spiral
  return { accumulator: acc, steps };
}
