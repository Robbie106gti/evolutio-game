import { FIRST_GROVE } from "./levels.ts";
import type { Animal, Species } from "./model.ts";
import {
  findMateNeighborhoods,
  reproductiveAdults,
  reproductiveSex,
  stepReproduction,
} from "./reproduction.ts";
import { decodeSave, encodeSave } from "./save.ts";
import { World, SPECIES } from "./sim.ts";

function check(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}
const assert = {
  equal(
    actual: unknown,
    expected: unknown,
    message = "Unexpected test result",
  ) {
    check(actual === expected, message + ": " + String(actual));
  },
  ok(condition: unknown) {
    check(condition, "Expected reproduction to meet the scenario conditions");
  },
  notEqual(actual: unknown, forbidden: unknown) {
    check(
      actual !== forbidden,
      "Genomes must not share the same weights array",
    );
  },
  deepEqual(
    actual: unknown,
    expected: unknown,
    message = "Expected matching traits",
  ) {
    check(JSON.stringify(actual) === JSON.stringify(expected), message);
  },
};

function island() {
  const world = new World(42, undefined, true);
  world.animals = [];
  world.deceased = [];
  return world;
}
function adult(world: World, species: Species, sex: Animal["sex"], x = 4) {
  const animal = world.addAnimal(SPECIES[species].kind, undefined, species);
  Object.assign(animal, { age: 55, cooldown: 0, energy: 125, sex, x, z: 6 });
  return animal;
}
const restore = (world: World) =>
  decodeSave(encodeSave({ world, rate: 1, paused: true, selected: 0 })).world;
const dry = () => 0;

const mice = island();
const mother = adult(mice, "mouse", "female");
const father = adult(mice, "mouse", "male", 5);
const rival = adult(mice, "mouse", "male", 5.5);
father.genes.size = 1.75;
rival.genes.size = 0.6;
mother.state = "Fleeing";
stepReproduction(mice, dry);
assert.equal(
  father.reproductive?.target,
  undefined,
  "Danger takes priority over courtship",
);
mother.state = "Foraging";
stepReproduction(mice, dry);
assert.equal(father.state, "Challenging rival");
assert.equal(rival.state, "Retreating from rival");
assert.ok(rival.energy < father.energy);
assert.equal(mice.births, 0);
mice.time = 1;
stepReproduction(mice, dry);
assert.equal(mother.reproductive?.mate, father.id);
assert.equal(mice.births, 0, "Pairing starts gestation");
// Saving mid-gestation and losing a mate must still preserve inherited parentage.
mice.animals = [mother, rival];
mice.deceased = [father];
const loaded = restore(mice);
assert.equal(loaded.naturalReproduction, true);
loaded.time = mother.reproductive!.due!;
stepReproduction(loaded, dry);
const pups = loaded.animals.filter((a) => a.parent === mother.id);
assert.ok(pups.length >= 2 && pups.length <= 3);
assert.equal(pups.length, loaded.births);
assert.ok(
  pups.every(
    (a) =>
      a.otherParent === father.id &&
      a.generation === 2 &&
      a.genes.weights.length === a.genes.neurons * 8,
  ),
);
assert.equal(
  restore(loaded).evolution.family.find((r) => r.id === pups[0].id)
    ?.otherParent,
  father.id,
);

const snakes = island();
const snake = adult(snakes, "snake", "female");
stepReproduction(snakes, dry);
snakes.time = 49;
stepReproduction(snakes, dry);
assert.equal(snakes.eggs.length, 0);
snakes.time = 50;
stepReproduction(snakes, dry);
assert.ok(snakes.eggs.length > 0);
for (const { embryo } of restore(snakes).eggs) {
  assert.equal(embryo.cloned, true);
  assert.deepEqual(embryo.genes, snake.genes);
  assert.notEqual(embryo.genes.weights, snake.genes.weights);
  assert.equal(reproductiveSex(embryo), "female");
}

