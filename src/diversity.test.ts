import {
  World,
  SPECIES,
  canHunt,
  APPEARANCE_DEFAULTS,
  type Species,
} from "./sim.ts";
import { canHuntAt, maturityAge } from "./biology.ts";
import { encodeSave, decodeSave } from "./save.ts";
import * as THREE from "three";
import { OrganismMeshes } from "./meshes.ts";
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const w = new World(42);
assert(
  Object.keys(SPECIES).every((s) => w.animals.some((a) => a.species === s)),
  "New islands contain all eleven species",
);
const animal = (s: Species) => w.animals.find((a) => a.species === s)!;
assert(
  canHunt(animal("cat"), animal("mouse")) &&
    canHunt(
      w.animals.find(
        (a) => a.species === "bird" && a.birdDiet === "insectivore",
      )!,
      animal("bug"),
    ) &&
    canHunt(animal("snake"), animal("mouse")),
  "Food web contains the intended predator/prey links",
);
assert(
  !canHunt(animal("mouse"), animal("cat")) &&
    !canHunt(animal("cat"), animal("cat")) &&
    !canHunt(animal("snake"), animal("cat")),
  "Species do not attack arbitrary neighbours",
);
const spider = { ...animal("spider"), age: 100 };
spider.genes = { ...spider.genes, size: 1 };
for (const species of ["mouse", "bird"] as const) {
  const prey = { ...animal(species), age: 0, altitude: 0 };
  prey.genes = { ...prey.genes, size: 1 };
  assert(canHunt(spider, prey), "Grown spider can take small grounded prey");
  assert(!canHunt({ ...spider, age: 0 }, prey), "Spiderlings cannot tackle the same prey");
  assert(!canHunt(spider, { ...prey, age: maturityAge(prey) }), "Prey outgrows the spider");
  if (species === "bird")
    assert(!canHunt(spider, { ...prey, altitude: 1 }), "Airborne bird escapes spider");
}
const croc = { ...animal("crocodile"), x: 0, z: 0 };
const bankBird = { ...animal("bird"), x: 1, z: 0, altitude: 0 };
const bankDepth = (x: number) => x < 0.5 ? 1 : 0;
assert(canHuntAt(croc, bankBird, bankDepth), "Crocodile can strike a bird at the bank");
assert(!canHuntAt(croc, { ...bankBird, altitude: 1 }, bankDepth), "Flying bird is safe");
assert(!canHuntAt(croc, { ...bankBird, x: 2 }, bankDepth), "No pursuit inland");
assert(!canHuntAt(croc, { ...bankBird, species: "mouse" }, bankDepth), "Mice are outside the crocodile diet");
assert(!canHuntAt(croc, bankBird, () => 0), "Crocodile needs water to ambush");
const hatchling = { ...croc, age: 0 };
for (const predator of [animal("cat"), animal("fox"), { ...bankBird, birdDiet: "raptor" as const }]) {
  assert(canHuntAt(predator, hatchling, () => 0), "Exposed hatchlings are prey");
  assert(!canHuntAt(predator, hatchling, () => 1), "Deep water shelters hatchlings");
  assert(!canHuntAt(predator, { ...hatchling, age: maturityAge(croc) / 3 }, () => 0), "Juveniles outgrow hatchling predators");
}
assert(!canHuntAt({ ...bankBird, birdDiet: "insectivore" }, hatchling, () => 0), "Insect eaters leave hatchlings alone");
for (const s of Object.keys(SPECIES) as Species[]) {
  const parent = animal(s);
  const before = JSON.stringify(parent.genes);
  const child = w.addAnimal(parent.kind, parent);
  assert(child.species === s, "Offspring inherit species");
  assert(
    child.genes.length !== parent.genes.length &&
      child.genes.cadence !== parent.genes.cadence,
    "Appearance and gait mutate",
  );
  assert(
    JSON.stringify(parent.genes) === before,
    "Mutation does not alter parent",
  );
}
const raw = encodeSave({
  world: w,
  rate: 1,
  paused: true,
  selected: animal("bird").id,
});
const saved = decodeSave(raw);
assert(
  JSON.stringify(saved.world) === JSON.stringify(w),
  "Species, morphology and gait survive save/restore",
);
const legacy = JSON.parse(raw);
legacy.version = 2;
for (const a of legacy.world.animals) {
  delete a.species;
  delete a.distance;
  for (const key of Object.keys(APPEARANCE_DEFAULTS)) delete a.genes[key];
}
const migrated = decodeSave(JSON.stringify(legacy));
assert(
  migrated.world.animals.length === w.animals.length &&
    migrated.world.seed === w.seed,
  "Migration preserves population and random state",
);
assert(
  migrated.world.animals.every(
    (a) =>
      a.genes.stride === 1 &&
      a.genes.length === 1 &&
      ["mouse", "cat"].includes(a.species),
  ),
  "Legacy animals get neutral morphology",
);
for (const key of ["species", "stride"]) {
  const broken = JSON.parse(raw);
  if (key === "species") broken.world.animals[0].species = "dragon";
  else broken.world.animals[0].genes.stride = -3;
  let rejected = false;
  try {
    decodeSave(JSON.stringify(broken));
  } catch {
    rejected = true;
  }
  assert(rejected, "Invalid species or morphology rejected");
}
// Isolate movement to verify that gait changes do real work and incur energy costs.
const slow = new World(9),
  fast = new World(9);
for (const x of [slow, fast]) {
  x.plants = [];
  x.animals = [x.animals[0]];
  x.animals[0].x = x.animals[0].z = 0;
}
fast.animals[0].genes.cadence = 1.5;
slow.animals[0].genes.cadence = 0.6;
slow.step(0.1);
fast.step(0.1);
assert(
  fast.animals[0].distance > slow.animals[0].distance &&
    fast.animals[0].energy < slow.animals[0].energy,
  "Faster cadence moves farther and consumes more energy",
);
console.log(
  "Species diets, inherited morphology, gait costs, and save migration passed",
);

const meshes = new OrganismMeshes(new THREE.Scene());
const snapshot = () =>
  JSON.stringify(
    Object.values(meshes.animal).map((m) =>
      Array.from(m.instanceMatrix.array.slice(0, m.count * 16)),
    ),
  );
for (const species of Object.keys(SPECIES) as Species[]) {
  const a = animal(species);
  a.age = 20;
  a.state = "Exploring";
  a.distance = 0;
  meshes.update([a], []);
  const first = snapshot();
  meshes.update([a], []);
  assert(snapshot() === first, "Paused gait stays still");
  a.distance = 0.37;
  meshes.update([a], []);
  assert(snapshot() !== first, `${species} has an animated gait`);
  assert(
    Object.values(meshes.animal).every(
      (m) =>
        m.count <= m.instanceMatrix.count &&
        Array.from(m.instanceMatrix.array.slice(0, m.count * 16)).every(
          Number.isFinite,
        ),
    ),
    "Mesh capacity and transforms valid",
  );
}
console.log(
  "All eleven species render finite animated meshes and freeze when paused",
);
