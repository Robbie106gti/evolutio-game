import { World } from "./sim.ts";
import {
  createWaterQuery,
  waterDepth,
  CoverCache,
  habitat,
  initialPonds,
} from "./ecology.ts";
import { SpatialGrid, riverX, FORDS } from "./terrain.ts";
import { encodeSave, decodeSave } from "./save.ts";
import { OrganismMeshes } from "./meshes.ts";
import * as THREE from "three";
function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
const ponds = initialPonds(),
  depth = createWaterQuery(ponds);
for (let pass = 0; pass < 4; pass++) {
  ponds[0].water = 0.2 + pass * 0.2;
  ponds[1].flow = pass / 3;
  for (let i = 0; i < 300; i++) {
    const x = Math.sin(i * 3.1) * 65,
      z = Math.cos(i * 1.3) * 65;
    assert(
      Math.abs(depth(x, z) - waterDepth(ponds, x, z)) < 1e-12,
      "Cached water equals exact water query",
    );
  }
  for (const z of FORDS)
    for (const offset of [0, 0.1, 0.5, 1, 2])
      assert(
        Math.abs(
          depth(riverX(z) + offset, z) -
            waterDepth(ponds, riverX(z) + offset, z),
        ) < 1e-12,
        "Fords and shorelines retain exact depths",
      );
}
const x = ponds[0].x,
  z = ponds[0].z;
const oldDepth = depth(x, z);
ponds[0].water -= 0.05;
assert(
  depth(x, z) < oldDepth,
  "Water level changes invalidate cached depths immediately",
);
const w = new World(81);
w.animals = [];
w.plants = [];
w.seedBank = [];
for (let i = 0; i < 20; i++) {
  const p = w.addPlant(undefined, -35 + i * 0.4, 25, "grass")!;
  p.energy = 1;
}
const cover = new CoverCache();
let query = cover.prepare(w.plants, w.weather.land, new SpatialGrid(w.plants));
for (let i = 0; i < 30; i++) {
  const a = { x: -35 + i * 0.3, z: 25 };
  assert(
    JSON.stringify(query(a)) ===
      JSON.stringify(habitat(a, w.plants, w.weather.land)),
    "Cached cover matches uncached cover",
  );
}
const point = { x: -32, z: 25 };
query(point);
const tree = w.addPlant(undefined, point.x, point.z, "tree")!;
query = cover.prepare(w.plants, w.weather.land, new SpatialGrid(w.plants));
assert(
  query(point).name === "Tree cover",
  "New cover invalidates cached results",
);
w.plants = w.plants.filter((p) => p !== tree);
query = cover.prepare(w.plants, w.weather.land, new SpatialGrid(w.plants));
assert(
  query(point).name !== "Tree cover",
  "Removed cover disappears immediately",
);
const original = w.plants.slice();
const updates = new Map(original.map((p) => [p.id, 0]));
for (let i = 0; i < 10; i++) {
  const before = new Map(original.map((p) => [p.id, p.lastGrowthAt]));
  w.step(0.1);
  let changed = 0;
  for (const p of original)
    if (p.lastGrowthAt !== before.get(p.id)) {
      updates.set(p.id, updates.get(p.id)! + 1);
      changed++;
    }
  assert(changed <= 3, "Plant work is distributed across ticks");
}
assert(
  [...updates.values()].every((n) => n === 1),
  "Each plant receives one growth update per second",
);
assert(
  original.every((p) => Math.abs(p.age - 1) < 1e-9),
  "Age advances between growth gates",
);
w.step(0.35);
const restored = decodeSave(
  encodeSave({ world: w, rate: 1, paused: true, selected: 0 }),
).world;
for (let i = 0; i < 40; i++) {
  w.step(0.1);
  restored.step(0.1);
}
assert(
  JSON.stringify(w) === JSON.stringify(restored),
  "Partial plant intervals and derived caches preserve save continuity",
);
const meshes = new OrganismMeshes(new THREE.Scene());
const p = w.plants[0];
p.variety = 0;
meshes.update([], w.plants, 0);
const first = meshes.plant.grass.instanceMatrix.version;
p.energy += 5;
meshes.update([], w.plants, 0.1);
assert(
  meshes.plant.grass.instanceMatrix.version === first,
  "Plant buffers stay unchanged between refreshes",
);
meshes.update([], w.plants, 0.6);
assert(
  meshes.plant.grass.instanceMatrix.version > first,
  "Plant buffers refresh at two Hz",
);
const remaining = w.plants.slice(1);
meshes.update([], remaining, 0.61);
assert(
  !meshes.ids.get(meshes.plant.grass)!.includes(p.id),
  "Removed plants immediately disappear from picking and rendering",
);
console.log(
  "Staggered plants, elapsed growth time, exact water/cover caches, invalidation, save continuity and plant mesh cadence passed",
);

const outer = w.addPlant(undefined, -60, 10, "grass")!;
w.seedBank.push({ ...outer });
assert(
  decodeSave(
    encodeSave({ world: w, rate: 1, paused: true, selected: 0 }),
  ).world.seedBank.some((p) => p.x === -60),
  "Outer-island dormant seeds remain loadable",
);
