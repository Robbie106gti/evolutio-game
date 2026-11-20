import { waterDepth } from "./ecology.ts";
import { introduceAnimals } from "./animal-introduction.ts";
import { applyIslandTool } from "./island-tools.ts";
import { World } from "./sim.ts";
import { landIndex } from "./terrain.ts";

function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

const world = new World(39);
world.animals = [];
world.plants = [];
world.ponds[0].water = 0;
world.random = () => 0;
introduceAnimals(world, "fish", 1);
const fish = world.animals[0];
const depth = (x: number, z: number) =>
  waterDepth(world.ponds, x, z, world.weather.land);
check(depth(fish.x, fish.z) > 0.1, "Fish founders skip drained ponds");
world.layClutch(fish, 2);
check(
  world.eggs.length === 2 &&
    world.eggs.every(({ embryo }) => depth(embryo.x, embryo.z) > 0.1),
  "Fish lay eggs in their current water, away from drained basins",
);

const forest = { x: -35, z: 25 };
const desert = { x: 34, z: -25 };
check(
  !world.addPlant(undefined, forest.x, forest.z, "bush", 2),
  "Manual plants cannot add a cactus in forest",
);
applyIslandTool(world, "plants", forest.x, forest.z, 1, 1, false, "bush", 2);
check(
  world.plants.length === 0,
  "The cactus brush respects the destination habitat",
);
const cactus = world.addPlant(undefined, desert.x, desert.z, "bush", 2);
check(cactus, "Cacti can be planted in desert");
check(
  !world.addPlant(cactus, forest.x, forest.z),
  "Cactus seeds cannot germinate in forest",
);
const berry = world.addPlant(undefined, forest.x, forest.z, "bush", 1);
check(berry, "Ordinary bushes can grow in forest");
const forestOffspring = world.addPlant(berry, forest.x + 1, forest.z);
check(
  forestOffspring?.variety === 1,
  "An unsuitable mutation cannot create a forest cactus",
);
world.seedBank = [{ ...cactus, ...forest, deposit: { time: 0 } }];
world.time = 25.9;
world.step(0.11);
check(
  world.seedBank.some((seed) => seed.id === cactus.id),
  "Cactus seeds dropped outside desert stay dormant",
);

const margin = new World(7823);
margin.animals = [];
margin.plants = [];
margin.dens = [];
for (const cell of margin.weather.land!) {
  Object.assign(cell, { grass: 0.65, forest: 0, moisture: 0 });
}
for (let i = 0; i < 14; i++) {
  const plant = margin.addPlant(undefined, desert.x + i * 0.05, desert.z, "bush", 2);
  check(plant, "Cacti can start on the dry grassland edge of the desert");
  Object.assign(plant, { age: 39.95, energy: 28 });
}
margin.weather.cloud = 0;
margin.step(0.1);
const sourcePatch = landIndex(desert.x, desert.z);
check(margin.seedBank.length > 0 &&
  margin.seedBank.every(seed => seed.deposit && landIndex(seed.x, seed.z) !== sourcePatch),
  "Crowded cacti drop seeds in other patches even before rain");
const dormantSeed = margin.seedBank[0];
margin.seedBank = [dormantSeed];
margin.plants = [];
margin.time = 27.95;
margin.step(0.1);
check(margin.seedBank.includes(dormantSeed), "A dry seed stays dormant");
for (const cell of margin.weather.land!) cell.moisture = 0.18;
margin.random = () => 0.5;
margin.time = 29.95;
margin.step(0.1);
check(margin.seedBank.length === 0 &&
  margin.plants.some(p => p.variety === 2 && p.x === dormantSeed.x && p.z === dormantSeed.z),
  "The same seed germinates on the grassland edge once its soil is damp");

for (const pond of world.ponds) pond.water = pond.flow = 0;
for (const cell of world.weather.land!)
  Object.assign(cell, { elevation: 5, surfaceWater: 0 });
