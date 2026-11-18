import * as THREE from "three";
import { World } from "./sim.ts";
import { OrganismMeshes } from "./meshes.ts";
import { encodeSave, decodeSave } from "./save.ts";
function check(ok: unknown, message: string) {
  if (!ok) throw new Error(message);
}
const w = new World(88);
w.animals = [];
w.eggs = [];
for (let i = 0; i < 600; i++) {
  const a = w.addAnimal("grazer", undefined, "mouse");
  a.age = 60;
  a.energy = 130;
  a.hydration = 100;
  a.cooldown = 0;
}
w.step(0.1);
check(
  w.animals.length > 600,
  "Well-fed mice reproduce beyond both former population caps",
);
const raw = encodeSave({ world: w, rate: 1, paused: true, selected: 0 });
check(
  decodeSave(raw).world.animals.length === w.animals.length,
  "Large populations reload",
);
const meshes = new OrganismMeshes(new THREE.Scene());
const many = Array.from({ length: 1800 }, (_, i) => {
  const a = structuredClone(w.animals[0]);
  a.id = i + 1;
  a.state = "Sleeping";
  return a;
});
meshes.update(many, []);
for (const m of [...Object.values(meshes.animal), meshes.eyes]) {
  check(m.count <= m.instanceMatrix.count, "Buffers expand before writing");
  check(
    Array.from(m.instanceMatrix.array.slice(0, m.count * 16)).every(
      Number.isFinite,
    ),
    "Expanded transforms remain finite",
  );
}
check(
  meshes.animal.round.instanceMatrix.count > 14000,
  "Animal geometry actually grows beyond original allocation",
);
console.log(
  "Uncapped mouse births, large saves and growing animal mesh buffers passed",
);
