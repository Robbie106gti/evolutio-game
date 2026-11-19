import type { Animal, Plant } from "./model.ts";
import { maturityAge } from "./biology.ts";
// Pure genotype-to-appearance mappings: no random draws or hidden visual genes.
export function animalAppearance(a: Animal) {
  const juvenile = 1 - Math.min(1, a.age / maturityAge(a));
  const mammal = ["mouse", "cat", "fox", "wolf"].includes(a.species);
  return {
    head: 1 + juvenile * 0.22,
    coat: mammal ? 0.92 + a.genes.insulation * 0.22 : 1,
    eye: 0.85 + ((a.genes.eyesight - 0.5) / 1.7) * 0.3,
    ear: mammal ? 1.12 - a.genes.insulation * 0.22 : 1,
  };
}
export function plantAppearance(p: Plant) {
  return {
    crown: 1.12 - p.droughtTolerance * 0.24,
    trunk: 0.86 + p.defense * 0.35 + p.floodTolerance * 0.15,
  };
}
// A foot travels back along the ground during stance and lifts on its return.
export function footPose(phase: number, reach: number, lift: number) {
  return {
    x: -Math.cos(phase) * reach,
    y: Math.max(0, Math.sin(phase)) * lift,
  };
}
