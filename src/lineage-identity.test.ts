import { lineageIdentity, mousePortrait } from "./lineage-identity.ts";
import { World } from "./sim.ts";
import { FIRST_GROVE } from "./levels.ts";
import { decodeSave, encodeSave } from "./save.ts";
import { LineageOverlay } from "./lineage-overlay.ts";
import { Scene, InstancedMesh } from "three";
function check(value: unknown, message: string) {
  if (!value) throw new Error(message);
}
const w = new World(123, FIRST_GROVE),
  a = w.animals[0];
const seed = w.seed;
const before = JSON.stringify(a.genes);
const identity = lineageIdentity(a.mouseLineage!.id);
const restored = decodeSave(
  encodeSave({ world: w, rate: 1, paused: true, selected: 0 }),
).world;
check(
  JSON.stringify(identity) ===
    JSON.stringify(lineageIdentity(restored.animals[0].mouseLineage!.id)),
  "Names and badges survive saves",
);
check(
  mousePortrait(a.genes) !==
    mousePortrait({ ...a.genes, size: a.genes.size * 0.5, markings: 0 }),
  "Portrait reflects inherited size and markings",
);
const scene = new Scene(),
  overlay = new LineageOverlay(scene);
overlay.update(w, true, a.id);
const mesh = scene.children[0] as InstancedMesh;
check(
  mesh.count ===
    w.animals.filter((b) => b.mouseLineage?.id === a.mouseLineage?.id).length,
  "Selected lineage highlighted",
);
overlay.update(w, false, 0);
check(!mesh.visible, "Overlay can be hidden");
check(
  w.seed === seed && JSON.stringify(a.genes) === before,
  "Visual identity never changes genes or simulation randomness",
);
console.log(
  "Lineage identity, portraits, overlay selection and save stability passed",
);
