function assert(
  ok: unknown,
  message = "Decomposition assertion failed",
): asserts ok {
  if (!ok) throw new Error(message);
}
assert.equal = (a: unknown, b: unknown) => assert(a === b, `${a} !== ${b}`);
assert.deepEqual = (a: unknown, b: unknown) =>
  assert(JSON.stringify(a) === JSON.stringify(b));
assert.throws = (fn: () => unknown) => {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  assert(threw);
};
import * as THREE from "three";
import {
  consumeRemains,
  recycleLitter,
  feedPlantSoil,
  remainsMass,
  DETRITUS_BITE_RATE,
  DETRITUS_NUTRITION,
} from "./decomposition.ts";
import { World } from "./sim.ts";
import { initialLandscape } from "./terrain.ts";
import { encodeSave, decodeSave } from "./save.ts";
import { OrganismMeshes } from "./meshes.ts";

const cell = initialLandscape()[0];
cell.litter = 0;
cell.nutrients = 0;
cell.moisture = 0.8;
cell.fungus = 0.5;
cell.worms = 0.5;
const remains = { id: 100, x: -36, z: 28, size: 1, decay: 0 };
assert.equal(consumeRemains(remains, 100, cell, true), 3);
assert.equal(consumeRemains(remains, 100, cell, true), 0);
assert.equal(remains.decay, 1);
const litter = cell.litter;
recycleLitter(cell, 10);
assert(cell.litter < litter && cell.nutrients > 0);
const fertile = { ...cell, nutrients: 1 },
  poor = { ...cell, nutrients: 0 };
assert(feedPlantSoil(fertile, 1, true) > feedPlantSoil(poor, 1, true));
assert(fertile.nutrients < 1);
const wormsOnly = { ...cell, fungus: 0, worms: 1, litter: 0.5, nutrients: 0 };
recycleLitter(wormsOnly, 10);
assert(wormsOnly.litter < 0.5 && wormsOnly.nutrients > 0);

for (const source of ["plant", "animal"] as const) {
  const w = new World(54);
  w.animals = [];
  w.plants = [];
  w.eggs = [];
  w.seedBank = [];
  const bug = w.addAnimal("grazer", undefined, "bug");
  Object.assign(bug, {
    x: -36,
    z: 28,
    energy: 40,
    hydration: 100,
    age: 100,
    altitude: 0,
  });
  const food = { ...remains, decay: 0 };
  if (source === "plant")
    w.plantRemains = [{ ...food, kind: "tree", variety: 0 }];
  else w.carcasses = [food];
  w.step(0.1);
  assert.equal(bug.state, "Eating remains");
  assert(bug.energy > 40);
  assert((source === "plant" ? w.plantRemains[0] : w.carcasses[0]).decay > 0);
  const loaded = decodeSave(
    encodeSave({ world: w, rate: 1, paused: true, selected: 0 }),
  ).world;
  assert.deepEqual(loaded.carcasses, w.carcasses);
  assert.deepEqual(loaded.plantRemains, w.plantRemains);
}
const w = new World(54);
w.animals = [];
w.eggs = [];
const animal = w.addAnimal("grazer", undefined, "mouse");
animal.energy = 0;
w.step(0.1);
assert(w.carcasses.some((c) => c.id === animal.id));
const legacy = JSON.parse(
  encodeSave({ world: w, rate: 1, paused: true, selected: 0 }),
);
legacy.version = 31;
delete legacy.world.carcasses;
for (const c of legacy.world.weather.land) delete c.nutrients;
assert.equal(decodeSave(JSON.stringify(legacy)).world.carcasses.length, 0);
const bad = JSON.parse(
  encodeSave({ world: w, rate: 1, paused: true, selected: 0 }),
);
bad.world.carcasses[0].decay = -1;
assert.throws(() => decodeSave(JSON.stringify(bad)));

const land = initialLandscape();
for (const c of land) {
  c.fungus = 0.8;
  c.moisture = 0.8;
}
const mesh = new OrganismMeshes(new THREE.Scene());
const log = { ...remains, kind: "tree" as const, variety: 0, decay: 0.5 };
mesh.update([], [], 0, 0, land, [log], [], [{ ...remains, decay: 0.3 }]);
assert(mesh.woodMushrooms.count > 0 && mesh.carcassMesh.count === 1);
for (const m of [mesh.woodMushrooms, mesh.carcassMesh])
  assert(
    Array.from(m.instanceMatrix.array.slice(0, m.count * 16)).every(
      Number.isFinite,
    ),
  );
assert(mesh.ids.get(mesh.woodMushrooms)?.every((id) => id === log.id));
for (const c of land) c.moisture = 0;
mesh.update([], [], 1, 0, land, [log]);
assert.equal(mesh.woodMushrooms.count, 0);
console.log(
  "Finite remains feeding, worm/fungal recycling, plant nutrients, death, save migration and log mushrooms passed",
);

const expired = new World(54);
expired.animals = [];
expired.plants = [];
expired.eggs = [];
expired.seedBank = [];
expired.carcasses = [{ ...remains, decay: 0.999999 }];
expired.plantRemains = [{ ...log, decay: 0.999999 }];
expired.step(1);
assert.equal(expired.carcasses.length, 0);
assert.equal(expired.plantRemains.length, 0);
const nutrientSave = decodeSave(
  encodeSave({ world: expired, rate: 1, paused: true, selected: 0 }),
);
assert.deepEqual(nutrientSave.world.weather.land, expired.weather.land);

const swarmSoil = {
  ...cell,
  litter: 0,
  nutrients: 0,
  fungus: 1,
  worms: 1,
  moisture: 0.8,
};
const swarmLog = { ...log, decay: 0 };
let eaten = 0;
for (let tick = 0; tick < 10; tick++)
  for (let bug = 0; bug < 30; bug++)
    eaten += consumeRemains(
      swarmLog,
      0.1 * DETRITUS_BITE_RATE,
      swarmSoil,
      true,
    );
assert.equal(swarmLog.decay, 1);
assert(
  Math.abs(eaten - remainsMass(log)) < 1e-8,
  "Swarm clears one finite food pool without duplicating meals",
);
assert(swarmSoil.litter > 0, "Swarm leaves waste for decomposers");
recycleLitter(swarmSoil, 10);
assert(swarmSoil.nutrients > 0, "Waste becomes soil fertility");
assert(
  remainsMass({ ...remains, size: 0.6 }) * DETRITUS_NUTRITION < 4,
  "One ordinary bug carcass cannot repay even the per-egg reproductive cost",
);
