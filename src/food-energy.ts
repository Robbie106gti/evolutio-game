import type { Animal, Plant, PlantKind, Species } from "./model.ts";
import { isFlyingInsect, isInsect, PLANTS, SPECIES } from "./species.ts";
import { clamp, grownBodySize } from "./biology.ts";
import { plantEfficiency } from "./mouse-lineages.ts";

export const SEED_FOOD = {
  grass: { label: "grass seeds", capacity: 6, rate: 0.32 },
  bush: { label: "bush seeds", capacity: 10, rate: 0.26 },
  tree: { label: "tree seeds", capacity: 14, rate: 0.22 },
} as const satisfies Record<PlantKind, { label: string; capacity: number; rate: number }>;

type SeedFood = (typeof SEED_FOOD)[PlantKind]["label"];
const MOUSE_SEED_HARVEST = 4.5;
const SEED_NUTRITION = 1.4;
export type Food = Species | PlantKind | SeedFood | "worms" | "mushrooms" | "pond food" | "algae" | "carrion" | "dead plants" | "older catch" | "eggs" | "blood" | "nectar" | "fruit juice" | "sap";
export type FoodTotals = Partial<Record<Species, Partial<Record<Food, number>>>>;
export type TreeBrowseDamage = Partial<Record<Species, number>>;
export const ANIMAL_ENERGY_CAPACITY = 140;

export function energyPercent(energy: number, capacity = ANIMAL_ENERGY_CAPACITY) {
  return capacity > 0 ? Math.round(clamp(energy / capacity, 0, 1) * 100) : 0;
}

// A compressed volume curve keeps larger catches valuable within the animal energy budget.
export function mealYield(prey: Animal, predator?: Animal) {
  const length = grownBodySize(prey);
  // Arachnid reserves use the same scale as larger animals.
  // An insect of equal grown size supplies 100 points if the predator finishes it.
  if (isInsect(prey.species) && (predator?.species === "spider" || predator?.species === "scorpion")) {
    const relativeVolume = (length / grownBodySize(predator)) ** 3;
    return ANIMAL_ENERGY_CAPACITY * relativeVolume / (0.4 + relativeVolume);
  }
  if (predator?.species === "bird" && prey.species === "frog") {
    const relativeVolume = (length / grownBodySize(predator)) ** 3;
    return ANIMAL_ENERGY_CAPACITY * relativeVolume / (0.35 + relativeVolume);
  }
  const volume = length ** 3;
  return ANIMAL_ENERGY_CAPACITY * volume / (0.75 + volume);
}

export function ingest(totals: FoodTotals, animal: Animal, source: Food, energy: number) {
  const gained = Math.min(Math.max(0, ANIMAL_ENERGY_CAPACITY - animal.energy), Math.max(0, energy));
  if (!gained) return;
  animal.energy += gained;
  const diet = totals[animal.species] ??= {};
  diet[source] = (diet[source] ?? 0) + gained;
}

export function foliageEnergy(animal: Animal, plant: Plant, eaten: number) {
  return eaten * PLANTS[plant.kind].nutrition * plantEfficiency(animal) *
    (animal.species === "bug" ? 0.7 : 1);
}

function availableSeeds(plant: Plant) {
  if (plant.health <= 0) return 0;
  // Older islands start with a small seed crop on mature, productive plants.
  return plant.seedFood ?? (plant.age >= PLANTS[plant.kind].maturity && !plant.stripped && plant.energy > 0
    ? SEED_FOOD[plant.kind].capacity * 0.5 : 0);
}

export function growSeedFood(plant: Plant, dt: number) {
  const profile = PLANTS[plant.kind];
  if (plant.health <= 0 || plant.age < profile.maturity) return;
  const seeds = SEED_FOOD[plant.kind];
  const productivity = plant.stripped ? 0 : plant.health / 100 * plant.energy / profile.capacity;
  // Only time since maturity contributes to this crop.
  const productiveTime = Math.min(dt, plant.age - profile.maturity);
  plant.seedFood = Math.min(seeds.capacity, availableSeeds(plant) + productiveTime * seeds.rate * productivity);
}

