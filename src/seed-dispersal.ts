import { regionWeights } from "./terrain.ts";
import type { Animal, Plant } from "./model.ts";

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
    // Preserve local seed sources too. A wetland cactus seed on the other
    // side of the island cannot repopulate a dry patch by local dispersal.
    const key = (seed: Plant) => seed.kind + seed.variety +
      (seed.kind === "bush" && seed.variety === 2 && regionWeights(seed.x, seed.z).desert > 0.4 ? "-arid" : "");
    const varieties = new Map<string, number>();
    for (const seed of bank) varieties.set(key(seed), (varieties.get(key(seed)) ?? 0) + 1);
    const incoming = varieties.get(key(plant)) ?? 0;
    let index = -1, largest = Math.max(1, incoming + 1);
    for (let i = 0; i < bank.length; i++) {
      const seed = bank[i];
      if (counts[plant.kind] >= 80 ? seed.kind !== plant.kind : counts[seed.kind] <= 80) continue;
      const n = varieties.get(key(seed))!;
      if (n > largest) { index = i; largest = n; }
    }
    if (index < 0) return false;
    bank.splice(index, 1);
  }
  bank.push({ ...plant, expression: { ...plant.expression } });
  return true;
}

export function collectSeed(bank: Plant[], animal: Animal, plant: Plant, mode: NonNullable<Animal["seedCargo"]>["mode"], time: number) {
  if (animal.seedCargo) return;
  const index = bank.findIndex(seed => seed.id === plant.id && !seed.deposit);
  if (index >= 0) animal.seedCargo = { seed: bank.splice(index, 1)[0], mode, pickedAt: time };
}

export function dropSeed(bank: Plant[], animal: Animal, time: number, depth: number) {
  const cargo = animal.seedCargo;
  if (!cargo || animal.altitude > 0.6) return;
  const elapsed = time - cargo.pickedAt;
  if (cargo.mode === "cache") {
    if (depth > 0.05 || Math.hypot(animal.x - cargo.seed.x, animal.z - cargo.seed.z) < 3) return;
  } else if (elapsed < (cargo.mode === "gut" ? 18 : 7)) return;
  const deposit = { time, owner: cargo.mode === "cache" ? animal.id : undefined };
  storeDormantSeed(bank, { ...cargo.seed, x: animal.x, z: animal.z, deposit });
  delete animal.seedCargo;
}
