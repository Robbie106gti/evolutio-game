import { World } from "./sim.ts";
import { stepLandscape, waterDepth } from "./ecology.ts";
import { initialLandscape, landAt } from "./terrain.ts";
import { encodeSave, decodeSave } from "./save.ts";
function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
const dry = { moisture: 0, cloud: 0, raining: false, land: initialLandscape() };
const wet = { moisture: 1, cloud: 1, raining: true, land: initialLandscape() };
for (let t = 0; t < 1800; t++) {
  stepLandscape(0, 1, dry, []);
  stepLandscape(0, 1, wet, []);
}
assert(landAt(dry.land, 0, 0).grass < 0.1, "Long drought removes grass");
assert(
  landAt(wet.land, 0, 20).forest > landAt(dry.land, 0, 20).forest + 0.3,
  "Sustained rain supports woodland succession",
);
for (const c of [...dry.land, ...wet.land])
  assert(
    c.forest + c.grass <= 1.00001 && c.moisture >= 0 && c.moisture <= 1,
    "Bounded terrain state",
  );
const world = new World(21);
world.animals = [];
world.plants = [];
world.weather.land!.forEach((c) => {
  c.moisture = 0;
  c.forest = 0;
  c.grass = 0.1;
});
const plant = world.addPlant(undefined, -30, 25, "grass")!;
plant.health = 0.01;
world.step(0.1);
assert(
  world.plantDeaths.drought === 1 && !world.plants.length,
  "Drought kills stressed plants and records cause",
);
const swimmer = world.addAnimal("grazer", undefined, "mouse");
swimmer.x = world.ponds[0].x;
swimmer.z = world.ponds[0].z;
swimmer.oxygen = 0.01;
assert(
  waterDepth(world.ponds, swimmer.x, swimmer.z) > 1,
  "Lake centres are deep",
);
world.step(0.1);
assert(
  world.deathCounts.drowning === 1,
  "An animal without breath drowns in deep water",
);
const migrant = world.addAnimal("grazer", undefined, "mouse");
migrant.x = 0;
migrant.z = 25;
migrant.genes.preferredMoisture = 0.85;
migrant.hydration = 100;
migrant.energy = 80;
world.time = 0;
world.weather.cloud = 0;
world.weather.land!.forEach((c, i) => {
  c.moisture = (i % 12) / 11;
  c.fungus = 0;
});
world.step(0.1);
assert(
  migrant.state === "Seeking habitat" || migrant.state === "Seeking crossing",
  "Animals seek a more suitable habitat",
);
const baby = world.addAnimal("grazer", migrant);
for (const key of [
  "preferredMoisture",
  "immunity",
  "swimming",
  "droughtTolerance",
] as const)
  assert(
    Math.abs(baby.genes[key] - migrant.genes[key]) <= 0.121,
    "Adaptations mutate within bounded steps",
  );
const saved = encodeSave({
  world,
  paused: true,
  rate: 1,
  selected: migrant.id,
});
assert(
  JSON.stringify(decodeSave(saved).world) === JSON.stringify(world),
  "Landscape, disease and adaptation state round-trip exactly",
);
const bad = JSON.parse(saved);
bad.world.weather.land[0].moisture = 2;
let rejected = false;
try {
  decodeSave(JSON.stringify(bad));
} catch {
  rejected = true;
}
assert(rejected, "Reject corrupt landscape cells");
const old = JSON.parse(saved);
old.version = 5;
delete old.world.weather.land;
delete old.world.plantDeaths;
for (const a of [...old.world.animals, ...old.world.deceased]) {
  delete a.infection;
  delete a.oxygen;
  for (const key of [
    "preferredMoisture",
    "immunity",
    "swimming",
    "droughtTolerance",
  ])
    delete a.genes[key];
}
assert(
  decodeSave(JSON.stringify(old)).world.animals[0].genes.immunity === 0.5,
  "Legacy organisms gain neutral adaptations",
);
console.log(
  "Succession, plant drought, drowning, habitat seeking, adaptation inheritance and save validation passed",
);

const illness = new World(99);
illness.animals = [];
illness.plants = [];
illness.time = 0;
illness.weather.land!.forEach((c) => {
  c.moisture = 0.8;
  c.fungus = 1;
  c.litter = 1;
});
const susceptible = illness.addAnimal("grazer", undefined, "mouse"),
  resistant = illness.addAnimal("grazer", undefined, "mouse");
