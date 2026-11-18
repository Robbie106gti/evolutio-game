import * as THREE from "three";
import { World } from "./sim.ts";
import { OrganismMeshes } from "./meshes.ts";
import { animalAppearance, plantAppearance, footPose } from "./appearance.ts";
function check(ok: unknown, message: string) {
  if (!ok) throw new Error(message);
}
const w = new World(88),
  a = w.animals[0];
a.species = "mouse";
a.age = 100;
a.genes.insulation = 0;
const thin = animalAppearance(a);
a.genes.insulation = 1;
check(
  animalAppearance(a).coat > thin.coat && animalAppearance(a).ear < thin.ear,
  "Insulation changes silhouette",
);
a.age = 0;
const baby = animalAppearance(a).head;
a.age = 1000;
check(animalAppearance(a).head < baby, "Juveniles have larger relative heads");
const p = w.plants.find((p) => p.kind === "tree")!;
p.droughtTolerance = 0;
const wet = plantAppearance(p).crown;
p.droughtTolerance = 1;
check(plantAppearance(p).crown < wet, "Drought tolerance narrows foliage");
check(
  footPose(Math.PI * 1.5, 0.3, 0.2).y === 0 &&
    footPose(Math.PI * 0.5, 0.3, 0.2).y > 0.19,
  "Feet lift only on return stroke",
);
const meshes = new OrganismMeshes(new THREE.Scene());
const many = Array.from({ length: 560 }, (_, i) => {
  const b = structuredClone(a);
  b.id = i + 1;
  b.age = 100;
  b.state = "Exploring";
  b.genes.markings = 1;
  b.genes.limbs = i % 2 ? 0.6 : 1.5;
  b.genes.length = i % 2 ? 0.6 : 1.6;
  return b;
});
meshes.update(many, [p], 0);
for (const mesh of Object.values(meshes.animal)) {
  check(
    mesh.count <= mesh.instanceMatrix.count,
    "Full population fits buffers",
  );
  check(
    Array.from(mesh.instanceMatrix.array.slice(0, mesh.count * 16)).every(
      Number.isFinite,
    ),
    "Extreme genes render finite poses",
  );
}
const before = JSON.stringify(w);
meshes.update(w.animals, w.plants, 1);
check(
  JSON.stringify(w) === before,
  "Rendering never modifies inherited traits or simulation",
);
console.log(
  "Inherited silhouettes, juvenile proportions, foot lift, full-population buffers and render purity passed",
);
