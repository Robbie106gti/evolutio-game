import { laysEggs } from "./biology.ts";
import { createWaterQuery } from "./ecology.ts";
import { hasDormantEggs, insectEggCanDevelop, insectEggTemperature } from "./insect-incubation.ts";
import type { Species } from "./model.ts";
import type { World } from "./sim.ts";
import { SPECIES } from "./species.ts";
import { landAt, landIndex } from "./terrain.ts";

type EggSummaryRow = { species: Species; laid: number; developing: number; waiting: number };

export function eggSummary(world: World) {
  const species = new Set([
    ...world.level.availableSpecies.filter(laysEggs),
    ...(Object.keys(world.eggsLaidBySpecies) as Species[]),
    ...world.eggs.map(e => e.embryo.species),
  ]);
  const rows = new Map<Species, EggSummaryRow>(
    (Object.keys(SPECIES) as Species[]).filter(s => species.has(s)).map(s =>
      [s, { species: s, laid: world.eggsLaidBySpecies[s] ?? 0, developing: 0, waiting: 0 }]),
  );
  const land = world.weather.land;
  const depthAt = createWaterQuery(world.ponds, land);
  const temperatures = new Map<number, number>();
  for (const { embryo, health, age, duration } of world.eggs) {
    if (health <= 0 || age >= duration) continue;
    const row = rows.get(embryo.species)!;
    if (hasDormantEggs(embryo.species)) {
      const { x, z, species } = embryo;
      const index = landIndex(x, z);
      let temperature = temperatures.get(index);
      if (temperature === undefined) {
        temperature = insectEggTemperature(world.time, world.weather, index);
        temperatures.set(index, temperature);
      }
      const { moisture, litter } = landAt(land, x, z);
      if (!insectEggCanDevelop(species, temperature, depthAt(x, z), moisture, litter)) {
        row.waiting++;
        continue;
      }
    }
    row.developing++;
  }
  return [...rows.values()];
}
