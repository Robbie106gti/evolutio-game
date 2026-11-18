import { World, SPECIES, type Species } from "./sim.ts";
import { treeRestSite, safeDenRoute } from "./resting.ts";
import { OrganismMeshes } from "./meshes.ts";
import { encodeSave, decodeSave } from "./save.ts";
import * as THREE from "three";
function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
function sleeper(species: Species) {
  const w = new World(88);
  w.animals = [];
  w.plants = [];
  w.seedBank = [];
  w.eggs = [];
  w.dens = [];
  w.time = 9;
  w.weather.cloud = 0;
  const a = w.addAnimal(SPECIES[species].kind, undefined, species);
  a.x = -30;
  a.z = 25;
  a.energy = 100;
  a.hydration = 100;
  a.age = 100;
  a.altitude = 0;
  Object.assign(a.genes, {
    activityPhase: 0.75,
    twilightBias: 0,
    activeFraction: 0.5,
  });
  return { w, a };
}
const bird = sleeper("bird");
const tree = bird.w.addPlant(undefined, -29, 25, "tree", 1)!;
tree.age = 70;
tree.energy = 85;
for (let i = 0; i < 100; i++) bird.w.step(0.1);
assert(
  bird.a.state === "Sleeping" &&
    bird.a.roost === tree.id &&
    bird.a.altitude > 1,
  "Birds settle into an elevated tree nest",
);
const site = treeRestSite(tree, bird.a.id, bird.w.weather.land);
assert(
  Math.hypot(bird.a.x - site.x, bird.a.z - site.z) < 0.2 &&
    Math.abs(bird.a.altitude - site.altitude) < 0.2,
  "Bird and nest use the same branch position",
);
const meshes = new OrganismMeshes(new THREE.Scene());
meshes.update(bird.w.animals, bird.w.plants, 0, 0, bird.w.weather.land);
assert(
  meshes.nests.count === 1 &&
    meshes.perches.count === 1 &&
    meshes.ids.get(meshes.nests)?.[0] === bird.a.id,
  "Tree nests and branches render and select their bird",
);
const raw = encodeSave({
  world: bird.w,
  rate: 1,
  paused: true,
  selected: bird.a.id,
});
assert(
  decodeSave(raw).world.animals[0].roost === tree.id,
  "Roost attachment survives saving",
);
const old = JSON.parse(raw);
old.version = 23;
old.world.animals.forEach((a: any) => delete a.roost);
assert(
  decodeSave(JSON.stringify(old)).world.animals[0].roost === 0,
  "Older islands migrate with no stale roost",
);
bird.w.plants = [];
bird.w.step(0.1);
assert(
  Number(bird.a.roost) === 0 && String(bird.a.state) !== "Sleeping",
  "Birds leave a removed tree instead of sleeping in midair",
);
for (let i = 0; i < 40; i++) bird.w.step(0.1);
assert(
  bird.a.state === "Sleeping" && bird.a.altitude < 0.2,
  "A bird without trees can settle into a ground nest",
);
meshes.update(bird.w.animals, [], 1, 0, bird.w.weather.land);
assert(
  meshes.nests.count === 1 && Number(meshes.perches.count) === 0,
  "Ground nests have no floating branch",
);
const mouse = sleeper("mouse");
const den = {
  id: mouse.w.nextId++,
  owner: mouse.a.id,
  x: -29.5,
  z: 25,
  progress: 1,
};
mouse.w.dens = [den];
mouse.w.step(0.1);
assert(
  mouse.a.home === den.id && mouse.a.state === "Sleeping",
  "Animals adopt a nearby complete den for sleep",
);
const unfinished = sleeper("fox");
unfinished.w.dens = [
  {
    id: unfinished.w.nextId++,
    owner: unfinished.a.id,
    x: -29.5,
    z: 25,
    progress: 0.4,
  },
];
unfinished.w.step(0.1);
assert(
  unfinished.a.home === 0,
  "Unfinished dens are not treated as ready sleeping places",
);
assert(
  !safeDenRoute({ x: 0, z: 0 }, { x: 6, z: 0 }, (x) =>
    x > 2 && x < 4 ? 0.8 : 0,
  ),
  "Deep water blocks a land animal rest route",
);
assert(
  !safeDenRoute({ x: 0, z: 0 }, { x: 6, z: 0 }, (x) => (x > 5 ? 0.2 : 0)),
  "Flooded den entrances are rejected",
);
for (const species of Object.keys(SPECIES) as Species[]) {
  const { a } = sleeper(species);
  a.state = "Exploring";
  meshes.update([a], [], 2);
  const awake = Array.from(meshes.animal.round.instanceMatrix.array).slice(
    0,
    meshes.animal.round.count * 16,
  );
  a.state = "Sleeping";
  meshes.update([a], [], 3);
  const asleep = Array.from(meshes.animal.round.instanceMatrix.array).slice(
    0,
    meshes.animal.round.count * 16,
  );
  assert(
    JSON.stringify(awake) !== JSON.stringify(asleep),
    `${species} gets a distinct sleeping pose`,
  );
  assert(
    asleep.every(Number.isFinite),
    `${species} sleeping geometry is finite`,
  );
  meshes.update([a], [], 4);
  assert(
    JSON.stringify(asleep) ===
      JSON.stringify(
        Array.from(meshes.animal.round.instanceMatrix.array).slice(
          0,
          meshes.animal.round.count * 16,
        ),
      ),
    `${species} pose freezes when simulation is paused`,
  );
}
console.log(
  "Sleeping poses, tree perches/nests, den preference, safe routes, lost roosts and save migration passed",
);
