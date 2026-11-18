import { packSave, unpackSave } from "./save-codec.ts";
import { World } from "./sim.ts";
import { SAVE_KEY, encodeSave, decodeSave } from "./save.ts";
import {
  FIRST_GROVE,
  PREDATOR_VALLEY,
  initialProgress,
  updateLevelProgress,
  levelComplete,
} from "./levels.ts";
import {
  loadSlot,
  saveSlot,
  slotKey,
  unlocked,
  preserveBeforeSwitch,
} from "./level-slots.ts";
import { levelCards, lessonContent } from "./level-screen.ts";
import { GenerationAdvance } from "./generation-advance.ts";
import {
  inheritMouseLineage,
  plantEfficiency,
  preyEfficiency,
} from "./mouse-lineages.ts";
import { canHunt } from "./biology.ts";
function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
function rejects(fn: () => unknown, message: string) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  check(threw, message);
}
const entries = new Map<string, string>();
const storage = {
  getItem: (key: string) => entries.get(key) ?? null,
  setItem: (key: string, value: string) => {
    entries.set(key, value);
  },
};
const sandbox = new World(88);
saveSlot(storage, { world: sandbox, rate: 1, paused: true, selected: 0 });
const original = entries.get(SAVE_KEY)!;
check(slotKey("sandbox") === SAVE_KEY, "Original sandbox key retained");
check(!unlocked(storage, "predator-valley"), "Predators start locked");
const grove = new World(undefined, FIRST_GROVE),
  progress = initialProgress(FIRST_GROVE);
check(
  grove.animals.every((a) => a.species === "mouse"),
  "First lesson contains only mice",
);
updateLevelProgress(FIRST_GROVE, progress, { births: 99 });
check(
  progress.completedObjectives.length === 0,
  "Births cannot bypass teaching steps",
);
for (const metric of [
  "inspectPlant",
  "inspectMouse",
  "plant",
  "water",
] as const)
  updateLevelProgress(FIRST_GROVE, progress, { [metric]: 1 });
check(
  lessonContent(progress).includes("three babies"),
  "Lesson advances after actions",
);
updateLevelProgress(FIRST_GROVE, progress, { births: 3 });
check(
  !levelComplete(FIRST_GROVE, progress),
  "Births alone cannot complete the evolution challenge",
);
updateLevelProgress(FIRST_GROVE, progress, { bugs: 12, omnivoreMice: 3 });
check(
  levelComplete(FIRST_GROVE, progress),
  "First lesson completes after reproduction",
);
saveSlot(storage, {
  world: grove,
  level: progress,
  rate: 1,
  paused: false,
  selected: 0,
});
check(
  entries.get(SAVE_KEY) === original,
  "Lesson cannot overwrite sandbox bytes",
);
check(
  unlocked(storage, "predator-valley"),
  "Saved first-level completion unlocks predators",
);
check(
  levelCards(storage).includes("Predator Valley") &&
    !levelCards(storage).includes("Complete First Grove to unlock"),
  "Selection screen reflects unlock",
);
const predator = new World(undefined, PREDATOR_VALLEY);
check(
  predator.animals.some((a) => a.species === "cat"),
  "Predator lesson introduces cats",
);
check(
  JSON.stringify(loadSlot(storage, "sandbox")!.world) ===
    JSON.stringify(sandbox),
  "Returning restores the same sandbox",
);
check(
  unpackSave(packSave(original)) === original,
  "Save compression is lossless",
);
check(
  original.length <
    encodeSave({ world: sandbox, rate: 1, paused: true, selected: 0 }).length /
      2,
  "Compression leaves room for multiple islands",
);
const legacy = JSON.parse(unpackSave(original));
legacy.version = 27;
delete legacy.world.animals[0].mouseLineage;
delete legacy.world.animals[0].genes.dietAffinity;
check(
  decodeSave(JSON.stringify(legacy)).world.animals[0].genes.dietAffinity === 0,
  "Existing genomes migrate to plant-eating baseline",
);
entries.set(slotKey("first-grove"), "broken");
rejects(
  () => loadSlot(storage, "first-grove"),
  "Corrupt destination is rejected",
);
check(
  entries.get(SAVE_KEY) === original,
  "Corrupt lesson cannot affect sandbox",
);
rejects(
  () =>
    saveSlot(
      storage,
      { world: sandbox, rate: 1, paused: true, selected: 0 },
      "stale",
    ),
  "A stale tab cannot overwrite a newer save",
);
const failing = {
  getItem: storage.getItem,
  setItem: () => {
    throw new Error("Storage full");
  },
};
rejects(
  () =>
    saveSlot(failing, {
      world: grove,
      level: progress,
      rate: 1,
      paused: false,
      selected: 0,
    }),
  "Write failures propagate to cancel switching",
);
check(
  entries.get(SAVE_KEY) === original,
  "Failed lesson save preserves sandbox",
);
const w = new World(11);
w.animals = [];
const mouse = w.addAnimal("grazer", undefined, "mouse"),
  bug = w.addAnimal("grazer", undefined, "bug");
