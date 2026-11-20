import type { Animal, Plant, PlantKind, Species } from "./model.ts";
import { isInsect, PLANTS } from "./species.ts";
import { grownBodySize } from "./biology.ts";

export type Food = Species | PlantKind | "worms" | "mushrooms" | "pond food" | "carrion" | "dead plants" | "older catch" | "eggs" | "blood" | "nectar" | "fruit juice";
export type FoodTotals = Partial<Record<Species, Partial<Record<Food, number>>>>;

// A compressed volume curve keeps larger catches valuable within the animal energy budget.
export function mealYield(prey: Animal, predator?: Animal) {
  const length = grownBodySize(prey);
  // Arachnid reserves are measured on the same 140-point scale as larger animals.
  // An insect of equal grown size supplies 100 points if the predator finishes it.
  if (isInsect(prey.species) && (predator?.species === "spider" || predator?.species === "scorpion")) {
    const relativeVolume = (length / grownBodySize(predator)) ** 3;
    return 140 * relativeVolume / (0.4 + relativeVolume);
  }
  const volume = length ** 3;
  return 140 * volume / (0.75 + volume);
}

export function ingest(totals: FoodTotals, animal: Animal, source: Food, energy: number) {
  const gained = Math.min(Math.max(0, 140 - animal.energy), Math.max(0, energy));
  if (!gained) return;
  animal.energy += gained;
  const diet = totals[animal.species] ??= {};
  diet[source] = (diet[source] ?? 0) + gained;
}

// Sparse patches offer little food per visit. Desperate animals still browse
// them, so prolonged grazing can exhaust the plant's remaining reserves.
export function worthBrowsing(plant: Plant, energy: number) {
  const threshold = energy < 30 ? 2 : PLANTS[plant.kind].capacity * 0.25;
  return !plant.stripped && plant.health > 0 && plant.energy > threshold;
}

function edibleMass(plant: Plant) {
  return Math.max(0, plant.energy - PLANTS[plant.kind].capacity * 0.12);
}

// Compare a short feeding visit, allowing for competitors already committed
// to the patch and time spent getting there.
export function browseValue(plant: Plant, distance: number, others: number) {
  const profile = PLANTS[plant.kind];
  const edible = edibleMass(plant);
  const share = edible * (plant.kind === "tree" ? 2 : 1.5) / (1 + others);
  const density = Math.min(1, 0.35 + edible / (profile.capacity * 0.35));
  const harvest = 18 * density / (1 + plant.defense * 4);
  return Math.min(share, harvest) * profile.nutrition /
    ((0.25 + distance) * (1 + others * 0.45));
}

// A tree's canopy represents more edible leaf material per plant-energy unit.
// A bug fills up at its ordinary pace while removing a smaller share of the tree.
export function grazePlant(plant: Plant, species: Species, dt: number) {
  // A mosquito fills its much smaller reserves with a sip. Charge that
  // volume against the plant even when only a partial meal remains.
  const leafDensity = species === "mosquito" ? 3 :
    species === "bug" && plant.kind === "tree" ? 25 / 3 :
    plant.kind === "tree" ? 2 : 1.5;
  const demand = dt * (species === "bug" ? 18 : 9) / (1 + plant.defense * 4);
  // Structural tissue and buds are not an edible meal. Sparse foliage also
  // takes longer to gather, even for an animal willing to visit the patch.
  const capacity = PLANTS[plant.kind].capacity;
  const edible = edibleMass(plant);
  const density = Math.min(1, 0.35 + edible / (capacity * 0.35));
  const removed = plant.stripped ? 0 : Math.min(edible, demand * density / leafDensity);
  if (removed >= edible) plant.stripped = true;
  plant.energy -= removed;
  return { removed, eaten: removed * leafDensity };
}