world.animals = [];
let rejected = false;
try {
  introduceAnimals(world, "fish", 1);
} catch (error) {
  rejected =
    error instanceof Error && error.message.includes("No water deep enough");
}
check(
  rejected && world.animals.length === 0,
  "A dry island rejects fish introductions",
);
for (const egg of world.eggs) egg.age = egg.duration - 0.01;
world.step(0.1);
check(
  world.animals.length === 0 && world.eggsLost === 2,
  "Fish eggs that dry out at hatching produce no fish",
);

const frogWorld = new World(39);
frogWorld.animals = [];
frogWorld.plants = [];
const drained = frogWorld.ponds[0];
drained.water = drained.flow = 0;
const frog = frogWorld.addAnimal("hunter", undefined, "frog");
Object.assign(frog, { x: drained.x, z: drained.z });
frogWorld.random = () => 0;
check(frogWorld.layClutch(frog, 10) && frogWorld.eggs.length === 10,
  "A frog finds a suitable pond when the nearest one is drained");
const frogPatches = new Set<number>();
for (const { embryo } of frogWorld.eggs) {
  const depth = waterDepth(frogWorld.ponds, embryo.x, embryo.z, frogWorld.weather.land);
  check(depth >= 0.2 && depth <= 0.75, "Frog eggs are laid in shallow water");
  frogPatches.add(landIndex(embryo.x, embryo.z));
}
check(frogPatches.size > 1, "Frog clutches are spread across several shoreline patches");
for (const pond of frogWorld.ponds) pond.water = pond.flow = 0;
for (const cell of frogWorld.weather.land!)
  Object.assign(cell, { elevation: 5, surfaceWater: 0 });
check(!frogWorld.layClutch(frog, 10) && frogWorld.eggsLaid === 10,
  "Frogs postpone laying if no suitable pond edge remains");
for (const egg of frogWorld.eggs) egg.age = egg.duration - 0.01;
frogWorld.step(0.1);
check(frogWorld.births === 0 && frogWorld.eggsLost === 10,
  "Frog eggs that dry out at hatching produce no frogs");

const crabWorld = new World(39);
crabWorld.animals = [];
const crab = crabWorld.addAnimal("hunter", undefined, "crab");
check(crabWorld.layClutch(crab, 6) && crabWorld.eggs.length === 6, "A crab lays a full clutch");
check(crabWorld.eggs.every(({ embryo }) => {
  const depth = waterDepth(crabWorld.ponds, embryo.x, embryo.z, crabWorld.weather.land);
  return depth >= 0.12 && depth <= 0.65;
}), "Crab eggs hatch within reach of shoreline algae");

const feedingWorld = new World(91);
feedingWorld.animals = [];
feedingWorld.plants = [];
feedingWorld.weather.cloud = 0;
feedingWorld.time = 90.1;
feedingWorld.ponds[0].algae = 0;
const mother = feedingWorld.addAnimal("hunter", undefined, "frog");
Object.assign(mother, { x: -10.25, z: -5 });
feedingWorld.random = () => 0;
check(feedingWorld.layClutch(mother, 1), "The test starts with a viable frog egg");
const hatch = feedingWorld.eggs[0];
Object.assign(hatch.embryo, { x: -10.25, z: -5, angle: 0 });
hatch.age = hatch.duration - 0.01;
feedingWorld.animals = [];
const visibleInsect = feedingWorld.addAnimal("grazer", undefined, "bug");
Object.assign(visibleInsect, { x: -7.8, z: -5 });
for (const soil of feedingWorld.weather.land!) soil.worms = 0.04;
const shore = landIndex(-9, -5);
feedingWorld.weather.land![shore].worms = 0.4;
feedingWorld.step(0.1);
check(feedingWorld.animals.includes(hatch.embryo), "The frog hatches in shallow water");
check(hatch.embryo.state === "Seeking worms",
  "A hungry hatchling heads for the nearby food on the bank when an insect is visible");
for (let i = 0; i < 80 && !feedingWorld.foodTotals.frog?.worms; i++) feedingWorld.step(0.1);
check((feedingWorld.foodTotals.frog?.worms ?? 0) > 0 && feedingWorld.weather.land![shore].worms < 0.4,
  "The hatchling reaches the bank and feeds from the finite worm stock");

console.log("Fish, frog eggs, and cactus spawns respect their habitats");
