import { World } from "./sim.ts";
import {
  ROCKS,
  LAND_SIDE,
  MAX_ANIMALS,
  PLANT_INSTANCE_CAPACITY,
  WORLD_RADIUS,
  landAt,
} from "./terrain.ts";
import { regionalClimate, waterDepth } from "./ecology.ts";
import { encodeSave, decodeSave } from "./save.ts";
function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
const w = new World(57);
w.animals = [];
w.plants = [];
w.dens = [];
w.weather.cloud = 0;
w.weather.moisture = 0.2;
const rock = ROCKS.find(
  (r) =>
    waterDepth(w.ponds, r.x, r.z) === 0 &&
    regionalClimate(0, w.weather, r.x, r.z).sunlight > 0.45,
)!;
assert(rock, "A dry sunny rock exists");
const a = w.addAnimal("grazer", undefined, "mouse");
Object.assign(a, {
  x: rock.x,
  z: rock.z,
  energy: 90,
  hydration: 100,
  wetness: 0.9,
  age: 40,
});
a.genes.preferredMoisture = landAt(w.weather.land, a.x, a.z).moisture;
w.step(0.1);
assert(a.state === "Drying on sunny rock", "Wet animal rests on sunny rock");
const wet = a.wetness;
for (let i = 0; i < 20; i++) w.step(0.1);
assert(a.wetness < wet, "Resting dries the coat");
a.hydration = 10;
w.step(0.1);
assert(!a.state.includes("Drying"), "Thirst interrupts drying");
a.hydration = 100;
a.wetness = 0.9;
a.energy = 90;
w.time = 90;
w.weather.cloud = 1;
w.dens = [{ id: 99999, owner: a.id, x: a.x, z: a.z, progress: 1 }];
a.home = 99999;
w.nextId = 100000;
w.step(0.1);
assert(
  String(a.state) === "Drying in shelter",
  "Wet animals use their den without sunshine",
);
// Compare otherwise identical waders, isolating water resistance.
const raw = encodeSave({ world: w, rate: 1, paused: true, selected: a.id });
const low = decodeSave(raw).world,
  high = decodeSave(raw).world;
for (const world of [low, high]) {
  const m = world.animals[0];
  m.x = 2;
  m.z = 0;
  m.wetness = 0;
}
low.animals[0].genes.waterproofing = 0;
high.animals[0].genes.waterproofing = 1;
low.step(0.1);
high.step(0.1);
assert(
  high.animals[0].wetness < low.animals[0].wetness,
  "Water-resistant coat soaks more slowly",
);
// Matching cold animals differ only in coat insulation, including its upkeep cost.
for (const world of [low, high]) {
  const m = world.animals[0];
  Object.assign(m, {
    x: -30,
    z: 0,
    wetness: 0.5,
    energy: 90,
    hydration: 100,
    home: 0,
  });
  world.time = 90;
  world.dens = [];
  world.plants = [];
  m.genes.waterproofing = 0.4;
}
low.animals[0].genes.insulation = 0;
high.animals[0].genes.insulation = 1;
low.step(0.1);
high.step(0.1);
assert(
  high.animals[0].energy > low.animals[0].energy,
  "Insulation reduces net cold-weather energy loss",
);
const baby = w.addAnimal(a.kind, a);
assert(
  Number.isFinite(baby.genes.insulation) &&
    Number.isFinite(baby.genes.waterproofing),
  "Offspring inherit weather traits",
);
assert(
  (WORLD_RADIUS * WORLD_RADIUS) / (44 * 44) > 2.5 &&
    MAX_ANIMALS === 560 &&
    PLANT_INSTANCE_CAPACITY === 2000,
  "More plant space with unchanged animal cap",
);
// Recreate the old 12 by 12 landscape and verify central state survives expansion.
const old = JSON.parse(
  encodeSave({ world: w, rate: 1, paused: true, selected: a.id }),
);
old.version = 16;
old.world.weather.land = Array.from(
  { length: 144 },
  (_, i) =>
    w.weather.land![(Math.floor(i / 12) + 4) * LAND_SIDE + (i % 12) + 4],
);
for (const m of old.world.animals) {
  delete m.genes.insulation;
  delete m.genes.waterproofing;
}
const migrated = decodeSave(JSON.stringify(old)).world;
assert(
  migrated.animals.length === w.animals.length && migrated.animals[0].x === a.x,
  "Expansion preserves animals and positions",
);
assert(
  migrated.plants.some((p) => Math.hypot(p.x, p.z) > 45),
  "New outer land receives vegetation",
);
assert(
  JSON.stringify(migrated.weather.land![4 * LAND_SIDE + 4]) ===
    JSON.stringify(old.world.weather.land[0]),
  "Original climate cells survive migration",
);
assert(
  decodeSave(
    encodeSave({ world: migrated, rate: 1, paused: true, selected: a.id }),
  ).world.plants.length === migrated.plants.length,
  "Expansion happens only once",
);
console.log(
  "Drying refuges, thirst priority, water resistance, inherited coats and island expansion migration passed",
);
