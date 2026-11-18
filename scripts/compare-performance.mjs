import * as THREE from "three";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
const before = {
  sim: await import("../reports/perf-baseline/src/sim.ts"),
  save: await import("../reports/perf-baseline/src/save.ts"),
  mesh: await import("../reports/perf-baseline/src/meshes.ts"),
  profile: await import("../reports/perf-baseline/src/profiling.ts"),
};
const after = {
  sim: await import("../src/sim.ts"),
  save: await import("../src/save.ts"),
  mesh: await import("../src/meshes.ts"),
  profile: await import("../src/profiling.ts"),
};
const fixture = "reports/performance-fixture.json";
if (!existsSync(fixture)) {
  const w = new before.sim.World(7823);
  for (let i = 0; i < 1200; i++) w.step(0.1);
  writeFileSync(
    fixture,
    before.save.encodeSave({ world: w, rate: 1, paused: true, selected: 0 }),
  );
}
const raw = readFileSync(fixture, "utf8");
const result = {
  setup: {
    seed: 7823,
    warmupSteps: 1200,
    stepsPerTrial: 300,
    trials: 3,
    note: "Alternating runs from the same saved mature island; mesh replay uses the same fixed organisms at 10 updates/sec.",
  },
  before: [],
  after: [],
};
for (let trial = 0; trial < 3; trial++)
  for (const [name, code] of [
    ["before", before],
    ["after", after],
  ]) {
    let w = code.save.decodeSave(raw).world;
    for (let i = 0; i < 30; i++) w.step(0.1);
    w = code.save.decodeSave(raw).world;
    code.profile.enableProfiling();
    const ms = [];
    for (let i = 0; i < 300; i++) {
      let t = performance.now();
      w.step(0.1);
      ms.push(performance.now() - t);
    }
    const phases = code.profile.timingReport();
    // Fixed initial island for fair visual comparison, independent of divergent evolution.
    const visual = code.save.decodeSave(raw).world;
    const meshes = new code.mesh.OrganismMeshes(new THREE.Scene());
    for (let i = 0; i < 30; i++)
      meshes.update(visual.animals, visual.plants, i * 0.1);
    let t = performance.now();
    for (let i = 30; i < 230; i++)
      meshes.update(visual.animals, visual.plants, i * 0.1);
    const meshMs = (performance.now() - t) / 200;
    ms.sort((a, b) => a - b);
    const entry = {
      meanMs: ms.reduce((a, b) => a + b, 0) / ms.length,
      p95Ms: ms[Math.floor(ms.length * 0.95)],
      meshMs,
      phases,
      animals: w.animals.length,
      plants: w.plants.length,
    };
    result[name].push(entry);
    console.log(name, trial + 1, JSON.stringify(entry));
  }
for (const name of ["before", "after"]) {
  const rows = result[name];
  result[name + "Average"] = {
    stepMs: rows.reduce((s, r) => s + r.meanMs, 0) / rows.length,
    meshMs: rows.reduce((s, r) => s + r.meshMs, 0) / rows.length,
  };
}
result.improvementPercent = {
  simulation:
    100 * (1 - result.afterAverage.stepMs / result.beforeAverage.stepMs),
  meshes: 100 * (1 - result.afterAverage.meshMs / result.beforeAverage.meshMs),
};
writeFileSync(
  "reports/performance-comparison.json",
  JSON.stringify(result, null, 2),
);
console.log(
  JSON.stringify(
    {
      before: result.beforeAverage,
      after: result.afterAverage,
      improvementPercent: result.improvementPercent,
    },
    null,
    2,
  ),
);
