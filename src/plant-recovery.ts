import type { Plant } from "./model.ts";
import { PLANTS } from "./species.ts";

export const RECOVERY = {
  grass: { reserve: 5, release: 0.12, grace: 18 },
  bush: { reserve: 12, release: 0.16, grace: 30 },
  tree: { reserve: 24, release: 0.2, grace: 45 },
};
// Reserves are stored energy, not free regrowth. Repeated depletion spends them;
// healthy surplus refills them. Mortality uses elapsed simulation time and RNG.
export function recoverPlant(p: Plant, dt: number, random: () => number) {
  const profile = RECOVERY[p.kind],
    capacity = PLANTS[p.kind].capacity;
  // Old islands can already contain bare plants when this rule first runs.
  if (p.energy <= capacity * 0.12 && p.depletion > 0) p.stripped = true;
  if (p.stripped && p.energy >= capacity * 0.3) delete p.stripped;
  if (p.energy < capacity * 0.15) {
    p.depletion += dt;
    const released = Math.min(p.reserves, dt * profile.release);
    p.reserves -= released;
    p.energy += released;
    const stress = Math.min(
      1,
      Math.max(0, p.depletion - profile.grace) / profile.grace,
    );
    const vulnerability = 1 - (0.8 * p.reserves) / profile.reserve;
    p.health = Math.max(0, p.health - dt * stress * vulnerability * 0.8);
    if (
      stress > 0 &&
      random() < -Math.expm1(-dt * 0.003 * stress * vulnerability)
    ) {
      p.health = 0;
    }
  } else {
    p.depletion = Math.max(0, p.depletion - dt * 2);
    if (p.energy > capacity * 0.5) {
      const stored = Math.min(
        profile.reserve - p.reserves,
        dt * profile.release * 0.5,
        p.energy - capacity * 0.5,
      );
      p.reserves += stored;
      p.energy -= stored;
    }
  }
}
export function foliageProductivity(p: Plant) {
  return (
    0.15 +
    0.85 * Math.min(1, Math.max(0, p.energy) / (PLANTS[p.kind].capacity * 0.4))
  );
}
