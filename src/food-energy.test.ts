import { World } from "./sim.ts";
import { browseValue, energyPercent, growSeedFood, growPlantLiquid, harvestPlant, ingestPlantFood, ingest, mealYield, SEED_FOOD, worthBrowsing } from "./food-energy.ts";
import { maturityAge } from "./biology.ts";
import { decodeSave, encodeSave } from "./save.ts";
import { PLANTS } from "./species.ts";
import { landAt } from "./terrain.ts";
import { stepApproximateAnimals } from "./approximate.ts";

const world = new World(91);
if (energyPercent(70) !== 50 || energyPercent(2_500, 5_000) !== 50 ||
    energyPercent(50, 100) !== 50 || energyPercent(0, 0) !== 0)
  throw Error("Energy percentages follow each reserve's capacity");
const mouse = world.animals.find(a => a.species === "mouse")!;
const cat = world.animals.find(a => a.species === "cat")!;
mouse.age = 0;
const newborn = mealYield(mouse);
mouse.age = maturityAge(mouse);
const adult = mealYield(mouse);
mouse.genes.size *= 1.05;
if (!(newborn < adult && adult < mealYield(mouse))) throw Error("Meal yield must follow grown body size");
cat.energy = 137;
ingest(world.foodTotals, cat, "mouse", adult);
if (world.foodTotals.cat?.mouse !== 3 || cat.energy !== 140) throw Error("Count only ingested energy");
const raw = encodeSave({world, rate: 1, paused: true, selected: 0});
if (decodeSave(raw).world.foodTotals.cat?.mouse !== 3) throw Error("Meal history lost");
console.log("Prey age, inherited size, intake capacity and saved diet totals passed");

const patch = { ...world.plants[0], kind: "grass" as const, energy: 30 };
const value = browseValue(patch, 1, 0);
if (value <= browseValue({ ...patch, energy: 5 }, 1, 0) ||
    value <= browseValue(patch, 2, 0) || value <= browseValue(patch, 1, 2))
  throw Error("Food remaining, travel distance and other visitors must affect patch choice");

for (const kind of ["grass", "bush", "tree"] as const) {
  const plant = { ...patch, kind, energy: PLANTS[kind].capacity, age: 0, seedFood: 0 };
  growSeedFood(plant, 60);
  if (worthBrowsing(plant, 15, "mouse")) throw Error("Seedlings cannot feed mice");
  plant.age = PLANTS[kind].maturity + 120;
  growSeedFood(plant, 120);
  const bite = harvestPlant(plant, mouse, 30);
  if (bite.eaten !== SEED_FOOD[kind].capacity || bite.removed !== 0 ||
      plant.energy !== PLANTS[kind].capacity || worthBrowsing(plant, 15, "mouse"))
    throw Error(`Mice can exhaust the seed crop without grazing ${kind}`);
  growSeedFood(plant, 0.1);
  if (!(plant.seedFood > 0 && plant.seedFood < 1)) throw Error("Seed crops replenish gradually");
}

const insect = world.animals.find(a => a.species === "bug")!;
const tree = { ...patch, kind: "tree" as const, energy: PLANTS.tree.capacity, defense: 0 };
insect.age = 0;
const smallBite = harvestPlant({ ...tree }, insect, 1, world.treeBrowseDamage);
insect.age = maturityAge(insect);
const adultBite = harvestPlant({ ...tree }, insect, 1, world.treeBrowseDamage);
harvestPlant({ ...tree }, mouse, 1, world.treeBrowseDamage);
if (!(smallBite.removed < adultBite.removed) ||
    Math.abs(smallBite.eaten - adultBite.eaten) > 1e-9 ||
    world.treeBrowseDamage.bug !== smallBite.removed + adultBite.removed || world.treeBrowseDamage.mouse !== undefined)
  throw Error("Tree damage scales with insect size and tracks tissue loss only");
const treeSave = encodeSave({ world, rate: 1, paused: true, selected: 0 });
if (decodeSave(treeSave).world.treeBrowseDamage.bug !== world.treeBrowseDamage.bug)
  throw Error("Tree browsing history must survive a save");

for (const [kind, variety, species, food] of [
  ["tree", 0, "ant", "sap"],
  ["grass", 2, "mosquito", "nectar"],
  ["bush", 1, "fly", "fruit juice"],
] as const) {
  const plant = { ...patch, kind, variety, age: 50, liquidFood: 0.5 };
  const drinker = world.animals.find(a => a.species === species)!;
  drinker.energy = 40;
  const sip = harvestPlant(plant, drinker, 1, world.treeBrowseDamage);
  ingestPlantFood(world.foodTotals, drinker, plant, sip.eaten);
  if (sip.removed !== 0 || plant.energy !== patch.energy || plant.liquidFood !== 0 ||
      worthBrowsing(plant, 40, species) || !world.foodTotals[species]?.[food] || world.treeBrowseDamage[species])
    throw Error(`Drinking ${food} depletes its separate supply without damaging the plant`);
  growPlantLiquid(plant, 1);
  if (!worthBrowsing(plant, 40, species)) throw Error(`${food} supply should recover on a healthy plant`);
}

for (const approximate of [false, true]) {
  const w = new World(63);
  w.animals = [];
  w.plants = [];
  w.dens = [];
  const a = w.addAnimal("grazer", undefined, "mouse");
  Object.assign(a, { x: -30, z: 25, age: 40, energy: 30, hydration: 100, cooldown: 100 });
  a.genes.dietAffinity = 0;
  const plant = w.addPlant(undefined, -29.8, 25, "grass")!;
  const soil = landAt(w.weather.land, a.x, a.z);
  soil.fungus = 0.9;
  if (approximate) w.random = () => 0;
  const step = () => approximate ? stepApproximateAnimals(w, 0.1, () => 0) : w.step(0.1);
  step();
  if (w.foodTotals.mouse) throw Error("Mice cannot eat immature grass or mushrooms");

  Object.assign(a, { x: -30, z: 25, nextSenseAt: 0 });
  Object.assign(plant, { age: 10, seedFood: 3 });
  step();
  const seedEnergy = w.foodTotals.mouse?.["grass seeds"];
  if (!seedEnergy || Object.keys(w.foodTotals.mouse ?? {}).length !== 1 || plant.seedFood! >= 3)
    throw Error("Mice should eat and record only the grass seeds");
  const save = encodeSave({ world: w, rate: 1, paused: true, selected: 0 });
  const savedWorld = decodeSave(save).world;
  if (savedWorld.foodTotals.mouse?.["grass seeds"] !== seedEnergy || savedWorld.plants[0].seedFood !== plant.seedFood)
    throw Error("Seed stocks and diet totals must survive a save");
}
console.log("Finite seed crops, mouse diet in both modes, and saved seed stocks passed");
