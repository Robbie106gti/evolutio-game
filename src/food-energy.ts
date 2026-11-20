import type { Animal, Plant, PlantKind, Species } from "./model.ts";
import { isInsect } from "./species.ts";
import { grownBodySize } from "./biology.ts";

export type Food = Species | PlantKind | "worms" | "mushrooms" | "pond food" | "carrion" | "dead plants" | "older catch";
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

// A tree's canopy represents more edible leaf material per plant-energy unit.
// A bug fills up at its ordinary pace while removing a smaller share of the tree.
export function grazePlant(plant: Plant, species: Species, dt: number) {
  const leafDensity = species === "bug" && plant.kind === "tree" ? 25 / 3 : 1;
  const demand = dt * (species === "bug" ? 18 : 9) / (1 + plant.defense * 4);
  const removed = Math.min(Math.max(0, plant.energy), demand / leafDensity);
  plant.energy -= removed;
  return { removed, eaten: removed * leafDensity };
}
