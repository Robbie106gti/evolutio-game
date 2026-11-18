import { World } from "./sim.ts";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
for (const seed of [7823, 42, 123]) {
  const a = new World(seed),
    b = new World(seed);
  const founders = a.animals.length;
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
    a.animals.length === founders + a.births - a.deaths,
    `Animal population must match founders, births and deaths (seed ${seed})`,
  );
  assert(a.plants.length < 20000, `Vegetation remains bounded (seed ${seed})`);
  console.log({
    seed,
    population: a.animals.length,
    grazers: a.animals.filter((x) => x.kind === "grazer").length,
    births: a.births,
    plants: a.plants.length,
    plantBirths: a.plantBirths,
  });
}
