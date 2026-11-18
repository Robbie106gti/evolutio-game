import { World, SPECIES } from "../src/sim.ts";
import { mkdirSync, writeFileSync } from "node:fs";
const seed = Number(process.argv[2] ?? 42),
  seconds = Number(process.argv[3] ?? 1800),
  dt = Number(process.argv[4] ?? 0.25);
const world = new World(seed),
  founderCount = world.animals.length,
  start = Date.now(),
  history = [];
for (let tick = 0; tick < Math.round(seconds / dt); tick++) {
  world.step(dt);
  if (tick % Math.round(300 / dt) === 0)
    history.push({
      time: Math.round(world.time),
      population: world.animals.length,
      generation: Math.max(0, ...world.animals.map((a) => a.generation)),
      species: Object.fromEntries(
        Object.keys(SPECIES).map((s) => [
          s,
          world.animals.filter((a) => a.species === s).length,
        ]),
      ),
    });
}
const populations = Object.fromEntries(
  Object.keys(SPECIES).map((s) => [
    s,
    world.animals.filter((a) => a.species === s).length,
  ]),
);
const result = {
  seed,
  seconds,
  timestep: dt,
  founderCount,
  automaticReintroductions: 0,
  populations,
  births: world.births,
  deaths: world.deathCounts,
  generation: Math.max(0, ...world.animals.map((a) => a.generation)),
  plants: world.plants.length,
  history,
  runtimeSeconds: (Date.now() - start) / 1000,
};
mkdirSync("reports", { recursive: true });
writeFileSync(
  `reports/balance-${seed}-${dt}.json`,
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result));
if (Object.values(populations).some((n) => n === 0) || result.generation < 5)
  process.exitCode = 1;
