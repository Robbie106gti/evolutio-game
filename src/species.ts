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

export const isFlyingInsect = (species: Species) => species === "mosquito" || species === "fly";
export const isInsect = (species: Species) =>
  species === "bug" || species === "ant" || species === "fly" || species === "mosquito";

export const SPECIES = freezeProfile({
  fox: defineAnimal("mammal", {
    label: "Fox",
    kind: "hunter",
    plants: false,
    prey: ["mouse", "bird", "frog", "turtle"] as Species[],
    speed: 1.3,
    size: 1,
    hue: 0.065,
    diet: "Mice, birds, frogs, crocodile hatchlings and young turtles",
    gait: "Stalk / dash",
    clutchSize: 1,
    incubation: 0,
  }),
  wolf: defineAnimal("mammal", {
    label: "Wolf",
    kind: "hunter",
    plants: false,
    prey: ["mouse", "bird", "frog", "turtle"] as Species[],
    speed: 1.25,
    size: 1.35,
    hue: 0.12,
    diet: "Small animals, including young turtles",
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
    clutchSize: 3,
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
    clutchSize: 24,
    incubation: 65,
    capabilities: { aquatic: true },
  }),
  frog: defineAnimal("amphibian", {
    label: "Frog",
    kind: "hunter",
    plants: false,
    prey: ["bug", "fly", "mosquito", "ant"] as Species[],
    speed: 1.1,
    size: 0.65,
    hue: 0.3,
    diet: "Insects, small spiders and worms",
    gait: "Hop / swim",
    clutchSize: 300,
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
    diet: "Plant seeds, insects and worms depending on lineage",
    gait: "Scurry",
    clutchSize: 1,
    incubation: 0,
  }),
  cat: defineAnimal("mammal", {
    label: "Cat",
    kind: "hunter",
    plants: false,
    prey: ["mouse", "bird", "turtle"] as Species[],
    speed: 1.35,
    size: 1.1,
    hue: 0.07,
    diet: "Mice, birds, crocodile hatchlings and small turtle hatchlings",
    gait: "Prowl",
    clutchSize: 1,
    incubation: 0,
  }),
  spider: defineAnimal("arachnid", {
    label: "Spider", kind: "hunter", plants: false, prey: ["fly", "mosquito", "ant", "bug", "mouse", "bird"], speed: 0.85,
    size: 0.45, hue: 0.07, diet: "Bugs, small grounded mice and birds, exposed worms", gait: "Eight-legged stalk",
    clutchSize: 96, incubation: 24,
  }),
  scorpion: defineAnimal("arachnid", {
    label: "Scorpion", kind: "hunter", plants: false, prey: ["fly", "mosquito", "ant", "bug", "spider", "mouse", "bird", "frog", "snake", "crab"], speed: 0.65,
    size: 0.58, hue: 0.11, diet: "Carrion, bugs, spiders, worms, small crabs and small grounded mice, frogs, birds or snakes", gait: "Night prowl",
    clutchSize: 3, incubation: 0, capabilities: { reproduction: "live" },
  }),
  crab: defineAnimal("crustacean", {
    label: "Crab", kind: "hunter", plants: false, prey: ["bug", "fly", "mosquito", "ant"], speed: 0.65,
    size: 0.72, hue: 0.035, diet: "Remains, insects and algae (young crabs)", gait: "Shore scavenger",
    clutchSize: 6, incubation: 30,
  }),
  mosquito: defineAnimal("insect", {
    label: "Mosquito", kind: "grazer", plants: true, prey: [], speed: 1.05,
    size: 0.32, hue: 0.12, diet: "Nectar, fruit juice and blood (females)", gait: "Hover",
    clutchSize: 48, incubation: 15, capabilities: { flies: true },
  }),
  fly: defineAnimal("insect", {
    label: "Fly", kind: "grazer", plants: true, prey: [], speed: 1.15,
    size: 0.4, hue: 0.55, diet: "Carrion, decaying plants and ripe fruit juice", gait: "Flit / land",
    clutchSize: 36, incubation: 12, capabilities: { flies: true },
  }),
  ant: defineAnimal("insect", {
    label: "Ant", kind: "grazer", plants: true, prey: [], speed: 0.85,
    size: 0.36, hue: 0.04, diet: "Plants, remains and mushrooms", gait: "Scurry",
    clutchSize: 30, incubation: 20,
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
    clutchSize: 80,
    incubation: 18,
  }),
  bird: defineAnimal("bird", {
    label: "Bird",
    kind: "hunter",
    plants: true,
    prey: ["bug", "fly", "mosquito", "ant", "spider", "scorpion", "frog", "turtle"] as Species[],
    speed: 1.28,
    size: 0.85,
    hue: 0.57,
    diet: "Insects, small arachnids and worms / raptor prey",
    gait: "Fly / hop",
    clutchSize: 2,
    incubation: 35,
  }),
  snake: defineAnimal("reptile", {
    label: "Snake",
    kind: "hunter",
    plants: false,
    prey: ["mouse", "frog", "bug", "fly", "mosquito", "ant"] as Species[],
    speed: 1.3,
    size: 0.9,
    hue: 0.22,
    diet: "Mice, frogs and insects",
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
  cat: { boost: 3.2, drain: 26, recovery: 7 },
  fox: { boost: 2.9, drain: 22, recovery: 6 },
  wolf: { boost: 2.35, drain: 8, recovery: 5 },
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
  mosquito: { maturity: 5, lifespan: 90 },
  fly: { maturity: 5, lifespan: 105 },
  ant: { maturity: 9, lifespan: 180 },
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
      lifespan: kind === "bush" && variety === 2 ? 900 : PLANTS[kind].lifespan,
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
