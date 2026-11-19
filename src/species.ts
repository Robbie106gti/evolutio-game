import { defineAnimal, definePlant, freezeProfile } from "./profiles.ts";
import type { Species, DeathCause } from "./model.ts";
export const DEATH_LABELS: Record<DeathCause, string> = {
  starvation: "Energy exhausted",
  predation: "Killed by predator",
  dehydration: "Dehydration",
  exposure: "Heat / cold exposure",
  old_age: "Old age",
  unknown: "Not recorded",
  drowning: "Drowned",
  disease: "Disease",
  stranding: "Stranded out of water",
};

export const SPECIES = freezeProfile({
  fox: defineAnimal("mammal", {
    label: "Fox",
    kind: "hunter",
    plants: false,
    prey: ["mouse", "bird", "frog"] as Species[],
    speed: 1.15,
    size: 1,
    hue: 0.065,
    diet: "Mice, birds, frogs and crocodile hatchlings",
    gait: "Stalk / dash",
    clutchSize: 1,
    incubation: 0,
  }),
  wolf: defineAnimal("mammal", {
    label: "Wolf",
    kind: "hunter",
    plants: false,
    prey: ["mouse", "bird", "frog"] as Species[],
    speed: 1.1,
    size: 1.35,
    hue: 0.12,
    diet: "Small animals",
    gait: "Rest / chase",
    clutchSize: 1,
    incubation: 0,
  }),
  fish: defineAnimal("fish", {
    label: "Fish",
    kind: "grazer",
    plants: false,
    prey: [] as Species[],
    speed: 0.8,
    size: 0.75,
    hue: 0.52,
    diet: "Aquatic food",
    gait: "Swim",
    clutchSize: 8,
    incubation: 22,
  }),
  turtle: defineAnimal("reptile", {
    label: "Turtle",
    kind: "grazer",
    plants: true,
    prey: [] as Species[],
    speed: 0.5,
    size: 1,
    hue: 0.24,
    diet: "Aquatic food and plants",
    gait: "Paddle / crawl",
    clutchSize: 4,
    incubation: 60,
    capabilities: { aquatic: true },
  }),
  crocodile: defineAnimal("reptile", {
    label: "Crocodile",
    kind: "hunter",
    plants: false,
    prey: ["fish", "frog", "bird"] as Species[],
    speed: 1,
    size: 1.5,
    hue: 0.18,
    diet: "Fish, frogs and water-edge birds",
    gait: "Swim / crawl",
    clutchSize: 4,
    incubation: 65,
    capabilities: { aquatic: true },
  }),
  frog: defineAnimal("amphibian", {
    label: "Frog",
    kind: "hunter",
    plants: false,
    prey: ["bug"] as Species[],
    speed: 1.1,
    size: 0.65,
    hue: 0.3,
    diet: "Bugs and worms",
    gait: "Hop / swim",
    clutchSize: 2000,
    incubation: 25,
  }),
  mouse: defineAnimal("mammal", {
    label: "Mouse",
    kind: "grazer",
    plants: true,
    prey: [] as Species[],
    speed: 1,
    size: 0.75,
    hue: 0.09,
    diet: "Seeds and foliage",
    gait: "Scurry",
    clutchSize: 1,
    incubation: 0,
  }),
  cat: defineAnimal("mammal", {
    label: "Cat",
    kind: "hunter",
    plants: false,
    prey: ["mouse", "bird"] as Species[],
    speed: 1.2,
    size: 1.1,
    hue: 0.07,
    diet: "Mice, birds and crocodile hatchlings",
    gait: "Prowl",
    clutchSize: 1,
    incubation: 0,
  }),
  spider: defineAnimal("arachnid", {
    label: "Spider", kind: "hunter", plants: false, prey: ["bug", "mouse", "bird"], speed: 0.85,
    size: 0.45, hue: 0.07, diet: "Bugs, small mice and small grounded birds", gait: "Eight-legged stalk",
    clutchSize: 8, incubation: 24,
  }),
  scorpion: defineAnimal("arachnid", {
    label: "Scorpion", kind: "hunter", plants: false, prey: ["bug", "spider"], speed: 0.65,
    size: 0.58, hue: 0.11, diet: "Bugs and spiders", gait: "Night prowl",
    clutchSize: 3, incubation: 0, capabilities: { reproduction: "live" },
  }),
  crab: defineAnimal("crustacean", {
    label: "Crab", kind: "hunter", plants: false, prey: ["bug"], speed: 0.65,
    size: 0.72, hue: 0.035, diet: "Remains and insects", gait: "Shore scavenger",
    clutchSize: 6, incubation: 30,
  }),
  bug: defineAnimal("insect", {
    label: "Bug",
    kind: "grazer",
    plants: true,
    prey: [] as Species[],
    speed: 0.75,
    size: 0.6,
    hue: 0.29,
    diet: "Foliage, remains and mushrooms",
    gait: "Six-legged crawl",
    clutchSize: 100,
    incubation: 18,
  }),
  bird: defineAnimal("bird", {
    label: "Bird",
    kind: "hunter",
    plants: true,
    prey: ["bug"] as Species[],
    speed: 1.1,
    size: 0.85,
    hue: 0.57,
    diet: "Insects / worms or small prey",
    gait: "Fly / hop",
    clutchSize: 2,
    incubation: 35,
  }),
  snake: defineAnimal("reptile", {
    label: "Snake",
    kind: "hunter",
    plants: false,
    prey: ["mouse", "bug"] as Species[],
    speed: 1.3,
    size: 0.9,
    hue: 0.22,
    diet: "Mice and bugs",
    gait: "Slither",
    clutchSize: 6,
    incubation: 42,
  }),
});

