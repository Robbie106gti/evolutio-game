import { FUNGI } from "./profiles.ts";
import type { PlantRemains } from "./model.ts";
import type { LandCell } from "./terrain.ts";

export interface Carcass {
  id: number;
  x: number;
  z: number;
  size: number;
  decay: number;
}
export type EdibleRemains = PlantRemains | Carcass;
// Detritus has low digestible energy. Clearing a patch should be much faster
// than feeding a whole new generation from one dead insect.
export const DETRITUS_NUTRITION = 0.8;
export const DETRITUS_BITE_RATE = 3;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
export function remainsMass(r: EdibleRemains) {
  return "kind" in r
    ? (r.kind === "tree" ? 60 : r.kind === "bush" ? 20 : 6) * r.size
    : 3 * r.size ** 3;
}
// Both feeding and decay remove the same finite pool. Only a fraction of a
// bug's meal returns immediately as waste; the rest supports its metabolism.
export function consumeRemains(
  r: EdibleRemains,
  requested: number,
  cell: LandCell,
  eaten = false,
) {
  const mass = remainsMass(r);
  const amount = Math.min(
    Math.max(0, requested),
    Math.max(0, 1 - r.decay) * mass,
  );
  r.decay = clamp(r.decay + amount / mass);
  cell.litter = clamp(cell.litter + amount * (eaten ? 0.008 : 0.006));
  return amount;
}
export function recycleLitter(cell: LandCell, dt: number) {
  const damp = cell.moisture > 0.25;
  const processed = Math.min(
    cell.litter,
    dt *
      (cell.fungus * FUNGI.mushroom.decomposition +
        (damp ? cell.worms * 0.0015 : 0)),
  );
  cell.litter -= processed;
  cell.nutrients = clamp((cell.nutrients ?? 0.5) + processed * 0.8);
}
export function feedPlantSoil(cell: LandCell, dt: number, tree: boolean) {
  const nutrients = cell.nutrients ?? 0.5;
  cell.nutrients = Math.max(0, nutrients - dt * (tree ? 0.00004 : 0.00002));
  return 0.08 + nutrients * 1.84;
}
