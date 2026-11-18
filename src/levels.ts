import { SPECIES } from "./species.ts";
import { MAX_ANIMALS } from "./terrain.ts";
import type { Species } from "./model.ts";
import type { IslandTool } from "./island-tools.ts";
import { freezeProfile } from "./profiles.ts";
export type LevelObjective = {
  id: string;
  label: string;
  metric:
    | "time"
    | "births"
    | "plants"
    | "generation"
    | "inspectPlant"
    | "inspectMouse"
    | "plant"
    | "water"
    | "bugs"
    | "omnivoreMice";
  target: number;
};
export interface LevelDefinition {
  id: string;
  revision: number;
  name: string;
  mode: "sandbox" | "challenge";
  terrain: "verdant-island";
  seed: number;
  climate: { moisture: number; cloud: number };
  availableSpecies: readonly Species[];
  initial: {
    plantAttempts: number;
    animals: readonly (readonly [Species, number])[];
  };
  tools: readonly IslandTool[];
  objectives: readonly LevelObjective[];
}
export function defineLevel(level: LevelDefinition): Readonly<LevelDefinition> {
  if (
    !level.id ||
    !Number.isInteger(level.revision) ||
    level.revision < 1 ||
    !Number.isInteger(level.seed) ||
    !Number.isInteger(level.initial.plantAttempts) ||
    level.initial.plantAttempts < 0
  )
    throw new Error("Invalid level definition");
  if (level.terrain !== "verdant-island" || !level.tools.includes("inspect"))
    throw new Error("Unsupported terrain or missing explore tool");
  if (
    level.initial.animals.some(([, n]) => !Number.isInteger(n) || n < 0) ||
    new Set(level.objectives.map((o) => o.id)).size !==
      level.objectives.length ||
    level.objectives.some(
      (o) => !o.id || !Number.isFinite(o.target) || o.target < 0,
    )
  )
    throw new Error("Invalid population or objectives");
  if (
    level.initial.animals.reduce((n, [, count]) => n + count, 0) >
      MAX_ANIMALS ||
    level.initial.animals.some(
      ([species]) => !level.availableSpecies.includes(species),
    ) ||
    level.availableSpecies.some((s) => !Object.hasOwn(SPECIES, s)) ||
    new Set(level.availableSpecies).size !== level.availableSpecies.length
  )
    throw new Error("Invalid level species");
  if (
    ![level.climate.moisture, level.climate.cloud].every(
      (n) => Number.isFinite(n) && n >= 0 && n <= 1,
    )
  )
    throw new Error("Invalid initial climate");
  // Copy nested input before freezing so the caller does not share mutable config.
  return freezeProfile({
    ...level,
    climate: { ...level.climate },
    availableSpecies: [...level.availableSpecies],
    initial: {
      plantAttempts: level.initial.plantAttempts,
      animals: level.initial.animals.map(([s, n]) => [s, n] as const),
    },
    tools: [...level.tools],
    objectives: level.objectives.map((o) => ({ ...o })),
  });
}
export const SANDBOX = defineLevel({
  id: "sandbox",
  revision: 1,
  name: "Verdant Island",
  mode: "sandbox",
  terrain: "verdant-island",
  seed: 7823,
  climate: { moisture: 0.7, cloud: 0.4 },
  availableSpecies: Object.keys(SPECIES) as Species[],
  initial: {
    plantAttempts: 1550,
    animals: [
      ["fish", 32],
      ["turtle", 10],
      ["crocodile", 5],
      ["frog", 18],
      ["fox", 4],
      ["wolf", 3],
      ["mouse", 50],
      ["bug", 60],
      ["bird", 18],
      ["cat", 8],
      ["snake", 10],
    ],
  },
  tools: [
    "inspect",
    "water",
    "soil",
    "sand",
    "plants",
    "fungus",
    "disease",
    "raise",
    "dig",
  ],
  objectives: [],
});
export const FIRST_GROVE = defineLevel({
  ...SANDBOX,
  id: "first-grove",
  revision: 2,
  name: "First Grove",
  mode: "challenge",
  seed: 123,
  availableSpecies: ["mouse", "bug"],
  initial: { plantAttempts: 900, animals: [["mouse", 16]] },
  tools: ["inspect", "plants", "water"],
  objectives: [
    {
      id: "meet-plant",
      label: "Select a plant to see how it grows",
      metric: "inspectPlant",
      target: 1,
    },
    {
      id: "meet-mouse",
      label: "Select a mouse to inspect its needs and genes",
      metric: "inspectMouse",
      target: 1,
    },
    {
      id: "grow-food",
      label: "Use Plant to add food on dry land",
      metric: "plant",
      target: 1,
    },
    {
      id: "give-water",
      label: "Use Water to moisten a patch of land",
      metric: "water",
      target: 1,
    },
    {
      id: "new-generation",
      label: "Let the mice raise three babies",
      metric: "births",
      target: 3,
    },
    {
      id: "introduce-bugs",
      label: "Introduce twelve bugs to the island",
      metric: "bugs",
      target: 12,
    },
    {
      id: "evolve-omnivores",
      label: "Establish three bug-eating omnivore mice",
      metric: "omnivoreMice",
      target: 3,
    },
  ],
});
export const PREDATOR_VALLEY = defineLevel({
  ...SANDBOX,
  id: "predator-valley",
  name: "Predator Valley",
  mode: "challenge",
  seed: 456,
  availableSpecies: ["mouse", "cat"],
  initial: {
    plantAttempts: 1100,
    animals: [
      ["mouse", 32],
      ["cat", 3],
    ],
  },
  tools: ["inspect", "plants", "water", "soil"],
  objectives: [
    {
      id: "survive",
      label: "Watch the food chain for two simulation minutes",
      metric: "time",
      target: 120,
    },
    {
      id: "offspring",
      label: "Support eight births",
      metric: "births",
      target: 8,
    },
  ],
});
export const LEVELS: Readonly<Record<string, Readonly<LevelDefinition>>> =
  Object.freeze({
    sandbox: SANDBOX,
    "first-grove": FIRST_GROVE,
    "predator-valley": PREDATOR_VALLEY,
  });