mouse.genes.dietAffinity = 0;
check(!canHunt(mouse, bug), "Herbivorous mice cannot hunt");
mouse.genes.dietAffinity = 0.9;
check(
  canHunt(mouse, bug) &&
    plantEfficiency(mouse) < 0.4 &&
    preyEfficiency(mouse) > 0.9,
  "Predatory diet trades plant efficiency for prey nutrition",
);
let parent = mouse;
parent.genes.size = 1.5;
for (let n = 0; n < 3; n++) {
  const child = w.addAnimal("grazer", parent);
  child.genes.dietAffinity = 0.9;
  child.genes.size = 1.5;
  child.mouseLineage = inheritMouseLineage(child, parent);
  parent = child;
}
check(
  parent.mouseLineage?.niche === "hunter" && parent.mouseLineage.id !== 0,
  "Sustained dietary difference creates persistent lineage",
);
const child = w.addAnimal("grazer", parent);
child.genes.dietAffinity = 0.9;
child.mouseLineage = inheritMouseLineage(child, parent);
check(
  child.mouseLineage?.id === parent.mouseLineage.id,
  "Branch identity inherited by offspring",
);
check(!canHunt(parent, child), "Parents do not hunt their own young");
const restored = decodeSave(
  encodeSave({ world: w, rate: 1, paused: true, selected: parent.id }),
);
check(
  restored.world.animals.find((a) => a.id === parent.id)?.mouseLineage?.id ===
    parent.mouseLineage.id,
  "Lineages persist in saves",
);
const fake = {
  animals: [mouse],
  eggs: [],
  time: 0,
  step(dt: number) {
    this.time += dt;
    this.animals[0].generation++;
  },
};
mouse.generation = 1;
const advance = new GenerationAdvance(fake, 10);
let clock = 0;
advance.run(fake, 12, () => clock++);
check(
  advance.done && advance.peak === 11 && fake.time > 0,
  "Advance runs simulation until target, never just edits generation",
);
const cancel = new GenerationAdvance(fake, 100);
cancel.cancel();
const time = fake.time;
cancel.run(fake);
check(fake.time === time, "Cancellation stops simulation work");
const extinct = {
  animals: [],
  eggs: [],
  time: 0,
  step() {
    throw new Error("Must not step extinct world");
  },
};
const gone = new GenerationAdvance(extinct, 1000);
gone.run(extinct);
check(
  gone.done && gone.status.includes("no animals"),
  "Extinction terminates jumps",
);
const stagnant = {
  animals: [mouse],
  eggs: [],
  time: 0,
  step() {
    this.time += 1800;
  },
};
const stalled = new GenerationAdvance(stagnant, 10);
stalled.run(stagnant);
check(
  stalled.done && stalled.status.includes("no new"),
  "Stalled reproduction terminates jumps",
);
console.log(
  "Isolated sandbox saves, ordered lessons, predator unlock, lineage evolution and cancellable generation advance passed",
);

// Reproduce startup with an unreadable sandbox and no lesson save.
const recoveryEntries = new Map<string, string>([
  [SAVE_KEY, "unreadable sandbox"],
]);
const recoveryStorage = {
  getItem: (key: string) => recoveryEntries.get(key) ?? null,
  setItem: (key: string, value: string) => {
    recoveryEntries.set(key, value);
  },
};
rejects(() => loadSlot(recoveryStorage, "sandbox"), "Failed startup restore");
let attemptedSave = false;
preserveBeforeSwitch(true, () => {
  attemptedSave = true;
  return false;
});
check(
  !attemptedSave,
  "Failed restore must never save its temporary replacement world",
);
saveSlot(
  recoveryStorage,
  { world: grove, level: progress, rate: 1, paused: true, selected: 0 },
  null,
);
check(
  loadSlot(recoveryStorage, "first-grove")?.world.level.id === "first-grove",
  "Lesson can start despite unreadable sandbox",
);
check(
  recoveryEntries.get(SAVE_KEY) === "unreadable sandbox",
  "Unreadable original remains byte-for-byte intact",
);
rejects(
  () => preserveBeforeSwitch(false, () => false),
  "Genuine save failures still prevent losing a loaded island",
);
preserveBeforeSwitch(false, () => true);