export const APPEARANCE_DEFAULTS = {
  length: 1,
  limbs: 1,
  cadence: 1,
  stride: 1,
  hue: 0,
  markings: 0.3,
  earSize: 1,
  tailLength: 1,
  furShade: 0.48,
  patternScale: 1,
};

export const PLANTS = freezeProfile({
  grass: definePlant("grass", {
    label: "Grass",
    capacity: 26,
    growth: 1.5,
    lifespan: 180,
    maturity: 8,
    seedCost: 10,
    nutrition: 0.8,
  }),
  bush: definePlant("bush", {
    label: "Bush",
    capacity: 50,
    growth: 1,
    lifespan: 420,
    maturity: 22,
    seedCost: 20,
    nutrition: 1,
  }),
  tree: definePlant("tree", {
    label: "Tree",
    capacity: 85,
    growth: 0.7,
    lifespan: 900,
    maturity: 45,
    seedCost: 34,
    nutrition: 1.2,
  }),
});

export const ADAPTATION_DEFAULTS = {
  preferredMoisture: 0.6,
  droughtTolerance: 0.5,
  immunity: 0.5,
  swimming: 0.5,
};

export const BURST_HUNTERS = {
  crocodile: { boost: 2.6, drain: 26, recovery: 4 },
  cat: { boost: 2.5, drain: 22, recovery: 7 },
  fox: { boost: 2.25, drain: 18, recovery: 6 },
  wolf: { boost: 1.95, drain: 14, recovery: 5 },
} as const;

export const PLANT_VARIETIES = {
  grass: ["Grass tufts", "Ferns", "Wildflowers"],
  bush: ["Leafy shrub", "Berry bush", "Cactus"],
  tree: ["Conifer", "Broadleaf", "Acacia"],
} as const;

// Compressed game-time life histories, not literal biological seconds.
export const MATURITY_AGE = 15;

// legacy save migration reference
export const LIFE_HISTORY: Record<
  Species,
  { maturity: number; lifespan: number }
> = {
  mouse: { maturity: 12, lifespan: 420 },
  cat: { maturity: 35, lifespan: 900 },
  fox: { maturity: 30, lifespan: 800 },
  wolf: { maturity: 45, lifespan: 1100 },
  spider: { maturity: 14, lifespan: 230 }, scorpion: { maturity: 45, lifespan: 640 }, crab: { maturity: 30, lifespan: 480 },
  bug: { maturity: 6, lifespan: 160 },
  bird: { maturity: 20, lifespan: 650 },
  snake: { maturity: 40, lifespan: 1100 },
  fish: { maturity: 12, lifespan: 420 },
  turtle: { maturity: 70, lifespan: 1600 },
  crocodile: { maturity: 240, lifespan: 1800 },
  frog: { maturity: 15, lifespan: 480 },
};

function plantVariants(kind: keyof typeof PLANTS) {
  return PLANT_VARIETIES[kind].map((label, variety) =>
    freezeProfile({
      ...PLANTS[kind],
      label,
      variety,
      desertAdapted: variety === 2 && kind !== "grass",
    }),
  );
}
export const PLANT_PROFILES = freezeProfile({
  grass: plantVariants("grass"),
  bush: plantVariants("bush"),
  tree: plantVariants("tree"),
});
