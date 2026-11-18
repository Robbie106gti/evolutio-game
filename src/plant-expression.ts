import type { Plant } from "./model.ts";
export const PLANT_EXPRESSION_TRAITS = [
  "droughtTolerance",
  "floodTolerance",
] as const;
export type PlantExpression = Record<
  (typeof PLANT_EXPRESSION_TRAITS)[number],
  number
>;
export function plantExpressionMarks(
  parent?: PlantExpression,
): PlantExpression {
  return {
    droughtTolerance: (parent?.droughtTolerance ?? 0) * 0.35,
    floodTolerance: (parent?.floodTolerance ?? 0) * 0.35,
  };
}
export function updatePlantExpression(
  p: Plant,
  dt: number,
  moisture: number,
  depth: number,
) {
  // Exposure, not damage: a tolerant plant still uses its protection.
  const drought = Math.max(0, Math.min(1, (0.22 - moisture) / 0.22));
  const flood = Math.max(0, Math.min(1, depth / 0.5));
  for (const key of PLANT_EXPRESSION_TRAITS) {
    const target = key === "droughtTolerance" ? drought : flood;
    p.expression[key] +=
      (target - p.expression[key]) *
      -Math.expm1(-dt / (target > p.expression[key] ? 30 : 90));
  }
}
export function retainPlantTraits(
  child: Plant,
  parent: Plant,
  random: () => number,
) {
  for (const key of PLANT_EXPRESSION_TRAITS)
    if (parent.expression[key] > 0 && random() < parent.expression[key] * 0.6)
      child[key] = parent[key];
}
