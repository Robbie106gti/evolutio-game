import type { Plant } from "./model.ts";

// Bounded local dispersal with occasional longer wind/animal transport. Test
// destinations, not the old parent's ground: that ground may now be flooded.
export function disperseSeed(
  seed: Pick<Plant, "x" | "z" | "spread">,
  random: () => number,
  suitable: (x: number, z: number) => boolean,
) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const angle = random() * Math.PI * 2;
    const reach = Math.max(2, seed.spread) * (attempt < 8 ? 1 : 6);
    const radius = Math.sqrt(random()) * reach;
    const x = seed.x + Math.cos(angle) * radius;
    const z = seed.z + Math.sin(angle) * radius;
    if (suitable(x, z)) return { x, z };
  }
  // Dormancy is retained if no destination is viable; no free replacement plant.
  return undefined;
}

// A bounded archive must not erase slow-growing plant types simply because
// grass produces seeds sooner. Replace an overrepresented type when full.
export function storeDormantSeed(bank: Plant[], plant: Plant) {
  if (bank.length >= 240) {
    const counts = { grass: 0, bush: 0, tree: 0 };
    for (const seed of bank) counts[seed.kind]++;
    if (counts[plant.kind] >= 80) return false;
    const index = bank.findIndex((seed) => counts[seed.kind] > 80);
    if (index < 0) return false;
    bank.splice(index, 1);
  }
  bank.push({ ...plant, expression: { ...plant.expression } });
  return true;
}
