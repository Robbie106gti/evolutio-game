import type { Animal, Plant } from "./model.ts";
import { PLANTS, PLANT_PROFILES } from "./species.ts";
const still = new Set([
  "Eating",
  "Resting",
  "Waiting in ambush",
  "Sleeping",
  "In nest",
  "In den",
  "Guarding brood",
  "Guarding young",
  "Feeding young",
  "Recovering",
  "Feeding on catch",
  "Drinking",
  "Digging",
  "Burying eggs",
  "Preparing nursery",
  "Sheltering",
  "Basking",
  "Drying on sunny rock",
  "Drying in shelter",
  "Waiting at hill",
  "Eating at hill",
  "Eating remains",
  "Eating mushrooms",
  "Foraging worms",
  "Aquatic feeding",
]);
export function animalPose(a: Animal) {
  const beat = a.age * 7 * a.genes.cadence + a.id;
  const phase =
    (a.distance * 7 * a.genes.cadence) / Math.max(0.6, a.genes.stride) + a.id;
  const digging =
    a.state === "Digging" ||
    a.state === "Burying eggs" ||
    a.state === "Preparing nursery";
  const drinking = a.state === "Drinking";
  const eating = [
    "Eating",
    "Eating remains",
    "Eating mushrooms",
    "Foraging worms",
    "Feeding on catch",
    "Aquatic feeding",
  ].includes(a.state);
  const stalking = a.state === "Stalking";
  const sprinting = a.state === "Sprinting" || a.state === "Fleeing";
  const moving = !still.has(a.state) || (a.species === "fish" && a.state === "Aquatic feeding");
  const frogHop =
    a.species === "frog" &&
    moving &&
    !["Crossing river", "Escaping water"].includes(a.state)
      ? Math.max(0, Math.sin(phase))
      : 0;
  const low = stalking || digging || a.state === "Sheltering";
  return {
    beat,
    phase,
    moving,
    digging,
    drinking,
    eating,
    stalking,
    sprinting,
    frogHop,
    crouch: low ? 0.76 : 1,
    pitch: drinking
      ? -0.12
      : eating
        ? -0.06 + Math.sin(beat) * 0.025
        : digging
          ? -0.1 + Math.sin(beat) * 0.04
          : sprinting
            ? Math.sin(phase * 2) * 0.035
            : 0,
    headDip: drinking
      ? 0.23
      : eating
        ? 0.12 + Math.sin(beat) * 0.035
        : stalking
          ? 0.1
          : 0,
    hop:
      frogHop * 0.38 * a.genes.limbs +
      (sprinting && a.species !== "snake" && a.species !== "fish"
        ? Math.abs(Math.sin(phase)) * 0.035
        : 0),
    reach: stalking ? 0.55 : sprinting ? 1.35 : 1,
  };
}
export function plantLifeVisuals(p: Plant) {
  const maturity = Math.min(1, Math.max(0, p.age) / PLANTS[p.kind].maturity);
  const herb = p.kind === "grass";
  const size = herb
    ? 0.18 + 0.82 * maturity
    : 0.22 + 0.78 * Math.sqrt(maturity);
  const damage = 1 - Math.max(0, Math.min(1, p.health / 100));
  const lifespanFraction = p.age * (0.6 + p.growth * 0.3) / PLANT_PROFILES[p.kind][p.variety].lifespan;
  const aging = Math.max(0, Math.min(1, (lifespanFraction - 0.68) / 0.32));
  const woodyCanopy = !herb && !(p.kind === "bush" && p.variety === 2);
  const drought = p.expression.droughtTolerance * (0.2 + damage * 0.8);
  const flooding = p.expression.floodTolerance * (0.2 + damage * 0.8);
  return {
    size,
    newGrowth: herb ? 1 - maturity : 0,
    lifespanFraction,
    aging,
    damage,
    wilt: herb ? Math.max(damage, aging * 0.62) : 0,
    drought,
    flooding,
    foliage:
      (woodyCanopy ? 1 - Math.max(aging * 0.38, damage * 0.28) : 1) * (0.08 +
      0.92 *
        Math.sqrt(Math.min(1, Math.max(0, p.energy) / (PLANTS[p.kind].capacity * 0.45)))),
    droop: p.kind === "tree" ? 1 : 1 - drought * 0.3 - flooding * 0.12,
  };
}
