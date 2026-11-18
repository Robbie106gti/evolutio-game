import { World } from "./sim.ts";
import { FIRST_GROVE, readLevelProgress } from "./levels.ts";
import {
  introduceAnimals,
  establishedOmnivores,
} from "./animal-introduction.ts";
import { encodeSave, decodeSave } from "./save.ts";
function check(ok: unknown, message: string) {
  if (!ok) throw new Error(message);
}
const w = new World(undefined, FIRST_GROVE);
introduceAnimals(w, "bug", 12);
introduceAnimals(w, "bug", 5);
check(
  w.animals.filter((a) => a.species === "bug").length === 17,
  "Can add more bugs, not just replace missing species",
);
let rejected = false;
try {
  introduceAnimals(w, "cat", 1);
} catch {
  rejected = true;
}
check(rejected, "Level restrictions enforced");
const mice = w.animals.filter((a) => a.species === "mouse").slice(0, 3);
for (const a of mice) {
  a.genes.dietAffinity = 0.4;
  a.mouseLineage!.niche = "omnivore";
}
check(
  establishedOmnivores(w) === 0,
  "Diet labels alone do not complete challenge",
);
for (const a of mice) a.hasEatenBug = true;
check(establishedOmnivores(w) === 3, "Inherited omnivores that ate bugs count");
const migrated = readLevelProgress({
  id: "first-grove",
  revision: 1,
  completedObjectives: ["meet-plant"],
});
check(
  migrated.revision === 2 && migrated.completedObjectives[0] === "meet-plant",
  "Previous lesson progress preserved",
);
const saved = encodeSave({ world: w, rate: 1, paused: true, selected: 0 });
check(
  establishedOmnivores(decodeSave(saved).world) === 3,
  "Evidence survives save",
);
const legacy = JSON.parse(saved);
legacy.version = 30;
for (const a of legacy.world.animals) delete a.hasEatenBug;
check(
  establishedOmnivores(decodeSave(JSON.stringify(legacy)).world) === 0,
  "Old saves do not invent feeding evidence",
);
console.log(
  "Animal introduction, repeated additions, challenge evidence and migration passed",
);
