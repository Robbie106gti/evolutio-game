import { World } from "./sim.ts";
import {
  RECOVERY,
  recoverPlant,
  foliageProductivity,
} from "./plant-recovery.ts";
import { PLANTS } from "./species.ts";
import { encodeSave, decodeSave } from "./save.ts";
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const world = new World(54);
for (const kind of ["grass", "bush", "tree"] as const) {
  const original = world.plants.find((p) => p.kind === kind)!;
  assert(original, `Fixture has ${kind}`);
  const plant = {
    ...original,
    energy: 0,
    health: 100,
    depletion: 0,
    reserves: RECOVERY[kind].reserve,
  };
  const before = plant.reserves;
  recoverPlant(plant, 1, () => 0);
  assert(
    plant.health === 100 && plant.energy > 0,
    `${kind} has a grace period and can regrow`,
  );
  assert(
    Math.abs(plant.energy + plant.reserves - before) < 1e-9,
    "Reserve release conserves energy",
  );
  plant.energy = PLANTS[kind].capacity;
  for (let i = 0; i < 5; i++) recoverPlant(plant, 1, () => 0);
  assert(
    plant.depletion === 0 && plant.health === 100,
    `${kind} recovers when grazing stops`,
  );
  const stressed = {
    ...plant,
    energy: 0,
    depletion: RECOVERY[kind].grace * 2,
    reserves: 0,
  };
  const survivor = { ...stressed };
  recoverPlant(stressed, 1, () => 0);
  recoverPlant(survivor, 1, () => 0.999);
  assert(
    stressed.health === 0 && survivor.health > 0 && survivor.health < 100,
    `${kind} can either survive or die under stress`,
  );
  assert(
    foliageProductivity({ ...plant, energy: 0 }) < foliageProductivity(plant),
    "Defoliation limits productivity",
  );
}
const save = encodeSave({ world, rate: 1, paused: true, selected: 0 });
const loaded = decodeSave(save).world;
assert(
  loaded.plants[0].reserves === world.plants[0].reserves,
  "Reserves persist",
);
const old = JSON.parse(save);
old.version = 32;
delete old.world.plantDeaths.depletion;
for (const p of [...old.world.plants, ...old.world.seedBank]) {
  delete p.reserves;
  delete p.depletion;
}
const migrated = decodeSave(JSON.stringify(old)).world;
assert(
  migrated.plants.every((p) => p.reserves > 0 && p.depletion === 0),
  "Old saves receive recovery grace",
);
const bad = JSON.parse(save);
bad.world.plants[0].reserves = -1;
let rejected = false;
try {
  decodeSave(JSON.stringify(bad));
} catch {
  rejected = true;
}
assert(rejected, "Invalid reserves rejected");
world.plants[0].energy = 0;
world.plants[0].reserves = 0;
world.plants[0].depletion = 100;
const restored = decodeSave(
  encodeSave({ world, rate: 1, paused: true, selected: 0 }),
).world;
for (let i = 0; i < 50; i++) {
  world.step(0.1);
  restored.step(0.1);
}
assert(
  JSON.stringify(world.plants) === JSON.stringify(restored.plants),
  "Mortality RNG continues deterministically after reload",
);
console.log(
  "All plant types: recovery, finite reserves, stochastic death, growth limitation and save compatibility passed",
);
