import { maturityAge } from "./biology.ts";
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

const outbreak = island();
const illMother = adult(outbreak, "mouse", "female");
const healthyMate = adult(outbreak, "mouse", "male", 5);
illMother.infection = 0.8;
stepReproduction(outbreak, dry);
assert.equal(illMother.reproductive?.mate, undefined, "Severe illness delays courtship");
illMother.infection = 0.2;
stepReproduction(outbreak, dry);
assert.equal(illMother.reproductive?.mate, healthyMate.id, "Recovered animals can breed again");

for (const species of ["cat", "fox", "spider"] as const) {
  const pair = island();
  pair.time = 90;
  pair.weather.cloud = 0;
  const female = adult(pair, species, "female", -30);
  const male = adult(pair, species, "male", -26);
  for (const predator of [female, male])
    Object.assign(predator, { z: 25, age: 100, energy: 77, hydration: 100 });
  stepReproduction(pair, dry);
  assert.equal(female.reproductive?.target, male.id, "The female approaches a prospective mate");
  assert.equal(male.reproductive?.target, female.id, "The male approaches a prospective mate");
  pair.step(0.1);
  assert.equal(female.state, "Courting", "A receptive female can move toward her mate");
  assert.equal(male.state, "Courting", "A receptive male can move toward his mate");
}

for (const species of ["fish", "frog"] as const) {
  const pair = island();
  pair.time = 90;
  pair.weather.cloud = 0;
  const pond = pair.ponds[0];
  const female = adult(pair, species, "female", pond.x - 2);
  const male = adult(pair, species, "male", pond.x + 2);
  for (const animal of [female, male])
    Object.assign(animal, { z: pond.z, energy: 75, hydration: 100 });
  stepReproduction(pair, () => 1);
  assert.equal(female.reproductive?.target, male.id, "An aquatic breeder approaches a mate before reaching full reserves");
  assert.equal(male.reproductive?.target, female.id, "Both aquatic partners approach");
  pair.step(0.1);
  assert.equal(female.state, "Courting", "Foraging can yield to courtship when the female has reserves");
  assert.equal(male.state, "Courting", "Foraging can yield to courtship when the male has reserves");
}

const bugPatch = island();
const layer = adult(bugPatch, "bug", "female");
const partnerBug = adult(bugPatch, "bug", "male", 5);
layer.energy = 57;
partnerBug.energy = 24;
stepReproduction(bugPatch, dry);
assert.equal(layer.reproductive?.mate, undefined, "A bug must fund its clutch");
layer.energy = 58;
stepReproduction(bugPatch, dry);
assert.equal(layer.reproductive?.mate, partnerBug.id, "Male bug needs only its own courtship reserve");
bugPatch.time = layer.reproductive!.due!;
stepReproduction(bugPatch, dry);
assert.equal(bugPatch.eggsLaid, SPECIES.bug.clutchSize, "Energy-funded courtship produces a complete pod");
assert.equal(layer.energy, 26, "The egg layer still pays both reproductive costs");

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
const crowded = island();
const crowdedMother = adult(crowded, "mouse", "female");
crowdedMother.energy = 86;
for (let i = 0; i < 12; i++) adult(crowded, "mouse", "male", 5).cooldown = i ? 10 : 0;
stepReproduction(crowded, dry);
assert.equal(crowdedMother.reproductive?.mate, undefined, "Crowded mice need stronger reserves to breed");
crowded.animals = crowded.animals.slice(0, 2);
stepReproduction(crowded, dry);
check(crowdedMother.reproductive?.mate, "A well-fed mouse can breed once the patch clears");
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
for (let i = 0; i < 600 && grove.births < 2; i++) grove.step(0.1);
check(
  grove.animals.some((a) => a.species === "mouse" && a.otherParent),
  "First Grove can produce a two-parent mouse litter",
);

