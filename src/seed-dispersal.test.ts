import { disperseSeed, storeDormantSeed } from "./seed-dispersal.ts";
import { World } from "./sim.ts";
const assert = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
};
const world = new World(72);
const random = () => world.random();
const seed = { x: 0, z: 0, spread: 4 };
let recovered = 0;
for (let i = 0; i < 100; i++) {
  const site = disperseSeed(seed, random, (x, z) => Math.hypot(x, z) > 8);
  if (site) {
    recovered++;
    assert(Math.hypot(site.x, site.z) > 8, "Never germinate in flooded source");
  }
}
assert(
  recovered > 80,
  "Dispersal can cross flooded ground to reachable dry land",
);
assert(
  !disperseSeed(seed, random, () => false),
  "Unsuitable landscape retains dormancy",
);
console.log(
  "Seed dispersal crosses flooding and respects destination suitability",
);

const tree = world.plants.find((p) => p.kind === "tree")!;
const grass = world.plants.find((p) => p.kind === "grass")!;
const bank = Array.from({ length: 240 }, () => ({ ...grass }));
assert(
  storeDormantSeed(bank, tree),
  "Trees can replenish a grass-filled seed archive",
);
assert(
  bank.length === 240 && bank.some((p) => p.kind === "tree"),
  "Keep storage bounded and preserve diversity",
);
assert(
  !storeDormantSeed(bank, grass),
  "Abundant grass cannot displace tree seeds",
);
