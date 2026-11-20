import type { Pond } from "./ecology.ts";
import {
  LAND_MIN,
  LAND_SIDE,
  LAND_STEP,
  RIVER_MAX,
  RIVER_MIN,
  WORLD_RADIUS,
  riverX,
  type LandCell,
} from "./terrain.ts";

type Depth = (x: number, z: number) => number;

export function isFishWater(x: number, z: number, depthAt: Depth) {
  return Math.hypot(x, z) <= WORLD_RADIUS && depthAt(x, z) > 0.1;
}

// The usual randomized spawn is checked by the caller. Search actual water
// when a drained or raised basin invalidates that point.
export function findFishWater(
  ponds: Pond[],
  land: LandCell[] | undefined,
  depthAt: Depth,
) {
  for (const pond of ponds) {
    if (isFishWater(pond.x, pond.z, depthAt)) return { x: pond.x, z: pond.z };
    const reach = pond.radius * Math.sqrt(pond.water) * 0.6;
    if (!reach) continue;
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      const x = pond.x + reach * Math.cos(angle);
      const z = pond.z + reach * Math.sin(angle);
      if (isFishWater(x, z, depthAt)) return { x, z };
    }
  }
  for (let z = RIVER_MIN + 2; z < RIVER_MAX - 2; z += 2) {
    const x = riverX(z);
    if (isFishWater(x, z, depthAt)) return { x, z };
  }
  if (!land) return;
  for (let i = 0; i < land.length; i++) {
    if ((land[i].surfaceWater ?? 0) <= 0.1) continue;
    const x = LAND_MIN + (i % LAND_SIDE) * LAND_STEP;
    const z = LAND_MIN + Math.floor(i / LAND_SIDE) * LAND_STEP;
    if (isFishWater(x, z, depthAt)) return { x, z };
  }
}
