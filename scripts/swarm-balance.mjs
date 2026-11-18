import { World } from "../src/sim.ts";
import { FIRST_GROVE, SANDBOX } from "../src/levels.ts";
import { encodeSave } from "../src/save.ts";
import { PLANTS } from "../src/species.ts";
import { writeFileSync } from "node:fs";
const cases = [
  { name: "sandbox", seed: 7823, level: SANDBOX },
  { name: "grove", seed: 123, level: FIRST_GROVE },
];
const summary = [];
for (const c of cases) {
  const w = new World(c.seed, c.level);
  if (c.name === "grove")
    for (let i = 0; i < 12; i++) w.addAnimal("grazer", undefined, "bug");
  const history = [];
  let peak = w.animals.length,
    maxGeneration = 1;
  let stopReason = "duration";
  const snapshot = () =>
    encodeSave({ world: w, rate: 1, paused: true, selected: 0 });
  for (let i = 0; i <= 18000; i++) {
    if (i > 0) w.step(0.1);
    maxGeneration = Math.max(
      maxGeneration,
      ...w.animals.map((a) => a.generation),
    );
    peak = Math.max(peak, w.animals.length);
    if (i === 3000)
      writeFileSync(`reports/swarm-${c.name}-300.json`, snapshot());
    if (i === 1500)
      writeFileSync(`reports/swarm-long-${c.name}-early.json`, snapshot());
    if (i % 600 === 0) {
      const row = {
        seconds: Math.round(w.time),
        animals: w.animals.length,
        plants: w.plants.length,
        energy: Math.round(w.plants.reduce((s, p) => s + p.energy, 0)),
        capacity: Math.round(
          w.plants.reduce((s, p) => s + PLANTS[p.kind].capacity, 0),
        ),
        depleted: w.plants.filter((p) => p.depletion > 0).length,
        generation: maxGeneration,
        livingGeneration: Math.max(0, ...w.animals.map((a) => a.generation)),
        species: Object.fromEntries(
          [...new Set(w.animals.map((a) => a.species))].map((s) => [
            s,
            w.animals.filter((a) => a.species === s).length,
          ]),
        ),
        eggs: Object.fromEntries(
          [...new Set(w.eggs.map((e) => e.embryo.species))].map((s) => [
            s,
            w.eggs.filter((e) => e.embryo.species === s).length,
          ]),
        ),
        plantDeaths: { ...w.plantDeaths },
        deaths: { ...w.deathCounts },
      };
      history.push(row);
      writeFileSync(
        `reports/swarm-long-${c.name}-history.json`,
        JSON.stringify(history, null, 2),
      );
      console.log(c.name, JSON.stringify(row));
      writeFileSync(`reports/swarm-long-${c.name}-late.json`, snapshot());
      if (w.animals.length >= 3500) {
        stopReason = "test stopped above 3500 animals; not a game cap";
        break;
      }
    }
  }
  writeFileSync(`reports/swarm-long-${c.name}-late.json`, snapshot());
  summary.push({ name: c.name, peak, maxGeneration, stopReason, history });
}
writeFileSync(
  "reports/swarm-long-balance-summary.json",
  JSON.stringify(summary, null, 2),
);
