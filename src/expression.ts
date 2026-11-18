import type { Animal, Genes } from "./model.ts";

export const EXPRESSED_TRAITS = [
  "speed",
  "endurance",
  "digging",
  "waterproofing",
  "insulation",
  "immunity",
] as const;
export type ExpressedTrait = (typeof EXPRESSED_TRAITS)[number];
export type Expression = Record<ExpressedTrait, number>;
export function expressionMarks(parent?: Expression): Expression {
  return Object.fromEntries(
    EXPRESSED_TRAITS.map((key) => [key, (parent?.[key] ?? 0) * 0.35]),
  ) as Expression;
}
// A recent-use memory, not a change to the animal's DNA. Rates use elapsed
// simulation time so resting animals and accelerated runs obey the same rules.
export function updateExpression(a: Animal, dt: number, temperature: number) {
  const running = a.state === "Sprinting" || a.state === "Fleeing";
  const active =
    running ||
    a.state === "Hunting" ||
    a.state === "Exploring" ||
    a.state === "Foraging";
  const used: Expression = {
    speed: running ? 1 : 0,
    endurance: active ? 1 : 0,
    digging: a.state === "Digging" || a.state === "Burying eggs" ? 1 : 0,
    waterproofing: a.wetness,
    insulation: Math.max(0, Math.min(1, (18 - temperature) / 18)),
    immunity: a.infection,
  };
  for (const key of EXPRESSED_TRAITS) {
    const target = used[key];
    const blend = -Math.expm1(-dt / (target > a.expression[key] ? 30 : 90));
    a.expression[key] += (target - a.expression[key]) * blend;
  }
}
// All traits already inherit from one parent. Usage increases the chance of
// retaining the parent's exact allele instead of its newly mutated candidate.
// Never boost values: existing energy/size/weather trade-offs still apply.
export function retainExpressedGenes(
  child: Genes,
  parent: Animal,
  random: () => number,
) {
  for (const key of EXPRESSED_TRAITS)
    if (parent.expression[key] > 0 && random() < parent.expression[key] * 0.6)
      child[key] = parent.genes[key];
}
