import { World, PLANT_VARIETIES } from "./sim.ts";
import { applyIslandTool } from "./island-tools.ts";
import { terrainHeight, riverX, landAt, landIndex } from "./terrain.ts";
import { encodeSave, decodeSave } from "./save.ts";
import { OrganismMeshes } from "./meshes.ts";
import * as THREE from "three";
function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
const w = new World(31);
const desert = new World(32);
desert.plants = [];
desert.addPlant(undefined, -35, 25, "tree", 2);
const acacia = desert.plants[0];
assert(
  acacia.droughtTolerance >= 0.8 && acacia.floodTolerance <= 0.35,
  "Acacia founders trade flood tolerance for drought tolerance",
);
desert.addPlant(acacia, -34, 25);
assert(
  Math.abs(desert.plants[1].droughtTolerance - acacia.droughtTolerance) <=
    0.081,
  "Offspring inherit desert tolerance with bounded mutation",
);
w.animals = [];
w.plants = [];
const x = -35,
  z = 25;
const h = terrainHeight(x, z, w.weather.land);
assert(h > 0.7, "Uplands have gentle elevation");
applyIslandTool(w, "raise", x, z, 8, 1, false);
assert(terrainHeight(x, z, w.weather.land) > h, "Raise brush changes terrain");
applyIslandTool(w, "dig", x, z, 8, 1, false);
assert(
  Math.abs(terrainHeight(x, z, w.weather.land) - h) < 1e-9,
  "Dig reverses a raised hill",
);
applyIslandTool(w, "raise", riverX(0), 0, 10, 1, false);
assert(
  terrainHeight(riverX(0), 0, w.weather.land) > 0.65,
  "Raised ground can form a river embankment",
);
applyIslandTool(w, "sand", x, z, 8, 1, false);
assert(
  (landAt(w.weather.land, x, z).sand ?? 0) > 0,
  "Sand brush changes saved soil",
);
applyIslandTool(w, "water", x, z, 8, 1, false);
applyIslandTool(w, "fungus", x, z, 8, 1, false);
assert(
  landAt(w.weather.land, x, z).fungus > 0.06,
  "Mushroom brush creates visible fungal cover",
);
applyIslandTool(w, "water", x, z, 8, 1, true);
const cactusX = 34,
  cactusZ = -25;
applyIslandTool(w, "plants", cactusX, cactusZ, 8, 1, false, "bush", 2);
assert(
  w.plants.length > 0 &&
    w.plants.every((p) => p.variety === 2 && p.droughtTolerance >= 0.8),
  "Cactus brush creates drought-tolerant plants",
);
applyIslandTool(w, "disease", cactusX, cactusZ, 16, 1, false);
assert(
  w.plants.some((p) => p.infection > 0),
  "Disease affects nearby plants",
);
applyIslandTool(w, "disease", cactusX, cactusZ, 16, 1, true);
assert(
  w.plants.every((p) => p.infection === 0),
  "Remove disease heals nearby infection",
);
const raw = encodeSave({
  world: w,
  rate: 1,
  paused: true,
  selected: -landIndex(x, z) - 1,
});
const loaded = decodeSave(raw);
assert(
  JSON.stringify(loaded.world) === JSON.stringify(w) && loaded.selected < 0,
  "Brush terrain, plant varieties and mushroom selection survive saving",
);
const legacy = JSON.parse(raw);
legacy.version = 19;
for (const p of legacy.world.plants) delete p.variety;
assert(
  decodeSave(JSON.stringify(legacy)).world.plants.every((p) =>
    Number.isInteger(p.variety),
  ),
  "Older islands gain plant varieties",
);
const mesh = new OrganismMeshes(new THREE.Scene());
mesh.update([], w.plants, 0, 0, w.weather.land);
assert(
  mesh.plantVariants.bush[2].count === w.plants.length,
  "Cacti use their own instanced geometry",
);
assert(
  Object.values(PLANT_VARIETIES).every((v) => v.length === 3),
  "Nine plant varieties are available",
);
applyIslandTool(w, "plants", cactusX, cactusZ, 16, 1, true, "bush", 2);
assert(w.plants.length === 0, "Remove brush clears the selected plant family");
console.log(
  "Elevation, water corridors, reversible brushes, desert plants, fungal patches, nine meshes and save migration passed",
);