const fish = island();
const larger = adult(fish, "fish", "female");
const smaller = adult(fish, "fish", "female", 6);
larger.genes.size = 1.4;
smaller.genes.size = 0.65;
stepReproduction(fish, () => 1);
fish.time = 24;
stepReproduction(fish, () => 1);
assert.equal(larger.reproductive?.transitionDue, 32);
assert.equal(reproductiveSex(larger), "female");
fish.time = 32;
stepReproduction(fish, () => 1);
assert.equal(reproductiveSex(larger), "male");
assert.equal(reproductiveSex(smaller), "female");
assert.equal(reproductiveSex(restore(fish).animals[0]), "male");

for (const warmth of [-70, 70]) {
  const turtles = island();
  const layer = adult(turtles, "turtle", "female", -18);
  const partner = adult(turtles, "turtle", "male", -17);
  turtles.layClutch(layer, 1, { mate: partner });
  const egg = turtles.eggs[0];
  egg.age = egg.duration - 0.05;
  egg.incubationHeat = warmth;
  const reloaded = restore(turtles);
  reloaded.random = () => 0.01;
  reloaded.step(0.1);
  const hatchling = reloaded.animals.find((a) => a.id === egg.embryo.id);
  check(
    hatchling,
    "A viable turtle egg hatches after restoring its incubation heat",
  );
  assert.equal(hatchling?.otherParent, partner.id);
  assert.equal(hatchling?.sex, warmth > 0 ? "female" : "male");
}

const serial = island();
adult(serial, "mouse", "female");
adult(serial, "mouse", "male");
const partitioned = restore(serial);
const adults = reproductiveAdults(partitioned.animals);
const neighbors = new Map([
  ...findMateNeighborhoods(adults, 0, 1),
  ...findMateNeighborhoods(adults, 1),
]);
stepReproduction(serial, dry);
stepReproduction(partitioned, dry, neighbors);
assert.deepEqual(
  partitioned.animals,
  serial.animals,
  "Partitioning mate searches does not reorder results",
);
console.log(
  "Courtship, rivalry, gestation recovery, clones, fish sex changes and deterministic helper results passed",
);

const grove = new World(undefined, FIRST_GROVE, true);
for (let i = 0; i < 400 && grove.births < 2; i++) grove.step(0.1);
check(
  grove.animals.some((a) => a.species === "mouse" && a.otherParent),
  "First Grove can produce a two-parent mouse litter",
);

// Every species uses the same two-parent eligibility, with its own brood type.
for (const species of Object.keys(SPECIES) as Species[]) {
  const w = island();
  const a = adult(w, species, "female");
  a.age = 100;
  a.genes.maturation = 1;
  a.genes.longevity = 1;
  stepReproduction(w, () => 1);
  assert.equal(
    w.births + w.eggs.length,
    0,
    species + " must not reproduce alone immediately",
  );
  const b = adult(w, species, "male", 5);
  b.age = 100;
  b.genes.maturation = 1;
  b.genes.longevity = 1;
  stepReproduction(w, () => 1);
  assert.equal(a.reproductive?.mate, b.id, species + " pairs");
  w.time = a.reproductive!.due!;
  stepReproduction(w, () => 1);
  const young = [...w.animals, ...w.eggs.map((e) => e.embryo)].filter(
    (c) => c.parent === a.id,
  );
  assert.ok(young.length > 0);
  assert.ok(young.every((c) => c.otherParent === b.id));
  assert.ok(a.energy <= 93); // At least 32 energy; buried eggs also cost digging energy.
}

const hungryPair = island();
const hungryMother = adult(hungryPair, "wolf", "female");
const hungryFather = adult(hungryPair, "wolf", "male", 5);
hungryMother.age = hungryFather.age = 100;
stepReproduction(hungryPair, dry);
check(hungryMother.reproductive?.mate, "Healthy wolves pair");
hungryPair.time = hungryMother.reproductive!.due!;
hungryMother.energy = 20;
stepReproduction(hungryPair, dry);
assert.equal(hungryPair.births, 0, "Energy-poor mothers delay delivery");
hungryMother.energy = 80;
stepReproduction(hungryPair, dry);
assert.ok(hungryPair.births > 0);
