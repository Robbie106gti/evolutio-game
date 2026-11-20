import { World } from "./sim.ts";
import { FIRST_GROVE, readLevelProgress } from "./levels.ts";
import {
  introduceAnimals,
  introduceMissingSpecies,
  missingFounderGroups,
  establishedOmnivores,
} from "./animal-introduction.ts";
import { createWaterQuery } from "./ecology.ts";
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

const restoredWildlife = new World(42);
restoredWildlife.animals = [];
const report = introduceMissingSpecies(restoredWildlife);
const count = (species: string) =>
  restoredWildlife.animals.filter(a => a.species === species).length;
check(count("ant") === 24 && count("mosquito") === 36 &&
  count("cat") === 6 && count("fox") === 6, "Missing species get the intended founder counts");
check(report.added.reduce((total, group) => total + group.count, 0) === restoredWildlife.animals.length &&
  missingFounderGroups(restoredWildlife).length === 0, "Only missing species and bird roles are introduced");
const depthAt = createWaterQuery(restoredWildlife.ponds, restoredWildlife.weather.land);
const mosquitoes = restoredWildlife.animals.filter(a => a.species === "mosquito");
for (let i = 0; i < mosquitoes.length; i += 2) {
  const [female, male] = mosquitoes.slice(i, i + 2);
  const depth = depthAt(female.x, female.z);
  check(female.sex === "female" && male.sex === "male" &&
    female.x === male.x && female.z === male.z && depth >= 0.025 && depth <= 0.1,
    "Mosquito founders are paired at shallow water");
}
restoredWildlife.animals = restoredWildlife.animals.filter(a => a.species !== "bird" || a.birdDiet === "raptor");
const additions = introduceMissingSpecies(restoredWildlife).added;
check(additions.length === 1 && additions[0].birdDiet === "insectivore" && additions[0].count === 4,
  "The missing bird diet is added without restocking established species");
const dryIsland = new World(42);
dryIsland.animals = [];
dryIsland.ponds = [];
for (const cell of dryIsland.weather.land!) cell.surfaceWater = 0;
const dryReport = introduceMissingSpecies(dryIsland);
check(dryReport.fishNeedWater && dryIsland.animals.some(a => a.species === "mosquito"),
  "A dry island skips fish and still introduces other species");
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
