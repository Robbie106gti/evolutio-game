const assert = {
  ok(value: unknown) {
    if (!value) throw new Error("Assertion failed");
  },
  equal(a: unknown, b: unknown, message = "Values differ") {
    if (a !== b) throw new Error(message);
  },
  notEqual(a: unknown, b: unknown) {
    if (a === b) throw new Error("Expected different values");
  },
  deepEqual(a: unknown, b: unknown) {
    if (JSON.stringify(a) !== JSON.stringify(b))
      throw new Error("Snapshots differ");
  },
  throws(fn: () => unknown) {
    try {
      fn();
    } catch {
      return;
    }
    throw new Error("Expected rejection");
  },
};
import { World } from "./sim.ts";
import {
  expressionMarks,
  updateExpression,
  retainExpressedGenes,
} from "./expression.ts";
import { encodeSave, decodeSave } from "./save.ts";
const world = new World(88);
const a = world.animals[0];
a.expression = expressionMarks();
a.state = "Fleeing";
updateExpression(a, 30, 25);
assert.ok(a.expression.speed > 0.63 && a.expression.speed < 0.64);
assert.equal(a.expression.digging, 0);
const split = structuredClone(a);
split.expression = expressionMarks();
for (let i = 0; i < 300; i++) updateExpression(split, 0.1, 25);
assert.ok(Math.abs(split.expression.speed - a.expression.speed) < 1e-12);
const before = a.expression.speed;
a.state = "Sleeping";
updateExpression(a, 90, 25);
assert.ok(a.expression.speed < before * 0.38);
const inherited = expressionMarks(a.expression);
assert.equal(inherited.speed, a.expression.speed * 0.35);
inherited.speed = 1;
assert.notEqual(a.expression.speed, 1);
a.expression.speed = 1;
const candidate = structuredClone(a.genes);
candidate.speed = 2.5;
retainExpressedGenes(candidate, a, () => 0.59);
assert.equal(candidate.speed, a.genes.speed);
candidate.speed = 2.5;
retainExpressedGenes(candidate, a, () => 0.61);
assert.equal(
  candidate.speed,
  2.5,
  "Mutation remains possible even at full activation",
);
const old = JSON.parse(
  encodeSave({ world, rate: 1, paused: true, selected: 0 }),
);
old.version = 28;
for (const animal of old.world.animals) delete animal.expression;
assert.equal(
  decodeSave(JSON.stringify(old)).world.animals[0].expression.speed,
  0,
);
const current = encodeSave({ world, rate: 1, paused: true, selected: 0 });
assert.equal(decodeSave(current).world.animals[0].expression.speed, 1);
const broken = JSON.parse(current);
broken.world.animals[0].expression.speed = 2;
assert.throws(() => decodeSave(JSON.stringify(broken)));
const restored = decodeSave(current).world;
world.step(0.1);
restored.step(0.1);
assert.deepEqual(restored.animals, world.animals);
console.log(
  "Expression use, decay, timestep equivalence, retention limits, migration and deterministic continuation passed",
);
