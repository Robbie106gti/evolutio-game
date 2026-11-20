import type { Animal, Species } from "./model.ts";
import { isFlyingInsect, isInsect, SPECIES, BURST_HUNTERS, LIFE_HISTORY } from "./species.ts";
export const huntsAnimals = (a: Animal) =>
  a.species === "mouse"
    ? a.genes.dietAffinity >= 0.3
    : SPECIES[a.species].prey.length > 0;

export const canHunt = (predator: Animal, prey: Animal) => {
  if (prey.webOwnerId && prey.webOwnerId !== predator.id && (prey.webHeldUntilAge ?? 0) > prey.age) return false;
  if (prey.altitude > 0.6 && predator.species !== "bird") {
    // Tongues and stings can reach insects hovering close to the ground.
    if ((predator.species !== "scorpion" && predator.species !== "frog") || !isFlyingInsect(prey.species) ||
        prey.altitude > 1 || Math.hypot(prey.x - predator.x, prey.z - predator.z) > 0.9) return false;
  }
  if (prey.species === "spider" && (predator.species === "frog" ||
      (predator.species === "bird" && predator.birdDiet === "insectivore")))
    return grownBodySize(prey) <= grownBodySize(predator) * 0.75;
  if (predator.species === "bird" && prey.species === "scorpion")
    return predator.birdDiet === "insectivore" && grownBodySize(prey) <= grownBodySize(predator) * 0.65;
  const smallVertebrate = prey.species === "mouse" || prey.species === "bird";
  if (predator.species === "spider" && smallVertebrate)
    return grownBodySize(prey) <= grownBodySize(predator) * 1.2;
  if (predator.species === "scorpion" &&
      (smallVertebrate || prey.species === "frog" || prey.species === "snake" || prey.species === "crab"))
    return grownBodySize(prey) <= grownBodySize(predator) * 1.3;
  if (predator.species === "snake" && prey.species === "frog")
    return grownBodySize(prey) <= grownBodySize(predator);
  if (prey.species === "turtle") {
    if (!SPECIES[predator.species].prey.includes("turtle")) return false;
    if (predator.species === "bird" && predator.birdDiet !== "raptor") return false;
    const stage = lifeStage(prey);
    const vulnerable = stage === "Baby" || (stage === "Juvenile" && predator.species !== "cat");
    return vulnerable && grownBodySize(prey) <= grownBodySize(predator) * 0.65;
  }
  if (prey.species === "crocodile")
    return lifeStage(prey) === "Baby" &&
      (predator.species === "cat" || predator.species === "fox" ||
        (predator.species === "bird" && predator.birdDiet === "raptor"));
  if (predator.species === "mouse") {
    if (
      predator.id === prey.id ||
      predator.parent === prey.id ||
      prey.parent === predator.id ||
      (predator.parent !== 0 && predator.parent === prey.parent)
    )
      return false;
    return (
      predator.genes.dietAffinity >= 0.3 &&
      (isInsect(prey.species) ||
        (predator.genes.dietAffinity >= 0.65 &&
          prey.species === "mouse" &&
          predator.genes.size > prey.genes.size * 1.35))
    );
  }
  if (predator.species === "bird")
    return predator.birdDiet === "raptor"
      ? prey.species === "mouse" || prey.species === "fish" ||
        (prey.species === "frog" && grownBodySize(prey) <= grownBodySize(predator))
      : isInsect(prey.species) || prey.species === "spider";
  return SPECIES[predator.species].prey.includes(prey.species);
};

export function canHuntAt(predator: Animal, prey: Animal, depthAt: (x: number, z: number) => number) {
  if (!canHunt(predator, prey)) return false;
  if (prey.species === "turtle") return depthAt(prey.x, prey.z) <= 0.2;
  if (predator.species === "scorpion" && depthAt(prey.x, prey.z) > 0.15) return false;
  if (predator.species === "snake" && prey.species === "frog") return depthAt(prey.x, prey.z) <= 0.25;
  if (predator.species === "bird" && prey.species === "frog") return depthAt(prey.x, prey.z) <= 0.3;
  if (prey.species === "crocodile")
    return depthAt(prey.x, prey.z) <= (predator.species === "bird" ? 0.4 : 0.2);
  if (predator.species !== "crocodile") return true;
  const reach = Math.hypot(prey.x - predator.x, prey.z - predator.z);
  return reach <= 2.5 && depthAt(predator.x, predator.z) > 0.1 &&
    (depthAt(prey.x, prey.z) > 0.05 || reach <= 1.1);
}

export const burstProfile = (species: Species) =>
  species in BURST_HUNTERS
    ? BURST_HUNTERS[species as keyof typeof BURST_HUNTERS]
    : undefined;

export const clamp = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, v));

export const nurseryAge = (a: Animal) =>
  maturityAge(a) * (a.species === "bird" ? 0.65 : 0.4);

export const maturityAge = (a: Animal) =>
  LIFE_HISTORY[a.species].maturity * a.genes.maturation;

export const lifespan = (a: Animal) =>
  (LIFE_HISTORY[a.species].lifespan * a.genes.longevity) /
  (0.65 + a.genes.size * 0.35);

export const reproductiveEnd = (a: Animal) => lifespan(a) * 0.85;

export const canReproduce = (a: Animal) =>
  a.age >= maturityAge(a) && a.age < reproductiveEnd(a);

export const lifeStage = (a: Animal) =>
  a.age < maturityAge(a) / 3
    ? "Baby"
    : a.age < maturityAge(a)
      ? "Juvenile"
      : a.age < lifespan(a) * 0.75
        ? "Adult"
        : "Elder";

export const ageAgility = (a: Animal) =>
  a.age < maturityAge(a)
    ? 0.55 + (0.45 * a.age) / maturityAge(a)
    : a.age > lifespan(a) * 0.75
      ? Math.max(0.55, 1 - (0.45 * (a.age / lifespan(a) - 0.75)) / 0.25)
      : 1;

export const ageVulnerability = (a: Animal) =>
  a.age < maturityAge(a) ? 1.2 : a.age > lifespan(a) * 0.75 ? 1.15 : 0.8;

export const growthScale = (a: Animal) =>
  0.4 + 0.6 * clamp(a.age / maturityAge(a), 0, 1);

export const grownBodySize = (a: Animal) =>
  SPECIES[a.species].size * a.genes.size * growthScale(a);

export function bodyNeeds(a: Animal, temperature: number) {
  return {
    hunger: clamp((100 - a.energy) / 100, 0, 1),
    thirst: clamp((80 - a.hydration) / 80, 0, 1),
    fatigue: 1 - a.stamina / 100,
    temperature: clamp(Math.abs(temperature - 23) / 20, 0, 1),
  };
}

export const laysEggs = (species: Species) =>
  SPECIES[species].capabilities.reproduction === "eggs";

export const aquatic = (species: Species) =>
  SPECIES[species].capabilities.aquatic;

export function perceptionInterval(a: Animal) {
  if (["Fleeing", "Sprinting", "Hunting", "Crossing river"].includes(a.state))
    return 0.1;
  if (
    [
      "Resting",
      "Sleeping",
      "Recovering",
      "Sheltering",
      "Drying on sunny rock",
      "Drying in shelter",
      "Feeding on catch",
    ].includes(a.state)
  )
    return 0.5;
  if (a.species === "turtle") return 0.5;
  if (a.species === "snake" && a.bodyTemperature < 18) return 0.4;
  return a.genes.speed * SPECIES[a.species].speed < 0.8 ? 0.3 : 0.2;
}
