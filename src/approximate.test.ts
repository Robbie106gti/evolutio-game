function check(value: unknown, message = "Assertion failed") {
  if (!value) throw new Error(message);
}
const assert = {
  equal: (a: unknown, b: unknown, message?: string) => check(a === b, message),
  ok: check,
  deepEqual: (a: unknown, b: unknown, message?: string) =>
    check(JSON.stringify(a) === JSON.stringify(b), message),
  doesNotThrow: (fn: () => unknown) => {
    fn();
  },
  throws: (fn: () => unknown, pattern: RegExp) => {
    let caught = false;
    try {
      fn();
    } catch (e) {
      caught = e instanceof Error && pattern.test(e.message);
    }
    check(caught, "Expected rejection");
  },
};
import { World } from "./sim.ts";
import { FIRST_GROVE, SANDBOX } from "./levels.ts";
import { encodeSave, decodeSave } from "./save.ts";
import {
  supportsApproximation,
  encounterProbability,
  stepApproximateAnimals,
} from "./approximate.ts";
import { maturityAge } from "./biology.ts";
const initial = encodeSave({
  world: new World(9123, FIRST_GROVE),
  rate: 1,
  paused: true,
  selected: 0,
});
const a = decodeSave(initial).world,
  b = decodeSave(initial).world;
assert.equal(supportsApproximation(a), true);
assert.equal(supportsApproximation(new World(9123, SANDBOX)), false);
assert.equal(encounterProbability(3, 0), 0);
assert.ok(
  Math.abs(
    (1 - encounterProbability(0.3, 1)) ** 2 -
      (1 - encounterProbability(0.3, 2)),
  ) < 1e-12,
);
for (let i = 0; i < 60; i++) {
  a.step(1, true);
  b.step(1, true);
}
assert.deepEqual(
  JSON.parse(JSON.stringify(a)),
  JSON.parse(JSON.stringify(b)),
  "seeded approximate runs must be reproducible",
);
assert.doesNotThrow(() =>
  decodeSave(encodeSave({ world: a, rate: 1, paused: true, selected: 0 })),
);
for (const p of a.plants) assert.ok(p.energy >= 0 && Number.isFinite(p.energy));
for (const animal of a.animals) {
  assert.ok(animal.energy > 0 && Number.isFinite(animal.x));
  assert.ok(animal.hydration >= 0 && animal.hydration <= 100);
}
const noFood = new World(123, FIRST_GROVE);
noFood.plants = [];
noFood.animals = noFood.animals.slice(0, 1);
noFood.plantRemains = [];
noFood.carcasses = [];
for (const cell of noFood.weather.land!) {
  cell.fungus = 0;
  cell.worms = 0;
}
const mouse = noFood.animals[0];
mouse.x = -30;
mouse.z = 0;
mouse.energy = 60;
mouse.cooldown = 100;
const energy = mouse.energy;
for (let i = 0; i < 10; i++) stepApproximateAnimals(noFood, 1, () => 0);
assert.ok(
  mouse.energy < energy,
  "patch encounters cannot create food when food pools are empty",
);
mouse.energy = 140;
mouse.cooldown = 0;
mouse.age = maturityAge(mouse) + 1;
mouse.hydration = 100;
mouse.nursery = null;
stepApproximateAnimals(noFood, 1, () => 0);
assert.equal(noFood.animals.length, 2);
assert.equal(noFood.animals[1].parent, mouse.id);
assert.equal(noFood.animals[1].generation, mouse.generation + 1);
assert.ok(mouse.energy < 110, "birth must spend parental energy");
const mixed = new World(123, SANDBOX);
assert.throws(() => stepApproximateAnimals(mixed, 1, () => 0), /mice and bugs/);
console.log(
  "Approximate mode: eligibility, deterministic replay, save round-trip, finite resources and inherited births passed",
);
