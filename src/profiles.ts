import type { Kind, Species, PlantKind } from "./model.ts";
export function freezeProfile<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value))
      if (child && typeof child === "object") freezeProfile(child);
    Object.freeze(value);
  }
  return value;
}
export type AnimalFamily =
  "mammal" | "reptile" | "fish" | "bird" | "insect" | "amphibian" | "arachnid" | "crustacean";
export interface AnimalCapabilities {
  aquatic: boolean;
  flies: boolean;
  reproduction: "live" | "eggs";
  nursery: "den" | "nest" | "none";
  waterEggs: boolean;
}
export const ANIMAL_FAMILIES = freezeProfile({
  mammal: {
    aquatic: false,
    flies: false,
    reproduction: "live",
    nursery: "den",
    waterEggs: false,
  },
  reptile: {
    aquatic: false,
    flies: false,
    reproduction: "eggs",
    nursery: "none",
    waterEggs: false,
  },
  fish: {
    aquatic: true,
    flies: false,
    reproduction: "eggs",
    nursery: "none",
    waterEggs: true,
  },
  bird: {
    aquatic: false,
    flies: true,
    reproduction: "eggs",
    nursery: "nest",
    waterEggs: false,
  },
  insect: {
    aquatic: false,
    flies: false,
    reproduction: "eggs",
    nursery: "none",
    waterEggs: false,
  },
  arachnid: { aquatic: false, flies: false, reproduction: "eggs", nursery: "none", waterEggs: false },
  crustacean: { aquatic: true, flies: false, reproduction: "eggs", nursery: "none", waterEggs: true },
  amphibian: {
    aquatic: true,
    flies: false,
    reproduction: "eggs",
    nursery: "none",
    waterEggs: true,
  },
} as const satisfies Record<AnimalFamily, AnimalCapabilities>);
export interface AnimalProfile {
  family: AnimalFamily;
  label: string;
  kind: Kind;
  plants: boolean;
  prey: readonly Species[];
  speed: number;
  size: number;
  hue: number;
  diet: string;
  gait: string;
  capabilities: Readonly<AnimalCapabilities>;
  clutchSize: number;
  incubation: number;
}
export function defineAnimal(
  family: AnimalFamily,
  config: Omit<AnimalProfile, "family" | "capabilities"> & {
    capabilities?: Partial<AnimalCapabilities>;
  },
): Readonly<AnimalProfile> {
  return freezeProfile({
    ...config,
    family,
    prey: [...config.prey],
    capabilities: { ...ANIMAL_FAMILIES[family], ...config.capabilities },
  });
}
export const PLANT_FAMILIES = freezeProfile({
  grass: {
    resource: "sunlight",
    structure: "herbaceous",
    reproduction: "seeds",
  },
  bush: { resource: "sunlight", structure: "shrub", reproduction: "seeds" },
  tree: { resource: "sunlight", structure: "woody", reproduction: "seeds" },
} as const);
export interface PlantProfile {
  label: string;
  capacity: number;
  growth: number;
  lifespan: number;
  maturity: number;
  seedCost: number;
  nutrition: number;
}
export function definePlant<K extends PlantKind>(
  family: K,
  config: PlantProfile,
) {
  return freezeProfile({ ...PLANT_FAMILIES[family], ...config, family });
}
export const FUNGUS_FAMILIES = freezeProfile({
  decomposer: {
    resource: "litter",
    reproduction: "spores",
    photosynthesis: false,
  },
} as const);
export const FUNGI = freezeProfile({
  mushroom: {
    ...FUNGUS_FAMILIES.decomposer,
    family: "decomposer",
    label: "Mushroom patch",
    moistureThreshold: 0.6,
    growth: 0.002,
    drying: 0.006,
    decomposition: 0.001,
    biteRate: 0.008,
    nutrition: 200,
    hydration: 18,
  },
});
