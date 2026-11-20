import { landAt, regionWeights, type LandCell } from "./terrain.ts";

export function canGrowCactus(land: LandCell[] | undefined, x: number, z: number) {
  const cell = landAt(land, x, z);
  const desert = 1 - cell.forest - cell.grass;
  return desert > 0.5 || (cell.forest <= 0.3 &&
    ((desert >= 0.22 && regionWeights(x, z).desert >= 0.2) ||
      ((cell.sand ?? 0) >= 0.25 && cell.grass <= 0.8)));
}
