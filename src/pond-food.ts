import type { Pond } from "./ecology.ts";
import { WORLD_RADIUS, type LandCell } from "./terrain.ts";

type Depth = (x: number, z: number) => number;
type PondFood = "food" | "algae";
type FoodQuery = (x: number, z: number, resource?: PondFood) => Pond | undefined;
const hasFood = (pond: Pond, resource: PondFood) =>
  (pond[resource] ?? 0) > (resource === "food" ? 0.01 : 0);
const cache = new WeakMap<LandCell[], FoodQuery>();

// Flood-fill from pond centres on a half-unit grid. Land is replaced at each
// hydrology tick and terrain edit, so its identity scopes the connectivity map.
export function pondFoodQuery(
  ponds: Pond[],
  depth: Depth,
  land?: LandCell[],
): FoodQuery {
  const previous = land && cache.get(land);
  if (previous) return previous;
  const extent = WORLD_RADIUS * 2;
  const stride = extent * 2 + 1;
  const key = (x: number, z: number) => (z + extent) * stride + x + extent;
  const components = new Map<number, Pond[]>();
  let built = false;
  function build() {
    for (const pond of ponds) {
      if (pond.water <= 0 || depth(pond.x, pond.z) <= 0.1) continue;
      const x = Math.round(pond.x * 2),
        z = Math.round(pond.z * 2);
      const start = key(x, z);
      if (depth(x / 2, z / 2) <= 0.1) continue;
      const existing = components.get(start);
      if (existing) {
        existing.push(pond);
        continue;
      }
      const sources = [pond],
        queue = [start];
      components.set(start, sources);
      for (let i = 0; i < queue.length; i++) {
        const px = (queue[i] % stride) - extent;
        const pz = Math.floor(queue[i] / stride) - extent;
        for (const [dx, dz] of directions) {
          const nx = px + dx,
            nz = pz + dz,
            next = key(nx, nz);
          if (nx * nx + nz * nz > extent * extent || components.has(next))
            continue;
          if (
            depth(nx / 2, nz / 2) <= 0.1 ||
            depth((px + nx) / 4, (pz + nz) / 4) <= 0.1
          )
            continue;
          components.set(next, sources);
          queue.push(next);
        }
      }
    }
    built = true;
  }
  const query: FoodQuery = (x, z, resource = "food") => {
    if (depth(x, z) <= 0.1) return;
    // Most feeding happens inside the source lake. Verify the short wet
    // segment directly so those meals never need an island connectivity map.
    {
      for (const pond of ponds) {
        const distance = Math.hypot(x - pond.x, z - pond.z);
        if (
          !hasFood(pond, resource) ||
          distance >= pond.radius * Math.sqrt(pond.water) * 1.15
        )
          continue;
        const steps = Math.max(1, Math.ceil(distance * 4));
        let wet = true;
        for (let i = 1; i <= steps && wet; i++) {
          wet =
            depth(
              x + ((pond.x - x) * i) / steps,
              z + ((pond.z - z) * i) / steps,
            ) > 0.1;
        }
        if (wet) return pond;
      }
    }
    if (!built) build();
    const nx = Math.round(2 * x),
      nz = Math.round(2 * z);
    if (depth((x + nx / 2) / 2, (z + nz / 2) / 2) <= 0.1) return;
    return components.get(key(nx, nz))?.find((p) => hasFood(p, resource));
  };
  if (land) cache.set(land, query);
  return query;
}
const directions = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
