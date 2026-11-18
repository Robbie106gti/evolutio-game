import { World } from "./sim.ts";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
for (const seed of [7823, 42, 123]) {
  const a = new World(seed),
    b = new World(seed);
  for (let i = 0; i < 1800; i++) {
    a.step(0.1);
    b.step(0.1);
  }
  assert(
    JSON.stringify(a) === JSON.stringify(b),
    "Simulation must be deterministic",
  );
  assert(a.births > 0, "Animals must reproduce");
  assert(a.plantBirths > 0, "Plants must reproduce");
  assert(
    a.animals.every(
      (x) =>
        Number.isFinite(x.energy) &&
        Number.isFinite(x.x) &&
        x.genes.weights.length === x.genes.neurons * 8,
    ),
    "Valid genomes and state",
  );
  assert(
    a.animals.length + a.eggs.length <= 560 && a.plants.length < 20000,
    "Animal limits and resource-bounded vegetation remain stable",
  );
  console.log({
    seed,
    population: a.animals.length,
    grazers: a.animals.filter((x) => x.kind === "grazer").length,
    births: a.births,
    plants: a.plants.length,
    plantBirths: a.plantBirths,
  });
}