export const MAX_PLANT_LIQUID = 3;

function plantLiquid(plant: Plant) {
  if (plant.kind === "tree") return "sap";
  if (plant.kind === "grass" && plant.variety === 2) return "nectar";
  if (plant.kind === "bush" && plant.variety === 1 && plant.age >= PLANTS.bush.maturity)
    return "fruit juice";
}

function drinksPlantLiquid(species?: Species) {
  return species !== undefined && isFlyingInsect(species);
}

function liquidSource(plant: Plant, species?: Species) {
  if (species !== "ant" && !drinksPlantLiquid(species)) return;
  const liquid = plantLiquid(plant);
  if (liquid === "sap") return species === "ant" ? liquid : undefined;
  if (species !== "ant" && (liquid === "fruit juice" || species === "mosquito")) return liquid;
}

function availableLiquid(plant: Plant) {
  return plant.health > 0 ? (plant.liquidFood ?? (plant.energy > 0 ? 1 : 0)) : 0;
}

export function growPlantLiquid(plant: Plant, dt: number) {
  if (!plantLiquid(plant) || plant.health <= 0) return;
  const productivity = plant.health / 100 * plant.energy / PLANTS[plant.kind].capacity;
  plant.liquidFood = Math.min(MAX_PLANT_LIQUID, availableLiquid(plant) + dt * 0.08 * productivity);
}

// A worker packs a finite load directly from the patch. Seeds and ripe
// liquids can be collected without stripping foliage from the plant.
export function antCropAvailable(p: Plant) {
  return p.health > 0 && (availableSeeds(p) > 0.05 ||
    (!!plantLiquid(p) && availableLiquid(p) > 0.05) || worthBrowsing(p, 45, "ant"));
}

export function gatherAntCrop(p: Plant, ant: Animal, damage: TreeBrowseDamage): { source: Food; energy: number } {
  const liquid = plantLiquid(p);
  if (liquid && availableLiquid(p) > 0.05) {
    const amount = Math.min(2, availableLiquid(p));
    p.liquidFood = availableLiquid(p) - amount;
    return { source: liquid, energy: amount * 5 };
  }
  const seeds = availableSeeds(p);
  if (seeds > 0.05) {
    const amount = Math.min(4, seeds);
    p.seedFood = seeds - amount;
    return { source: SEED_FOOD[p.kind].label, energy: amount * SEED_NUTRITION };
  }
  const bite = grazePlant(p, "ant", 1);
  if (p.kind === "tree" && bite.removed) damage.ant = (damage.ant ?? 0) + bite.removed;
  return { source: p.kind, energy: foliageEnergy(ant, p, bite.eaten) };
}

export function harvestPlant(plant: Plant, animal: Animal, dt: number, treeDamage?: TreeBrowseDamage) {
  const { species } = animal;
  if (liquidSource(plant, species)) {
    const stock = availableLiquid(plant);
    const eaten = Math.min(stock, dt * 1.5);
    if (eaten > 0) plant.liquidFood = stock - eaten;
    return { removed: 0, eaten };
  }
  if (species !== "mouse") {
    const treeInsect = plant.kind === "tree" && species === "bug";
    const biteSize = treeInsect ? clamp((grownBodySize(animal) / SPECIES[species].size) ** 3, 0.12, 1.35) : 1;
    const bite = grazePlant(plant, species, dt, biteSize);
    if (treeDamage && plant.kind === "tree" && bite.removed > 0)
      treeDamage[species] = (treeDamage[species] ?? 0) + bite.removed;
    return bite;
  }
  const seeds = availableSeeds(plant);
  const eaten = Math.min(seeds, dt * MOUSE_SEED_HARVEST);
  if (eaten > 0) plant.seedFood = seeds - eaten;
  return { removed: 0, eaten };
}

