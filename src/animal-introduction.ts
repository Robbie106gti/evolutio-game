import type { World } from "./sim.ts";
import type { Species } from "./model.ts";
import { SPECIES } from "./species.ts";
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