for (const a of [susceptible, resistant]) {
  a.x = -30;
  a.z = 25;
  a.hydration = 100;
  a.genes.speed = 0.5;
  a.genes.preferredMoisture = 0.8;
}
susceptible.genes.immunity = 0;
resistant.genes.immunity = 1;
illness.step(1);
assert(
  susceptible.infection > resistant.infection,
  "Immunity limits spore infection",
);
const illPlant = illness.addPlant(undefined, -30, 25, "tree")!;
illPlant.infection = 1;
illPlant.resistance = 0;
illPlant.health = 0.01;
illness.step(0.1);
assert(illness.plantDeaths.disease === 1, "Severe plant infection can kill");
const flooded = illness.addPlant(undefined, -30, 25, "grass")!;
flooded.x = illness.ponds[0].x;
flooded.z = illness.ponds[0].z;
flooded.health = 0.01;
illness.step(0.1);
assert(illness.plantDeaths.flooding === 1, "Flooding kills submerged plants");
console.log(
  "Spore infection, inherited immunity, plant disease and flooding passed",
);

const { snakeThermal } = await import("./ecology.ts");
const cold = snakeThermal(10, 10, 0, 0, 1),
  warm = snakeThermal(30, 30, 1, 0, 1);
assert(
  cold.speed < warm.speed &&
    cold.metabolism < warm.metabolism &&
    cold.water < warm.water,
  "Cold snakes move slowly and use less energy and water",
);
assert(
  snakeThermal(20, 20, 1, 0, 20).temperature >
    snakeThermal(20, 20, 1, 1, 20).temperature,
  "Sun exposure warms snakes more than shade",
);
const air = new World(10);
air.animals = [];
air.plants = [];
const raptor = air.addAnimal("hunter", undefined, "bird");
raptor.birdDiet = "raptor";
raptor.x = -30;
raptor.z = 25;
raptor.hydration = 100;
raptor.energy = 100;
for (let i = 0; i < 30; i++) air.step(0.1);
assert(raptor.altitude > 0.6, "Travelling birds take off");
const cat = air.addAnimal("hunter", undefined, "cat");
const { canHunt } = await import("./sim.ts");
assert(!canHunt(cat, raptor), "Airborne birds escape ground predators");
raptor.altitude = 0;
assert(canHunt(cat, raptor), "Landed birds remain vulnerable");
const insect = air.addAnimal("hunter", raptor);
insect.birdDiet = "insectivore";
insect.x = -30;
insect.z = 25;
insect.energy = 50;
insect.altitude = 0;
air.animals = [insect];
air.weather.land!.forEach((c) => {
  c.worms = 1;
  c.moisture = 0.7;
});
const before = insect.energy;
air.step(0.1);
assert(
  insect.energy > before && insect.state === "Foraging worms",
  "Landed insect eaters gain energy from worms",
);
assert(
  air.addAnimal("hunter", insect).birdDiet === "insectivore",
  "Bird roles are inherited",
);
const flyingSave = encodeSave({
  world: air,
  paused: true,
  rate: 1,
  selected: insect.id,
});
assert(
  decodeSave(flyingSave).world.animals[0].birdDiet === "insectivore",
  "Flight and role save round-trip",
);
console.log(
  "Snake thermoregulation, flight, airborne safety, worm feeding and inherited bird diets passed",
);

