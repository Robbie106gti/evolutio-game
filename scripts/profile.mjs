import { enableProfiling, timingReport } from "../src/profiling.ts";
import { World } from "../src/sim.ts";
import { OrganismMeshes } from "../src/meshes.ts";
import * as THREE from "three";
import inspector from "node:inspector";
import { writeFileSync } from "node:fs";
const w = new World(7823);
for (let i = 0; i < 1200; i++) w.step(0.1);
const session = new inspector.Session();
session.connect();
const post = (method, params = {}) =>
  new Promise((resolve, reject) =>
    session.post(method, params, (err, result) =>
      err ? reject(err) : resolve(result),
    ),
  );
enableProfiling();
await post("Profiler.enable");
await post("Profiler.start");
const samples = [];
for (let i = 0; i < 300; i++) {
  const start = performance.now();
  w.step(0.1);
  samples.push(performance.now() - start);
}
const { profile } = await post("Profiler.stop");
session.disconnect();
writeFileSync("reports/current-simulation.cpuprofile", JSON.stringify(profile));
function stats(values) {
  const s = [...values].sort((a, b) => a - b);
  return {
    mean: values.reduce((a, b) => a + b, 0) / values.length,
    median: s[Math.floor(s.length / 2)],
    p95: s[Math.floor(s.length * 0.95)],
  };
}
const meshes = new OrganismMeshes(new THREE.Scene());
const meshResults = {};
for (const [name, animals, plants] of [
  ["all", w.animals, w.plants],
  ["animalsOnly", w.animals, []],
  ["plantsOnly", [], w.plants],
]) {
  for (let i = 0; i < 20; i++) meshes.update(animals, plants);
  const ms = [];
  for (let i = 0; i < 100; i++) {
    const start = performance.now();
    meshes.update(animals, plants);
    ms.push(performance.now() - start);
  }
  meshResults[name] = stats(ms);
}
meshes.update(w.animals, w.plants);
const geometry = meshes.pickables.map((m) => ({
  instances: m.count,
  triangles:
    (m.count *
      (m.geometry.index?.count ?? m.geometry.attributes.position.count)) /
    3,
}));
const result = {
  seed: 7823,
  warmupSteps: 1200,
  measuredSteps: 300,
  animals: w.animals.length,
  plants: w.plants.length,
  simulationMs: stats(samples),
  simulationPhases: timingReport(),
  meshPreparationMs: meshResults,
  organismTriangles: geometry.reduce((s, m) => s + m.triangles, 0),
  note: "Node CPU timings; excludes browser UI, environment meshes, GPU drawing and shadow passes.",
};
writeFileSync(
  "reports/performance-current.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
