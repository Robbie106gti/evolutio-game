import { World } from "./sim.ts";
import { selectedFamily, followShift } from "./family.ts";
import { encodeSave, decodeSave } from "./save.ts";
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const world = new World(42);
const parent = world.animals[0],
  child = world.addAnimal(parent.kind, parent),
  sibling = world.addAnimal(parent.kind, parent),
  baby = world.addAnimal(child.kind, child);
let family = selectedFamily(world, child.id);
assert(
  family.parent === parent &&
    family.children.length === 1 &&
    family.children[0] === baby,
  "Highlight the direct parent and offspring, not siblings",
);
assert(
  !family.children.includes(sibling),
  "Siblings must not be marked as offspring",
);
const newborn = world.addAnimal(child.kind, child);
assert(
  selectedFamily(world, child.id).children.includes(newborn),
  "Newborns join the highlighted family immediately",
);
child.energy = 0;
world.step(0.1);
family = selectedFamily(world, child.id);
assert(
  !family.living &&
    family.selected?.id === child.id &&
    family.children.length === 2,
  "A deceased selected animal stops camera tracking but keeps living offspring",
);
parent.energy = 0;
world.step(0.1);
assert(
  !selectedFamily(world, child.id).parent,
  "Deceased parents must not have island highlights",
);
assert(
  !selectedFamily(world, world.plants[0].id).selected,
  "Selecting plants clears animal family overlays",
);
const target = { x: 0, y: 0, z: 0 },
  animal = { x: 12, z: -5 };
const shift = followShift(target, animal, 1 / 60);
assert(
  shift.x > 0 && shift.x < animal.x && shift.z < 0 && shift.z > animal.z,
  "Camera moves smoothly toward animal",
);
const simulate = (fps: number) => {
  const t = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < fps; i++) {
    const d = followShift(t, animal, 1 / fps);
    t.x += d.x;
    t.y += d.y;
    t.z += d.z;
  }
  return t;
};
assert(
  Math.abs(simulate(30).x - simulate(60).x) < 1e-10,
  "Follow smoothing is frame-rate independent",
);
const camera = { x: 20, y: 30, z: 40 };
const before = {
  x: camera.x - target.x,
  y: camera.y - target.y,
  z: camera.z - target.z,
};
for (const key of ["x", "y", "z"] as const) {
  camera[key] += shift[key];
  target[key] += shift[key];
  assert(
    Math.abs(camera[key] - target[key] - before[key]) < 1e-10,
    "Following preserves user orbit and zoom offset",
  );
}
const saved = decodeSave(
  encodeSave({
    world,
    rate: 1,
    paused: true,
    selected: baby.id,
    follow: false,
  }),
);
assert(
  saved.follow === false && saved.selected === baby.id,
  "Follow preference and selection survive saving",
);
const old = decodeSave(
  encodeSave({ world, rate: 1, paused: true, selected: baby.id }),
);
assert(old.follow === true, "Older saves receive a safe follow default");
console.log(
  "Family relationships, births/deaths, follow smoothing, orbit preservation, and save compatibility passed",
);
