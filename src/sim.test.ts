import {
  World,
  PLANTS,
  type PlantKind,
  evaluateBrain,
  lifeStage,
  growthScale,
  lifespan,
} from "./sim.ts";
import { traitChanges } from "./inspector.ts";
import { encodeSave, decodeSave } from "./save.ts";
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const w = new World(5);
const parent = w.animals[0];
const baby = w.addAnimal("grazer", parent);
assert(baby.parent === parent.id && baby.generation === 2, "Lineage inherited");
assert(
  baby.genes !== parent.genes && baby.genes.weights !== parent.genes.weights,
  "Genomes independent",
);
console.log("Simulation checks passed");

for (const kind of Object.keys(PLANTS) as PlantKind[]) {
  const island = new World(9);
  island.animals = [];
  island.plants = [];
  const parent = island.addPlant(undefined, -25, 15, kind)!;
  parent.age = PLANTS[kind].maturity + 1;
  parent.energy = PLANTS[kind].capacity;
  for (
    let tick = 0;
    tick < 600 && !island.plants.some((p) => p.parent === parent.id);
    tick++
  )
    island.step(0.1);
  const child = island.plants.find((p) => p.parent === parent.id);
  assert(
    child?.kind === kind && child.generation === 2,
    `${kind} must reproduce its own species`,
  );
  assert(child.growth !== parent.growth, `${kind} growth must mutate`);
  assert(
    parent.energy < PLANTS[kind].capacity,
    "Reproduction must cost energy",
  );
}
const original = new World(42);
for (let i = 0; i < 300; i++) original.step(0.1);
original.scarcity = true;
const raw = encodeSave({
  world: original,
  rate: 3,
  paused: true,
  selected: original.animals[0].id,
});
const restored = decodeSave(raw);
assert(
  restored.rate === 3 && restored.paused && restored.world.scarcity,
  "Session preferences restored",
);
assert(
  JSON.stringify(original) === JSON.stringify(restored.world),
  "Save must restore the entire world",
);
for (let i = 0; i < 100; i++) {
  original.step(0.1);
  restored.world.step(0.1);
}
assert(
  JSON.stringify(original) === JSON.stringify(restored.world),
  "Evolution continues identically after reload",
);
for (const broken of [
  "{",
  "{}",
  JSON.stringify({ ...JSON.parse(raw), version: 999 }),
  raw.replace('"kind":"grass"', '"kind":"unknown"'),
]) {
  let rejected = false;
  try {
    decodeSave(broken);
  } catch {
    rejected = true;
  }
  assert(rejected, "Invalid saves must be rejected");
}
console.log("Plant inheritance and save/restore checks passed");

const family = new World(99);
const founder = family.animals[0];
const offspring = family.addAnimal(founder.kind, founder);
const parentGenes = JSON.stringify(founder.genes);
founder.energy = 0;
family.step(0.1);
assert(
  !family.animals.some((a) => a.id === founder.id) &&
    family.deceased.some((a) => a.id === founder.id),
  "Dead parents remain in family history",
);
assert(
  JSON.stringify(family.deceased.find((a) => a.id === founder.id)!.genes) ===
    parentGenes,
  "Parent genome remains intact",
);
assert(
  traitChanges(offspring.genes, founder.genes).every(
    (r) => r.delta === offspring.genes[r.key] - founder.genes[r.key],
  ),
  "Trait differences use the actual parent",
);
const savedFamily = decodeSave(
  encodeSave({ world: family, rate: 1, paused: true, selected: founder.id }),
);
assert(
  savedFamily.world.deceased.some((a) => a.id === founder.id) &&
    savedFamily.world.animals.some((a) => a.parent === founder.id),
  "Saved dead parents remain linked to children",
);
const legacy = JSON.parse(
  encodeSave({ world: family, rate: 1, paused: true, selected: 0 }),
);
legacy.version = 1;
delete legacy.world.deceased;
const upgraded = decodeSave(JSON.stringify(legacy));
assert(
  upgraded.world.deceased.length === 0 &&
    upgraded.world.animals.length === family.animals.length,
  "Legacy saves migrate without inventing ancestors or losing live animals",
);
offspring.age = 0;
assert(
  lifeStage(offspring) === "Baby" && growthScale(offspring) === 0.4,
  "Newborn size and stage",
);
offspring.age = 8;
assert(
  lifeStage(offspring) === "Juvenile" &&
    growthScale(offspring) > 0.4 &&
    growthScale(offspring) < 1,
  "Juveniles visibly grow",
);
offspring.age = 15;
assert(
  lifeStage(offspring) === "Adult" && growthScale(offspring) === 1,
  "Adult maturity",
);
offspring.age = lifespan(offspring) * 0.8;
assert(
  lifeStage(offspring) === "Elder",
  "Elders identified by relative lifespan",
);
const genes = { ...offspring.genes, neurons: 2, weights: Array(16).fill(0) };
genes.weights[0] = 1;
genes.weights[6] = 1;
genes.weights[7] = -1;
const activity = evaluateBrain(genes, [1, 0, 0, 0, 0, 1]);
assert(
  activity.hidden[0] === Math.tanh(1) &&
    activity.outputs[0] === Math.tanh(Math.tanh(1)) &&
    activity.outputs[1] === -activity.outputs[0],
  "Brain diagram signals reflect actual network computation",
);
console.log(
  "Lineage history, legacy migration, trait comparison, brain signals and life stages passed",
);
