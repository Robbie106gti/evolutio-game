import type { Animal, Plant, Egg } from "./model.ts";
import type { Den } from "./ecology.ts";
import type { LandCell } from "./terrain.ts";
import { nurseryAge, maturityAge } from "./biology.ts";
import { treeRestSite } from "./resting.ts";
export interface NurseryContext {
  trees: ReadonlyMap<number, Plant>;
  dens: ReadonlyMap<number, Den>;
  land: LandCell[] | undefined;
  depthAt: (x: number, z: number) => number;
}
// Mutates only the occupant and its nursery; world orchestration owns ordering.
export function updateNursery(a: Animal, context: NurseryContext, egg = false) {
  const n = a.nursery;
  if (!n) return;
  const tree = context.trees.get(n.site),
    den = context.dens.get(n.site);
  if (
    (n.kind === "nest" && n.site && !tree) ||
    (n.kind === "den" && (!den || den.progress < 1))
  ) {
    a.nursery = null;
    a.altitude = 0;
    return;
  }
  if (n.kind === "nest" && tree)
    Object.assign(n, treeRestSite(tree, n.owner, context.land));
  if (n.kind === "den" && den) {
    n.x = den.x;
    n.z = den.z;
  }
  if (
    !egg &&
    (a.age >= nurseryAge(a) ||
      a.energy < 8 ||
      a.hydration < 15 ||
      context.depthAt(n.x, n.z) > n.altitude + 0.2)
  ) {
    a.nursery = null;
    return;
  }
  a.x = n.x;
  a.z = n.z;
  a.altitude = n.altitude;
}

// Transfers existing reserves; never generates food or water.
export function feedYoung(parent: Animal, baby: Animal, dt: number): boolean {
  if (dt <= 0 || baby.energy >= 65 || parent.energy <= 48) return false;
  const food = Math.min(dt * 5, 65 - baby.energy, parent.energy - 48);
  const drink = Math.min(
    dt * 3,
    100 - baby.hydration,
    Math.max(0, parent.hydration - 45),
  );
  parent.energy -= food;
  baby.energy += food;
  parent.hydration -= drink;
  baby.hydration += drink;
  if (food > 0 || drink > 0) {
    parent.feedingTarget = baby.id;
    baby.fedUntilAge = baby.age + 0.9;
    return true;
  }
  return false;
}

// A den belongs to one adult household, not every descendant of its founder.
export function reconcileDens(animals: Animal[], dens: Den[], eggs: Egg[]) {
  const byId = new Map(
    animals.filter((a) => a.energy > 0).map((a) => [a.id, a]),
  );
  const byDen = new Map(dens.map((d) => [d.id, d]));
  const nursing = new Set([
    ...animals.filter((a) => a.nursery && a.energy > 0).map((a) => a.parent),
    ...eggs.map((e) => e.embryo.parent),
  ]);
  for (const a of animals) {
    const den = byDen.get(a.home);
    if (
      den &&
      !byId.has(den.owner) &&
      a.energy > 0 &&
      !a.nursery &&
      a.age >= maturityAge(a) &&
      Math.hypot(a.x - den.x, a.z - den.z) < 2
    )
      den.owner = a.id;
  }
  for (const a of animals) {
    if (!a.home || a.nursery || nursing.has(a.id)) continue;
    const den = byDen.get(a.home);
    if (a.species === "ant" && den?.pantry) continue;
    if (!den || (a.age >= maturityAge(a) && den.owner !== a.id)) a.home = 0;
  }
  for (const a of animals)
    if (!a.nursery && a.age < maturityAge(a) && a.home) {
      if (a.species === "ant" && byDen.get(a.home)?.pantry) continue;
      const parent = byId.get(a.parent);
      a.home = parent?.home ?? 0;
    }
}
