import { grazePlant, worthBrowsing } from "./food-energy.ts";
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
const shrub = { ...world.plants.find(p => p.kind === "bush")!, energy: 10, health: 100 };
const rootStock = PLANTS.bush.capacity * 0.12;
const lastBite = grazePlant(shrub, "turtle", 30);
assert(lastBite.removed === 10 - rootStock && shrub.energy === rootStock,
  "A long feeding step leaves non-edible stems and buds");
assert(!worthBrowsing(shrub, 1) && grazePlant(shrub, "bug", 1).eaten === 0,
  "A second grazer cannot harvest the same stripped plant");
shrub.energy = PLANTS.bush.capacity * 0.29;
recoverPlant(shrub, 1, () => 1);
assert(!worthBrowsing(shrub, 1), "New shoots remain too sparse to browse");
shrub.energy = PLANTS.bush.capacity * 0.31;
recoverPlant(shrub, 1, () => 1);
assert(worthBrowsing(shrub, 60), "The patch becomes attractive again after regrowing");
const canopy = { ...world.plants.find(p => p.kind === "tree")!,
  energy: PLANTS.tree.capacity, defense: 0, health: 100, stripped: false };
const browsedTree = { ...canopy };
assert(grazePlant(browsedTree, "bug", 1).removed <= 1, "Bugs take smaller bites from trees");
grazePlant(browsedTree, "bug", 120);
assert(browsedTree.energy >= PLANTS.tree.capacity * 0.5 && !browsedTree.stripped &&
  !worthBrowsing(browsedTree, 20, "bug") && worthBrowsing(browsedTree, 20, "turtle") &&
  grazePlant(browsedTree, "bug", 1).removed === 0,
  "Bugs leave at least half the canopy under sustained feeding");
for (const kind of ["grass", "bush"] as const) {
  const patch = { ...world.plants.find(p => p.kind === kind)!, energy: PLANTS[kind].capacity, stripped: false };
  grazePlant(patch, "bug", 120);
  assert(patch.energy === PLANTS[kind].capacity * 0.3 && !patch.stripped,
    `Dense bug browsing leaves a recovery reserve in ${kind}`);
}
for (const species of ["fly", "mosquito", "mouse", "ant"] as const) {
  const tree = { ...canopy };
  assert(grazePlant(tree, species, 1).eaten === 0 && tree.energy === canopy.energy,
    `${species} cannot harvest tree foliage`);
}
assert(grazePlant({ ...canopy }, "turtle", 1).removed === 4.5, "A turtle can still take a full browsing bite");
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
