import { readFileSync, writeFileSync } from "node:fs";
import { decodeSave as beforeDecode } from "../reports/swarm-baseline/src/save.ts";
import { decodeSave as afterDecode } from "../src/save.ts";
import * as beforeProfile from "../reports/swarm-baseline/src/profiling.ts";
import * as afterProfile from "../src/profiling.ts";
const fixtures = [
  {
    label: "before: sandbox at 300s",
    file: "reports/long-sandbox-late.json",
    decode: beforeDecode,
    profile: beforeProfile,
  },
  {
    label: "after: sandbox at 300s",
    file: "reports/swarm-sandbox-300.json",
    decode: afterDecode,
    profile: afterProfile,
  },
  {
    label: "after: mature sandbox",
    file: "reports/swarm-long-sandbox-late.json",
    decode: afterDecode,
    profile: afterProfile,
  },
  {
    label: "after: mature grove",
    file: "reports/swarm-long-grove-late.json",
    decode: afterDecode,
    profile: afterProfile,
  },
];
const results = [];
for (let trial = 0; trial < 3; trial++)
  for (const f of trial % 2 ? [...fixtures].reverse() : fixtures) {
    const raw = readFileSync(f.file, "utf8");
    let w = f.decode(raw).world;
    for (let i = 0; i < 3; i++) w.step(0.1);
    w = f.decode(raw).world;
    const animals = w.animals.length,
      plants = w.plants.length,
      ms = [];
    f.profile.enableProfiling();
    for (let i = 0; i < 30; i++) {
      let t = performance.now();
      w.step(0.1);
      ms.push(performance.now() - t);
    }
    const sorted = [...ms].sort((a, b) => a - b);
    const result = {
      label: f.label,
      trial,
      animals,
      plants,
      mean: ms.reduce((a, b) => a + b, 0) / ms.length,
      p95: sorted[Math.floor(ms.length * 0.95)],
      phases: f.profile.timingReport(),
    };
    results.push(result);
    console.log(JSON.stringify(result));
    writeFileSync(
      "reports/swarm-profile.json",
      JSON.stringify(results, null, 2),
    );
  }