export interface LevelProgress {
  id: string;
  revision: number;
  completedObjectives: string[];
}
export const initialProgress = (
  level: Readonly<LevelDefinition> = SANDBOX,
): LevelProgress => ({
  id: level.id,
  revision: level.revision,
  completedObjectives: [],
});
export function readLevelProgress(value: unknown): LevelProgress {
  if (!value || typeof value !== "object")
    throw new Error("Missing level progress");
  const v = value as Record<string, unknown>;
  const level =
    typeof v.id === "string" && Object.hasOwn(LEVELS, v.id)
      ? LEVELS[v.id]
      : undefined;
  if (
    !level ||
    (v.revision !== level.revision &&
      !(v.id === "first-grove" && v.revision === 1)) ||
    !Array.isArray(v.completedObjectives) ||
    !v.completedObjectives.every(
      (id) =>
        typeof id === "string" && level.objectives.some((o) => o.id === id),
    ) ||
    new Set(v.completedObjectives).size !== v.completedObjectives.length
  )
    throw new Error("Unsupported or damaged level progress");
  return {
    id: level.id,
    revision: level.revision,
    completedObjectives: [...v.completedObjectives],
  };
}
// Progress depends on a small read-only snapshot, not World or rendering classes.
export function updateLevelProgress(
  level: Readonly<LevelDefinition>,
  progress: LevelProgress,
  metrics: Readonly<Partial<Record<LevelObjective["metric"], number>>>,
): boolean {
  if (progress.id !== level.id || progress.revision !== level.revision)
    throw new Error("Level progress mismatch");
  for (const o of level.objectives) {
    if (progress.completedObjectives.includes(o.id)) continue;
    if ((metrics[o.metric] ?? 0) < o.target) break;
    progress.completedObjectives.push(o.id);
  }
  return (
    level.mode === "challenge" &&
    level.objectives.length > 0 &&
    level.objectives.every((o) => progress.completedObjectives.includes(o.id))
  );
}

export function levelComplete(
  level: Readonly<LevelDefinition>,
  progress: LevelProgress,
) {
  return (
    level.mode === "challenge" &&
    level.objectives.length > 0 &&
    level.objectives.every((o) => progress.completedObjectives.includes(o.id))
  );
}