export function ingestPlantFood(totals: FoodTotals, animal: Animal, plant: Plant, bite: number) {
  if (animal.species === "mouse") {
    ingest(totals, animal, SEED_FOOD[plant.kind].label, bite * SEED_NUTRITION * plantEfficiency(animal));
    return;
  }
  const liquid = liquidSource(plant, animal.species);
  ingest(totals, animal, liquid ?? plant.kind, liquid ? bite * 5 : foliageEnergy(animal, plant, bite));
  animal.hydration = Math.min(100, animal.hydration + bite * 0.3);
}

// Sparse patches offer little food per visit. Desperate animals still browse
// them, so prolonged grazing can exhaust the plant's remaining reserves.
export function worthBrowsing(plant: Plant, energy: number, species?: Species) {
  if (species === "mouse") return availableSeeds(plant) >= (energy < 30 ? 0.03 : 0.25);
  if (liquidSource(plant, species)) return availableLiquid(plant) > 0.002;
  const threshold = energy < 30 ? 2 : PLANTS[plant.kind].capacity * 0.25;
  return !plant.stripped && plant.health > 0 &&
    plant.energy > Math.max(threshold, browseFloor(plant, species)) && hasPlantFood(plant, species);
}

function hasPlantFood(plant: Plant, species?: Species) {
  return !drinksPlantLiquid(species) && !(plant.kind === "tree" && species === "ant");
}

function browseFloor(plant: Plant, species?: Species) {
  const reserve = plant.kind === "tree" && species === "bug" ? 0.5 :
    species === "bug" ? 0.3 : 0.12;
  return PLANTS[plant.kind].capacity * reserve;
}

// Compare a short feeding visit, allowing for competitors already committed
// to the patch and time spent getting there.
export function browseValue(plant: Plant, distance: number, others: number, species?: Species) {
  if (species === "mouse") {
    return Math.min(MOUSE_SEED_HARVEST, availableSeeds(plant) / (1 + others)) * SEED_NUTRITION /
      ((0.25 + distance) * (1 + others * 0.45));
  }
  if (liquidSource(plant, species)) {
    return Math.min(1.5, availableLiquid(plant) / (1 + others)) * 5 /
      ((0.25 + distance) * (1 + others * 0.45));
  }
  const profile = PLANTS[plant.kind];
  const edible = Math.max(0, plant.energy - browseFloor(plant, species));
  const share = edible * (plant.kind === "tree" ? 2 : 1.5) / (1 + others);
  const density = Math.min(1, 0.35 + edible / (profile.capacity * 0.35));
  const harvest = 18 * density / (1 + plant.defense * 4);
  return Math.min(share, harvest) * profile.nutrition /
    ((0.25 + distance) * (1 + others * 0.45));
}

// A tree's canopy represents more edible leaf material per plant-energy unit.
// A bug fills up at its ordinary pace while removing a smaller share of the tree.
export function grazePlant(plant: Plant, species: Species, dt: number, biteSize = 1) {
  if (species === "mouse") return { removed: 0, eaten: 0 };
  const floor = browseFloor(plant, species);
  const edible = plant.energy - floor;
  if (plant.stripped || edible <= 0 || !hasPlantFood(plant, species)) return { removed: 0, eaten: 0 };
  const leafDensity = plant.kind === "tree" ? (species === "bug" ? 18 : 2) : 1.5;
  const demand = dt * (species === "bug" ? 18 : 9) / (1 + plant.defense * 4);
  // Structural tissue and buds are not an edible meal. Sparse foliage also
  // takes longer to gather, even for an animal willing to visit the patch.
  const capacity = PLANTS[plant.kind].capacity;
  const density = Math.min(1, 0.35 + edible / (capacity * 0.35));
  // Larger bodies take more tissue to gain the same share of their reserves.
  const removed = Math.min(edible, demand * density * biteSize / leafDensity);
  if (removed === edible) {
    plant.energy = floor;
    if (floor === browseFloor(plant)) plant.stripped = true;
  } else plant.energy -= removed;
  return { removed, eaten: removed * leafDensity / biteSize };
}
