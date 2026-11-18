import { World } from "./sim.ts";
import { FIRST_GROVE } from "./levels.ts";
import {
  populationCounts,
  dietGroup,
  completePopulationSample,
} from "./population-history.ts";
import { encodeSave, decodeSave } from "./save.ts";
import { GenerationAdvance } from "./generation-advance.ts";
function check(v: unknown, m: string) {
  if (!v) throw new Error(m);
}
const w = new World(123, FIRST_GROVE),
  mouse = w.animals[0];
for (const [gene, category] of [
  [0.299, "herbivores"],
  [0.3, "omnivores"],
  [0.65, "omnivores"],
  [0.799, "omnivores"],
  [0.8, "carnivores"],
] as const) {
  mouse.genes.dietAffinity = gene;
  check(dietGroup(mouse) === category, `Diet threshold ${gene}`);
}
const bug = w.addAnimal("grazer", undefined, "bug");
check(dietGroup(bug) === "detritivores", "Bugs recycle remains");
const counts = populationCounts(w.animals, w.plants.length);
check(
  counts.herbivores +
    counts.omnivores +
    counts.carnivores +
    counts.detritivores ===
    w.animals.length,
  "Every animal counted once",
);
w.record();
check(
  completePopulationSample(w.history.at(-1)!),
  "New history records all populations",
);
w.highestGeneration = 90;
w.step(0.1);
check(
  w.highestGeneration === 90,
  "Loss of a lineage does not reduce the record",
);
check(
  new GenerationAdvance(w, 10).target === 100,
  "Jump starts from the generation record",
);
const raw = encodeSave({ world: w, paused: true, rate: 1, selected: 0 });
check(
  decodeSave(raw).world.highestGeneration === 90,
  "Generation record survives saving",
);
const old = JSON.parse(raw);
delete old.world.highestGeneration;
for (const h of old.world.history)
  for (const key of [
    "herbivores",
    "omnivores",
    "carnivores",
    "detritivores",
    "plants",
  ])
    delete h[key];
const restored = decodeSave(JSON.stringify(old));
check(
  !completePopulationSample(restored.world.history[0]),
  "Do not invent historical diets or plant counts",
);
old.world.history[0].plants = -1;
let rejected = false;
try {
  decodeSave(JSON.stringify(old));
} catch {
  rejected = true;
}
check(rejected, "Invalid chart counts rejected");
console.log(
  "Diet thresholds, population totals, legacy chart history and generation persistence passed",
);
