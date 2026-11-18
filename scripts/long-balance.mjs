import { World } from "../src/sim.ts";
import { FIRST_GROVE, SANDBOX } from "../src/levels.ts";
import { encodeSave, decodeSave } from "../src/save.ts";
import { PLANTS } from "../src/species.ts";
import { writeFileSync, readFileSync } from "node:fs";
import { enableProfiling, timingReport } from "../src/profiling.ts";
const cases = [
  { name: "sandbox", seed: 7823, level: SANDBOX },
  { name: "grove", seed: 123, level: FIRST_GROVE },
];
const summary = [];
for (const c of cases) {
  const resume = c.name === "sandbox";
  const w = resume
    ? decodeSave(readFileSync("reports/long-sandbox-early.json", "utf8")).world
    : new World(c.seed, c.level);
  if (c.name === "grove")
    for (let i = 0; i < 12; i++) w.addAnimal("grazer", undefined, "bug");
  const history = resume
    ? JSON.parse(
        readFileSync("reports/long-sandbox-history.json", "utf8"),
      ).filter((r) => r.seconds <= 150)
    : [];
  let peak = Math.max(w.animals.length, ...history.map((r) => r.animals)),
    maxGeneration = Math.max(1, ...history.map((r) => r.generation));
  let stopReason = "duration";
  const snapshot = () =>
    encodeSave({ world: w, rate: 1, paused: true, selected: 0 });
  for (let i = resume ? 1501 : 0; i <= 18000; i++) {
    if (i > 0) w.step(0.1);
    maxGeneration = Math.max(
      maxGeneration,
      ...w.animals.map((a) => a.generation),
    );
    peak = Math.max(peak, w.animals.length);
    if (i === 1500)
      writeFileSync(`reports/long-${c.name}-early.json`, snapshot());
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
        plantDeaths: { ...w.plantDeaths },
        deaths: { ...w.deathCounts },
      };
      history.push(row);
      writeFileSync(
        `reports/long-${c.name}-history.json`,
        JSON.stringify(history, null, 2),
      );
      console.log(c.name, JSON.stringify(row));
      writeFileSync(`reports/long-${c.name}-late.json`, snapshot());
      if (w.animals.length >= 6000) {
        stopReason = "test stopped at 6000 animals; not a game cap";
        break;
      }
    }
  }
  writeFileSync(`reports/long-${c.name}-late.json`, snapshot());
  summary.push({ name: c.name, peak, maxGeneration, stopReason, history });
}
writeFileSync(
  "reports/long-balance-summary.json",
  JSON.stringify(summary, null, 2),
);
// Only benchmark after all long runs stop, so the simulations do not compete
// with each other for CPU. Same current code, early/late snapshots, alternating.
const profiles = [];
for (const c of cases)
  for (let trial = 0; trial < 3; trial++)
    for (const age of trial % 2 ? ["late", "early"] : ["early", "late"]) {
      const raw = readFileSync(`reports/long-${c.name}-${age}.json`, "utf8");
      let w = decodeSave(raw).world;
      for (let i = 0; i < 20; i++) w.step(0.1);
      w = decodeSave(raw).world;
      enableProfiling();
      const ms = [];
      const count = w.animals.length;
      for (let i = 0; i < 120; i++) {
        const start = performance.now();
        w.step(0.1);
        ms.push(performance.now() - start);
      }
      const sorted = [...ms].sort((a, b) => a - b);
      profiles.push({
        name: c.name,
        age,
        trial,
        animals: count,
        plants: w.plants.length,
        mean: ms.reduce((a, b) => a + b, 0) / ms.length,
        p95: sorted[Math.floor(ms.length * 0.95)],
        phases: timingReport(),
      });
    }
writeFileSync(
  "reports/long-balance-profile.json",
  JSON.stringify(profiles, null, 2),
);
console.log("PROFILES", JSON.stringify(profiles));
