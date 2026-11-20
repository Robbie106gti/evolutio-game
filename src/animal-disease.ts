import { clamp } from "./biology.ts";
import type { Animal, Species } from "./model.ts";
import { landIndex, LAND_SIDE } from "./terrain.ts";

type Patch = { animals: number; contagious: number };
type Exposure = { density: number; crowding: number; contagiousShare: number };
type SpeciesCounts = { total: number; patches: Map<number, Patch>; exposure: Map<number, Exposure> };

export const hasBreedingHealth = (animal: Animal) =>
  animal.infection < (animal.species === "bug" ? 0.4 : 0.55);

export const infectionSeverity = (animal: Animal) =>
  clamp((animal.infection - 0.35) / 0.65, 0, 1);
export const illnessSpeed = (animal: Animal) => 1 - 0.65 * infectionSeverity(animal);
export const illnessVulnerability = (animal: Animal) => 1 + 0.6 * infectionSeverity(animal);

export function diseaseTarget(animal: Animal, candidates: Animal[], isHunter: (other: Animal) => boolean) {
  let healthy: Animal | undefined, hunter: Animal | undefined;
  let healthyDistance = Math.min(8, animal.genes.sense), hunterDistance = healthyDistance;
  for (const other of candidates) {
    if (other.id === animal.id || other.energy <= 0 || other.nursery) continue;
    const distance = Math.hypot(other.x - animal.x, other.z - animal.z);
    if (other.species === animal.species && other.infection < 0.55 && distance < healthyDistance) {
      healthy = other;
      healthyDistance = distance;
    }
    if (distance < hunterDistance && isHunter(other)) {
      hunter = other;
      hunterDistance = distance;
    }
  }
  if (hunter && (animal.id % 4 === 0 || !healthy))
    return { animal: hunter, state: "Seeking predators" as const };
  if (healthy) return { animal: healthy, state: "Spreading infection" as const };
}

export function spreadInfection(animal: Animal, other: Animal, dt: number) {
  if (animal.species !== other.species || Math.abs(animal.altitude - other.altitude) > 0.8) return;
  other.infection = clamp(other.infection + dt * 0.24 * (1 - other.genes.immunity), 0, 1);
}

export function prepareAnimalDisease(animals: readonly Animal[]) {
  const populations = new Map<Species, SpeciesCounts>();
  for (const animal of animals) {
    if (animal.energy <= 0) continue;
    let population = populations.get(animal.species);
    if (!population) {
      population = { total: 0, patches: new Map(), exposure: new Map() };
      populations.set(animal.species, population);
    }
    population.total++;
    const index = landIndex(animal.x, animal.z);
    let patch = population.patches.get(index);
    if (!patch) {
      patch = { animals: 0, contagious: 0 };
      population.patches.set(index, patch);
    }
    patch.animals++;
    if (animal.infection >= 0.45) patch.contagious++;
  }
  for (const animal of animals) {
    if (animal.infection > 0 && (populations.get(animal.species)?.total ?? 0) < 24)
      animal.infection = 0;
  }
  const exposureAt = (species: Species, population: SpeciesCounts, index: number) => {
    let exposure = population.exposure.get(index);
    if (exposure === undefined) {
      const x = index % LAND_SIDE, z = Math.floor(index / LAND_SIDE);
      let density = 0, contagious = 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (x + dx < 0 || x + dx >= LAND_SIDE || z + dz < 0 || z + dz >= LAND_SIDE) continue;
          const patch = population.patches.get(index + dx + dz * LAND_SIDE);
          if (!patch) continue;
          // Include adjacent cells so a cluster split across a terrain boundary still counts.
          const weight = dx === 0 && dz === 0 ? 1 : dx !== 0 && dz !== 0 ? 0.2 : 0.4;
          density += patch.animals * weight;
          contagious += patch.contagious * weight;
        }
      }
      const start = species === "bug" ? 9 : species === "fish" ? 20 : 12;
      const range = species === "fish" ? 24 : 16;
      exposure = {
        density,
        crowding: clamp((density - start) / range, 0, 1),
        contagiousShare: contagious / Math.max(1, density),
      };
      population.exposure.set(index, exposure);
    }
    return exposure;
  };
  return {
    compelled(animal: Animal, index: number, fungus: number) {
      const population = populations.get(animal.species);
      if (animal.infection < 0.72 || !population || population.total < 80) return false;
      const exposure = exposureAt(animal.species, population, index);
      return exposure.density >= 28 && (fungus >= 0.25 || exposure.contagiousShare >= 0.45);
    },
    update(animal: Animal, index: number, fungus: number, dt: number) {
      const population = populations.get(animal.species);
      // A tiny island population cannot sustain an outbreak, even on a damp patch.
      if (!population || population.total < 24) {
        animal.infection = 0;
        return;
      }
      const exposure = exposureAt(animal.species, population, index);
      const immunity = animal.genes.immunity;
      const fungalExposure = fungus * (animal.species === "fish" ? 0.035 : 0.14);
      const susceptibility = animal.species === "bug" ? 1.45 : 1;
      const infectionRate = susceptibility * exposure.crowding *
        (0.045 + fungalExposure + 0.12 * exposure.contagiousShare);
      animal.infection = clamp(animal.infection +
        dt * (infectionRate * (1 - immunity) - (0.012 + immunity * 0.025)), 0, 1);
      animal.energy -= dt * 0.45 * infectionSeverity(animal);
    },
  };
}
