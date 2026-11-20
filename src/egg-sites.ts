import type { Egg, Species } from "./model.ts";
import { landIndex } from "./terrain.ts";

type Point = { x: number; z: number };

export function distributeEggSites(species: Species, sites: Point[], eggs: Egg[]) {
  const patches = new Map<number, { sites: Point[]; load: number; next: number }>();
  for (const site of sites) {
    const index = landIndex(site.x, site.z);
    let patch = patches.get(index);
    if (!patch) {
      patch = { sites: [], load: 0, next: 0 };
      patches.set(index, patch);
    }
    patch.sites.push(site);
  }
  for (const egg of eggs) {
    if (egg.health <= 0 || egg.embryo.species !== species) continue;
    const patch = patches.get(landIndex(egg.embryo.x, egg.embryo.z));
    if (patch) patch.load++;
  }
  const nearby = [...patches.values()];
  return {
    nearest: sites[0],
    nextSite() {
      // Use the least crowded patch, with nearer sites winning ties.
      const patch = nearby.reduce((least, candidate) => candidate.load < least.load ? candidate : least);
      const site = patch.sites[patch.next++ % patch.sites.length];
      patch.load++;
      return site;
    },
  };
}
