import type { Pond } from "./ecology.ts";
import { availableWorms } from "./decomposition.ts";
import { distributeEggSites } from "./egg-sites.ts";
import type { Egg } from "./model.ts";
import { landIndex, WORLD_RADIUS, type LandCell } from "./terrain.ts";

export const FROG_WORM_DEPTH = 0.45;

const shoreSearch = [1.25, 2.5, 4, 6, 8].flatMap(distance =>
  Array.from({ length: 8 }, (_, i) => {
    const angle = i * Math.PI / 4;
    return { dx: distance * Math.cos(angle), dz: distance * Math.sin(angle), distance };
  }),
);

export function frogShoreFood(
  frog: { x: number; z: number },
  land: LandCell[],
  depthAt: (x: number, z: number) => number,
) {
  let best: { x: number; z: number } | undefined;
  let bestScore = 0;
  for (const { dx, dz, distance } of shoreSearch) {
    const x = frog.x + dx, z = frog.z + dz;
    if (x * x + z * z >= WORLD_RADIUS * WORLD_RADIUS) continue;
    const worms = availableWorms(land[landIndex(x, z)]);
    if (worms <= 0.002) continue;
    const score = worms / (1 + distance);
    if (score <= bestScore || depthAt(x, z) >= FROG_WORM_DEPTH) continue;
    best = { x, z };
    bestScore = score;
  }
  return best;
}

export function shoreNursery(
  species: "frog" | "crab",
  parent: { x: number; z: number },
  ponds: Pond[],
  depthAt: (x: number, z: number) => number,
  eggs: Egg[],
) {
  const distance = (point: { x: number; z: number }) =>
    (point.x - parent.x) ** 2 + (point.z - parent.z) ** 2;
  for (const pond of [...ponds].sort((a, b) => distance(a) - distance(b))) {
    const radius = pond.radius * Math.sqrt(pond.water) * 1.15;
    const sites: { x: number; z: number }[] = [];
    for (let i = 0; i < 24; i++) {
      const angle = i * Math.PI / 12;
      for (const inset of [0.45, 0.25, 0.1, 0.65]) {
        if (radius <= inset) continue;
        const x = pond.x + (radius - inset) * Math.cos(angle);
        const z = pond.z + (radius - inset) * Math.sin(angle);
        if (Math.hypot(x, z) >= WORLD_RADIUS) continue;
        const depth = depthAt(x, z);
        if (depth < (species === "crab" ? 0.12 : 0.2) ||
            depth > (species === "crab" ? 0.65 : 0.75)) continue;
        sites.push({ x, z });
        break;
      }
    }
    if (sites.length) {
      sites.sort((a, b) => distance(a) - distance(b));
      return { pond, ...distributeEggSites(species, sites, eggs) };
    }
  }
}
