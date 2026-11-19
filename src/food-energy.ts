import type { Animal, PlantKind, Species } from "./model.ts";
import { grownBodySize } from "./biology.ts";

export type Food = Species | PlantKind | "worms" | "mushrooms" | "pond food" | "carrion" | "dead plants" | "older catch";
export type FoodTotals = Partial<Record<Species, Partial<Record<Food, number>>>>;

// A compressed volume curve keeps larger catches valuable within the animal energy budget.
export function mealYield(prey: Animal) {
  const length = grownBodySize(prey);
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
