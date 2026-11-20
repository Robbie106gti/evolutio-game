import type { World } from "./sim.ts";
import type { Species } from "./model.ts";
import { SPECIES } from "./species.ts";
import { createWaterQuery } from "./ecology.ts";
import { findFishWater } from "./fish-habitat.ts";
import { WORLD_RADIUS } from "./terrain.ts";

type FounderGroup = {
  species: Species;
  count: number;
  birdDiet?: "raptor" | "insectivore";
};

const founderCounts: Partial<Record<Species, number>> = {
  ant: 24,
  bug: 12,
  cat: 6,
  fox: 6,
  mosquito: 36,
};

export function missingFounderGroups(world: World) {
  const living = new Set<Species>();
  const birdDiets = new Set<FounderGroup["birdDiet"]>();
  for (const animal of world.animals) {
    if (animal.energy <= 0) continue;
    living.add(animal.species);
    if (animal.species === "bird") birdDiets.add(animal.birdDiet);
  }
  const groups: FounderGroup[] = [];
  for (const species of world.level.availableSpecies) {
    if (species === "bird") {
      for (const birdDiet of ["raptor", "insectivore"] as const)
        if (!birdDiets.has(birdDiet))
          groups.push({ species, birdDiet, count: birdDiets.size ? 4 : 3 });
    } else if (!living.has(species)) {
      const count = world.level.mode === "challenge" && species !== "bug"
        ? 4 : founderCounts[species] ?? 4;
      groups.push({ species, count });
    }
  }
  return groups;
}

export function introduceMissingSpecies(world: World) {
  const added: FounderGroup[] = [];
  const depthAt = createWaterQuery(world.ponds, world.weather.land);
  let fishNeedWater = false;
  for (const group of missingFounderGroups(world)) {
    const { species, birdDiet, count } = group;
    if (species === "fish" && !findFishWater(world.ponds, world.weather.land, depthAt)) {
      fishNeedWater = true;
      continue;
    }
    const sites = species === "mosquito" ? mosquitoFounderSites(world, depthAt) : [];
    for (let i = 0; i < count; i++) {
      const founder = world.addAnimal(SPECIES[species].kind, undefined, species);
      founder.sex = i % 2 === 0 ? "female" : "male";
      if (birdDiet) founder.birdDiet = birdDiet;
      if (sites.length) {
        const site = sites[Math.floor(i / 2) % sites.length];
        Object.assign(founder, { ...site, mealX: site.x, mealZ: site.z });
      }
    }
    added.push(group);
  }
  return { added, fishNeedWater };
}

function mosquitoFounderSites(world: World, depthAt: (x: number, z: number) => number) {
  const sites: { x: number; z: number }[] = [];
  for (const pond of world.ponds) {
    const shoreline = pond.radius * Math.sqrt(pond.water) * 1.15;
    if (shoreline < 0.08) continue;
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      const x = pond.x + (shoreline - 0.08) * Math.cos(angle);
      const z = pond.z + (shoreline - 0.08) * Math.sin(angle);
      const depth = depthAt(x, z);
      if (Math.hypot(x, z) < WORLD_RADIUS && depth >= 0.025 && depth <= 0.1)
        sites.push({ x, z });
    }
  }
  return sites;
}

export function introduceAnimals(
  world: World,
  species: Species,
  count: number,
) {
  if (!world.level.availableSpecies.includes(species))
    throw new Error("This animal is not available in this level.");
  if (![1, 5, 12].includes(count))
    throw new Error("Choose 1, 5 or 12 founders.");
  for (let i = 0; i < count; i++)
    world.addAnimal(SPECIES[species].kind, undefined, species);
  return count;
}
export function establishedOmnivores(world: Pick<World, "animals">) {
  return world.animals.filter(
    (a) =>
      a.species === "mouse" &&
      a.hasEatenBug &&
      a.genes.dietAffinity >= 0.3 &&
      a.genes.dietAffinity < 0.65 &&
      a.mouseLineage?.niche === "omnivore",
  ).length;
}
