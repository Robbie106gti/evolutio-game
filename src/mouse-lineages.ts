import type { Animal } from "./model.ts";
export const MOUSE_NICHES = [
  "plant eater",
  "small plant eater",
  "large plant eater",
  "omnivore",
  "hunter",
] as const;
export type MouseNiche = (typeof MOUSE_NICHES)[number];
export interface MouseLineage {
  id: number;
  parentId: number;
  originGeneration: number;
  niche: MouseNiche;
  candidate: MouseNiche;
  streak: number;
}
export function mouseNiche(a: Animal): MouseNiche {
  if (a.genes.dietAffinity >= 0.65) return "hunter";
  if (a.genes.dietAffinity >= 0.3) return "omnivore";
  return a.genes.size < 0.75
    ? "small plant eater"
    : a.genes.size > 1.25
      ? "large plant eater"
      : "plant eater";
}
export function inheritMouseLineage(
  a: Animal,
  parent?: Animal,
): MouseLineage | null {
  if (a.species !== "mouse") return null;
  const old = parent?.mouseLineage;
  const candidate = mouseNiche(a);
  if (!old)
    return {
      id: 0,
      parentId: 0,
      originGeneration: 1,
      niche: "plant eater",
      candidate,
      streak: 0,
    };
  const streak = candidate === old.candidate ? old.streak + 1 : 1;
  if (candidate !== old.niche && streak >= 3)
    return {
      id: a.id,
      parentId: old.id,
      originGeneration: a.generation,
      niche: candidate,
      candidate,
      streak: 0,
    };
  return { ...old, candidate, streak: Math.min(3, streak) };
}
export function eatsPlants(a: Animal) {
  return a.species !== "mouse" || a.genes.dietAffinity < 0.8;
}
export function plantEfficiency(a: Animal) {
  return a.species === "mouse" ? 1 - 0.75 * a.genes.dietAffinity : 1;
}
export function preyEfficiency(a: Animal) {
  return a.species === "mouse" ? 0.4 + 0.6 * a.genes.dietAffinity : 1;
}