// Every species uses the same two-parent eligibility, with its own brood type.
for (const species of Object.keys(SPECIES) as Species[]) {
  const w = island();
  const a = adult(w, species, "female");
  if (species === "mosquito") a.mosquitoFed = true;
  a.genes.maturation = 1;
  a.age = maturityAge(a) + 1;
  a.genes.longevity = 1;
  stepReproduction(w, () => 1);
  assert.equal(
    w.births + w.eggs.length,
    0,
    species + " must not reproduce alone immediately",
  );
  const b = adult(w, species, "male", 5);
  b.genes.maturation = 1;
  b.age = maturityAge(b) + 1;
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
  if (species === "fish") assert.equal(young.length, 3, "Fish release a smaller clutch per spawn");
  const investment = species === "mosquito" || species === "fly" || species === "ant" || species === "fish" ? 14 :
    species === "spider" ? 16 : 32;
  assert.ok(a.energy <= 125 - investment); // Buried eggs can cost additional digging energy.
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

function developingSpiderEggs(neighborDistance: number) {
  const world = new World(7823);
  const mother = world.addAnimal("hunter", undefined, "spider");
  world.animals = [mother];
  world.eggs = [];
  for (let i = 0; i < 40; i++)
    world.animals.push({ ...mother, id: world.nextId++, x: mother.x + neighborDistance });
  world.layClutch(mother);
  return world.eggs.length;
}
check(developingSpiderEggs(1) < developingSpiderEggs(20),
  "Only nearby competitors reduce recruitment from the same seeded clutch");

for (const species of ["bug", "fly"] as const) {
  const habitat = island();
  habitat.plants = [];
  const layer = adult(habitat, species, "female", -30);
  layer.z = 25;
  habitat.random = () => 0.5;
  check(habitat.layClutch(layer) && habitat.eggs.length > 0,
    `A small ${species} population can still recruit`);
  habitat.eggs = [];
  for (let i = 0; i < 40; i++)
    habitat.animals.push({ ...layer, id: habitat.nextId++, x: layer.x + 1 });
  check(habitat.layClutch(layer) && habitat.eggs.length === 0,
    `A crowded ${species} patch with no food has strong recruitment pressure`);
}

for (const species of ["ant", "fly", "mosquito"] as const) {
  const insects = island();
  const female = adult(insects, species, "female");
  const male = adult(insects, species, "male");
  stepReproduction(insects, dry);
  if (species === "mosquito") {
    assert.equal(female.reproductive?.due, insects.time + 0.5, "Mosquitoes prepare their clutches promptly");
    insects.time = female.reproductive!.due!;
    stepReproduction(insects, dry);
    assert.equal(insects.eggsLaid, 0, "A paired mosquito waits for its first meal");
    female.mosquitoFed = true;
  }
  insects.time = female.reproductive!.due!;
  stepReproduction(insects, dry);
  const saved = restore(insects);
  const m = saved.animals.find(a => a.id === female.id)!;
  const f = saved.animals.find(a => a.id === male.id)!;
  f.x = -50;
  m.cooldown = 0;
  m.energy = 30;
  const laid = saved.eggsLaid;
  stepReproduction(saved, dry);
  assert.equal(m.reproductive?.mate, f.id, "Stored paternity survives a reload");
  saved.time = m.reproductive!.due!;
  stepReproduction(saved, dry);
  assert.equal(saved.eggsLaid - laid, species === "ant" ? 15 : SPECIES[species].clutchSize);
}

const spiders = island();
const firstMother = adult(spiders, "spider", "female");
const youngMate = adult(spiders, "spider", "male", 5);
for (const a of [firstMother, youngMate]) {
  a.age = maturityAge(a) - 0.1;
  a.energy = a === firstMother ? 42 : 32;
}
stepReproduction(spiders, dry);
assert.equal(firstMother.reproductive?.mate, undefined, "Juvenile spiders cannot mate");
for (const a of [firstMother, youngMate]) a.age += 0.2;
stepReproduction(spiders, dry);
assert.equal(firstMother.reproductive?.mate, youngMate.id, "Young adults mate with modest reserves");
assert.equal(firstMother.reproductive?.due, spiders.time + 2, "Young adults prepare their first clutch promptly");
spiders.time += 2;
stepReproduction(spiders, dry);
assert.equal(spiders.eggsLaid, SPECIES.spider.clutchSize);
assert.equal(firstMother.cooldown, 60, "Normal recovery follows an early clutch");