const nursery = new World(39);
nursery.animals = [];
nursery.plants = [];
const insectParent = nursery.addAnimal("grazer", undefined, "bug");
insectParent.x = -30;
insectParent.z = 25;
nursery.layClutch(insectParent, 8);
assert(
  nursery.eggs.length === 8 && nursery.animals.length === 1,
  "Bugs lay a clutch rather than instant babies",
);
assert(
  nursery.eggs.every(
    (e) => e.embryo.parent === insectParent.id && e.embryo.generation === 2,
  ),
  "Eggs preserve ancestry and inherited genomes",
);
const eggSave = encodeSave({
  world: nursery,
  rate: 1,
  paused: true,
  selected: insectParent.id,
});
assert(
  JSON.stringify(decodeSave(eggSave).world) === JSON.stringify(nursery),
  "Egg incubation persists exactly",
);
for (const e of nursery.eggs) e.age = e.duration - 0.01;
nursery.step(0.1);
assert(
  Number(nursery.eggs.length) === 0 && nursery.births + nursery.eggsLost === 8,
  "Hatching accounts for survivors and egg losses",
);
const aquaticWorld = new World(4);
aquaticWorld.animals = aquaticWorld.animals.filter((a) => a.species === "fish");
aquaticWorld.plants = [];
const fish = aquaticWorld.animals[0];
fish.energy = 50;
const startEnergy = fish.energy;
aquaticWorld.step(0.1);
assert(
  fish.energy > startEnergy && fish.oxygen === 100,
  "Fish feed and breathe in water",
);
fish.x = -35;
fish.z = 25;
fish.oxygen = 0.01;
aquaticWorld.step(0.1);
assert(
  aquaticWorld.deathCounts.stranding === 1,
  "Stranded fish can die out of water",
);
const { laysEggs } = await import("./sim.ts");
assert(
  !laysEggs("mouse") &&
    !laysEggs("cat") &&
    laysEggs("snake") &&
    laysEggs("frog"),
  "Reproductive strategies differ by species",
);
console.log(
  "Aquatic feeding, stranding, egg clutches, incubation, inheritance and save persistence passed",
);

function predationWithParent(nearby: boolean) {
  const w = new World(32);
  w.animals = [];
  w.plants = [];
  w.time = 0;
  const parent = w.addAnimal("grazer", undefined, "mouse"),
    baby = w.addAnimal("grazer", parent),
    hunter = w.addAnimal("hunter", undefined, "cat");
  for (const a of [parent, baby, hunter]) {
    a.z = 25;
    a.energy = 80;
    a.hydration = 100;
    a.cooldown = 1000;
    a.genes.weights.fill(0);
  }
  parent.x = nearby ? -28.5 : -10;
  parent.age = 30;
  baby.x = -30;
  baby.age = 1;
  hunter.x = -30.3;
  hunter.age = 30;
  hunter.energy = 50;
  w.step(0.1);
  return 80 - baby.energy;
}
assert(
  predationWithParent(true) < predationWithParent(false),
  "A nearby mammal parent reduces predation damage to its young",
);
console.log("Nearby parental protection reduces predation damage");

const { changingWeights, ROCKS } = await import("./terrain.ts");
const { ageAgility, ageVulnerability, lifespan } = await import("./sim.ts");
const desertWeather = {
  moisture: 0.9,
  cloud: 0.9,
  raining: true,
  land: initialLandscape(),
};
for (let t = 0; t < 1800; t++) stepLandscape(t, 1, desertWeather, []);
assert(
  changingWeights(desertWeather.land, 34, -25).desert > 0.5,
  "Arid core remains desert even under repeated wet weather",
);
const ageAnimal = new World(6).animals.find((a) => a.species === "mouse")!;
ageAnimal.age = 1;
const young = ageAgility(ageAnimal),
  youngRisk = ageVulnerability(ageAnimal);
ageAnimal.age = 40;
const adult = ageAgility(ageAnimal),
  adultRisk = ageVulnerability(ageAnimal);
ageAnimal.age = lifespan(ageAnimal) * 0.95;
assert(
  adult > young && adult > ageAgility(ageAnimal) && youngRisk > adultRisk,
  "Adults are more agile and harder to catch than young or elders",
);
const nests = new World(2);
nests.animals = [];
const snake = nests.addAnimal("hunter", undefined, "snake");
snake.x = ROCKS[0].x;
snake.z = ROCKS[0].z;
nests.layClutch(snake, 6);
assert(
  nests.eggs.every((e) => e.concealment > 0.3) && snake.nesting > 0,
  "Snakes conceal their clutch and spend time nesting",
);
assert(
  JSON.stringify(
    decodeSave(
      encodeSave({ world: nests, rate: 1, paused: true, selected: snake.id }),
    ).world,
  ) === JSON.stringify(nests),
  "Concealed nests save exactly",
);
console.log(
  "Persistent arid regions, age vulnerability and concealed snake nests passed",
);
