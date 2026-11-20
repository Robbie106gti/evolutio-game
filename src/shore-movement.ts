import type { Pond } from "./ecology.ts";
import { riverDrinkPoint } from "./terrain.ts";

type Point = { x: number; z: number };
type Depth = (x: number, z: number) => number;

// Probe short connected routes so a fish turning away from a bank cannot
// select deeper water across a strip of dry land.
export function turnFromBank(p: Point, heading: number, depth: Depth, id: number) {
  const probe = (angle: number) => {
    const dx = Math.cos(angle), dz = Math.sin(angle);
    const halfway = depth(p.x + dx * 0.55, p.z + dz * 0.55);
    return halfway <= 0.1 ? 0 : Math.min(halfway, depth(p.x + dx * 1.1, p.z + dz * 1.1));
  };
  let best = probe(heading);
  if (best >= 0.45) return heading;
  let result = heading;
  const side = id % 2 ? 1 : -1;
  for (const turn of [1, -1, 2, -2, 3, -3, 4]) {
    const angle = heading + side * turn * Math.PI / 4;
    const score = probe(angle);
    if (score > best + 0.02) { best = score; result = angle; }
  }
  return result;
}

export function crabShoreTarget(p: Point, ponds: Pond[], depth: Depth) {
  const here = depth(p.x, p.z);
  if (here > 0.05 && here < 0.7) return;
  // Flood pools and player-dug channels count as shoreline too.
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    const q = { x: p.x + 2 * Math.cos(angle), z: p.z + 2 * Math.sin(angle) };
    if ((here <= 0.05) !== (depth(q.x, q.z) <= 0.05)) return;
  }
  let nearest = riverDrinkPoint(p.x, p.z, ponds);
  let distance = Math.hypot(nearest.x - p.x, nearest.z - p.z);
  for (const pond of ponds) {
    if (pond.water <= 0) continue;
    const angle = Math.atan2(p.z - pond.z, p.x - pond.x);
    const radius = pond.radius * Math.sqrt(pond.water) * 1.15 - 0.25;
    const x = pond.x + Math.cos(angle) * radius, z = pond.z + Math.sin(angle) * radius;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < distance) { nearest = { x, z }; distance = d; }
  }
  return distance > 1 ? nearest : undefined;
}
