function check(ok: unknown, message = "Assertion failed"): asserts ok {
  if (!ok) throw new Error(message);
}
const assert: typeof check & {
  equal: (a: unknown, b: unknown, message?: string) => void;
  deepEqual: (a: unknown, b: unknown) => void;
  throws: (fn: () => unknown, message?: string) => void;
} = Object.assign(check, {
  equal: (a: unknown, b: unknown, message?: string) =>
    check(a === b, message ?? `${a} !== ${b}`),
  deepEqual: (a: unknown, b: unknown) =>
    check(JSON.stringify(a) === JSON.stringify(b)),
  throws: (fn: () => unknown, message?: string) => {
    let threw = false;
    try {
      fn();
    } catch {
      threw = true;
    }
    check(threw, message);
  },
});
import {
  World,
  SPECIES,
  nurseryAge,
  maturityAge,
  type Species,
} from "./sim.ts";
import { treeRestSite } from "./resting.ts";
import { encodeSave, decodeSave } from "./save.ts";
import { OrganismMeshes } from "./meshes.ts";
import * as THREE from "three";
function fixture(species: Species) {
  const w = new World(88);
  w.animals = [];
  w.plants = [];
  w.seedBank = [];
  w.eggs = [];
  w.dens = [];
  w.time = 9;
  w.weather.cloud = 0;
  const parent = w.addAnimal(SPECIES[species].kind, undefined, species);
  Object.assign(parent, {
    x: -30,
    z: 25,
    energy: 100,
    hydration: 100,
    age: 100,
    cooldown: 100,
    altitude: 0,
  });
  Object.assign(parent.genes, {
    activityPhase: 0.25,
    twilightBias: 0,
    activeFraction: 0.8,
  });
  return { w, parent };
}
const { w, parent } = fixture("bird");
const tree = w.addPlant(undefined, -30, 25, "tree", 1)!;
assert(tree);
tree.age = 70;
tree.energy = 85;
parent.roost = tree.id;
Object.assign(parent, treeRestSite(tree, parent.id, w.weather.land));
w.layClutch(parent, 2);
assert.equal(w.eggs.length, 2);
for (const e of w.eggs) {
  assert.equal(e.embryo.nursery?.site, tree.id);
  assert.equal(e.embryo.x, parent.x);
  assert.equal(e.embryo.altitude, parent.altitude);
}
const meshes = new OrganismMeshes(new THREE.Scene());
meshes.update(
  [],
  w.plants,
  0,
  0,
  w.weather.land,
  [],
  w.eggs.map((e) => e.embryo),
);
assert.equal(
  meshes.nests.count,
  1,
  "An orphaned clutch keeps one shared visible nest",
);
const round = decodeSave(
  encodeSave({ world: w, rate: 1, paused: true, selected: parent.id }),
);
assert.deepEqual(round.world.eggs[0].embryo.nursery, w.eggs[0].embryo.nursery);
for (const egg of w.eggs) {
  egg.age = egg.duration - 0.01;
  egg.concealment = 1;
}
w.step(0.1);
const chick = w.animals.find((a) => a.parent === parent.id)!;
assert(chick && chick.nursery, "Hatched chicks keep their nest");
assert.equal(chick.state, "In nest");
assert(chick.altitude > 1);
parent.x -= 4;
parent.energy = 100;
parent.state = "Exploring";
w.step(0.1);
assert.equal(parent.state, "Returning to young");
Object.assign(parent, treeRestSite(tree, parent.id, w.weather.land));
chick.energy = 20;
chick.hydration = 40;
parent.energy = 100;
parent.hydration = 100;
const before = parent.energy;
w.step(0.1);
assert.equal(parent.state, "Feeding young");
assert(
  chick.energy > 20 && chick.hydration > 40,
  "Care supplies food and water",
);
assert(parent.energy < before - 0.4, "Food is paid from the parent reserves");
chick.age = nurseryAge(chick) + 0.01;
chick.energy = 60;
chick.hydration = 100;
w.step(0.1);
assert.equal(chick.nursery, null, "Inherited maturation determines fledging");
assert(chick.age < maturityAge(chick));
const younger = w.animals.find((a) => a.parent === parent.id && a !== chick)!;
w.plants = [];
w.step(0.1);
assert.equal(younger.nursery, null, "A destroyed tree releases its chicks");
const m = fixture("mouse");
const den = {
  id: m.w.nextId++,
  owner: m.parent.id,
  x: m.parent.x,
  z: m.parent.z,
  progress: 1,
};
m.w.dens = [den];
m.parent.home = den.id;
const baby = m.w.addAnimal(m.parent.kind, m.parent);
assert.equal(baby.nursery?.site, den.id);
m.parent.x += 4;
m.w.step(0.1);
assert.equal(baby.state, "In den");
assert.equal(baby.x, den.x);
baby.age = nurseryAge(baby) + 0.01;
baby.energy = 60;
baby.hydration = 100;
m.parent.x = den.x + 4;
m.w.step(0.1);
assert.equal(baby.nursery, null);
assert.equal(baby.state, "Following parent");
const legacy = JSON.parse(
  encodeSave({ world: m.w, rate: 1, paused: false, selected: 0 }),
);
legacy.version = 24;
for (const a of legacy.world.animals) delete a.nursery;
assert(
  decodeSave(JSON.stringify(legacy)).world.animals.every(
    (a) => a.nursery === null,
  ),
);
legacy.version = 25;
legacy.world.animals[0].nursery = {
  kind: "nest",
  site: 1,
  owner: 1,
  x: NaN,
  z: 0,
  altitude: 0,
};
assert.throws(
  () => decodeSave(JSON.stringify(legacy)),
  "Malformed nursery saves are rejected",
);
console.log(
  "Nest eggs, orphaned nest rendering, hatching, parental feeding, den young, fledging and save migration passed",
);
