import type { PlantExpression } from "./plant-expression.ts";
import type { Expression } from "./expression.ts";
import type { MouseLineage } from "./mouse-lineages.ts";
import type { AnimalState } from "./animal-state.ts";
export type Kind = "grazer" | "hunter";

export type DeathCause =
  | "starvation"
  | "predation"
  | "dehydration"
  | "exposure"
  | "old_age"
  | "unknown"
  | "drowning"
  | "disease"
  | "stranding";

export type Species =
  | "mouse"
  | "cat"
  | "fox"
  | "wolf"
  | "spider"
  | "scorpion"
  | "crab"
  | "mosquito"
  | "fly"
  | "ant"
  | "bug"
  | "bird"
  | "snake"
  | "fish"
  | "turtle"
  | "crocodile"
  | "frog";

export interface PlantRemains {
  id: number;
  kind: PlantKind;
  variety: number;
  x: number;
  z: number;
  size: number;
  decay: number;
}

export type PlantKind = "grass" | "bush" | "tree";

export interface Genes {
  dietAffinity: number;
  activityPhase: number;
  twilightBias: number;
  activeFraction: number;
  insulation: number;
  waterproofing: number;
  endurance: number;
  maturation: number;
  longevity: number;
  preferredMoisture: number;
  droughtTolerance: number;
  immunity: number;
  swimming: number;
  eyesight: number;
  digging: number;
  length: number;
  limbs: number;
  cadence: number;
  stride: number;
  hue: number;
  markings: number;
  earSize: number;
  tailLength: number;
  furShade: number;
  patternScale: number;
  speed: number;
  size: number;
  sense: number;
  activity: number;
  aggression: number;
  neurons: number;
  weights: number[];
}

export interface Animal {
  antLoad?: { food: "carrion" | "dead plants" | "crop"; energy: number; source?: number; points?: import("./ant-trails.ts").TrailPoint[] };
  seedCargo?: { seed: Plant; mode: "cache" | "gut" | "attached"; pickedAt: number };
  nextStingAge?: number;
  sex?: "female" | "male";
  otherParent?: number;
  cloned?: true;
  reproductive?: {
    target?: number;
    rivalUntil?: number;
    mate?: number;
    previousMate?: number;
    due?: number;
    isolatedSince?: number;
    transitionDue?: number;
  };
  hasEatenBug: boolean;
  expression: Expression;
  mouseLineage: MouseLineage | null;
  feedingTarget: number;
  fedUntilAge: number;
  nursery: {
    kind: "nest" | "den";
    site: number;
    owner: number;
    x: number;
    z: number;
    altitude: number;
  } | null;
  roost: number;
  nextSenseAt: number;
  sensedTarget: number;
  sensedThreat: number;
  sensedHungry: boolean;
  wetness: number;
  crossingZ: number | null;
  crossingSide: number;
  stamina: number;
  restTimer: number;
  mealSpecies?: Species;
  stungUntilAge?: number;
  web?: { x: number; z: number; expires: number; prey: number };
  natalDispersal?: boolean;
  nextBloodMealAge?: number;
  lastPreyAt?: number;
  webScout?: { x: number; z: number; until: number; silk?: boolean; natal?: boolean };
  webHeldUntilAge?: number;
  webOwnerId?: number;
  walkTrail?: { tile: number; time: number }[];
  lastMushroomCell?: number;
  lastMushroomTime?: number;
  mealEnergy: number;
  mealX: number;
  mealZ: number;
  mealTime: number;
  nesting: number;
  altitude: number;
  birdDiet: "raptor" | "insectivore";
  bodyTemperature: number;
  infection: number;
  oxygen: number;
  deathCause?: DeathCause;
  diedAt?: number;
  killedBy?: number;
  hydration: number;
  home: number;
  species: Species;
  distance: number;
  id: number;
  parent: number;
  kind: Kind;
  x: number;
  z: number;
  angle: number;
  energy: number;
  age: number;
  generation: number;
  cooldown: number;
  genes: Genes;
  state: AnimalState;
}

export interface Plant {
  deposit?: { time: number; owner?: number };
  reserves: number;
  depletion: number;
  stripped?: boolean;
  expression: PlantExpression;
  variety: number;
  lastGrowthAt: number;
  health: number;
  droughtTolerance: number;
  floodTolerance: number;
  resistance: number;
  infection: number;
  id: number;
  kind: PlantKind;
  parent: number;
  x: number;
  z: number;
  energy: number;
  growth: number;
  defense: number;
  spread: number;
  generation: number;
  age: number;
}

export interface Egg {
  incubationHeat?: number;
  concealment: number;
  buried: boolean;
  embryo: Animal;
  age: number;
  duration: number;
  health: number;
}

export interface BrainActivity {
  inputs: number[];
  hidden: number[];
  outputs: number[];
}
