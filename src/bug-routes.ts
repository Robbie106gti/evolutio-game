import type { Animal } from "./model.ts";
import type { LandCell } from "./terrain.ts";

// A one-unit tile is narrower than a web. Record the visited tile, including
// bends in the approach, rather than extrapolating from the final heading.
export function recordBugStep(bug: Animal, time: number) {
  const tile = (Math.round(bug.x) + 128) * 256 + Math.round(bug.z) + 128;
  const trail = bug.walkTrail ??= [];
  if (trail.at(-1)?.tile === tile) return;
  trail.push({ tile, time });
  if (trail.length > 12) trail.shift();
}

export function recordApproach(cell: LandCell, bug: Animal, time: number, samePatch: boolean) {
  const visits = (samePatch ? cell.routeVisits ?? [] : []).filter(v => time - v.time <= 90).slice(-11);
  const tiles = new Set<number>();
  for (const step of bug.walkTrail ?? []) {
    const distance = Math.hypot((step.tile >> 8) - 128 - bug.x, (step.tile & 255) - 128 - bug.z);
    if (time - step.time <= 15 && distance >= 0.75 && distance <= 4) tiles.add(step.tile);
  }
  visits.push({ time, tiles: [...tiles] });
  cell.routeVisits = visits;
  delete cell.approachX;
  delete cell.approachZ;
  cell.approachCount = 0;
  const counts = new Map<number, number>();
  for (const visit of visits) {
    for (const tile of visit.tiles) {
      const count = (counts.get(tile) ?? 0) + 1;
      counts.set(tile, count);
      if (count < 2 || count <= cell.approachCount) continue;
      cell.approachCount = count;
      cell.approachX = (tile >> 8) - 128;
      cell.approachZ = (tile & 255) - 128;
    }
  }
}
