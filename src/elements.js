// Element registry. Ids are stored per-cell in a Uint8Array, so keep the count small.

export const E = Object.freeze({
  EMPTY: 0,
  SAND: 1,
  WALL: 2,
  WATER: 3,
  WOOD: 4,
  FIRE: 5,
  SMOKE: 6,
  LAVA: 7,
  STONE: 8,
  STEAM: 9,
  CINDER: 10,
});

// density: relative weight used for displacement swaps (higher sinks through lower).
// static: never moves on its own. flammable: can be ignited by fire/lava.
export const ELEMENTS = Object.freeze([
  { id: E.EMPTY,  name: 'Empty',  density: 0, static: true,  gas: false, liquid: false, flammable: false, emissive: false },
  { id: E.SAND,   name: 'Sand',   density: 4, static: false, gas: false, liquid: false, flammable: false, emissive: false },
  { id: E.WALL,   name: 'Wall',   density: 5, static: true,  gas: false, liquid: false, flammable: false, emissive: false },
  { id: E.WATER,  name: 'Water',  density: 2, static: false, gas: false, liquid: true,  flammable: false, emissive: false },
  { id: E.WOOD,   name: 'Wood',   density: 5, static: true,  gas: false, liquid: false, flammable: true,  emissive: false },
  { id: E.FIRE,   name: 'Fire',   density: 1, static: false, gas: false, liquid: false, flammable: false, emissive: true  },
  { id: E.SMOKE,  name: 'Smoke',  density: 1, static: false, gas: true,  liquid: false, flammable: false, emissive: false },
  { id: E.LAVA,   name: 'Lava',   density: 3, static: false, gas: false, liquid: true,  flammable: false, emissive: true  },
  { id: E.STONE,  name: 'Stone',  density: 5, static: true,  gas: false, liquid: false, flammable: false, emissive: false },
  { id: E.STEAM,  name: 'Steam',  density: 1, static: false, gas: true,  liquid: false, flammable: false, emissive: false },
  { id: E.CINDER, name: 'Cinder', density: 4, static: false, gas: false, liquid: false, flammable: false, emissive: false },
]);

export const isGas = (id) => ELEMENTS[id].gas;
export const isLiquid = (id) => ELEMENTS[id].liquid;
export const isStatic = (id) => ELEMENTS[id].static;
export const isFlammable = (id) => ELEMENTS[id].flammable;
export const densityOf = (id) => ELEMENTS[id].density;

// Lifetime defaults assigned when a particle is created.
export const DEFAULT_LIFE = Object.freeze({
  [E.FIRE]: 90,
  [E.SMOKE]: 120,
  [E.STEAM]: 70,
});
