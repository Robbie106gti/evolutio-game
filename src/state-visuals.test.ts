import * as THREE from "three";
import { World } from "./sim.ts";
import { OrganismMeshes } from "./meshes.ts";
import { ANIMAL_STATES } from "./animal-state.ts";
import { SPECIES } from "./species.ts";
import { animalPose, plantLifeVisuals } from "./state-visuals.ts";
import type { Species } from "./model.ts";
function check(ok: unknown, message: string) {
  if (!ok) throw new Error(message);
}
const w = new World(88),
  meshes = new OrganismMeshes(new THREE.Scene());
const a = w.animals[0];
a.state = "Stalking";
check(animalPose(a).crouch < 1, "Stalk crouches");
a.state = "Sprinting";
check(animalPose(a).reach > 1, "Sprint extends stride");
for (const state of [
  "Drinking",
  "Digging",
  "Burying eggs",
  "Eating",
] as const) {
  a.state = state;
  check(!animalPose(a).moving, "Stationary actions stop walking");
}
a.species = "frog";
a.state = "Exploring";
a.distance =
  ((Math.PI / 2 - a.id) * Math.max(0.6, a.genes.stride)) /
  (7 * a.genes.cadence);
check(animalPose(a).hop > 0.1, "Frogs hop");
a.state = "Crossing river";
check(animalPose(a).frogHop === 0, "Crossing frogs do not hop");
for (const species of Object.keys(SPECIES) as Species[]) {
  a.species = species;
  for (const state of ANIMAL_STATES) {
    a.state = state;
    meshes.update([a], [], 1);
    const before = JSON.stringify(
      Object.values(meshes.animal).map((m) =>
        Array.from(m.instanceMatrix.array.slice(0, m.count * 16)),
      ),
    );
    meshes.update([a], [], 1);
    check(
      before ===
        JSON.stringify(
          Object.values(meshes.animal).map((m) =>
            Array.from(m.instanceMatrix.array.slice(0, m.count * 16)),
          ),
        ),
      "Paused state freezes",
    );
    for (const m of Object.values(meshes.animal))
      check(
        Array.from(m.instanceMatrix.array.slice(0, m.count * 16)).every(
          Number.isFinite,
        ),
        "Every species/state has finite pose",
      );
  }
}
const p = w.plants[0];
p.age = 0;
const seedling = plantLifeVisuals(p).size;
p.age = 10000;
const mature = plantLifeVisuals(p).size;
check(mature > seedling * 3, "Age drives structural growth");
p.energy = 0;
check(
  plantLifeVisuals(p).size === mature,
  "Grazing does not shrink mature trunks",
);
p.kind = "bush";
p.expression.droughtTolerance = 1;
p.health = 20;
check(plantLifeVisuals(p).droop < 0.8, "Drought wilts foliage");
console.log(
  "All species/state poses finite and paused; stalking, sprinting, stationary actions, frog hops and plant life stages passed",
);
