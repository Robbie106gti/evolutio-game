import {
  ANIMAL_FAMILIES,
  PLANT_FAMILIES,
  FUNGI,
  defineAnimal,
} from "./profiles.ts";
import { SPECIES, PLANT_PROFILES } from "./species.ts";
import { aquatic, laysEggs } from "./biology.ts";
import { World } from "./sim.ts";
import {
  SANDBOX,
  defineLevel,
  initialProgress,
  updateLevelProgress,
  readLevelProgress,
} from "./levels.ts";
import { encodeSave, decodeSave } from "./save.ts";
import { applyIslandTool } from "./island-tools.ts";
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
check(
  !laysEggs("mouse") && laysEggs("bird") && laysEggs("snake"),
  "Reproduction uses inherited family capabilities",
);
check(
  aquatic("turtle") && !aquatic("snake") && aquatic("fish"),
  "Species overrides do not change reptile defaults",
);
check(
  !ANIMAL_FAMILIES.reptile.aquatic &&
    SPECIES.bird.capabilities.nursery === "nest",
  "Family defaults are isolated",
);
const variant = defineAnimal("mammal", {
  ...SPECIES.mouse,
  capabilities: { aquatic: true },
});
check(
  variant.capabilities.aquatic &&
    variant.capabilities.reproduction === "live" &&
    variant.capabilities.nursery === "den",
  "Nested capabilities merge explicitly",
);
check(
  Object.isFrozen(SPECIES.mouse) &&
    Object.isFrozen(SPECIES.mouse.prey) &&
    Object.isFrozen(SPECIES.mouse.capabilities),
  "Resolved profiles are deeply frozen",
);
check(
  PLANT_PROFILES.bush[2].label === "Cactus" &&
    PLANT_PROFILES.bush[2].desertAdapted &&
    PLANT_PROFILES.tree[2].desertAdapted,
  "Existing numeric plant varieties retain identity and traits",
);
check(
  PLANT_FAMILIES.tree.resource === "sunlight" &&
    FUNGI.mushroom.resource === "litter" &&
    !FUNGI.mushroom.photosynthesis,
  "Fungi use decomposer resources, not plant rules",
);
const w = new World(88);
const before = JSON.stringify(w);
w.mutate(w.animals[0].genes);
check(
  SPECIES.mouse.capabilities.reproduction === "live",
  "Individual mutation cannot alter profile defaults",
);
const custom = defineLevel({
  ...SANDBOX,
  id: "test-grove",
  mode: "challenge",
  seed: 123,
  availableSpecies: ["mouse"],
  initial: { plantAttempts: 12, animals: [["mouse", 3]] },
  tools: ["inspect"],
  objectives: [
    {
      id: "first-birth",
      label: "Raise a new generation",
      metric: "births",
      target: 1,
    },
  ],
});
const grove = new World(undefined, custom);
check(
  grove.animals.length === 3 &&
    grove.animals.every((a) => a.species === "mouse") &&
    grove.plants.length <= 12,
  "Definition controls starting populations",
);
check(
  JSON.stringify(grove) === JSON.stringify(new World(123, custom)),
  "Definition seed is used when no override is supplied",
);
check(
  applyIslandTool(grove, "water", 0, 0, 6, 0.5, false).includes("unavailable"),
  "Disabled level tools are rejected at the mutation boundary",
);
const progress = initialProgress(custom);
check(
  !updateLevelProgress(custom, progress, {
    time: 0,
    births: 0,
    plants: 0,
    generation: 1,
  }),
  "Challenge begins incomplete",
);
check(
  updateLevelProgress(custom, progress, {
    time: 5,
    births: 1,
    plants: 0,
    generation: 2,
  }),
  "Objective completes on matching metric",
);
updateLevelProgress(custom, progress, {
  time: 6,
  births: 2,
  plants: 0,
  generation: 2,
});
check(
  progress.completedObjectives.length === 1,
  "Objective completion is idempotent",
);
check(
  !updateLevelProgress(SANDBOX, initialProgress(), {
    time: 99999,
    births: 99999,
    plants: 99999,
    generation: 99999,
  }),
  "Sandbox never has a win condition",
);
const legacy = JSON.parse(
  encodeSave({ world: new World(88), rate: 3, paused: true, selected: 0 }),
);
legacy.version = 26;
delete legacy.level;
const loaded = decodeSave(JSON.stringify(legacy));
check(
  loaded.level?.id === "sandbox" && loaded.world.level.id === "sandbox",
  "Version 26 and earlier default to sandbox",
);
check(
  JSON.stringify(loaded.world) === before,
  "Migration never reseeds or replaces the island",
);
const round = decodeSave(encodeSave(loaded));
check(
  JSON.stringify(round.world) === JSON.stringify(loaded.world) &&
    JSON.stringify(round.level) === JSON.stringify(loaded.level),
  "Current save round trip preserves world and separate progress",
);
for (let i = 0; i < 10; i++) {
  loaded.world.step(0.1);
  round.world.step(0.1);
}
check(
  JSON.stringify(loaded.world) === JSON.stringify(round.world),
  "Restored island continues deterministically",
);
const bad = JSON.parse(encodeSave(loaded));
bad.level.id = "missing-level";
rejects(
  () => decodeSave(JSON.stringify(bad)),
  "Unknown future level cannot silently become sandbox",
);
rejects(
  () =>
    readLevelProgress({ id: "sandbox", revision: 99, completedObjectives: [] }),
  "Unsupported revision rejected",
);
rejects(
  () =>
    readLevelProgress({
      id: "sandbox",
      revision: 1,
      completedObjectives: ["invented"],
    }),
  "Unknown objective rejected",
);
rejects(
  () =>
    defineLevel({
      ...SANDBOX,
      initial: { plantAttempts: 1, animals: [["mouse", 561]] },
    }),
  "Starting population respects simulation capacity",
);
console.log(
  "Family profiles, plant varieties, fungal resources, level initialization, tools, objectives and legacy sandbox saves passed",
);
