import { readFileSync, writeFileSync } from "node:fs";
import * as THREE from "three";
import { decodeSave } from "../src/save.ts";
import { OrganismMeshes } from "../src/meshes.ts";
import { enableProfiling, timingReport } from "../src/profiling.ts";

// Replay a known fixture without touching browser saves. Compare repeated runs,
// and give meshes timestamps/land/remains as the live loop does.
const raw = readFileSync("reports/performance-fixture.json", "utf8");
const stats = (ms) => {
  const sorted = [...ms].sort((a, b) => a - b);
  return {
    mean: ms.reduce((a, b) => a + b, 0) / ms.length,
    p95: sorted[Math.floor(sorted.length * 0.95)],
  };
};
const runs = [];
for (let trial = 0; trial < 3; trial++) {
  const w = decodeSave(raw).world;
  for (let i = 0; i < 20; i++) w.step(0.1);
  enableProfiling();
  const times = [];
  const startAnimals = w.animals.length;
  for (let i = 0; i < 120; i++) {
    const start = performance.now();
    w.step(0.1);
    times.push(performance.now() - start);
  }
  runs.push({
    startAnimals,
    endAnimals: w.animals.length,
    plants: w.plants.length,
    simulationMs: stats(times),
    phases: timingReport(),
  });
}
const visual = decodeSave(raw).world;
const mesh = new OrganismMeshes(new THREE.Scene());
const render = (i) => {
  // Slow landscape calculations replace the array once per simulation second.
  if (i % 10 === 0) visual.weather.land = visual.weather.land.slice();
  mesh.update(
    visual.animals,
    visual.plants,
    i * 0.1,
    0,
    visual.weather.land,
    visual.plantRemains,
    visual.eggs.map((e) => e.embryo),
    visual.carcasses,
  );
};
for (let i = 0; i < 50; i++) render(i);
const times = [];
for (let i = 50; i < 250; i++) {
  const start = performance.now();
  render(i);
  times.push(performance.now() - start);
}
const cpu = JSON.parse(
  readFileSync("reports/current-simulation.cpuprofile", "utf8"),
);
const nodes = new Map(cpu.nodes.map((n) => [n.id, n]));
const self = new Map();
for (let i = 0; i < cpu.samples.length; i++) {
  const frame = nodes.get(cpu.samples[i]).callFrame;
  const key = `${frame.functionName || "(anonymous)"} · ${frame.url.split("/").at(-1)}:${frame.lineNumber + 1}`;
  self.set(key, (self.get(key) ?? 0) + cpu.timeDeltas[i]);
}
const total = [...self.values()].reduce((a, b) => a + b, 0);
const result = {
  note: "Controlled Node CPU measurements, not the live browser island or GPU frame time. Mesh replay is 10 updates/sec at 1x; population and plant positions fixed during mesh measurement.",
  runs,
  meshReplay: {
    animals: visual.animals.length,
    plants: visual.plants.length,
    ms: stats(times),
  },
  sampledSelfTime: [...self]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 18)
    .map(([name, us]) => ({ name, percent: +((100 * us) / total).toFixed(1) })),
};
writeFileSync("reports/loop-review.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
