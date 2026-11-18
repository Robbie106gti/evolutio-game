import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  landAt,
  landFieldAt,
} from "../reports/current-jump-candidate/src/terrain.ts";
import {
  habitat as beforeHabitat,
  surfaceDepth as beforeDepth,
} from "../reports/current-jump-baseline/src/ecology.ts";
import {
  habitat as afterHabitat,
  surfaceDepth as afterDepth,
} from "../reports/current-jump-candidate/src/ecology.ts";
const world = JSON.parse(
  readFileSync("reports/current-jump-start.json", "utf8"),
).world;
let seed = 7213;
const random = () =>
  (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
for (let i = 0; i < 2000; i++) {
  const x = i < 10 ? -75 + i * 15 : random() * 160 - 80,
    z = i < 10 ? 70 - i * 15 : random() * 160 - 80;
  for (const land of [world.weather.land, undefined]) {
    const fields = landAt(land, x, z);
    for (const field of Object.keys(fields))
      assert.equal(landFieldAt(land, x, z, field), fields[field]);
    assert.deepEqual(
      afterHabitat({ x, z }, world.plants, land),
      beforeHabitat({ x, z }, world.plants, land),
    );
    assert.equal(afterDepth(land, x, z), beforeDepth(land, x, z));
  }
}
console.log(
  "2,000 positions: scalar interpolation, rock shelter and surface water match baseline exactly, including boundaries and absent landscape.",
);
