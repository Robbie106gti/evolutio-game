import { World } from "./sim.ts";
import { careVisuals } from "./care-visuals.ts";
import { OrganismMeshes } from "./meshes.ts";
import { encodeSave, decodeSave } from "./save.ts";
import * as THREE from "three";
function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
const w = new World(88);
w.animals = [];
w.plants = [];
w.eggs = [];
w.dens = [];
w.time = 9;
w.weather.cloud = 0;
const parent = w.addAnimal("grazer", undefined, "mouse");
Object.assign(parent, {
  x: -30,
  z: 25,
  age: 100,
  altitude: 0,
  energy: 100,
  hydration: 100,
  cooldown: 100,
});
const den = {
  id: w.nextId++,
  owner: parent.id,
  x: parent.x,
  z: parent.z,
  progress: 1,
};
w.dens.push(den);
parent.home = den.id;
const baby = w.addAnimal("grazer", parent);
baby.energy = 20;
baby.hydration = 40;
parent.state = "Returning to young";
let visual = careVisuals(w.animals);
check(
  visual.get(parent.id)!.carrying > 0,
  "Returning parent visibly carries real spare reserves",
);
check(visual.get(baby.id)!.begging, "Hungry dependent young beg");
parent.energy = 48;
check(
  careVisuals(w.animals).get(parent.id)!.carrying === 0,
  "No spare reserve means no mouthful",
);
parent.energy = 100;
const before = parent.energy;
w.step(0.1);
check(
  parent.feedingTarget === baby.id && baby.fedUntilAge > baby.age,
  "Actual feeding sets giver and recipient animation cues",
);
check(
  parent.energy < before && baby.energy > 20,
  "Animation accompanies paid energy transfer",
);
visual = careVisuals(w.animals);
check(
  visual.get(parent.id)!.feeding &&
    visual.get(baby.id)!.chewing &&
    !visual.get(baby.id)!.begging,
  "Feeding interrupts begging with chewing",
);
const saved = encodeSave({
  world: w,
  rate: 1,
  paused: true,
  selected: parent.id,
});
const restored = decodeSave(saved).world;
check(
  restored.animals[0].feedingTarget === baby.id &&
    restored.animals[1].fedUntilAge === baby.fedUntilAge,
  "Care animation state survives save/load",
);
const old = JSON.parse(saved);
old.version = 25;
for (const a of old.world.animals) {
  delete a.feedingTarget;
  delete a.fedUntilAge;
}
check(
  decodeSave(JSON.stringify(old)).world.animals.every(
    (a) => a.feedingTarget === 0 && a.fedUntilAge === 0,
  ),
  "Old saves migrate without fake feed events",
);
const meshes = new OrganismMeshes(new THREE.Scene());
meshes.update(w.animals, [], 1);
const capture = () =>
  Array.from(
    meshes.animal.round.instanceMatrix.array.slice(
      0,
      meshes.animal.round.count * 16,
    ),
  );
const first = capture();
meshes.update(w.animals, [], 100);
check(
  JSON.stringify(first) === JSON.stringify(capture()),
  "Care animation freezes with paused animal age, not wall time",
);
parent.age += 0.2;
baby.age += 0.2;
meshes.update(w.animals, [], 101);
check(
  JSON.stringify(first) !== JSON.stringify(capture()),
  "Feeding moves while simulation advances",
);
for (const mesh of [
  meshes.animal.round,
  meshes.animal.limb,
  meshes.animal.angular,
])
  check(
    Array.from(mesh.instanceMatrix.array.slice(0, mesh.count * 16)).every(
      Number.isFinite,
    ),
    "Care poses have finite matrices",
  );
baby.age = baby.fedUntilAge + 1;
baby.energy = 70;
check(!careVisuals(w.animals).get(baby.id)!.begging, "Fed young stop begging");
w.animals = [parent];
check(
  !careVisuals(w.animals).get(parent.id)!.feeding &&
    careVisuals(w.animals).get(parent.id)!.carrying === 0,
  "Missing young do not leave a phantom food transfer",
);
console.log(
  "Care reserves, hungry begging, real transfer cues, chewing, animation pause and save migration passed",
);
