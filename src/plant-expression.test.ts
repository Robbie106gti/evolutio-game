import { World } from "./sim.ts";
import {
  plantExpressionMarks,
  updatePlantExpression,
  retainPlantTraits,
} from "./plant-expression.ts";
import { encodeSave, decodeSave } from "./save.ts";
function check(ok: unknown, message: string) {
  if (!ok) throw new Error(message);
}
const w = new World(88);
for (const kind of ["grass", "bush", "tree"] as const) {
  const p = w.plants.find((p) => p.kind === kind)!;
  p.expression = plantExpressionMarks();
  updatePlantExpression(p, 30, 0, 0);
  check(
    p.expression.droughtTolerance > 0.63 && p.expression.floodTolerance === 0,
    "Dry soil activates only drought",
  );
  const split = structuredClone(p);
  split.expression = plantExpressionMarks();
  for (let i = 0; i < 300; i++) updatePlantExpression(split, 0.1, 0, 0);
  check(
    Math.abs(
      split.expression.droughtTolerance - p.expression.droughtTolerance,
    ) < 1e-12,
    "Elapsed time independent of staggering",
  );
  const before = p.expression.droughtTolerance;
  updatePlantExpression(p, 90, 1, 1);
  check(
    p.expression.droughtTolerance < before * 0.38 &&
      p.expression.floodTolerance > 0.95,
    "Flooding replaces drought memory",
  );
  const child = structuredClone(p);
  child.droughtTolerance = 0.123;
  p.expression.droughtTolerance = 1;
  retainPlantTraits(child, p, () => 0.59);
  check(
    child.droughtTolerance === p.droughtTolerance,
    "Activated tolerance preserved",
  );
  child.droughtTolerance = 0.123;
  retainPlantTraits(child, p, () => 0.61);
  check(child.droughtTolerance === 0.123, "Mutation remains possible");
  const newborn = w.addPlant(p, p.x, p.z);
  check(
    newborn && newborn.expression.droughtTolerance === 0.35,
    "Offspring inherit reduced memory",
  );
  check(newborn!.expression !== p.expression, "Independent offspring marks");
}
const seed = { ...w.plants[0], expression: { ...w.plants[0].expression } };
w.seedBank.push(seed);
const raw = encodeSave({ world: w, rate: 1, paused: true, selected: 0 });
const restored = decodeSave(raw).world;
check(
  JSON.stringify(restored.seedBank[0].expression) ===
    JSON.stringify(seed.expression),
  "Dormant seed memory saved",
);
w.step(0.1);
restored.step(0.1);
check(
  JSON.stringify(w.plants) === JSON.stringify(restored.plants),
  "Deterministic continuation",
);
const old = JSON.parse(raw);
old.version = 29;
for (const p of [...old.world.plants, ...old.world.seedBank])
  delete p.expression;
const migrated = decodeSave(JSON.stringify(old)).world;
check(
  migrated.seedBank[0].expression.droughtTolerance === 0,
  "Legacy dormant seeds migrate",
);
const bad = JSON.parse(raw);
bad.world.seedBank[0].expression.floodTolerance = 2;
let rejected = false;
try {
  decodeSave(JSON.stringify(bad));
} catch {
  rejected = true;
}
check(rejected, "Invalid seed marks rejected");
console.log(
  "Plant/tree stress memory, decay, inheritance, seed persistence and migration passed",
);
