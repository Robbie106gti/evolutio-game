import { World } from "./sim.ts";
import { SpatialGrid } from "./terrain.ts";
import { encodeSave, decodeSave } from "./save.ts";
function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
const items = Array.from({ length: 100 }, (_, id) => ({
  id,
  x: Math.sin(id * 3) * 30,
  z: Math.cos(id * 5) * 30,
}));
const grid = new SpatialGrid(items, 8);
for (let i = 0; i < 50; i++) {
  const x = Math.sin(i) * 20,
    z = Math.cos(i) * 20;
  const predicate = (p: (typeof items)[number]) =>
    p.id % 3 === 0 && Math.hypot(p.x - x, p.z - z) < 9;
  assert(
    grid.findNear(x, z, 9, predicate) === grid.near(x, z, 9).find(predicate),
    "Early-exit queries preserve candidate order and exact results",
  );
}
const w = new World(63);
w.animals = [];
w.plants = [];
w.dens = [];
const a = w.addAnimal("grazer", undefined, "mouse");
Object.assign(a, {
  x: -30,
  z: 25,
  age: 40,
  energy: 30,
  hydration: 100,
  state: "Resting",
  nextSenseAt: 100,
  sensedHungry: true,
  sensedTarget: 0,
});
const food = w.addPlant(undefined, a.x + 0.4, a.z, "grass")!;
w.step(0.1);
assert(
  a.sensedTarget === food.id,
  "Nearby food interrupts a delayed sensing cycle",
);
food.health = 0;
food.energy = 10;
a.nextSenseAt = 100;
w.step(0.1);
assert(
  a.sensedTarget !== food.id,
  "A dead food target is discarded immediately",
);
const cat = w.addAnimal("hunter", undefined, "cat");
Object.assign(cat, {
  x: a.x + 0.8,
  z: a.z,
  age: 80,
  energy: 40,
  stamina: 100,
  restTimer: 0,
  mealEnergy: 0,
});
a.nextSenseAt = 100;
w.step(0.1);
assert(a.sensedThreat === cat.id, "Nearby predator wakes sensing immediately");
w.animals = [a];
a.hydration = 10;
a.nextSenseAt = 100;
w.step(0.1);
assert(
  ["Seeking water", "Drinking", "Seeking crossing", "Crossing river"].includes(
    a.state,
  ),
  "Urgent thirst still interrupts the current activity",
);
const restored = decodeSave(
  encodeSave({ world: w, rate: 1, paused: true, selected: a.id }),
).world;
for (let i = 0; i < 30; i++) {
  w.step(0.1);
  restored.step(0.1);
}
assert(
  JSON.stringify(w) === JSON.stringify(restored),
  "Per-step site weather caches preserve save continuity",
);
console.log(
  "Early-exit search equivalence, immediate food/predator wakeups, invalid food targets, thirst and cached save continuity passed",
);
