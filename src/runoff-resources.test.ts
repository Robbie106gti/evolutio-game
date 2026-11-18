import { World } from "./sim.ts";
import { initialLandscape, landIndex, terrainHeight } from "./terrain.ts";
import {
  stepRunoff,
  surfaceDepth,
  waterDepth,
  createWaterQuery,
} from "./ecology.ts";
import { applyIslandTool } from "./island-tools.ts";
import { encodeSave, decodeSave } from "./save.ts";
import { OrganismMeshes } from "./meshes.ts";
import * as THREE from "three";
function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
const dryWeather = () => ({
  land: initialLandscape(),
  cloud: 0,
  moisture: 0.5,
  raining: false,
});
const flow = dryWeather();
const high = landIndex(-36, 28),
  low = landIndex(-28, 28);
flow.land[high].surfaceWater = 1;
flow.land[low].elevation = -5;
stepRunoff(0, 1, flow, []);
assert(
  (flow.land[high].surfaceWater ?? 0) < 1 &&
    (flow.land[low].surfaceWater ?? 0) > 0,
  "Water moves downhill without negative depths",
);
assert(
  flow.land.every((c) => (c.surfaceWater ?? 0) >= 0),
  "Runoff remains nonnegative",
);
const channel = dryWeather();
for (let x = -36; x <= 4; x += 8) channel.land[landIndex(x, 28)].elevation = -5;
const isolated = landIndex(-44, -44);
channel.land[isolated].elevation = -5;
for (let t = 0; t < 240; t++) stepRunoff(0, 1, channel, []);
assert(
  (channel.land[landIndex(-20, 28)].surfaceWater ?? 0) > 0.05,
  "A dug channel connects to and fills from the river",
);
assert(
  (channel.land[isolated].surfaceWater ?? 0) < 0.001,
  "Digging an isolated pond does not create water",
);
assert(
  surfaceDepth(channel.land, -20, 28) > 0.05,
  "Collected water is queryable",
);
assert(
  waterDepth([], -20, 28, channel.land) ===
    createWaterQuery([], channel.land)(-20, 28),
  "Cached and direct runoff queries agree",
);
const wet = dryWeather();
wet.cloud = 1;
wet.land[isolated].elevation = -5;
for (let t = 0; t < 120; t++) stepRunoff(0, 1, wet, []);
assert(
  (wet.land[isolated].surfaceWater ?? 0) > 0.01,
  "Rain fills an isolated depression",
);
const w = new World(31);
w.animals = [];
w.plants = [];
w.seedBank = [];
applyIslandTool(w, "dig", -36, 28, 8, 1, false);
assert(
  terrainHeight(-36, 28, w.weather.land) < terrainHeight(-36, 28),
  "Digging changes the hydraulic bed",
);
for (let i = 0; i < 2105; i++) w.addPlant(undefined, -36, 28, "grass");
assert(
  w.plants.length === 2105,
  "Plant count can exceed 2000 and former family limits",
);
const restored = decodeSave(
  encodeSave({ world: w, rate: 1, paused: true, selected: 0 }),
);
assert(
  restored.world.plants.length === 2105,
  "Larger vegetation populations survive saving",
);
const meshes = new OrganismMeshes(new THREE.Scene());
meshes.update([], w.plants, 0, 0, w.weather.land);
assert(
  meshes.plantVariants.grass.reduce((n, m) => n + m.count, 0) === 2105,
  "Every plant has a visible instance",
);
// Force one variety beyond the original buffer size.
w.plants.forEach((p) => (p.variety = 0));
meshes.update([], w.plants, 1, 0, w.weather.land);
assert(
  meshes.plant.grass.count === 2105 &&
    meshes.plant.grass.instanceMatrix.count >= 2105,
  "Plant instance buffers grow without a rendering cap",
);
const health = w.plants[0].health;
for (let i = 0; i < 20; i++) w.step(0.1);
assert(
  w.plants[0].health < health,
  "Overcrowding damages plants through resource competition",
);
for (const species of ["mouse", "bug", "bird"] as const) {
  const world = new World(54);
  world.animals = [];
  world.plants = [];
  world.eggs = [];
  world.seedBank = [];
  const animal = world.addAnimal("grazer", undefined, species);
  animal.x = -36;
  animal.z = 28;
  animal.energy = 40;
  animal.hydration = 100;
  animal.age = 100;
  animal.altitude = 0;
  if (species === "bird") animal.birdDiet = "insectivore";
  const cell = world.weather.land![landIndex(animal.x, animal.z)];
  cell.fungus = 0.8;
  world.step(0.1);
  assert(
    cell.fungus < 0.8 &&
      animal.energy > 40 &&
      animal.state === "Eating mushrooms",
    `${species} eats a finite amount of fungal food`,
  );
  decodeSave(
    encodeSave({ world, rate: 1, paused: false, selected: animal.id }),
  );
}
console.log(
  "Runoff, river connections, rain-fed depressions, resource competition, expanding plant buffers and mushroom diets passed",
);

const dying = new World(71);
dying.animals = [];
dying.plants = [];
dying.eggs = [];
dying.seedBank = [];
const tree = dying.addPlant(undefined, -36, 28, "tree", 1)!;
tree.health = 0.01;
tree.floodTolerance = 0;
applyIslandTool(dying, "water", -36, 28, 8, 1, false);
dying.step(0.1);
assert(
  !dying.plants.some((p) => p.id === tree.id) &&
    dying.plantDeaths.flooding === 1,
  "A waterlogged plant dies and records flooding",
);
assert(
  dying.plantRemains.some((p) => p.id === tree.id),
  "Dead plants leave persistent visible remains",
);
for (let i = 0; i < 60; i++) dying.step(1);
const remains = dying.plantRemains.find((p) => p.id === tree.id)!;
assert(remains.decay > 0 && remains.decay < 1, "Dead trees decay gradually");
const saved = encodeSave({
  world: dying,
  rate: 1,
  paused: false,
  selected: tree.id,
});
assert(
  JSON.stringify(decodeSave(saved).world) === JSON.stringify(dying),
  "Decomposition and runoff survive reload",
);
const old = JSON.parse(saved);
old.version = 21;
delete old.world.plantRemains;
delete old.world.plantDeaths.competition;
assert(
  decodeSave(JSON.stringify(old)).world.plantRemains.length === 0,
  "Intermediate saves migrate safely",
);
for (let i = 0; i < 900; i++) dying.step(1);
assert(
  !dying.plantRemains.some((p) => p.id === tree.id),
  "Fully decomposed remains disappear",
);
console.log(
  "Flood death, gradual decay, eventual removal and old-save migration passed",
);

const remainsMesh = new OrganismMeshes(new THREE.Scene());
remainsMesh.update([], [], 0, 0, undefined, [
  { id: 1, kind: "tree", variety: 1, x: -30, z: 20, size: 1, decay: 0.3 },
]);
assert(
  remainsMesh.deadWood.count === 1 &&
    remainsMesh.plantVariants.tree.every((m) => m.count === 0),
  "Dead trees shed their canopy while bare wood remains visible",
);
remainsMesh.update([], [], 1, 0, undefined, []);
assert(
  Number(remainsMesh.deadWood.count) === 0,
  "Decomposed wood stops rendering",
);
