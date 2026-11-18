import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { decodeSave as baseline } from "../reports/fast-forward-baseline/src/save.ts";
import { decodeSave as candidate } from "../reports/fast-forward-candidate/src/save.ts";
const results = [];
for (const file of [
  "reports/performance-fixture.json",
  "reports/swarm-long-sandbox-late.json",
]) {
  const raw = readFileSync(file, "utf8");
  let a = baseline(raw).world,
    b = candidate(raw).world;
  for (let i = 0; i < 200; i++) {
    a.step(0.1);
    b.step(0.1);
  }
  assert.equal(
    JSON.stringify(a),
    JSON.stringify(b),
    "World/RNG must be identical after 200 steps",
  );
  for (let trial = 0; trial < 3; trial++)
    for (const [name, decode] of trial % 2
      ? [
          ["after", candidate],
          ["before", baseline],
        ]
      : [
          ["before", baseline],
          ["after", candidate],
        ]) {
      let w = decode(raw).world;
      for (let i = 0; i < 20; i++) w.step(0.1);
      w = decode(raw).world;
      const ms = [];
      for (let i = 0; i < 100; i++) {
        const t = performance.now();
        w.step(0.1);
        ms.push(performance.now() - t);
      }
      ms.sort((a, b) => a - b);
      const row = {
        file,
        name,
        trial,
        mean: ms.reduce((a, b) => a + b, 0) / ms.length,
        p95: ms[95],
        animals: w.animals.length,
        plants: w.plants.length,
      };
      results.push(row);
      console.log(JSON.stringify(row));
    }
}
writeFileSync(
  "reports/fast-forward-comparison.json",
  JSON.stringify(results, null, 2),
);
