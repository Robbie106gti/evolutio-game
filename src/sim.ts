import { markTrail, nextTrailPoint } from "./ant-trails.ts";
import { crabShoreTarget, turnFromBank } from "./shore-movement.ts";
import { recordApproach, recordBugStep } from "./bug-routes.ts";
import { ANIMAL_ENERGY_CAPACITY, browseValue, worthBrowsing, growSeedFood, growPlantLiquid, harvestPlant, ingestPlantFood, ingest, mealYield, SEED_FOOD, type FoodTotals, type TreeBrowseDamage } from "./food-energy.ts";
import { pondFoodQuery } from "./pond-food.ts";
import { canGrowCactus } from "./cactus-habitat.ts";
import { disperseSeed, storeDormantSeed, collectSeed, dropSeed } from "./seed-dispersal.ts";
import {
  createEvolutionArchive,
  recordEvolution,
  rememberAnimal,
} from "./evolution-history.ts";
import {
  populationCounts,
  type PopulationCounts,
} from "./population-history.ts";
import {
  stepApproximateAnimals,
  supportsApproximation,
} from "./approximate.ts";
import {
  RECOVERY,
  recoverPlant,
  foliageProductivity,
} from "./plant-recovery.ts";
import {
  consumeRemains,
  availableWorms,
  eatWorms,
  DETRITUS_NUTRITION,
  DETRITUS_BITE_RATE,
  remainsMass,
  feedPlantSoil,
  type Carcass,
  type EdibleRemains,
} from "./decomposition.ts";
import { plantLifeVisuals } from "./state-visuals.ts";
import {
  plantExpressionMarks,
  updatePlantExpression,
  retainPlantTraits,
} from "./plant-expression.ts";
import {
  expressionMarks,
  updateExpression,
  retainExpressedGenes,
} from "./expression.ts";
import {
  inheritMouseLineage,
  eatsPlants,
  preyEfficiency,
} from "./mouse-lineages.ts";
import { SANDBOX, type LevelDefinition } from "./levels.ts";
import { FUNGI } from "./profiles.ts";
import { updateNursery, feedYoung, reconcileDens } from "./nursery.ts";
import type { AnimalState } from "./animal-state.ts";
import { treeRestSite, safeDenRoute } from "./resting.ts";
import { dailyRhythm, rhythmDefaults, wrapPhase } from "./rhythm.ts";
import { profiling, measured } from "./profiling.ts";
import {
  WORLD_RADIUS,
  changingWeights,
  initialLandscape,
  landAt,
  waterDistance,
  landIndex,
  LAND_STEP,
  LAND_SIDE,
  plantProductivity,
  riverDrinkPoint,
  SpatialGrid,
  ROCKS,
  riverX,
  riverWidthAt,
  riverDepthAt,
  FORDS,
} from "./terrain.ts";
import {
  regionalClimate,
  CoverCache,
  createWaterQuery,
  stepWater,
  detectionRange,
  concealedAmbush,
  eyesightCost,
  initialPonds,
  habitat,
  stepLandscape,
  stepRunoff,
  surfaceDepth,
  waterDepth,
  snakeThermal,
  type Weather,
  type Pond,
  type Den,
} from "./ecology.ts";
import type {
  Kind,
  DeathCause,
  Species,
  PlantRemains,
  PlantKind,
  Genes,
  Animal,
  Plant,
  Egg,
  BrainActivity,
} from "./model.ts";
import { isFlyingInsect, isInsect, SPECIES, PLANTS, PLANT_PROFILES } from "./species.ts";
import {
  canHuntAt,
  grownBodySize,
  huntsAnimals,
  burstProfile,
  clamp,
  maturityAge,
  growthScale,
  lifespan,
  canReproduce,
  ageAgility,
  ageVulnerability,
  laysEggs,
  aquatic,
  perceptionInterval,
} from "./biology.ts";
import { evaluateBrain } from "./brain.ts";
// Compatibility exports for existing consumers and saved-island tools.
export * from "./model.ts";
export * from "./species.ts";
export * from "./biology.ts";
export * from "./brain.ts";
import {
  mixGenes,
  reproductiveSex,
  stepReproduction,
  youngAdultSpider,
  mosquitoHasFed,
  MOUSE_BIRTH_RECOVERY,
  courtshipEnergy,
  usesMate,
  type MateNeighborhoods,
} from "./reproduction.ts";

// Night condensation gives succulent tissue a small water input even when
// surface soil is dry. Clear, dry nights and daylight supply no dew.
function succulentWater(local: ReturnType<typeof regionalClimate>) {
  const dew = Math.max(0, local.cloud - 0.15) * Math.max(0, 1 - local.sunlight * 8) * 0.45;
  return local.moisture + dew;
}

function wolfSearchTarget(wolf: Animal, time: number, depthAt: (x: number, z: number) => number) {
  const goal = wolf.wolfSearch;
  if (goal && goal.until > time && Math.hypot(goal.x - wolf.x, goal.z - wolf.z) > 1) return goal;
  const direction = wolf.id % 2 ? 1 : -1;
  for (const turn of [0, 1, -1, 2, -2, 3, -3, 4]) {
    const heading = wolf.angle + direction * (0.25 + turn * Math.PI / 4);
    const site = { x: wolf.x + Math.cos(heading) * 10, z: wolf.z + Math.sin(heading) * 10 };
    if (Math.hypot(site.x, site.z) >= WORLD_RADIUS - 1 || !safeDenRoute(wolf, site, depthAt)) continue;
    return wolf.wolfSearch = { ...site, until: time + 16 };
  }
  delete wolf.wolfSearch;
}

import { hasDormantEggs, insectEggPatch, insectEggTemperature, insectNurseries, stepInsectEgg } from "./insect-incubation.ts";
import { findFishWater, isFishWater } from "./fish-habitat.ts";
import { FROG_WORM_DEPTH, shoreNursery, frogShoreFood } from "./frog-nursery.ts";
import { diseaseTarget, hasBreedingHealth, illnessSpeed, illnessVulnerability, prepareAnimalDisease, spreadInfection } from "./animal-disease.ts";

export class World {
  readonly #level: Readonly<LevelDefinition>;
  get level() {
    return this.#level;
  }
  #coverCache = new CoverCache();
  deathCounts: Record<DeathCause, number> = {
    starvation: 0,
    predation: 0,
    dehydration: 0,
    exposure: 0,
    old_age: 0,
    unknown: 0,
    drowning: 0,
    disease: 0,
    stranding: 0,
  };
  weather: Weather = {
    moisture: 0.7,
    cloud: 0.4,
    raining: false,
    land: initialLandscape(),
  };
  foodTotals: FoodTotals = {};
  treeBrowseDamage: TreeBrowseDamage = {};
  plantDeaths = {
    depletion: 0,
    drought: 0,
    flooding: 0,
    disease: 0,
    competition: 0,
    old_age: 0,
  };
  ponds: Pond[] = initialPonds();
  dens: Den[] = [];
  seed: number;
  time = 0;
  nextId = 1;
  animals: Animal[] = [];
  deceased: Animal[] = [];
  brainActivity = new Map<number, BrainActivity>();
  plants: Plant[] = [];
  seedBank: Plant[] = [];
  plantRemains: PlantRemains[] = [];
  carcasses: Carcass[] = [];
  eggs: Egg[] = [];
  eggsLaid = 0;
  eggsLaidBySpecies: Partial<Record<Species, number>> = {};
  eggsLost = 0;
  evolution = createEvolutionArchive();
  highestGeneration = 1;
  births = 0;
  deaths = 0;
  plantBirths = 0;
  scarcity = false;
  naturalReproduction: boolean;
  events: string[] = [];
  history: (Partial<PopulationCounts> & {
    time: number;
    grazers: number;
    hunters: number;
    speed: number;
    brain: number;
    growth: number;
  })[] = [];
  constructor(
    seed: number | undefined = undefined,
    level: Readonly<LevelDefinition> = SANDBOX,
    naturalReproduction = false,
    varyLandscape = false,
  ) {
    this.#level = level;
    this.seed = seed ?? level.seed;
    this.naturalReproduction = naturalReproduction;
    this.weather.moisture = level.climate.moisture;
    this.weather.cloud = level.climate.cloud;
    if (varyLandscape && this.weather.land) {
      const phase = [this.random(), this.random(), this.random()].map(n => n * Math.PI * 2);
      for (const [i, cell] of this.weather.land.entries()) {
        const x = i % LAND_SIDE, z = Math.floor(i / LAND_SIDE);
        const ridge = Math.sin(0.37 * x + phase[0]) * Math.cos(0.42 * z + phase[1]);
        cell.elevation = 1.8 * ridge + 0.7 * Math.sin(0.58 * (x + z) + phase[2]);
        cell.moisture = clamp(cell.moisture - ridge * 0.16, 0, 1);
      }
    }
    for (let i = 0; i < level.initial.plantAttempts; i++) this.addPlant();
    // Established islands begin with seeds already on the ground around plants.
    for (const plant of this.plants) plant.seedFood = SEED_FOOD[plant.kind].capacity;
    for (const [species, count] of level.initial.animals)
      for (let i = 0; i < count; i++)
        this.addAnimal(SPECIES[species].kind, undefined, species);
    this.record();
  }
  random() {
    this.seed = (Math.imul(1664525, this.seed) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  range(a: number, b: number) {
    return a + (b - a) * this.random();
  }
  point() {
    const a = this.range(0, Math.PI * 2),
      r = Math.sqrt(this.random()) * (WORLD_RADIUS - 2);
    return { x: Math.cos(a) * r, z: Math.sin(a) * r };
  }
  genes(): Genes {
    const neurons = 4 + Math.floor(this.random() * 4);
    return {
      ...rhythmDefaults("mouse"),
      dietAffinity: 0,
      endurance: this.range(0.9, 1.1),
      maturation: this.range(0.9, 1.1),
      longevity: this.range(0.9, 1.1),
      insulation: this.range(0.2, 0.6),
      waterproofing: this.range(0.2, 0.6),
      preferredMoisture: this.range(0.4, 0.8),
      droughtTolerance: this.range(0.3, 0.7),
      immunity: this.range(0.3, 0.7),
      swimming: this.range(0.3, 0.7),
      eyesight: this.range(0.8, 1.2),
      digging: this.range(0.8, 1.2),
      length: this.range(0.85, 1.15),
      limbs: this.range(0.85, 1.15),
      cadence: this.range(0.85, 1.15),
      stride: this.range(0.85, 1.15),
      hue: this.range(-0.06, 0.06),
      markings: this.range(0.1, 0.7),
      earSize: this.range(0.7, 1.3),
      tailLength: this.range(0.7, 1.3),
      furShade: this.range(0.3, 0.62),
      patternScale: this.range(0.7, 1.3),
      speed: this.range(0.8, 1.5),
      size: this.range(0.7, 1.2),
      sense: this.range(5, 10),
      activity: this.range(0.25, 0.9),
      aggression: this.range(0.1, 0.9),
      neurons,
      weights: Array.from({ length: neurons * 8 }, () => this.range(-1, 1)),
    };
  }
  mutate(g: Genes): Genes {
    const m = (v: number, a: number, b: number) =>
      clamp(v + this.range(-0.12, 0.12) * (b - a), a, b);
    let n = g.neurons;
    if (this.random() < 0.12)
      n = clamp(n + (this.random() < 0.5 ? -1 : 1), 2, 12);
    return {
      activityPhase: wrapPhase(g.activityPhase + this.range(-0.035, 0.035)),
      twilightBias: m(g.twilightBias, 0, 1),
      activeFraction: m(g.activeFraction, 0.35, 0.8),
      endurance: m(g.endurance, 0.6, 1.6),
      maturation: m(g.maturation, 0.6, 1.6),
      longevity: m(g.longevity, 0.65, 1.6),
      insulation: m(g.insulation, 0, 1),
      waterproofing: m(g.waterproofing, 0, 1),
      preferredMoisture: m(g.preferredMoisture, 0.1, 0.9),
      droughtTolerance: m(g.droughtTolerance, 0, 1),
      immunity: m(g.immunity, 0, 1),
      swimming: m(g.swimming, 0, 1),
      eyesight: m(g.eyesight, 0.5, 2.2),
      digging: m(g.digging, 0.5, 1.8),
      length: m(g.length, 0.6, 1.6),
      limbs: m(g.limbs, 0.6, 1.5),
      cadence: m(g.cadence, 0.6, 1.6),
      stride: m(g.stride, 0.6, 1.5),
      hue: clamp(g.hue + this.range(-0.012, 0.012), -0.18, 0.18),
      markings: clamp(g.markings + this.range(-0.035, 0.035), 0, 1),
      earSize: clamp(g.earSize + this.range(-0.035, 0.035), 0.55, 1.55),
      tailLength: clamp(g.tailLength + this.range(-0.04, 0.04), 0.5, 1.6),
      furShade: clamp(g.furShade + this.range(-0.015, 0.015), 0.24, 0.68),
      patternScale: clamp(g.patternScale + this.range(-0.035, 0.035), 0.6, 1.6),
      speed: m(g.speed, 0.5, 2.5),
      size: m(g.size, 0.5, 1.8),
      sense: m(g.sense, 3, 14),
      activity: m(g.activity, 0.05, 1),
      aggression: m(g.aggression, 0, 1),
      dietAffinity: m(g.dietAffinity, 0, 1),
      neurons: n,
      weights: Array.from({ length: n * 8 }, (_, i) =>
        clamp(
          (g.weights[i] ?? this.range(-1, 1)) + this.range(-0.18, 0.18),
          -3,
          3,
        ),
      ),
    };
  }
  addAnimal(
    kind: Kind,
    parent?: Animal,
    requestedSpecies?: Species,
    asEgg = false,
    inheritance?: { mate: Animal } | { clone: true },
  ) {
    const species =
      parent?.species ??
      requestedSpecies ??
      (kind === "grazer" ? "mouse" : "cat");
    const p = parent
      ? {
          x: parent.x + this.range(-0.7, 0.7),
          z: parent.z + this.range(-0.7, 0.7),
        }
      : this.point();
    const mate =
      inheritance && "mate" in inheritance ? inheritance.mate : undefined;
    const clone = inheritance && "clone" in inheritance;
    const genes = !parent
      ? this.genes()
      : clone
        ? { ...parent.genes, weights: [...parent.genes.weights] }
        : this.mutate(
            mate
              ? mixGenes(parent.genes, mate.genes, () => this.random())
              : parent.genes,
          );
    if (parent && !inheritance)
      retainExpressedGenes(genes, parent, () => this.random());
    if (!parent) {
      if (species === "ant") { genes.sense = 3; genes.eyesight = 0.5; }
      if (isFlyingInsect(species) || species === "ant") {
        genes.neurons = 2 + genes.neurons % 2;
        genes.weights.length = genes.neurons * 8;
      }
      const rhythm = rhythmDefaults(species);
      genes.activityPhase = wrapPhase(
        rhythm.activityPhase + this.range(-0.025, 0.025),
      );
      genes.twilightBias = clamp(
        rhythm.twilightBias + this.range(-0.06, 0.06),
        0,
        1,
      );
      genes.activeFraction = clamp(
        rhythm.activeFraction + this.range(-0.04, 0.04),
        0.35,
        0.8,
      );
      const desertBug = species === "bug" && changingWeights(this.weather.land, p.x, p.z).desert > 0.45;
      if (desertBug) {
        genes.droughtTolerance = 0.7 + 0.3 * genes.droughtTolerance;
        genes.hue = 0.08 + 0.05 * genes.hue;
      }
      genes.preferredMoisture = clamp(
        {
          mouse: 0.58,
          cat: 0.5,
          fox: 0.52,
          wolf: 0.55,
          spider: 0.55, scorpion: 0.18, crab: 0.85,
          mosquito: 0.85, fly: 0.65, ant: 0.4,
          bug: desertBug ? 0.24 : 0.72,
          bird: 0.65,
          snake: 0.38,
          fish: 0.8,
          turtle: 0.7,
          crocodile: 0.7,
          frog: 0.8,
        }[species] + this.range(-0.1, 0.1),
        0.1,
        0.9,
      );
      for (
        let tries = 0;
        tries < 30 &&
        ((species === "ant" && !this.suitableAntSite(p.x, p.z)) || waterDepth(this.ponds, p.x, p.z, this.weather.land) > 0.1 ||
          Math.abs(
            landAt(this.weather.land, p.x, p.z).moisture -
              genes.preferredMoisture,
          ) > 0.25);
        tries++
      )
        Object.assign(p, this.point());
    }
    if (!parent && (species === "scorpion" || species === "spider")) {
      const site = this.shelteredFounderSite(p, species);
      if (site) Object.assign(p, site);
    }
    if (aquatic(species) && !parent && this.ponds.length) {
      const pond = this.ponds[Math.floor(this.random() * this.ponds.length)];
      const angle = this.range(0, Math.PI * 2);
      const r = species === "fish" ? pond.radius * 0.5 : pond.radius * 0.95;
      p.x = pond.x + Math.cos(angle) * r;
      p.z = pond.z + Math.sin(angle) * r;
    }
    if (species === "fish") {
      const depthAt = createWaterQuery(this.ponds, this.weather.land);
      if (parent && !isFishWater(parent.x, parent.z, depthAt))
        throw new Error("Fish can only reproduce in water.");
      if (!isFishWater(p.x, p.z, depthAt)) {
        const site = parent ?? findFishWater(this.ponds, this.weather.land, depthAt);
        if (!site) throw new Error("No water deep enough for fish. Try adding water first.");
        p.x = site.x;
        p.z = site.z;
      }
    }
    const occupiedHills = species === "ant" && !parent
      ? new Set(this.animals.filter(a => a.species === "ant" && a.energy > 0).map(a => a.home)) : undefined;
    const antHill = species === "ant" ? this.dens.find(d => d.pantry &&
      (parent ? d.id === parent.home : occupiedHills?.has(d.id) && this.suitableAntSite(d.x, d.z)) &&
      waterDepth(this.ponds, d.x, d.z, this.weather.land) < 0.1) : undefined;
    if (species === "ant") {
      const origin = antHill;
      if (origin) {
        p.x = origin.x + this.range(-0.22, 0.22);
        p.z = origin.z + this.range(-0.22, 0.22);
        if (waterDepth(this.ponds, p.x, p.z, this.weather.land) > 0.1) Object.assign(p, { x: origin.x, z: origin.z });
      }
    }
    const a: Animal = {
      expression: expressionMarks(parent?.expression),
      hasEatenBug: false,
      mouseLineage: null,
      feedingTarget: 0,
      fedUntilAge: 0,
      nursery: null,
      roost: 0,
      nextSenseAt: 0,
      sensedTarget: 0,
      sensedThreat: 0,
      sensedHungry: false,
      wetness: 0,
      crossingZ: null,
      crossingSide: 0,
      stamina: 100,
      restTimer: 0,
      mealEnergy: 0,
      mealX: p.x,
      mealZ: p.z,
      mealTime: 0,
      nesting: 0,
      altitude: 0,
      birdDiet:
        parent?.birdDiet ??
        (this.animals.filter((a) => a.species === "bird").length % 4 === 0
          ? "raptor"
          : "insectivore"),
      infection: 0,
      oxygen: 100,
      bodyTemperature: 23,
      hydration: 90,
      home: antHill?.id ?? parent?.home ?? 0,
      id: this.nextId++,
      parent: parent?.id ?? 0,
      kind: SPECIES[species].kind,
      species,
      distance: 0,
      ...p,
      angle: this.range(0, 6.28),
      energy: parent ? 24 : 80,
      age: 0,
      generation: parent
        ? Math.max(parent.generation, mate?.generation ?? 0) + 1
        : 1,
      cooldown: species === "spider" ? 0 : isFlyingInsect(species) ? 4 : 15,
      genes,
      state: "Exploring",
    };
    if (species === "ant" && !parent && !antHill && this.suitableAntSite(a.x,a.z) && this.dens.length < 152 &&
        this.dens.filter(d => d.pantry).length < 32 && waterDepth(this.ponds, a.x, a.z, this.weather.land) < 0.05) {
      a.home = this.nextId++;
      this.dens.push({ id: a.home, owner: a.id, x: a.x, z: a.z, progress: 0,
        pantry: { carrion: 0, "dead plants": 0 } });
    }
    if (mate) a.otherParent = mate.id;
    if (parent && clone) {
      a.cloned = true;
      a.sex = reproductiveSex(parent);
    }
    a.mouseLineage = inheritMouseLineage(a, parent);
    if (parent && !laysEggs(species)) {
      const den = this.dens.find(
        (d) => d.id === parent.home && d.progress >= 1,
      );
      if (
        den &&
        Math.hypot(parent.x - den.x, parent.z - den.z) < 1.5 &&
        waterDepth(this.ponds, den.x, den.z, this.weather.land) < 0.1
      ) {
        a.nursery = {
          kind: "den",
          site: den.id,
          owner: parent.id,
          x: den.x,
          z: den.z,
          altitude: 0,
        };
        a.x = den.x;
        a.z = den.z;
      }
    }
    this.animals.push(a);
    if (!asEgg) rememberAnimal(this.evolution, a, this.time);
    if (!asEgg)
      this.highestGeneration = Math.max(this.highestGeneration, a.generation);
    return a;
  }
  private shelteredFounderSite(origin: { x: number; z: number }, species: "scorpion" | "spider") {
    const depthAt = createWaterQuery(this.ponds, this.weather.land);
    const spider = species === "spider";
    const insects = new SpatialGrid(this.animals.filter(a =>
      a.energy > 0 && a.altitude <= (spider ? 1.2 : 0.6) && isInsect(a.species) && a.species !== "ant"));
    const mates = this.animals.filter(a => a.energy > 0 && a.species === species);
    const conflictingAnimals = new SpatialGrid(this.animals.filter(a => a.energy > 0 &&
      (spider ? a.species === "frog" || a.species === "scorpion" ||
        (a.species === "bird" && a.birdDiet === "insectivore") : a.species === "spider")));
    let best = -Infinity;
    let site: typeof origin | undefined;
    for (const plant of this.plants) {
      if (plant.kind === "grass" || plant.health <= 0) continue;
      const angle = Math.atan2(origin.z - plant.z, origin.x - plant.x);
      const x = plant.x + 0.9 * Math.cos(angle);
      const z = plant.z + 0.9 * Math.sin(angle);
      if (depthAt(x, z) >= 0.1 || Math.hypot(x, z) >= WORLD_RADIUS - 1) continue;
      // Keep a scorpion and spider apart whichever one is introduced first.
      if (conflictingAnimals.findNear(x, z, 2.5, a => Math.hypot(a.x - x, a.z - z) < 2.5))
        continue;
      const cell = landAt(this.weather.land, x, z);
      const worms = spider && cell.moisture <= 0.45 ? 0 : availableWorms(cell);
      let prey = 0;
      for (const insect of insects.near(x, z, 8))
        if (Math.hypot(insect.x - x, insect.z - z) < 8) prey++;
      if (prey === 0 && worms <= 0.02) continue;
      const cover = habitat({ x, z }, [plant], this.weather.land).cover;
      const neighbors = mates.filter(a => Math.hypot(a.x - x, a.z - z) < 2).length;
      const distance = Math.hypot(x - origin.x, z - origin.z);
      const nearMate = spider && mates.some(a => Math.hypot(a.x - x, a.z - z) < 12);
      const nearbyThreats = spider ? conflictingAnimals.near(x, z, 7)
        .filter(a => Math.hypot(a.x - x, a.z - z) < 7).length : 0;
      const score = cover + Math.min(4, prey) * 0.24 + worms -
        Math.abs(cell.moisture - 0.45) * 0.6 - neighbors * 0.18 - distance * 0.013 +
        (nearMate ? 0.35 : 0) - Math.min(4, nearbyThreats) * 0.25;
      if (score > best) {
        best = score;
        site = { x, z };
      }
    }
    return site;
  }
  addPlant(
    parent?: Plant,
    x?: number,
    z?: number,
    requestedKind?: PlantKind,
    requestedVariety?: number,
  ) {
    const p = parent
      ? {
          x: parent.x + this.range(-parent.spread, parent.spread),
          z: parent.z + this.range(-parent.spread, parent.spread),
        }
      : this.point();
    p.x = x ?? p.x;
    p.z = z ?? p.z;
    if (
      Math.hypot(p.x, p.z) > WORLD_RADIUS - 1 ||
      waterDepth(this.ponds, p.x, p.z, this.weather.land) > 0.1
    )
      return;
    const weights = changingWeights(this.weather.land, p.x, p.z);
    const cactusHabitat = canGrowCactus(this.weather.land, p.x, p.z);
    const roll = this.random();
    const kind =
      parent?.kind ??
      requestedKind ??
      (roll < 0.7 * weights.forest
        ? "tree"
        : roll <
            0.7 * weights.forest +
              0.3 * weights.forest +
              0.7 * weights.desert +
              0.2 * weights.plains
          ? "bush"
          : "grass");
    if (
      kind === "bush" && !cactusHabitat &&
      (parent?.variety === 2 || (!parent && requestedVariety === 2))
    ) return;
    const profile = PLANTS[kind];
    let variety = parent
      ? this.random() < 0.03
        ? (parent.variety + 1) % 3
        : parent.variety
      : (requestedVariety ??
        (weights.desert > 0.4
          ? kind === "grass"
            ? 0
            : 2
          : Math.floor(this.random() * 3)));
    if (kind === "bush" && variety === 2 && !cactusHabitat)
      variety = parent?.variety ?? (roll < 0.5 ? 0 : 1);
    const desertAdapted =
      weights.desert > 0.4 || PLANT_PROFILES[kind][variety].desertAdapted;
    this.plants.push({
      expression: plantExpressionMarks(parent?.expression),
      variety,
      lastGrowthAt: this.time,
      seedFood: 0,
      reserves: RECOVERY[kind].reserve * 0.5,
      depletion: 0,
      health: 100,
      infection: 0,
      droughtTolerance: parent
        ? clamp(parent.droughtTolerance + this.range(-0.08, 0.08), 0, 1)
        : desertAdapted
          ? this.range(0.8, 0.98)
          : this.range(0.3, 0.7),
      floodTolerance: parent
        ? clamp(parent.floodTolerance + this.range(-0.08, 0.08), 0, 1)
        : desertAdapted
          ? this.range(0.1, 0.35)
          : this.range(0.3, 0.7),
      resistance: parent
        ? clamp(parent.resistance + this.range(-0.08, 0.08), 0, 1)
        : this.range(0.3, 0.7),
      id: this.nextId++,
      kind,
      parent: parent?.id ?? 0,
      ...p,
      energy: parent
        ? profile.seedCost * 0.45
        : profile.capacity * this.range(0.45, 0.75),
      growth: parent
        ? clamp(parent.growth + this.range(-0.12, 0.12), 0.3, 1.7)
        : this.range(0.6, 1.2),
      defense: parent
        ? clamp(parent.defense + this.range(-0.08, 0.08), 0, 0.8)
        : this.range(0, kind === "grass" ? 0.15 : kind === "bush" ? 0.45 : 0.6),
      spread: parent
        ? clamp(parent.spread + this.range(-0.3, 0.3), 1, 6)
        : this.range(2, 4),
      generation: parent ? parent.generation + 1 : 1,
      age: 0,
    });
    if (parent) {
      retainPlantTraits(this.plants.at(-1)!, parent, () => this.random());
      this.plantBirths++;
    }
    return this.plants.at(-1);
  }
  layClutch(
    parent: Animal,
    available = Infinity,
    inheritance?: { mate: Animal } | { clone: true },
  ) {
    if (parent.species === "fish" && !isFishWater(parent.x, parent.z, createWaterQuery(this.ponds, this.weather.land))) return 0;
    const species = parent.species;
    const shoreSites = species === "frog" || species === "crab"
      ? shoreNursery(species, parent, this.ponds, createWaterQuery(this.ponds, this.weather.land), this.eggs)
      : undefined;
    const insectSites = hasDormantEggs(species)
      ? insectNurseries(species, parent.x, parent.z,
          createWaterQuery(this.ponds, this.weather.land), this.weather.land, this.eggs)
      : undefined;
    const nurseries = shoreSites ?? insectSites;
    if ((species === "frog" || species === "crab" || species === "bug" || species === "mosquito") && !nurseries) return 0;
    const profile = SPECIES[species];
    const antHill = species === "ant" ? this.dens.find(d => d.id === parent.home && d.pantry && d.progress >= 1) : undefined;
    const provisioned = antHill?.queen === parent.id;
    const workers = provisioned ? this.animals.filter(a =>
      a.species === "ant" && a.home === parent.home && a.id !== parent.id &&
      a.energy > 0 && a.age >= maturityAge(a)).length : 0;
    const workerBonus = 3 * clamp(workers - 4, 0, 10);
    const laid = Math.min(profile.clutchSize + workerBonus, available);
    let developing = laid;
    if (parent.species === "frog" || isInsect(parent.species) || parent.species === "spider") {
      // Sample early egg losses in bulk. Geometric gaps give the same binomial
      // outcome as one trial per egg, with work proportional to survivors.
      const frog = parent.species === "frog";
      const site = shoreSites?.pond ?? insectSites?.nearest ?? parent;
      const quality = frog
        ? Math.min(1, waterDepth(this.ponds, site.x, site.z, this.weather.land))
        : landAt(this.weather.land, site.x, site.z).moisture;
      // Fewer frog eggs are counted at laying, with similar expected recruitment.
      const baseSurvival = provisioned ? 0.5 : frog ? 0.025 + 0.08 * quality
        : parent.species === "spider" ? 0.06 + 0.06 * quality
        : 0.08 + 0.17 * quality;
      // Siblings share the same nursery patch until they disperse. Count
      // developing broods too, so overlapping clutches compete before hatch.
      let competitors = 0, food = 0;
      const nearby = (p: {x: number; z: number}) => (p.x - site.x) ** 2 + (p.z - site.z) ** 2 <= 64;
      for (const a of this.animals) {
        if (a.energy <= 0 || !nearby(a)) continue;
        if (a.species === parent.species && a.id !== parent.id) competitors++;
        if ((frog || parent.species === "spider") && isInsect(a.species)) food++;
      }
      for (const egg of this.eggs)
        if (egg.embryo.species === parent.species && nearby(egg.embryo)) competitors += 0.5;
      if (isInsect(parent.species)) {
        for (const plant of this.plants)
          if (nearby(plant) && worthBrowsing(plant, 80, parent.species))
            food += plant.energy / PLANTS[plant.kind].capacity;
        if (parent.species === "ant" || parent.species === "fly")
          for (const remains of [...this.plantRemains, ...this.carcasses])
            if (nearby(remains)) food += (1 - remains.decay) * remainsMass(remains);
      }
      const capacity = 5 + Math.sqrt(food) * 3;
      const pressure = competitors / capacity;
      // A large local swarm exhausts the food around its nursery faster than
      // a small founding group. Keep early recruitment possible at low density.
      const overcrowding = parent.species === "fly" || parent.species === "bug"
        ? Math.max(0, pressure - 1) ** 2 : 0;
      const chance = baseSurvival / (1 + pressure + overcrowding);
      const logFailure = Math.log1p(-chance);
      developing = 0;
      let index = -1;
      while (true) {
        index += 1 + Math.floor(Math.log1p(-this.random()) / logFailure);
        if (index >= laid) break;
        developing++;
      }
    }
    this.eggsLaid += laid;
    if (laid > 0) this.eggsLaidBySpecies[species] = (this.eggsLaidBySpecies[species] ?? 0) + laid;
    this.eggsLost += laid - developing;
    for (let n = 0; n < developing; n++) {
      const embryo = this.addAnimal(
        parent.kind,
        parent,
        undefined,
        true,
        inheritance,
      );
      this.animals.pop();
      const waterEgg = SPECIES[parent.species].capabilities.waterEggs;
      if (nurseries) {
        Object.assign(embryo, nurseries.nextSite());
      } else if (waterEgg && parent.species !== "fish") {
        const pond = this.ponds.reduce((best, p) =>
          Math.hypot(p.x - parent.x, p.z - parent.z) <
          Math.hypot(best.x - parent.x, best.z - parent.z)
            ? p
            : best,
        );
        embryo.x = pond.x + this.range(-1, 1);
        embryo.z = pond.z + this.range(-1, 1);
      } else if (
        parent.species !== "fish" && waterDepth(this.ponds, embryo.x, embryo.z, this.weather.land) > 0.1
      ) {
        const pond = this.ponds.reduce((best, p) =>
          Math.hypot(p.x - parent.x, p.z - parent.z) <
          Math.hypot(best.x - parent.x, best.z - parent.z)
            ? p
            : best,
        );
        const angle = Math.atan2(parent.z - pond.z, parent.x - pond.x);
        embryo.x = pond.x + Math.cos(angle) * (pond.radius * 1.15 + 0.8);
        embryo.z = pond.z + Math.sin(angle) * (pond.radius * 1.15 + 0.8);
      }
      let concealment = 0,
        buried = false;
      if (parent.species === "ant") {
        if (antHill) {
          embryo.x = antHill.x;
          embryo.z = antHill.z;
          buried = true;
          concealment = 0.8;
        }
      }
      if (parent.species === "snake") {
        const rock = ROCKS.find(
          (r) =>
            Math.hypot(r.x - parent.x, r.z - parent.z) < parent.genes.sense &&
            waterDepth(this.ponds, r.x, r.z, this.weather.land) < 0.1,
        );
        const den = this.dens.find(
          (d) => d.id === parent.home && d.progress >= 1,
        );
        if (rock || den) {
          const nest = rock ?? den!;
          embryo.x = nest.x + this.range(-0.2, 0.2);
          embryo.z = nest.z + this.range(-0.2, 0.2);
          concealment = 0.8;
        } else {
          buried = true;
          concealment = clamp(0.35 + parent.genes.digging * 0.25, 0.4, 0.8);
        }
      }
      if (parent.species === "bird") {
        const tree = this.plants.find(
          (p) => p.id === parent.roost && p.kind === "tree" && p.health > 0,
        );
        const site = tree
          ? treeRestSite(tree, parent.id, this.weather.land)
          : { x: parent.x, z: parent.z, altitude: 0 };
        embryo.nursery = {
          kind: "nest",
          site: tree?.id ?? 0,
          owner: parent.id,
          ...site,
        };
        Object.assign(embryo, site);
        concealment = tree ? 0.5 : 0.15;
      }
      this.eggs.push({
        concealment,
        buried,
        embryo,
        age: 0,
        duration: profile.incubation,
        health: 100,
      });

    }
    if (species === "bug") {
      const localEggs = insectSites?.eggLoad ?? 0;
      // Sparse colonies keep their usual laying interval. Crowded nurseries
      // get time to clear without shortening the eggs’ dormant period.
      const recovery = this.naturalReproduction ? 24 : 40;
      parent.cooldown = recovery + clamp(4 * (localEggs - 8), 0, 108);
    }
    if (species === "snake") {
      parent.energy -= 4;
      parent.nesting = 8 / parent.genes.digging;
    }
    return laid;
  }
  leavePlantRemains(p: Plant) {
    this.plantRemains.push({
      id: p.id,
      kind: p.kind,
      variety: p.variety,
      x: p.x,
      z: p.z,
      size: plantLifeVisuals(p).size,
      decay: 0,
    });
  }
  private tendAntQueens() {
    const members = new Map<number, Animal[]>();
    for (const a of this.animals) {
      if (a.species !== "ant" || a.energy <= 0 || !a.home) continue;
      const colony = members.get(a.home);
      if (colony) colony.push(a);
      else members.set(a.home, [a]);
    }
    for (const hill of this.dens) {
      if (!hill.pantry || hill.progress < 1) continue;
      const ants = members.get(hill.id) ?? [];
      let queen = ants.find(a => a.id === hill.queen && canReproduce(a));
      if (!queen) {
        queen = ants.filter(a => reproductiveSex(a) === "female" && canReproduce(a))
          .sort((a,b) => b.energy - a.energy)[0];
        hill.queen = queen?.id;
      }
      if (!queen || queen.cooldown > 0 || queen.reproductive?.mate || !canReproduce(queen) || !hasBreedingHealth(queen) ||
          queen.energy < 28 || Math.hypot(queen.x-hill.x, queen.z-hill.z) > 0.85 ||
          waterDepth(this.ponds, hill.x, hill.z, this.weather.land) > 0.1) continue;
      const pantry = hill.pantry;
      const funded = Math.floor((pantry.carrion + pantry["dead plants"] + (pantry.crop ?? 0)) / 0.5);
      if (funded < 2) continue;
      const previous = queen.reproductive?.previousMate;
      const mate = ants.find(a => a.id === previous) ??
        (previous ? this.deceased.find(a => a.id === previous) : undefined) ??
        ants.find(a => reproductiveSex(a) === "male" && canReproduce(a) &&
          Math.hypot(a.x-hill.x,a.z-hill.z) <= 2);
      if (!mate) continue;
      (queen.reproductive ??= {}).previousMate = mate.id;
      const cost = this.layClutch(queen, funded, { mate }) * 0.5;
      const carrion = Math.min(cost, pantry.carrion);
      pantry.carrion -= carrion;
      const litter = Math.min(cost - carrion, pantry["dead plants"]);
      pantry["dead plants"] -= litter;
      pantry.crop = Math.max(0, (pantry.crop ?? 0) - (cost - carrion - litter));
      queen.energy -= 5;
      queen.cooldown = 20;
    }
  }
  private suitableAntSite(x: number, z: number) {
    const cell = landAt(this.weather.land, x, z);
    return cell.moisture >= 0.24 && changingWeights(this.weather.land, x, z).desert < 0.65;
  }
  private expandAntColonies(depthAt: (x: number, z: number) => number) {
    const colonies = new Map<number, Animal[]>();
    for (const ant of this.animals) {
      if (ant.species !== "ant" || ant.energy <= 0 || !ant.home) continue;
      const members = colonies.get(ant.home);
      if (members) members.push(ant);
      else colonies.set(ant.home, [ant]);
    }
    const hills = this.dens.filter(d => d.pantry);
    for (const [home, members] of colonies) {
      if (members.length < 18 || hills.length >= 32 || this.dens.length >= 152) continue;
      const hill = hills.find(d => d.id === home);
      if (!hill || hill.progress < 1) continue;
      const candidates = members.filter(a => a.id !== hill.queen && !a.antLoad && a.energy >= 45 && a.age >= maturityAge(a));
      const female = candidates.find(a => reproductiveSex(a) === "female");
      const male = candidates.find(a => reproductiveSex(a) === "male");
      if (!female || !male || candidates.length < 4) continue;
      for (let attempt = 0; attempt < 8; attempt++) {
        const angle = this.range(0, Math.PI * 2), radius = this.range(6, 10);
        const dx = Math.cos(angle) * radius, dz = Math.sin(angle) * radius;
        const x = hill.x + dx, z = hill.z + dz;
        if (!this.suitableAntSite(x,z) || Math.hypot(x,z) >= WORLD_RADIUS - 1 || hills.some(d => Math.hypot(d.x-x,d.z-z) < 5)) continue;
        if ([0.25, 0.5, 0.75, 1].some(t => depthAt(hill.x + t*dx, hill.z + t*dz) >= 0.05)) continue;
        const daughter: Den = { id: this.nextId++, owner: female.id, x, z, progress: 0,
          pantry: { carrion: 0, "dead plants": 0 } };
        hills.push(daughter);
        this.dens.push(daughter);
        const party = [female, male, ...candidates.filter(a => a !== female && a !== male)]
          .slice(0, Math.min(12, Math.floor(members.length / 4), candidates.length));
        for (const ant of party) ant.home = daughter.id;
        break;
      }
    }
  }
  step(
    dt: number,
    approximate = false,
    findMates?: (
      animals: Animal[],
    ) => Promise<MateNeighborhoods | undefined> | undefined,
  ) {
    if (approximate && !supportsApproximation(this))
      throw new Error(
        "Approximate mode currently supports mice and bugs only.",
      );
    const previousTime = this.time;
    this.time += dt;
    // Slow environmental processes integrate once per simulated second. Deriving
    // gates from saved time preserves partial intervals across save/load.
    for (
      let tick = Math.floor(previousTime + 1e-8) + 1;
      tick <= Math.floor(this.time + 1e-8);
      tick++
    ) {
      this.tendAntQueens();
      stepWater(tick, 1, this.weather, this.ponds);
      stepLandscape(tick, 1, this.weather, this.ponds);
      stepRunoff(tick, 1, this.weather, this.ponds);
      for (const remains of this.plantRemains) {
        const cell = this.weather.land?.[landIndex(remains.x, remains.z)];
        const rate =
          (0.6 + (cell?.moisture ?? 0.5) + (cell?.fungus ?? 0)) /
          (remains.kind === "tree" ? 480 : remains.kind === "bush" ? 180 : 65);
        if (cell) consumeRemains(remains, rate * remainsMass(remains), cell);
      }
      this.plantRemains = this.plantRemains.filter((p) => p.decay < 1);
      for (const carcass of this.carcasses) {
        const cell = this.weather.land![landIndex(carcass.x, carcass.z)];
        consumeRemains(
          carcass,
          (remainsMass(carcass) * (0.5 + cell.moisture + cell.fungus)) / 160,
          cell,
        );
      }
      this.carcasses = this.carcasses.filter((c) => c.decay < 1);
    }
    const depthAt = createWaterQuery(this.ponds, this.weather.land);
    if (Math.floor(this.time / 30) > Math.floor(previousTime / 30)) this.expandAntColonies(depthAt);
    const foodAt = pondFoodQuery(this.ponds, depthAt, this.weather.land);
    const plantPressure = new Float64Array(LAND_SIDE * LAND_SIDE);
    const treeShade = new Float64Array(plantPressure.length);
    for (const p of this.plants) {
      const i = landIndex(p.x, p.z);
      plantPressure[i] += p.kind === "tree" ? 2 : p.kind === "bush" ? 1.2 : 0.7;
      if (p.kind === "tree") treeShade[i] += Math.min(1, p.age / 90);
    }
    const cactusCrowding = (x: number, z: number) =>
      (plantPressure[landIndex(x, z)] + 1.2) /
        (5 + 17 * landAt(this.weather.land, x, z).moisture);
    const cactusSite = (seed: Plant, x: number, z: number, germinating: boolean) => {
      if (Math.hypot(x, z) >= WORLD_RADIUS - 1 || depthAt(x, z) >= 0.1 ||
          !canGrowCactus(this.weather.land, x, z) || cactusCrowding(x, z) > 0.9) return false;
      if (!germinating) return true;
      const weather = regionalClimate(this.time, this.weather, x, z);
      // Rain can wet the seed directly. Damp soil and desert dew extend the window.
      return weather.rain >= 0.02 || succulentWater(weather) >= 0.08 - 0.06 * seed.droughtTolerance;
    };
    const spreadCactus = (seed: Plant, germinating: boolean) =>
      disperseSeed(seed, () => this.random(),
        (x, z) => cactusSite(seed, x, z, germinating),
        (x, z) => cactusCrowding(x, z) + 0.04 * clamp(waterDistance(x, z), 0, 24));
    if (
      Math.floor(this.time / 2) > Math.floor((this.time - dt) / 2) &&
      this.seedBank.length
    ) {
      // Cacti have a different germination window from other bushes.
      const group = (seed: Plant) => seed.kind === "bush" && seed.variety === 2 ? "cactus" : seed.kind;
      const kinds = [...new Set(this.seedBank.map(group))];
      const kind = kinds[Math.floor(this.random() * kinds.length)];
      const candidates = this.seedBank.filter((seed) => group(seed) === kind);
      const seed = candidates[Math.floor(this.random() * candidates.length)];
      const cactusSeed = seed.kind === "bush" && seed.variety === 2;
      const suitable = (x: number, z: number) => {
          if (Math.hypot(x, z) >= WORLD_RADIUS - 1 || depthAt(x, z) >= 0.1) return false;
          return cactusSeed ? cactusSite(seed, x, z, true) : landAt(this.weather.land, x, z).moisture > 0.3;
      };
      const owner = seed.deposit?.owner && this.animals.find(a => a.id === seed.deposit!.owner);
      if (owner && owner.energy < 65 && this.time - seed.deposit!.time > 12 && Math.hypot(owner.x - seed.x, owner.z - seed.z) < 1) {
        ingest(this.foodTotals, owner, SEED_FOOD[seed.kind].label, PLANTS[seed.kind].seedCost * 0.2);
        this.seedBank.splice(this.seedBank.indexOf(seed), 1);
      } else {
        const site = seed.deposit
          ? this.time - seed.deposit.time > 24 && suitable(seed.x, seed.z) && seed
          : cactusSeed ? spreadCactus(seed, true) : disperseSeed(seed, () => this.random(), suitable);
        const young = site && this.addPlant(seed, site.x, site.z);
        if (young) {
          plantPressure[landIndex(young.x, young.z)] += young.kind === "tree" ? 2 : young.kind === "bush" ? 1.2 : 0.7;
          this.seedBank.splice(this.seedBank.indexOf(seed), 1);
        }
      }
    }

    // Resolve shared nursery sites once per step, including eggs and orphaned broods.
    const nurseryTrees = new Map(
      this.plants
        .filter((p) => p.kind === "tree" && p.health > 0)
        .map((p) => [p.id, p]),
    );
    const nurseryDens = new Map(this.dens.map((d) => [d.id, d]));
    const nurseryContext = {
      trees: nurseryTrees,
      dens: nurseryDens,
      land: this.weather.land,
      depthAt,
    };
    for (const a of this.animals) {
      a.feedingTarget = 0;
      updateNursery(a, nurseryContext);
    }
    const eggTemperatures = new Map<number, number>();
    const insectEggCounts = new Map<number, number>();
    for (const { embryo, health } of this.eggs) {
      if (health <= 0 || !hasDormantEggs(embryo.species)) continue;
      const patch = insectEggPatch(landIndex(embryo.x, embryo.z), embryo.species);
      insectEggCounts.set(patch, (insectEggCounts.get(patch) ?? 0) + 1);
    }
    for (const egg of this.eggs) {
      updateNursery(egg.embryo, nurseryContext, true);
      const a = egg.embryo;
      const depth = depthAt(a.x, a.z);
      const soil = landAt(this.weather.land, a.x, a.z);
      if (hasDormantEggs(a.species)) {
        const index = landIndex(a.x, a.z);
        let temperature = eggTemperatures.get(index);
        if (temperature === undefined) {
          temperature = insectEggTemperature(this.time, this.weather, index);
          eggTemperatures.set(index, temperature);
        }
        stepInsectEgg(egg, dt, temperature, depth, soil.moisture, soil.litter,
          insectEggCounts.get(insectEggPatch(index, a.species)) ?? 1);
      } else {
        egg.age += dt;
        const wet = depth > a.altitude + 0.1;
        const waterEgg = SPECIES[a.species].capabilities.waterEggs;
        if (waterEgg !== wet) egg.health -= dt * 3;
        if (!waterEgg && soil.moisture < 0.08)
          egg.health -= dt * (1 - a.genes.droughtTolerance) * (1 - 0.6 * egg.concealment);
      }
      if (this.naturalReproduction && a.species === "turtle") {
        const temperature = regionalClimate(
          this.time,
          this.weather,
          a.x,
          a.z,
        ).temperature;
        egg.incubationHeat =
          (egg.incubationHeat ?? 0) + dt * (temperature - 22);
      }
      if (egg.age >= egg.duration && egg.health > 0) {
        const survival =
          a.species === "bird" ? 0.8 : a.species === "bug" ? 0.25 : a.species === "ant" && egg.buried && nurseryDens.get(a.home)?.pantry ? 0.65 : 0.4;
        if (
          (a.species !== "fish" || isFishWater(a.x, a.z, depthAt)) &&
          ((a.species !== "frog" && a.species !== "crab") || depth > 0.1) &&
          this.random() <
          survival + 0.15 * a.genes.immunity + 0.2 * egg.concealment
        ) {
          if (egg.incubationHeat !== undefined)
            a.sex = egg.incubationHeat >= 0 ? "female" : "male";
          if (a.species === "spider") a.natalDispersal = true;
          this.animals.push(a);
          this.births++;
        } else this.eggsLost++;
      } else if (egg.health <= 0) this.eggsLost++;
    }
    this.eggs = this.eggs.filter((e) => e.health > 0 && e.age < e.duration);
    if (Math.floor(previousTime) !== Math.floor(this.time))
      reconcileDens(this.animals, this.dens, this.eggs);
    const indexStart = profiling ? performance.now() : 0;
    const markInsectFeeding = (a: Animal) => {
      if (a.species === "mosquito") a.mosquitoFed = true;
      const cell = this.weather.land?.[landIndex(a.x, a.z)];
      if (cell) {
        cell.bugFeedX = a.x;
        cell.bugFeedZ = a.z;
        cell.bugFeedTime = this.time;
      }
    };
    const remainsGrid = new SpatialGrid<EdibleRemains>(
      [...this.plantRemains, ...this.carcasses],
      8,
    );
    const plantGrid = new SpatialGrid(this.plants);
    const animalGrid = new SpatialGrid(this.animals, 8);
    if (Math.floor(previousTime) !== Math.floor(this.time) && this.eggs.length) {
      const fed = new Set<number>();
      this.eggs = this.eggs.filter(egg => {
        const embryo = egg.embryo;
        if (egg.buried || this.random() >= 0.12 * (1 - egg.concealment)) return true;
        const near = animalGrid.near(embryo.x, embryo.z, 2);
        if (!isInsect(embryo.species) && near.some(a => (a.id === embryo.parent || a.id === embryo.otherParent) &&
            a.energy > 0 && Math.hypot(a.x - embryo.x, a.z - embryo.z) < 2)) return true;
        const eater = near.find(a => !(a.species === "bird" && isInsect(embryo.species)) && a.species !== embryo.species && a.energy > 0 && a.energy < 95 &&
          a.state !== "Sleeping" && !fed.has(a.id) && !a.nursery && a.mealEnergy <= 0 &&
          (huntsAnimals(a) || a.species === "ant") &&
          Math.abs(a.altitude - embryo.altitude) < 0.7 &&
          (!SPECIES[embryo.species].capabilities.waterEggs || aquatic(a.species) || depthAt(embryo.x, embryo.z) < 0.2) &&
          Math.hypot(a.x - embryo.x, a.z - embryo.z) < 0.85);
        if (!eater) return true;
        ingest(this.foodTotals, eater, "eggs", 2 + 8 * grownBodySize(embryo));
        fed.add(eater.id);
        this.eggsLost++;
        return false;
      });
    }
    const exposedInsectEggs = this.eggs.filter(e => !e.buried && e.health > 0 && isInsect(e.embryo.species));
    const insectEggGrid = new SpatialGrid(exposedInsectEggs.map(e => e.embryo), 4);
    const eggByEmbryo = new Map(exposedInsectEggs.map(e => [e.embryo.id, e]));
    // Nestmates share finite crop reserves on contact, even when the pantry
    // is empty. Leave donors enough energy to forage or breed themselves.
    if (Math.floor(previousTime) !== Math.floor(this.time)) {
      for (const worker of this.animals) {
        if (worker.species !== "ant" || !worker.home || worker.energy <= 45) continue;
        const recipient = animalGrid.findNear(worker.x, worker.z, 1.6, b =>
          b.species === "ant" && b.home === worker.home && b.energy > 0 &&
          b.energy < 30 && Math.hypot(worker.x - b.x, worker.z - b.z) <= 1.6);
        if (recipient) {
          const transfer = Math.min(6, worker.energy - 40, 35 - recipient.energy);
          worker.energy -= transfer;
          recipient.energy += transfer;
        }
      }
    }
    const predatorGrid = new SpatialGrid(this.animals.filter(huntsAnimals), 8);
    const plantById = new Map(this.plants.map((p) => [p.id, p]));
    const animalById = new Map(this.animals.map((a) => [a.id, a]));
    const broods = new Map<number, Animal[]>();
    for (const a of [...this.animals, ...this.eggs.map((e) => e.embryo)]) {
      if (!a.nursery) continue;
      const brood = broods.get(a.parent);
      if (brood) brood.push(a);
      else broods.set(a.parent, [a]);
    }
    const youngByParent = new Map<number, Animal[]>();
    for (const a of this.animals)
      if (a.age < maturityAge(a)) {
        const siblings = youngByParent.get(a.parent);
        if (siblings) siblings.push(a);
        else youngByParent.set(a.parent, [a]);
      }

    const denById = new Map(this.dens.map((d) => [d.id, d]));
    const siteClimate = new Map<
      number,
      Map<number, ReturnType<typeof regionalClimate>>
    >();
    const climateAt = (x: number, z: number) => {
      let row = siteClimate.get(x);
      if (!row) {
        row = new Map();
        siteClimate.set(x, row);
      }
      let c = row.get(z);
      if (!c) {
        c = regionalClimate(this.time, this.weather, x, z);
        row.set(z, c);
      }
      return c;
    };
    const coverAt = this.#coverCache.prepare(
      this.plants,
      this.weather.land,
      plantGrid,
    );
    const terrain = new Map<number, ReturnType<typeof coverAt>>(
      approximate ? [] : this.animals.map((a) => [a.id, coverAt(a)]),
    );
    const shelteredInAntHill = (prey: Animal) => {
      if (prey.species !== "ant") return false;
      const hill = denById.get(prey.home);
      return !!hill?.pantry && hill.progress >= 1 && Math.hypot(prey.x-hill.x, prey.z-hill.z) <= 1;
    };
    const canReachPrey = (predator: Animal, prey: Animal) =>
      !shelteredInAntHill(prey) && canHuntAt(predator, prey, depthAt);
    const inDen = (a: Animal) => {
      if (
        a.nursery &&
        Math.hypot(a.x - a.nursery.x, a.z - a.nursery.z) < 0.8 &&
        Math.abs(a.altitude - a.nursery.altitude) < 0.3
      )
        return true;
      if (a.species === "bird" && a.roost) {
        const tree = plantById.get(a.roost);
        if (tree && tree.health > 0) {
          const site = treeRestSite(tree, a.id, this.weather.land);
          if (
            Math.hypot(a.x - site.x, a.z - site.z) < 0.3 &&
            Math.abs(a.altitude - site.altitude) < 0.2
          )
            return true;
        }
      }
      const d = denById.get(a.home);
      return !!d && d.progress >= 1 && Math.hypot(d.x - a.x, d.z - a.z) < 1.2;
    };
    measured("simulation: indexes + habitat", indexStart);
    const plantsStart = profiling ? performance.now() : 0;
    for (const p of [...this.plants]) {
      if (p.health <= 0) continue;
      const profile = PLANTS[p.kind];
      const cactus = p.kind === "bush" && p.variety === 2;
      p.age += dt;
      const seedInterval = cactus ? 40 : 60;
      if (
        p.age > PLANTS[p.kind].maturity &&
        p.energy > profile.capacity * (cactus ? 0.3 : 0.6) &&
        p.depletion === 0 &&
        Math.floor(p.age / seedInterval) > Math.floor((p.age - dt) / seedInterval)
      ) {
        const site = cactus ? spreadCactus(p, false) : undefined;
        const seed = site ? { ...p, ...site, deposit: { time: this.time } } : p;
        if ((!cactus || site) && storeDormantSeed(this.seedBank, seed))
          p.energy -= profile.seedCost * (cactus ? 0.1 : 0.2);
      }
      // Ten ID-based cohorts spread one-second growth work across ten ticks.
      const phase = (p.id % 10) * 0.1;
      if (
        Math.floor(previousTime - phase + 1e-8) ===
          Math.floor(this.time - phase + 1e-8) &&
        p.health > 1
      )
        continue;
      const growthDt = this.time - p.lastGrowthAt;
      p.lastGrowthAt = this.time;
      const cell = landAt(this.weather.land, p.x, p.z);
      const plantClimate = regionalClimate(this.time, this.weather, p.x, p.z);
      const patch = landIndex(p.x, p.z);
      const resources =
        (5 + 17 * cell.moisture) * (0.75 + 0.25 * plantClimate.sunlight);
      const competition = plantPressure[patch] / resources;
      const availableLight =
        1 / (1 + treeShade[patch] * (p.kind === "tree" ? 0.05 : 0.13));
      const water = cactus ? succulentWater(plantClimate) : cell.moisture;
      const drought = water < (cactus ? 0.08 : 0.22) * (1 - 0.7 * p.droughtTolerance);
      // Succulents make use of small rain pulses and slow their metabolism
      // between them. Dry soil still limits growth and prolonged drought hurts.
      const usableMoisture = cactus
        ? water / (water + 0.08)
        : 0.1 + 0.9 * cell.moisture;
      const depth = depthAt(p.x, p.z);
      const flood = depth > 0.2 + p.floodTolerance;
      updatePlantExpression(p, growthDt, cell.moisture, depth);
      p.infection = clamp(
        p.infection +
          growthDt *
            (cell.fungus * 0.05 * (1 - p.resistance) -
              (0.008 + p.resistance * 0.02)),
        0,
        1,
      );
      p.health = clamp(
        p.health +
          growthDt *
            (drought
              ? (cactus ? -0.12 : -0.65) * (1 - 0.8 * p.droughtTolerance)
              : flood
                ? -0.8
                : p.infection > 0.5
                  ? -0.3 * p.infection
                  : 0.18) -
          growthDt * Math.max(0, competition - 1) * 0.35,
        0,
        100,
      );
      if (p.health <= 0) {
        this.plantDeaths[
          drought
            ? "drought"
            : flood
              ? "flooding"
              : competition > 1
                ? "competition"
                : "disease"
        ]++;
        if (this.weather.land)
          this.weather.land[landIndex(p.x, p.z)].litter = clamp(
            this.weather.land[landIndex(p.x, p.z)].litter + 0.12,
            0,
            1,
          );
        continue;
      }

      const nearby = plantGrid
        .near(p.x, p.z, 2)
        .reduce(
          (n, q) =>
            n + (p !== q && (p.x - q.x) ** 2 + (p.z - q.z) ** 2 < 4 ? 1 : 0),
          0,
        );
      recoverPlant(p, growthDt, () => this.random());
      if (p.health <= 0) {
        this.plantDeaths.depletion++;
        continue;
      }
      p.energy +=
        foliageProductivity(p) *
        ((((growthDt * profile.growth * p.growth * (1 - p.defense * 0.65)) /
          (1 + nearby * 0.12)) *
          (this.scarcity ? 0.42 : 1) *
          usableMoisture *
          availableLight) /
          (1 + competition * 0.65)) *
        (0.55 + 0.45 * plantClimate.sunlight) *
        (cactus ? 1 : plantProductivity(p.x, p.z)) *
        (p.health / 100) *
        feedPlantSoil(this.weather.land![patch], growthDt, p.kind === "tree") *
        (1 -
          0.15 * p.droughtTolerance -
          0.1 * p.floodTolerance -
          0.1 * p.resistance) *
        1.4;
      p.energy -= growthDt * profile.growth * 0.08 * (1 + competition) *
        (cactus ? 0.25 + 0.75 * usableMoisture : 1);
      if (this.weather.land)
        this.weather.land[patch].moisture = Math.max(
          0,
          this.weather.land[patch].moisture -
            growthDt * 0.000025 * (p.kind === "tree" ? 2 : 1),
        );
      if (
        p.age > profile.maturity &&
        p.depletion === 0 &&
        p.health > 60 &&
        p.energy > profile.capacity * 0.88 &&
        competition < 1.35 &&
        this.random() < growthDt * 0.25 * Math.max(0, 1 - competition / 1.35)
      ) {
        const site = cactus ? spreadCactus(p, true) : undefined;
        const young = cactus ? site && this.addPlant(p, site.x, site.z) : this.addPlant(p);
        if (young) {
          p.energy -= profile.seedCost + p.spread * 0.5;
          plantPressure[cactus ? landIndex(young.x, young.z) : patch] +=
            p.kind === "tree" ? 2 : p.kind === "bush" ? 1.2 : 0.7;
        }
      }
      p.energy = clamp(p.energy, 0, profile.capacity);
      growSeedFood(p, growthDt);
      growPlantLiquid(p, growthDt);
    }
    this.plants = this.plants.filter((p) => {
      if (p.health <= 0) {
        this.leavePlantRemains(p);
        return false;
      }
      if (p.age < PLANT_PROFILES[p.kind][p.variety].lifespan / (0.6 + p.growth * 0.3)) return true;
      this.plantDeaths.old_age++;
      this.leavePlantRemains(p);
      if (this.weather.land)
        this.weather.land[landIndex(p.x, p.z)].litter = clamp(
          this.weather.land[landIndex(p.x, p.z)].litter + 0.12,
          0,
          1,
        );
      return false;
    });
    measured("simulation: plants", plantsStart);
    const plantVisitors = new Map<number, number>();
    for (const a of this.animals)
      if (a.energy > 0 && plantById.has(a.sensedTarget))
        plantVisitors.set(a.sensedTarget, (plantVisitors.get(a.sensedTarget) ?? 0) + 1);
    const colonyRanks = new Map<number, number>();
    const remainsIds = new Set([...this.plantRemains, ...this.carcasses].map(r => r.id));
    const animalsStart = profiling ? performance.now() : 0;
    const disease = prepareAnimalDisease(this.animals);
    if (approximate) stepApproximateAnimals(this, dt, depthAt, disease);
    else
      for (const a of [...this.animals]) {
        if (a.energy <= 0) continue;
        const g = a.genes;
        if (a.roost && !plantById.has(a.roost)) a.roost = 0;
        let hill = a.species === "ant" ? denById.get(a.home) : undefined;
        if (a.species === "ant" && !hill?.pantry) {
          let range = 18;
          for (const site of this.dens) {
            if (!site.pantry) continue;
            const distance = Math.hypot(a.x - site.x, a.z - site.z);
            if (distance < range) { range = distance; hill = site; }
          }
          if (!hill?.pantry && this.suitableAntSite(a.x,a.z) && depthAt(a.x, a.z) < 0.05 && this.dens.length < 152 &&
              this.dens.filter(d => d.pantry).length < 32) {
            hill = { id: this.nextId++, owner: a.id, x: a.x, z: a.z, progress: 0,
              pantry: { carrion: 0, "dead plants": 0 } };
            this.dens.push(hill);
            denById.set(hill.id, hill);
          }
          if (!hill?.pantry) {
            hill = this.dens.reduce<Den | undefined>((nearest, site) =>
              site.pantry && (!nearest || Math.hypot(a.x-site.x, a.z-site.z) <
                Math.hypot(a.x-nearest.x, a.z-nearest.z)) ? site : nearest, undefined);
          }
          if (hill) a.home = hill.id;
        }
        let scout = false;
        if (hill?.pantry && a.id !== hill.queen) {
          const rank = colonyRanks.get(hill.id) ?? 0;
          colonyRanks.set(hill.id, rank + 1);
          scout = rank % 8 === 0;
          if (hill.antTrail && (hill.antTrail.expires < this.time || !remainsIds.has(hill.antTrail.source))) delete hill.antTrail;
        }
        const hunter = burstProfile(a.species);
        a.restTimer = Math.max(0, a.restTimer - dt);
        if (a.mealEnergy > 0) {
          a.mealTime = Math.max(0, a.mealTime - dt);
          if (a.mealTime === 0) a.mealEnergy = 0;
        }
        const restDue =
          !dailyRhythm(g, this.time).active &&
          a.energy >
            (["Sleeping", "Seeking sleep"].includes(a.state) ? 55 : 85) &&
          a.hydration > 55 &&
          a.oxygen > 50 &&
          (aquatic(a.species) || a.wetness < 0.4) &&
          a.nesting <= 0;
        const hungry =
          !restDue && a.mealEnergy <= 0 &&
          (hunter
            ? a.energy < 70 + g.activity * 10 &&
              a.mealEnergy <= 0 &&
              a.restTimer <= 0 &&
              a.stamina > 30
            : a.energy < 112);
        const conditions = regionalClimate(this.time, this.weather, a.x, a.z);
        const contact = depthAt(a.x, a.z) > 0.05 && a.altitude < 0.5;
        a.wetness = clamp(
          a.wetness +
            dt *
              ((contact
                ? 0.45
                : conditions.rain *
                  0.06 *
                  (1 - (inDen(a) ? 1 : (terrain.get(a.id)?.cover ?? 0)))) *
                (1 - 0.75 * g.waterproofing) -
                (contact
                  ? 0
                  : 0.012 * (1 + conditions.sunlight + (inDen(a) ? 1 : 0)))),
          0,
          1,
        );
        const localTemp =
          conditions.temperature -
          (aquatic(a.species)
            ? 0
            : a.wetness *
              (3 + 4 * (1 - conditions.sunlight)) *
              (1 - 0.6 * g.insulation));
        const thermal =
          a.species === "snake"
            ? snakeThermal(
                a.bodyTemperature,
                localTemp,
                conditions.sunlight,
                terrain.get(a.id)?.cover ?? 0,
                dt,
              )
            : { temperature: 37, speed: 1, metabolism: 1, water: 1 };
        a.bodyTemperature = thermal.temperature;
        updateExpression(a, dt, conditions.temperature);
        a.age += dt;
        if (a.seedCargo) {
          dropSeed(this.seedBank, a, this.time, depthAt(a.x, a.z));
        } else if (a.altitude < 0.6 && Math.floor(a.age / 6) > Math.floor((a.age - dt) / 6)) {
          const plant = plantGrid.findNear(a.x, a.z, 0.8, p => Math.hypot(a.x - p.x, a.z - p.z) < 0.8);
          if (plant && this.random() < 0.2) collectSeed(this.seedBank, a, plant, "attached", this.time);
        }
        a.cooldown -= dt;
        let target: Plant | Animal | undefined =
          animalById.get(a.sensedTarget) ?? plantById.get(a.sensedTarget);
        let threat = animalById.get(a.sensedThreat);
        let distance = target
          ? Math.hypot(target.x - a.x, target.z - a.z)
          : g.sense;
        const foodRange = a.species === "mosquito" && a.energy < 30 ? g.sense * 2 : g.sense;
        const invalidTarget =
          !!target &&
          (target.energy <= ("genes" in target ? 0 : 2) ||
            ("genes" in target && (shelteredInAntHill(target) || ((a.species === "frog" || a.species === "spider" || a.species === "scorpion" || a.species === "crocodile" ||
              ((a.species === "snake" || a.species === "bird") && target.species === "frog") ||
              target.species === "crocodile" || target.species === "turtle") && !canReachPrey(a, target)))) ||
            (!("genes" in target) && !worthBrowsing(target, a.energy, a.species)));
        const urgentFood =
          hungry &&
          (!target || invalidTarget || distance > 2) &&
          ((SPECIES[a.species].plants &&
            eatsPlants(a) &&
            a.species !== "bird" &&
            plantGrid.findNear(
              a.x,
              a.z,
              2,
              (p) =>
                worthBrowsing(p, a.energy, a.species) &&
                Math.hypot(p.x - a.x, p.z - a.z) < 2,
            )) ||
            ((SPECIES[a.species].prey.length > 0 ||
              (a.species === "mouse" && a.genes.dietAffinity >= 0.3)) &&
              animalGrid.findNear(
                a.x,
                a.z,
                2,
                (b) =>
                  b.energy > 0 &&
                  canReachPrey(a, b) &&
                  Math.hypot(b.x - a.x, b.z - a.z) < 2,
              )));
        const urgentThreat = predatorGrid.findNear(
          a.x,
          a.z,
          2,
          (b) =>
            b.energy > 0 &&
            canReachPrey(b, a) &&
            Math.hypot(b.x - a.x, b.z - a.z) < 2 &&
            (b.state !== "Waiting in ambush" || !concealedAmbush(b, terrain.get(b.id) ?? coverAt(b)) ||
              Math.hypot(b.x - a.x, b.z - a.z) < 0.45 * g.eyesight) &&
            (!burstProfile(b.species) ||
              (b.energy < 80 &&
                b.mealEnergy <= 0 &&
                b.restTimer <= 0 &&
                b.stamina > 30)),
        );
        if (
          this.time >= a.nextSenseAt ||
          hungry !== a.sensedHungry ||
          (a.sensedTarget !== 0 &&
            (!target || invalidTarget || distance > foodRange)) ||
          (a.sensedThreat !== 0 && (!threat || threat.energy <= 0)) ||
          urgentThreat ||
          urgentFood
        ) {
          if (plantVisitors.has(a.sensedTarget))
            plantVisitors.set(a.sensedTarget, plantVisitors.get(a.sensedTarget)! - 1);
          let bestBrowse = 0;
          target = undefined;
          distance = foodRange;

          const considerTarget = (b: Plant | Animal) => {
            const d = Math.hypot(b.x - a.x, b.z - a.z);
            if (!("genes" in b) && (a.species === "mouse" || a.species === "turtle")) {
              if (d >= foodRange) return;
              // Crawling turtles pay more travel time to switch patches.
              const travel = a.species === "turtle" ? d * (1 + d) : d;
              const value = browseValue(b, travel, plantVisitors.get(b.id) ?? 0, a.species);
              if (value > bestBrowse) {
                bestBrowse = value;
                distance = d;
                target = b;
              }
              return;
            }
            if (
              d < distance &&
              (!("genes" in b) ||
                ((a.species === "spider" || a.species === "scorpion") && isInsect(b.species) && d < 0.85) ||
                d <
                  detectionRange(
                    a,
                    b,
                    terrain.get(b.id) ?? coverAt(b),
                    conditions.light,
                    inDen(b),
                  ))
            ) {
              distance = d;
              target = b;
            }
          };
          if (hungry) {
            if (
              SPECIES[a.species].plants &&
              eatsPlants(a) &&
              a.species !== "bird"
            )
              for (const p of plantGrid.near(a.x, a.z, foodRange))
                if (worthBrowsing(p, a.energy, a.species)) considerTarget(p);
            if (huntsAnimals(a))
              for (const b of animalGrid.near(a.x, a.z, g.sense))
                if (b.energy > 0 && canReachPrey(a, b)) considerTarget(b);
          }

          threat = predatorGrid.findNear(
            a.x,
            a.z,
            g.sense,
            (b) =>
              canReachPrey(b, a) &&
              (!burstProfile(b.species) ||
                (b.mealEnergy <= 0 &&
                  b.energy < 80 &&
                  b.restTimer <= 0 &&
                  b.stamina > 30)) &&
              b.energy > 0 &&
              Math.hypot(b.x - a.x, b.z - a.z) <
                detectionRange(
                  a,
                  b,
                  terrain.get(b.id) ?? coverAt(b),
                  conditions.light,
                  inDen(b),
                ),
          );

          threat = urgentThreat ?? threat;
          a.sensedTarget = (target as Plant | Animal | undefined)?.id ?? 0;
          if (plantById.has(a.sensedTarget))
            plantVisitors.set(a.sensedTarget, (plantVisitors.get(a.sensedTarget) ?? 0) + 1);
          a.sensedThreat = threat?.id ?? 0;
          a.sensedHungry = hungry;
          a.nextSenseAt = this.time + (threat ? 0.1 : perceptionInterval(a));
        }
        const surroundings = terrain.get(a.id)!;
        let shelter = inDen(a) ? 1 : surroundings.cover;
        const harsh =
          (a.species === "snake" && a.bodyTemperature > 35) ||
          localTemp > 34 ||
          localTemp < 8 ||
          conditions.rain > 0.2;
        let need: { x: number; z: number } | undefined;
        let needState: AnimalState | "" = "";
        let restAltitude = 0;
        let stationary = false;
        a.hydration = clamp(
          a.hydration -
            dt *
              (0.12 + 0.012 * Math.max(0, localTemp - 22)) *
              (1 - 0.45 * g.droughtTolerance) *
              thermal.water *
              (1 - 0.45 * shelter),
          0,
          100,
        );
        const nearbyScorpionPrey = a.species === "scorpion" && target && "genes" in target &&
          Math.hypot(target.x - a.x, target.z - a.z) <= 2.5 && a.hydration >= 35;
        const thirsty = !nearbyScorpionPrey &&
          a.hydration <
          (["Drinking", "Seeking water"].includes(a.state) ? 90 : 55);
        let water:
          { x: number; z: number; pond: Pond; river: boolean } | undefined;
        if (thirsty) {
          const fresh = this.ponds
            .filter((p) => p.water > 0.04)
            .map((p) => {
              const d = Math.hypot(p.x - a.x, p.z - a.z),
                radius = p.radius * Math.sqrt(p.water) * 1.15;
              return {
                x: p.x + ((a.x - p.x) / Math.max(d, 0.01)) * (radius + 0.3),
                z: p.z + ((a.z - p.z) / Math.max(d, 0.01)) * (radius + 0.3),
                pond: p,
                river: false,
              };
            });
          const river = riverDrinkPoint(a.x, a.z, this.ponds);
          fresh.push({ ...river, pond: this.ponds[0], river: true });
          for (let j = 0; j < 17; j++) {
            const r = j === 0 ? 0 : j <= 8 ? 3 : 7;
            const x = a.x + Math.cos((j * Math.PI) / 4) * r;
            const z = a.z + Math.sin((j * Math.PI) / 4) * r;
            if (surfaceDepth(this.weather.land, x, z) > 0.04)
              fresh.push({ x, z, pond: this.ponds[0], river: true });
          }
          water = fresh.sort(
            (p, q) =>
              Math.hypot(p.x - a.x, p.z - a.z) -
              Math.hypot(q.x - a.x, q.z - a.z),
          )[0];
        }
        if (thirsty && water) {
          need = water;
          needState = "Seeking water";
          if (
            a.altitude < 0.5 &&
            Math.hypot(water.x - a.x, water.z - a.z) < 2.2
          ) {
            a.hydration = Math.min(100, a.hydration + dt * 18);
            if (!water.river)
              water.pond.water = Math.max(0, water.pond.water - dt * 0.0002);
            stationary = true;
            needState = "Drinking";
          }
        } else if (
          harsh &&
          a.energy > 45 &&
          (localTemp > 36 ||
            localTemp < 5 ||
            (denById.get(a.home)?.progress ?? 1) < 1 ||
            (this.time + a.id) % 40 < 10 + 12 * (1 - g.activity))
        ) {
          const home = denById.get(a.home);
          if (home) {
            need = home;
            needState = "Returning home";
            if (Math.hypot(home.x - a.x, home.z - a.z) < 1) {
              stationary = true;
              if (home.progress < 1) {
                home.progress = Math.min(
                  1,
                  home.progress + dt * 0.08 * g.digging,
                );
                a.energy -= dt * 1.3;
                needState = "Digging";
              } else {
                needState = "Sheltering";
                shelter = 1;
              }
            }
          } else if (surroundings.cover > 0.45) {
            stationary = true;
            needState = "Sheltering";
          } else {
            let cover: Plant | undefined,
              coverDistance = g.sense * g.sense;
            for (const candidate of plantGrid.near(a.x, a.z, g.sense)) {
              if (candidate.kind === "grass") continue;
              const d = (candidate.x - a.x) ** 2 + (candidate.z - a.z) ** 2;
              if (d < coverDistance) {
                cover = candidate;
                coverDistance = d;
              }
            }
            const preferDen =
              restDue &&
              !SPECIES[a.species].capabilities.flies &&
              g.digging > 1 &&
              a.age >= maturityAge(a) &&
              a.energy > 65 &&
              this.dens.length < 120;
            if (
              !preferDen &&
              cover &&
              Math.hypot(cover.x - a.x, cover.z - a.z) < g.sense
            ) {
              need = cover;
              needState = "Seeking cover";
            } else if (
              a.age >= maturityAge(a) &&
              !aquatic(a.species) &&
              a.species !== "ant" && !SPECIES[a.species].capabilities.flies &&
              a.energy > 38 &&
              this.dens.length < 120
            ) {
              const den = {
                id: this.nextId++,
                owner: a.id,
                x: a.x,
                z: a.z,
                progress: 0,
              };
              this.dens.push(den);
              denById.set(den.id, den);
              a.home = den.id;
              need = den;
              needState = "Digging";
              stationary = true;
            }
          }
        }
        if (
          a.species === "snake" &&
          harsh &&
          (!need || needState === "Seeking cover") &&
          a.energy > 35
        ) {
          let rock: (typeof ROCKS)[number] | undefined;
          let rockDistance = g.sense;
          for (const r of ROCKS) {
            const d = Math.hypot(r.x - a.x, r.z - a.z);
            if (d < rockDistance && depthAt(r.x, r.z) < 0.1) {
              rock = r;
              rockDistance = d;
            }
          }
          if (rock && Math.hypot(rock.x - a.x, rock.z - a.z) < g.sense) {
            need = rock;
            needState = "Seeking cover";
            stationary = false;
            if (Math.hypot(rock.x - a.x, rock.z - a.z) < rock.radius * 0.5) {
              stationary = true;
              needState = "Sheltering";
              shelter = 0.85;
            }
          }
        }
        if (
          a.species === "snake" &&
          a.bodyTemperature < 27 &&
          conditions.sunlight > 0.25 &&
          !threat &&
          a.hydration > 55 &&
          a.energy > 18 &&
          (!need || needState === "Seeking cover" || needState === "Sheltering")
        ) {
          let bestCover = surroundings.cover,
            sunny: { x: number; z: number } | undefined;
          for (let j = 0; j < 8; j++) {
            const x = a.x + Math.cos((j * Math.PI) / 4) * 5,
              z = a.z + Math.sin((j * Math.PI) / 4) * 5;
            if (Math.hypot(x, z) > WORLD_RADIUS - 1 || depthAt(x, z) > 0.1)
              continue;
            const cover = coverAt({ x, z }).cover;
            if (cover < bestCover - 0.05) {
              bestCover = cover;
              sunny = { x, z };
            }
          }
          const baskRock = ROCKS.find(
            (r) =>
              Math.hypot(r.x - a.x, r.z - a.z) < g.sense &&
              depthAt(r.x, r.z) < 0.1,
          );
          if (baskRock) {
            if (
              Math.hypot(baskRock.x - a.x, baskRock.z - a.z) >
              baskRock.radius * 0.5
            )
              sunny = baskRock;
            else sunny = undefined;
          }
          need = sunny ?? { x: a.x, z: a.z };
          needState = sunny ? "Seeking sunshine" : "Basking";
          stationary = !sunny;
        }
        // Fledged birds can land at an exposed clutch. Keep the approach
        // active while descending, and share each egg only once.
        let eggAltitude: number | undefined;
        if (a.species === "bird" && hungry && !a.nursery && !need && !threat) {
          let nearest = Math.min(3, g.sense, target ? distance : Infinity);
          let selected: Animal | undefined;
          for (const embryo of insectEggGrid.near(a.x, a.z, nearest)) {
            const d = Math.hypot(embryo.x - a.x, embryo.z - a.z);
            if (d > nearest || eggByEmbryo.get(embryo.id)!.health <= 0 ||
                depthAt(embryo.x, embryo.z) > embryo.altitude + 0.2) continue;
            nearest = d;
            selected = embryo;
          }
          if (selected) {
            need = selected;
            needState = "Seeking eggs";
            eggAltitude = selected.altitude;
            stationary = nearest < 0.75;
            if (stationary && Math.abs(a.altitude - eggAltitude) < 0.6 &&
                Math.floor(a.age) !== Math.floor(a.age - dt)) {
              eggByEmbryo.get(selected.id)!.health = 0;
              ingest(this.foodTotals, a, "eggs", 2 + 8 * grownBodySize(selected));
              needState = "Eating eggs";
            }
          }
        }
        const layingMosquito = a.species === "mosquito" && a.reproductive?.mate !== undefined && mosquitoHasFed(a);
        if (layingMosquito && !threat && !thirsty && !need) {
          const shore = crabShoreTarget(a, this.ponds, depthAt);
          if (shore) {
            need = shore;
            target = undefined;
            needState = "Seeking egg site";
          }
        }
        if (a.species === "mosquito" && !layingMosquito && !a.reproductive?.target && reproductiveSex(a) === "female" && a.age >= maturityAge(a) &&
            (hungry || a.reproductive?.mate !== undefined) && !threat && !need && a.age >= (a.nextBloodMealAge ?? 0)) {
          const range = Math.min(mosquitoHasFed(a) ? 4 : 8, g.sense);
          const host = animalGrid.findNear(a.x, a.z, range, b =>
            (SPECIES[b.species].family === "mammal" || b.species === "bird") &&
            b.energy > 20 && !inDen(b) && b.altitude < 1 &&
            Math.hypot(b.x - a.x, b.z - a.z) <= range);
          if (host) {
            const close = Math.hypot(host.x-a.x, host.z-a.z) <= 0.7;
            need = host;
            target = undefined;
            stationary = close;
            needState = "Seeking host";
            if (close && Math.abs(a.altitude-host.altitude) <= 0.6) {
              host.energy -= 0.5;
              ingest(this.foodTotals, a, "blood", 12);
              a.mosquitoFed = true;
              a.nextBloodMealAge = a.age + 16;
              needState = "Taking blood meal";
            }
          }
        }
        if ((a.species === "bug" || a.species === "ant" || a.species === "fly" || a.species === "crab" || (a.species === "scorpion" && a.mealEnergy <= 0)) && (hungry || (hill?.pantry && !restDue)) && !a.antLoad && (!hill?.pantry || hill.progress >= 1) && !a.nursery && !threat && !need) {
          // Prefer nearby edible remains, but do not abandon a closer plant
          // for the first carcass returned by the spatial grid.
          const smallScavenger = a.species === "ant" || a.species === "fly";
          // Reserves are on the same scale for every animal. A unit of
          // digestible tissue supplies more meals to a much smaller body.
          const nutrition = DETRITUS_NUTRITION *
            (a.species === "ant" ? 4 : a.species === "fly" ? 2 : 1);
          const reach = Math.min(g.sense, 10, target && !hill?.pantry ? distance : Infinity);
          let best = -Infinity;
          let food: EdibleRemains | undefined;
          for (const r of remainsGrid.near(a.x, a.z, reach)) {
            if (a.species === "scorpion" && "kind" in r) continue;
            if (hill?.pantry && !scout && hill.antTrail && r.id !== hill.antTrail.source) continue;
            const d = Math.hypot(a.x - r.x, a.z - r.z);
            const remainingEnergy = (1 - r.decay) * remainsMass(r) * nutrition;
            const score = (smallScavenger ? Math.min(16, remainingEnergy) : 0) - d;
            if (score > best && remainingEnergy > Math.max(0, d - 0.65) && d <= reach && (a.species === "crab" || depthAt(r.x, r.z) < 0.15)) {
              food = r;
              best = score;
            }
          }
          if (food) {
            need = food;
            target = undefined;
            stationary = Math.hypot(a.x - food.x, a.z - food.z) < 0.65;
            needState = stationary ? "Eating remains" : "Seeking remains";
            if (stationary) {
              const cell = this.weather.land![landIndex(food.x, food.z)];
              const bite = consumeRemains(
                food,
                hill?.pantry && a.id !== hill.queen && a.energy >= 35 ? 5 : dt * DETRITUS_BITE_RATE,
                cell,
                true,
              );
              if (isInsect(a.species) && bite > 0 && a.energy < ANIMAL_ENERGY_CAPACITY) markInsectFeeding(a);
              const source = "kind" in food ? "dead plants" : "carrion";
              if (hill?.pantry && a.id !== hill.queen && a.energy >= 35 && bite > 0)
                a.antLoad = { food: source, energy: bite * nutrition, source: food.id, points: [{ x: food.x, z: food.z }] };
              else ingest(this.foodTotals, a, source, bite * nutrition);
              a.hydration = Math.min(100, a.hydration + bite * 2);
            }
          }
        }
        if (
          (a.species === "bug" || a.species === "ant" ||
            (a.species === "bird" && a.birdDiet === "insectivore" && hungry && !target)) &&
          hungry &&
          !a.nursery &&
          !threat &&
          !need
        ) {
          const cell = this.weather.land?.[landIndex(a.x, a.z)];
          if (cell && cell.fungus > 0.025 && depthAt(a.x, a.z) < 0.15) {
            need = { x: a.x, z: a.z };
            needState = "Eating mushrooms";
            stationary = true;
            if (a.altitude < 0.5) {
              const bite = Math.min(cell.fungus, dt * FUNGI.mushroom.biteRate);
              cell.fungus -= bite;
              if (a.species === "bug" && bite > 0 && a.energy < ANIMAL_ENERGY_CAPACITY) {
                markInsectFeeding(a);
                const index = landIndex(a.x, a.z);
                const newVisit = a.lastMushroomCell !== index || this.time - (a.lastMushroomTime ?? 0) > 3;
                if (newVisit) {
                  const samePatch = this.time - (cell.mushroomTime ?? -Infinity) < 90 &&
                    Math.hypot(a.x - (cell.mushroomX ?? Infinity), a.z - (cell.mushroomZ ?? Infinity)) < 2;
                  recordApproach(cell, a, this.time, samePatch);
                  cell.mushroomVisits = samePatch ? Math.min(8, (cell.mushroomVisits ?? 0) + 1) : 1;
                  cell.mushroomX = a.x;
                  cell.mushroomZ = a.z;
                  cell.mushroomTime = this.time;
                }
                if (a.walkTrail) a.walkTrail.length = 0;
                a.lastMushroomCell = index;
                a.lastMushroomTime = this.time;
              }
              ingest(this.foodTotals, a, "mushrooms", bite * FUNGI.mushroom.nutrition);
              a.hydration = Math.min(
                100,
                a.hydration + bite * FUNGI.mushroom.hydration,
              );
            }
          } else if (!target && (Math.floor(this.time * 10) + a.id) % 5 === 0) {
            let best = 0.07;
            for (let j = 0; j < 8; j++) {
              const x = a.x + Math.cos((j * Math.PI) / 4) * 6;
              const z = a.z + Math.sin((j * Math.PI) / 4) * 6;
              const food = landAt(this.weather.land, x, z).fungus;
              if (
                food > best &&
                Math.hypot(x, z) < WORLD_RADIUS - 1 &&
                depthAt(x, z) < 0.15
              ) {
                best = food;
                need = { x, z };
                needState = "Seeking mushrooms";
              }
            }
          }
        }
        const ambusher = a.species === "spider" || a.species === "scorpion";
        const ambushCover = terrain.get(a.id) ?? (ambusher ? coverAt(a) : undefined);
        const atHide = ambusher && ambushCover && (ambushCover.cover >= 0.15 ||
          (a.species === "spider" ? ambushCover.sand : ambushCover.name === "Desert"));
        const reach = 0.65 + g.size * 0.35 * g.length;
        let scorpionScouting = false;
        if (a.species === "scorpion") {
          if (a.mealEnergy > 0) a.lastPreyAt = this.time;
          a.lastPreyAt ??= this.time;
          scorpionScouting = a.mealEnergy <= 0 && a.energy < courtshipEnergy(a) &&
            this.time - a.lastPreyAt >= (a.age < maturityAge(a) * 2 ? 3 : 8);
        }
        if (a.species === "spider") {
          a.lastPreyAt ??= this.time;
          const sawPrey = !!target && "genes" in target;
          if (a.natalDispersal && a.age >= maturityAge(a)) delete a.natalDispersal;
          if ((!a.webScout?.natal && sawPrey) || a.mealEnergy > 0 || (a.web?.prey && a.web.expires > this.time)) {
            a.lastPreyAt = this.time;
            delete a.webScout;
          }
          if (a.web && (this.time >= a.web.expires || depthAt(a.web.x, a.web.z) >= 0.15)) delete a.web;
          if (a.webScout && (a.webScout.until <= this.time || Math.hypot(a.x - a.webScout.x, a.z - a.webScout.z) < 1)) delete a.webScout;
          const natal = !!a.natalDispersal && a.age >= 0.5 + (a.id % 13) * 0.1;
          if (!a.webScout && (natal || this.time - a.lastPreyAt >= (a.energy < 60 ? 8 : 24)) && !threat && !need && !restDue &&
              !a.nursery && !a.reproductive?.target && !a.reproductive?.mate && !a.web?.prey) {
            // The regional weather front travels toward +x and -z. Light
            // spiders can ride that breeze if the landing site is dry land.
            const wind = Math.atan2(-19, 35) + (natal ? Math.sin(a.id) * 0.35 : 0);
            const drift = natal ? 12 + a.id % 9 : 9 + g.sense * 0.6;
            const x = a.x + Math.cos(wind) * drift, z = a.z + Math.sin(wind) * drift;
            if (grownBodySize(a) < 0.48 && conditions.rain < 0.2 && a.wetness < 0.3 &&
                a.stamina > 35 && Math.hypot(x,z) < WORLD_RADIUS - 1 && depthAt(x,z) < 0.1) {
              a.webScout = { x, z, until: this.time + drift / 2.4 + 1, silk: true, natal };
            } else if (!natal) {
              let best = -Infinity;
              for (let j = 0; j < 8; j++) {
                const angle = a.angle + j * Math.PI / 4;
                const x = a.x + g.sense * Math.cos(angle), z = a.z + g.sense * Math.sin(angle);
                if (Math.hypot(x, z) >= WORLD_RADIUS || depthAt(x, z) >= 0.15) continue;
                const cell = this.weather.land?.[landIndex(x, z)];
                if (!cell) continue;
                const score = cell.litter + cell.fungus + cell.grass * 0.3 + availableWorms(cell) +
                  Math.max(0, 1 - (this.time - (cell.bugFeedTime ?? -Infinity)) / 30);
                if (score > best) { best = score; a.webScout = { x, z, until: this.time + 20 }; }
              }
            }
            if (a.webScout) { delete a.web; a.lastPreyAt = this.time; }
          }
        }
        // A passing insect is a local cue to spin silk, even if it is
        // hovering above bite height. Anchor the web beside the spider.
        if (a.species === "spider" && !a.web && hungry && !threat && !need &&
            !a.natalDispersal && a.altitude < 0.2 && a.energy > 0.3 &&
            depthAt(a.x, a.z) < 0.15) {
          const nearby = animalGrid.findNear(a.x, a.z, 2.4, b =>
            isInsect(b.species) && b.energy > 0 && b.altitude <= 1.05 &&
            (b.webHeldUntilAge ?? 0) <= b.age && Math.hypot(b.x - a.x, b.z - a.z) <= 2.4);
          if (nearby) {
            const dx = nearby.x - a.x, dz = nearby.z - a.z;
            const step = Math.min(1, 0.8 / Math.max(0.01, Math.hypot(dx, dz)));
            const x = a.x + dx * step, z = a.z + dz * step;
            if (depthAt(x, z) < 0.15) {
              a.web = { x, z, expires: this.time + 45, prey: 0 };
              a.energy -= 0.3;
              a.lastPreyAt = this.time;
              delete a.webScout;
            }
          }
        }
        if (a.web && a.species === "spider") {
          const web = a.web;
          const radius = Math.min(2.1, 1 + grownBodySize(a));
          if (!web.prey) {
            const caught = animalGrid.findNear(web.x, web.z, radius, b =>
              b.energy > 0 && (isFlyingInsect(b.species) ? b.altitude <= 1.05 : canReachPrey(a, b)) &&
              grownBodySize(b) <= grownBodySize(a) * (isInsect(b.species) ? 1.35 : 1) &&
              (b.webHeldUntilAge ?? 0) <= b.age && Math.hypot(b.x - web.x, b.z - web.z) <= radius);
            if (caught) {
              web.prey = caught.id;
              web.expires = this.time + 5;
              // The insect drops into the lower silk where the owner can feed.
              if (isFlyingInsect(caught.species)) caught.altitude = Math.min(caught.altitude, 0.45);
              caught.webOwnerId = a.id;
              caught.webHeldUntilAge = caught.age + 5;
            }
          }
          const held = animalById.get(web.prey);
          if (held && held.energy > 0 && !threat && !need && !a.mealEnergy &&
              Math.hypot(a.x - web.x, a.z - web.z) <= g.sense) {
            target = held;
            distance = Math.hypot(a.x - held.x, a.z - held.z);
          }
        }
        const retrieving = !!target && a.web?.prey === target.id && a.web.prey !== 0;
        if (retrieving && !threat && !need && distance > reach) {
          need = target;
          needState = "Returning to catch";
          stationary = false;
        }
        const strike = ambusher && target && "genes" in target &&
          distance <= reach + (a.species === "scorpion" ? 2.8 : 0.8) * g.stride &&
          (retrieving || a.stamina > 20) && (a.species !== "scorpion" || a.age >= (a.nextStingAge ?? 0));
        // Scout food that insects can actually reach. A hide beside the food
        // keeps the feeding spot within striking distance.
        let spiderSite: { x: number; z: number } | undefined;
        let activePatch = false;
        let repeatPatch = false;
        if (a.species === "spider" && !strike && !threat && !need && !restDue && !a.nursery && a.mealEnergy <= 0) {
          const radius = Math.min(10, g.sense);
          let best = -Infinity;
          for (const r of remainsGrid.near(a.x, a.z, radius)) {
            const d = Math.hypot(r.x - a.x, r.z - a.z);
            const mass = (1 - r.decay) * remainsMass(r);
            if (d > radius || mass * DETRITUS_NUTRITION < 1 || depthAt(r.x, r.z) >= 0.15) continue;
            const score = Math.min(3, Math.log1p(mass)) - d;
            if (score > best) {
              best = score;
              spiderSite = r;
            }
          }
          // Fresh feeding traces lead to the bite location, even after the insect moves.
          // Sample only cells intersecting this spider's sensory neighborhood.
          const cells = Math.ceil(radius / LAND_STEP);
          for (let dz = -cells; dz <= cells; dz++) {
            for (let dx = -cells; dx <= cells; dx++) {
              const index = landIndex(a.x + dx * LAND_STEP, a.z + dz * LAND_STEP);
              const cell = this.weather.land?.[index];
              if (cell && (cell.mushroomVisits ?? 0) >= 2 && cell.mushroomX !== undefined &&
                  cell.mushroomZ !== undefined && cell.mushroomTime !== undefined && cell.fungus > 0.025) {
                const d = Math.hypot(cell.mushroomX - a.x, cell.mushroomZ - a.z);
                const age = this.time - cell.mushroomTime;
                const score = 24 + 4 * (cell.approachCount ?? 0) + Math.min(6, cell.mushroomVisits!) - age / 5 - d;
                if (age < 90 && d <= radius && score > best && depthAt(cell.mushroomX, cell.mushroomZ) < 0.15) {
                  best = score;
                  const entrance = (cell.approachCount ?? 0) >= 2 && cell.approachX !== undefined && cell.approachZ !== undefined &&
                    depthAt(cell.approachX, cell.approachZ) < 0.15;
                  spiderSite = entrance ? { x: cell.approachX!, z: cell.approachZ! } : { x: cell.mushroomX, z: cell.mushroomZ };
                  repeatPatch = activePatch = true;
                }
              }
              if (cell?.bugFeedTime === undefined || cell.bugFeedX === undefined || cell.bugFeedZ === undefined) continue;
              const trace = { x: cell.bugFeedX, z: cell.bugFeedZ };
              const age = this.time - cell.bugFeedTime;
              const d = Math.hypot(trace.x - a.x, trace.z - a.z);
              if (age < 0 || age > 15 || d > radius || depthAt(trace.x, trace.z) >= 0.15) continue;
              const score = 14 - age - d;
              if (score <= best) continue;
              best = score;
              repeatPatch = false;
              spiderSite = trace;
              activePatch = true;
            }
          }
          if (!repeatPatch && target && "genes" in target && isInsect(target.species) && distance <= g.sense) {
            spiderSite = target;
            activePatch = true;
          }
          if (!activePatch && a.webScout) spiderSite = a.webScout;
          if (!activePatch && a.web && !a.web.prey && Math.hypot(a.x - a.web.x, a.z - a.web.z) <= radius) {
            spiderSite = a.web;
            activePatch = true;
          }
          if (activePatch && spiderSite && (!a.web || (!a.web.prey && Math.hypot(a.web.x - spiderSite.x, a.web.z - spiderSite.z) > 1.5)) && Math.hypot(a.x - spiderSite.x, a.z - spiderSite.z) <= 1.5) {
            a.web = { x: spiderSite.x, z: spiderSite.z, expires: this.time + 45, prey: 0 };
            a.energy -= 0.3;
          }
          if (spiderSite) {
            const food = spiderSite;
            let bestCover = -Infinity;
            for (const [dx, dz] of [[0, 0], [0.55, 0], [-0.55, 0], [0, 0.55], [0, -0.55]]) {
              const spot = { x: food.x + dx, z: food.z + dz };
              if (depthAt(spot.x, spot.z) >= 0.15) continue;
              const cover = coverAt(spot);
              const score = cover.cover + (cover.sand ? 0.5 : 0);
              if (score > bestCover) {
                bestCover = score;
                spiderSite = spot;
              }
            }
          }
        }
        const besideFood = spiderSite && Math.hypot(a.x - spiderSite.x, a.z - spiderSite.z) < 0.55;
        const lyingInWait = !scorpionScouting && (besideFood || atHide) &&
          a.mealEnergy <= 0 && (this.time + a.id) % 90 < 80;
        const youngFrog = a.species === "frog" && a.age < maturityAge(a);
        if (
          ((a.species === "frog" && hungry && (!target || (youngFrog && a.energy < 45))) ||
            (a.species === "scorpion" && a.mealEnergy <= 0 && !target && a.energy < 90 && (!lyingInWait || a.energy < 15)) ||
            (a.species === "spider" && a.mealEnergy <= 0 && a.energy < 50 &&
              !strike && !a.web?.prey && !a.natalDispersal && !a.webScout?.natal &&
              ((!spiderSite && !lyingInWait) || a.energy < 30)) ||
            (a.species === "mouse" && g.dietAffinity >= 0.3 && !target) ||
            (a.species === "bird" && a.birdDiet === "insectivore" && hungry && !target)) &&
          a.energy < 110 &&
          !a.nursery &&
          !restDue &&
          !threat &&
          !need
        ) {
          const cell = this.weather.land?.[landIndex(a.x, a.z)];
          const wadingDepth = a.species === "frog" ? FROG_WORM_DEPTH : 0.1;
          if (cell && (a.species !== "spider" || cell.moisture > 0.45) && availableWorms(cell) > 0.002 && depthAt(a.x, a.z) < wadingDepth) {
            if (youngFrog) target = undefined;
            need = { x: a.x, z: a.z };
            needState = "Foraging worms";
            stationary = true;
            if (a.altitude < 0.5) {
              const bite = eatWorms(cell, a.species === "spider" ? dt * 0.5 : dt);
              ingest(this.foodTotals, a, "worms", bite * 110);
              a.hydration = Math.min(100, a.hydration + bite * 12);
            }
          } else if (youngFrog && this.weather.land) {
            const food = frogShoreFood(a, this.weather.land, depthAt);
            if (food) {
              target = undefined;
              need = food;
              needState = "Seeking worms";
            }
          } else if (!target) {
            let best = 0.02;
            for (let j = 0; j < 8; j++) {
              const x = a.x + Math.cos((j * Math.PI) / 4) * 6,
                z = a.z + Math.sin((j * Math.PI) / 4) * 6;
              const patch = this.weather.land?.[landIndex(x, z)];
              const food = patch && (a.species !== "spider" || patch.moisture > 0.45) ? availableWorms(patch) : 0;
              if (
                Math.hypot(x, z) < WORLD_RADIUS - 1 &&
                food > best &&
                depthAt(x, z) < wadingDepth
              ) {
                best = food;
                need = { x, z };
                needState = "Seeking worms";
              }
            }
          }
        }
        // Inherited habitat preference is a soft attraction: food, thirst and danger still take priority.
        const deep =
          !aquatic(a.species) &&
          a.altitude < 0.5 &&
          depthAt(a.x, a.z) > 0.25 &&
          (a.crossingZ === null || a.oxygen < 30 || a.stamina < 15);
        const diseasePatch = landIndex(a.x, a.z);
        const currentLand = landAt(this.weather.land, a.x, a.z);
        const mismatch = Math.abs(currentLand.moisture - g.preferredMoisture);
        if (
          deep ||
          (!need && !threat && a.species !== "fish" && a.species !== "crab" && a.mealEnergy <= 0 && (a.energy > 85 || !target) && mismatch > 0.18)
        ) {
          let best: { x: number; z: number } | undefined,
            score = deep ? 100 : mismatch;
          for (let j = 0; j < 12; j++) {
            const angle = (j * Math.PI) / 6,
              reach = deep ? 4 : Math.min(8, g.sense);
            const x = a.x + Math.cos(angle) * reach,
              z = a.z + Math.sin(angle) * reach;
            if (Math.hypot(x, z) > WORLD_RADIUS - 1) continue;
            const candidate =
              Math.abs(
                landAt(this.weather.land, x, z).moisture - g.preferredMoisture,
              ) +
              depthAt(x, z) * 3;
            if (candidate < score - 0.03) {
              score = candidate;
              best = { x, z };
            }
          }
          if (best) {
            need = best;
            needState = deep ? "Escaping water" : "Seeking habitat";
            stationary = false;
          }
        }
        if (aquatic(a.species)) {
          const pond = this.ponds.reduce((best, p) =>
            Math.hypot(p.x - a.x, p.z - a.z) <
            Math.hypot(best.x - a.x, best.z - a.z)
              ? p
              : best,
          );
          const depth = depthAt(a.x, a.z);
          const wet = depth > a.altitude + 0.1;
          if (wet) a.hydration = Math.min(100, a.hydration + dt * 8);
          const browsingHere = a.species === "turtle" && hungry && !need && !threat &&
            target && !("genes" in target) && distance < reach && worthBrowsing(target, a.energy, a.species);
          if (browsingHere) stationary = true;
          const fish = a.species === "fish";
          const youngFish = fish && a.age < maturityAge(a);
          const youngCrab = a.species === "crab" && a.age < maturityAge(a);
          const canGrazeAlgae = wet && !restDue && !threat && a.mealEnergy <= 0 &&
            ((youngFish && a.energy < 90) ||
              (youngCrab && !need && depth < 0.7 && a.energy < 50) ||
              (youngFrog && (!need || needState === "Seeking worms") && depth <= 0.85 && a.energy < 50));
          const nurseryPond = canGrazeAlgae ? foodAt(a.x, a.z, "algae") : undefined;
          const feedingPond =
            !nurseryPond && (fish || a.species === "turtle") &&
            wet && !browsingHere &&
            a.energy < 110 &&
            !restDue ? foodAt(a.x, a.z) : undefined;
          if (nurseryPond) {
            const bite = Math.min(nurseryPond.algae ?? 0, dt * 0.002);
            nurseryPond.algae = (nurseryPond.algae ?? 0) - bite;
            ingest(this.foodTotals, a, "algae", bite * 400);
            if (!fish) {
              need = { x: a.x, z: a.z };
              target = undefined;
              stationary = true;
            }
            needState = "Aquatic feeding";
          } else if (feedingPond) {
            // Fish can use suspended food more efficiently than browsing turtles.
            const nutrition = fish ? 500 : 300;
            const bite = Math.min(feedingPond.food, dt * (fish ? 0.75 : 0.6) / nutrition);
            feedingPond.food -= bite;
            ingest(this.foodTotals, a, "pond food", bite * nutrition);
            if (a.species !== "fish") {
              need = { x: a.x, z: a.z };
              stationary = true;
            }
            needState = "Aquatic feeding";
          }
          if (!wet && (fish || a.hydration < 65)) {
            need = { x: pond.x, z: pond.z };
            needState = "Seeking water";
            stationary = false;
          }
        }
        const guardian = animalById.get(a.parent);
        if (
          (!laysEggs(a.species) || a.species === "bird") &&
          !a.nursery &&
          a.age < maturityAge(a) &&
          !(a.species === "bird" && hungry && target) &&
          guardian &&
          guardian.energy > 0 &&
          !need &&
          !threat &&
          Math.hypot(guardian.x - a.x, guardian.z - a.z) > 2
        ) {
          need = guardian;
          needState = "Following parent";
          stationary = false;
        }
        if (
          (!laysEggs(a.species) || a.species === "bird") &&
          !need &&
          a.energy > 45
        ) {
          const baby = youngByParent
            .get(a.id)
            ?.find(
              (b) =>
                b.parent === a.id &&
                b.age < maturityAge(b) &&
                b.energy > 0 &&
                Math.hypot(b.x - a.x, b.z - a.z) < 5,
            );
          if (
            baby &&
            animalGrid.near(baby.x, baby.z, 3).some((p) => canReachPrey(p, baby))
          ) {
            need = baby;
            needState = "Guarding young";
            a.energy -= dt * 0.05;
          }
        }
        if (threat && !inDen(a) && !deep && needState !== "Guarding young") {
          stationary = false;
          need = undefined;
          needState = "";
        }
        if (threat && hill?.pantry && hill.progress >= 1 &&
            Math.hypot(a.x - hill.x, a.z - hill.z) <= 3) {
          need = hill;
          needState = "Returning home";
          target = undefined;
          stationary = shelteredInAntHill(a);
        }
        if (
          target &&
          !("genes" in target) &&
          distance < 0.65 + g.size * 0.35 * g.length &&
          !threat &&
          !needState
        )
          stationary = true;
        if (a.nesting > 0 && !threat && !deep) {
          a.nesting = Math.max(0, a.nesting - dt);
          need = { x: a.x, z: a.z };
          needState = "Burying eggs";
          stationary = true;
        }
        // Drying is a comfort goal; food, thirst, threats and water escape take priority.
        const social =
          this.naturalReproduction && a.reproductive?.target
            ? animalById.get(a.reproductive.target)
            : undefined;
        const seeksMate = isInsect(a.species) || a.species === "scorpion" || a.species === "spider" ||
          a.species === "frog" || a.species === "fish" || a.species === "crab";
        if (
          (!need || (seeksMate && ["Seeking habitat", "Foraging", "Eating mushrooms", "Seeking mushrooms", "Seeking remains", "Eating remains", "Foraging worms", "Seeking worms", "Aquatic feeding"].includes(needState))) &&
          !threat &&
          !thirsty &&
          (!stationary || seeksMate) &&
          social &&
          social.energy > 0 &&
          a.energy >= (seeksMate || a.species === "cat" || a.species === "fox"
            ? courtshipEnergy(a) : 80)
        ) {
          const retreating = (a.reproductive?.rivalUntil ?? 0) > this.time;
          need = retreating
            ? { x: 2 * a.x - social.x, z: 2 * a.z - social.z }
            : social;
          needState = retreating
            ? "Retreating from rival"
            : a.state === "Challenging rival"
              ? "Challenging rival"
              : "Courting";
          stationary =
            !retreating && Math.hypot(a.x - social.x, a.z - social.z) < 1;
        }
        if (
          !aquatic(a.species) &&
          !threat &&
          !deep &&
          a.nesting <= 0 &&
          a.crossingZ === null &&
          a.energy > 45 &&
          a.hydration > 55 &&
          a.wetness > (a.state.includes("Drying") ? 0.12 : 0.4) &&
          (!need ||
            [
              "Seeking habitat",
              "Seeking cover",
              "Returning home",
              "Sheltering",
            ].includes(needState))
        ) {
          let refuge: { x: number; z: number; sun: boolean } | undefined;
          let bestRefugeScore = 0;
          const considerRefuge = (
            r: { x: number; z: number },
            sun: boolean,
          ) => {
            const distance = Math.hypot(r.x - a.x, r.z - a.z);
            if (distance >= g.sense * 2 || depthAt(r.x, r.z) >= 0.05) return;
            const c = climateAt(r.x, r.z);
            const score =
              (sun ? c.sunlight * 5 - c.rain * 5 : 1 + c.rain * 3) -
              distance * 0.12;
            if (score > bestRefugeScore) {
              bestRefugeScore = score;
              refuge = { x: r.x, z: r.z, sun };
            }
          };
          for (const r of ROCKS) considerRefuge(r, true);
          const home = denById.get(a.home);
          if (home && home.progress >= 1) considerRefuge(home, false);
          for (const p of plantGrid.near(a.x, a.z, g.sense))
            if (p.kind !== "grass") considerRefuge(p, false);
          if (refuge) {
            need = refuge;
            stationary = Math.hypot(a.x - refuge.x, a.z - refuge.z) < 0.7;
            needState = stationary
              ? refuge.sun
                ? "Drying on sunny rock"
                : "Drying in shelter"
              : refuge.sun
                ? "Seeking sunny rock"
                : "Seeking dry shelter";
            if (stationary) {
              a.wetness = Math.max(0, a.wetness - dt * 0.025);
              shelter = Math.max(shelter, refuge.sun ? 0.4 : 0.85);
            }
          }
        }
        // Urgent food and water needs override comfort, while threats still override rest.
        if (
          a.energy < 35 &&
          a.hydration > 35 &&
          localTemp > 8 &&
          localTemp < 35 &&
          [
            "Sheltering",
            "Seeking cover",
            "Returning home",
            "Seeking habitat",
          ].includes(needState)
        ) {
          need = undefined;
          needState = "";
          stationary = false;
        }
        // Daily rhythm is a soft preference. Immediate body needs and threats win.
        if (
          restDue &&
          !threat &&
          !deep &&
          a.mealEnergy <= 0 &&
          localTemp >= 5 &&
          localTemp <= 35 &&
          (!need ||
            [
              "Sheltering",
              "Seeking cover",
              "Returning home",
              "Seeking habitat",
            ].includes(needState))
        ) {
          let bed: { x: number; z: number } = a;
          if (a.species === "bird") {
            let tree = plantById.get(a.roost);
            if (
              !tree ||
              tree.kind !== "tree" ||
              tree.health <= 0 ||
              tree.age < PLANTS.tree.maturity ||
              Math.hypot(tree.x - a.x, tree.z - a.z) > Math.max(24, g.sense * 3)
            )
              tree = undefined;
            if (!tree) {
              let nearest = Math.max(18, g.sense * 3);
              for (const p of plantGrid.near(a.x, a.z, nearest)) {
                if (
                  p.kind !== "tree" ||
                  p.health <= 0 ||
                  p.age < PLANTS.tree.maturity
                )
                  continue;
                const site = treeRestSite(p, a.id, this.weather.land);
                const d = Math.hypot(site.x - a.x, site.z - a.z);
                if (
                  d < nearest &&
                  Math.hypot(site.x, site.z) < WORLD_RADIUS - 1
                ) {
                  tree = p;
                  nearest = d;
                }
              }
            }
            a.roost = tree?.id ?? 0;
            if (tree) {
              const site = treeRestSite(tree, a.id, this.weather.land);
              bed = site;
              restAltitude = site.altitude;
            }
          } else if (a.species !== "fish") {
            const home = denById.get(a.home);
            const usable = (d: Den) =>
              (a.species === "ant" ? !!d.pantry : !d.pantry) && d.progress >= 1 &&
              Math.hypot(d.x - a.x, d.z - a.z) < Math.max(18, g.sense * 3) &&
              (aquatic(a.species)
                ? depthAt(d.x, d.z) < 0.1
                : safeDenRoute(a, d, depthAt));
            let den = home && usable(home) ? home : undefined;
            if (!den && !(a.species === "ant" && home?.pantry)) {
              let nearest = 8;
              for (const d of this.dens) {
                const distance = Math.hypot(d.x - a.x, d.z - a.z);
                if (distance < nearest && usable(d)) {
                  den = d;
                  nearest = distance;
                }
              }
            }
            if (den) {
              bed = den;
              a.home = den.id;
            } else if (!aquatic(a.species) && surroundings.cover < 0.25) {
              let nearest = 6;
              for (const p of plantGrid.near(a.x, a.z, 6)) {
                const d = Math.hypot(p.x - a.x, p.z - a.z);
                if (
                  p.kind !== "grass" &&
                  d < nearest &&
                  safeDenRoute(a, p, depthAt)
                ) {
                  nearest = d;
                  bed = p;
                }
              }
            }
          }
          need = { x: bed.x, z: bed.z };
          target = undefined;
          stationary =
            Math.hypot(bed.x - a.x, bed.z - a.z) <
            (a.species === "bird" && a.roost ? 0.55 : 0.8);
          if (stationary && a.species === "bird" && a.roost) {
            a.x = bed.x;
            a.z = bed.z;
          }
          needState =
            stationary && Math.abs(a.altitude - restAltitude) < 0.15
              ? "Sleeping"
              : "Seeking sleep";
          if (a.species === "bird" && a.roost && stationary)
            shelter = Math.max(shelter, 0.75);
        }

        if (
          !hunter &&
          !need &&
          !threat &&
          !deep &&
          a.energy > 25 &&
          a.hydration > 35 &&
          (a.stamina < 20 || a.restTimer > 0 || a.energy > 105)
        ) {
          if (a.stamina < 20) a.restTimer = Math.max(a.restTimer, 12);
          stationary = true;
          needState = a.stamina < 70 ? "Recovering" : "Resting";
          target = undefined;
        }
        // Care overrides routine rest, but never urgent needs or escape.
        const brood = broods.get(a.id);
        const dependent = brood?.find((b) => b.energy > 0 && b.nursery);
        if (
          dependent &&
          !threat &&
          a.energy >
            (["Returning to young", "Guarding brood", "Feeding young"].includes(
              a.state,
            )
              ? 50
              : 85) &&
          a.hydration > 45 &&
          a.oxygen > 50 &&
          !deep &&
          (!need ||
            [
              "Sleeping",
              "Seeking sleep",
              "Resting",
              "Recovering",
              "Guarding young",
              "Eating mushrooms",
              "Seeking mushrooms",
              "Foraging worms",
              "Seeking worms",
            ].includes(needState))
        ) {
          const site = dependent.nursery!;
          if (site.kind === "nest") a.roost = site.site;
          need = site;
          target = undefined;
          stationary = Math.hypot(a.x - site.x, a.z - site.z) < 0.65;
          restAltitude = site.altitude;
          if (stationary) {
            a.x = site.x;
            a.z = site.z;
          }
          needState = stationary ? "Guarding brood" : "Returning to young";
          if (stationary && Math.abs(a.altitude - site.altitude) < 0.3) {
            for (const baby of brood!) {
              if (
                !animalById.has(baby.id) ||
                baby.energy >= 65 ||
                a.energy <= 48
              )
                continue;
              if (feedYoung(a, baby, dt)) needState = "Feeding young";
            }
          }
        }
        // Prepare a birth site; existing nests/dens are reused while a brood depends on them.
        if (
          (!this.naturalReproduction ||
            !usesMate(a.species) ||
            a.reproductive?.due !== undefined) &&
          !dependent &&
          !threat &&
          !a.nursery &&
          canReproduce(a) &&
          a.cooldown <= 0 &&
          a.energy > 74 &&
          a.hydration > 55 &&
          !deep &&
          (!need || ["Sleeping", "Seeking sleep"].includes(needState))
        ) {
          const tree =
            a.species === "bird" ? nurseryTrees.get(a.roost) : undefined;
          const den = !laysEggs(a.species)
            ? nurseryDens.get(a.home)
            : undefined;
          const site = tree
            ? treeRestSite(tree, a.id, this.weather.land)
            : den && den.progress >= 1 && safeDenRoute(a, den, depthAt)
              ? { ...den, altitude: 0 }
              : undefined;
          if (site) {
            need = site;
            target = undefined;
            restAltitude = site.altitude;
            stationary = Math.hypot(a.x - site.x, a.z - site.z) < 0.6;
            needState = "Preparing nursery";
          }
        }
        if (a.nursery && !threat) {
          need = a.nursery;
          target = undefined;
          stationary = true;
          restAltitude = a.nursery.altitude;
          needState = a.nursery.kind === "nest" ? "In nest" : "In den";
        } else if (a.nursery && threat) a.nursery = null;
        let huntingState: AnimalState | "" = "",
          burst = 1;
        // Periodically relocate when no prey appears. Local threats, food,
        // courtship and body needs take priority over waiting.
        const searchingAmbusher = ambusher && a.mealEnergy <= 0 && a.energy < 65 &&
          !target && !threat && (!need || needState === "Seeking habitat");
        const scouting = searchingAmbusher &&
          (scorpionScouting || (!lyingInWait && (this.time + a.id) % 30 >= 20));
        if (spiderSite && (!need || needState === "Seeking habitat")) {
          if (besideFood) {
            need = undefined;
            needState = "";
            stationary = true;
            huntingState = "Waiting in ambush";
          } else {
            need = spiderSite;
            needState = "Searching for prey";
            stationary = false;
          }
        } else if (scouting) {
          // Hungry scorpions scout vegetated edges where insects forage.
          // Follow local habitat cues without seeing prey beyond sensory range.
          const score = (cell: typeof currentLand) => cell.grass + 0.6 * cell.litter +
            0.4 * cell.forest - Math.abs(cell.moisture - 0.55) + (scorpionScouting
              ? 1.5 * availableWorms(cell) + Math.max(0, 1 - (this.time - (cell.bugFeedTime ?? -Infinity)) / 30)
              : 0);
          let best = score(currentLand) + 0.025;
          for (let j = 0; j < 8; j++) {
            const angle = j * Math.PI / 4;
            const x = a.x + Math.cos(angle) * g.sense, z = a.z + Math.sin(angle) * g.sense;
            if (Math.hypot(x, z) >= WORLD_RADIUS || depthAt(x, z) > 0.1) continue;
            const value = score(landAt(this.weather.land, x, z));
            if (value <= best) continue;
            best = value;
            need = { x, z };
            needState = "Searching for prey";
            stationary = false;
          }
          if (scorpionScouting && (!need || needState === "Seeking habitat")) {
            need = undefined;
            needState = "";
            huntingState = "Searching for prey";
            stationary = false;
          }
        }
        if (searchingAmbusher && !scouting && needState === "Seeking habitat") {
          need = undefined;
          needState = "";
        }
        if (lyingInWait && !strike && !threat && needState === "Seeking habitat") {
          need = undefined;
          needState = "";
        }
        if (ambusher && !scorpionScouting && !need && !threat && ((lyingInWait && !strike) || (!target &&
            (this.time + a.id) % 30 < (searchingAmbusher ? 20 : 24)))) {
          stationary = true;
          huntingState = "Waiting in ambush";
        }
        if (a.species === "spider" && !a.web && a.energy > 0.3 && !a.mealEnergy &&
            !a.webScout && huntingState === "Waiting in ambush" && (atHide || besideFood) && depthAt(a.x, a.z) < 0.15) {
          a.web = { x: a.x, z: a.z, expires: this.time + 45, prey: 0 };
          a.energy -= 0.3;
        }
        // A tired ambusher following visible prey otherwise keeps spending
        // stamina below the launch threshold and never gets another attempt.
        if (ambusher && !need && !threat && !a.mealEnergy && target && "genes" in target &&
            a.stamina <= 20) {
          stationary = true;
          huntingState = "Recovering";
        }
        if (strike && hungry && !threat && !thirsty && !deep && !a.nursery &&
            !(needState === "Courting" && youngAdultSpider(a)) &&
            ["Seeking habitat", "Searching for prey", "Seeking worms", "Foraging worms", "Courting"].includes(needState)) {
          need = undefined;
          needState = "";
          stationary = false;
        }
        if (strike && !retrieving && !need && !threat) {
          if (a.species === "scorpion") stationary = false;
          burst = a.species === "scorpion" ? 3.8 : 2.2;
          a.stamina = Math.max(0, a.stamina - dt * (a.species === "scorpion" ? 20 : 12));
          huntingState = "Sprinting";
        }
        if ((hunter || ambusher) && a.mealEnergy > 0 && !need && !threat) {
          const atCatch = Math.hypot(a.mealX - a.x, a.mealZ - a.z) < 1;
          need = { x: a.mealX, z: a.mealZ };
          needState = atCatch ? "Feeding on catch" : "Returning to catch";
          stationary = atCatch;
          if (atCatch) {
            const bite = Math.min(a.mealEnergy, dt * 3);
            a.mealEnergy -= bite;
            ingest(this.foodTotals, a, a.mealSpecies ?? "older catch", bite);
            a.hydration = Math.min(100, a.hydration + bite * 0.2);
            if (a.mealEnergy <= 0) a.restTimer = 15;
          }
        }
        if (hunter) {
          if (a.species === "wolf" && hungry && !threat && !target &&
              a.mealEnergy <= 0 && needState === "Seeking habitat") {
            need = undefined;
            needState = "";
          }
          if (!need && !threat && a.mealEnergy <= 0) {
            if (!hungry || a.stamina < 30) {
              stationary = true;
              huntingState =
                a.restTimer > 0 || a.stamina < 60 ? "Recovering" : "Resting";
              target = undefined;
            } else if (target) {
              if (a.wolfSearch) delete a.wolfSearch;
              const inBurst = distance < 4 || a.state === "Sprinting";
              if (inBurst && a.stamina > 10) {
                burst = hunter.boost;
                huntingState = "Sprinting";
                a.stamina = Math.max(
                  0,
                  a.stamina - (dt * hunter.drain) / g.endurance,
                );
                if (a.stamina <= 30) a.restTimer = 10;
              } else huntingState = "Stalking";
            } else if (a.species === "crocodile") {
              if (depthAt(a.x, a.z) > 0.1) {
                stationary = true;
                huntingState = "Waiting in ambush";
              } else {
                need = this.ponds.reduce((nearest, pond) =>
                  Math.hypot(pond.x - a.x, pond.z - a.z) < Math.hypot(nearest.x - a.x, nearest.z - a.z)
                    ? pond : nearest, { x: riverX(a.z), z: a.z });
                needState = "Seeking water";
              }
            } else {
              huntingState = "Searching for prey";
              if (a.species === "wolf") need = wolfSearchTarget(a, this.time, depthAt);
            }
          }
          if (burst === 1)
            a.stamina = Math.min(
              100,
              a.stamina +
                dt *
                  (stationary ? hunter.recovery : 2) *
                  Math.sqrt(g.endurance),
            );
        }
        if (
          !aquatic(a.species) &&
          !SPECIES[a.species].capabilities.flies &&
          !a.webScout?.silk &&
          !stationary &&
          !threat &&
          a.oxygen > 30 &&
          a.stamina > 20
        ) {
          const destination = need ?? target;
          if (
            a.crossingZ === null &&
            destination &&
            Math.sign(a.x - riverX(a.z)) !==
              Math.sign(destination.x - riverX(destination.z)) &&
            a.energy < 95
          ) {
            const side = Math.sign(a.x - riverX(a.z)) || 1,
              other = Math.sign(destination.x - riverX(destination.z)) || -side;
            let best = Infinity;
            for (const z of [a.z, destination.z, ...FORDS]) {
              if (riverDepthAt(z, this.ponds) > 0.25 + 0.5 * g.swimming)
                continue;
              const x = riverX(z),
                w = riverWidthAt(z, this.ponds) + 0.5;
              const score =
                Math.hypot(a.x - x - side * w, a.z - z) +
                Math.hypot(destination.x - x - other * w, destination.z - z) +
                riverDepthAt(z, this.ponds) * w * 20 * (1 - 0.5 * g.swimming);
              if (score < best) {
                best = score;
                a.crossingZ = z;
                a.crossingSide = other;
              }
            }
          }
          if (a.crossingZ !== null) {
            const z = a.crossingZ,
              x = riverX(z),
              w = riverWidthAt(z, this.ponds) + 0.5;
            if ((a.x - x) * a.crossingSide > w && Math.abs(a.z - z) < 1.5) {
              a.crossingZ = null;
              a.crossingSide = 0;
            } else {
              const approach = Math.abs(a.z - z) > 0.8;
              need = {
                x: x + (approach ? -a.crossingSide : a.crossingSide) * w,
                z,
              };
              needState = approach ? "Seeking crossing" : "Crossing river";
              stationary = false;
            }
          }
        }
        // Hold on the plant to feed. Continuing forwards made small fliers
        // overshoot a food source while descending into feeding range.
        if (isFlyingInsect(a.species) && !threat && !need && target && !("genes" in target) &&
            distance < 0.65 + g.size * 0.35 * g.length) stationary = true;
        if (a.species === "crab" && !threat && !a.nursery && (!need || needState === "Seeking habitat")) {
          const shore = crabShoreTarget(a, this.ponds, depthAt);
          if (shore) {
            need = shore;
            needState = "Seeking habitat";
            stationary = false;
          }
        }
        if (hill?.pantry && !threat && !thirsty && !deep) {
          const pantry = hill.pantry;
          const remains = pantry.carrion > pantry["dead plants"] ? "carrion" : "dead plants";
          const source = (pantry.crop ?? 0) > pantry[remains] ? "crop" : remains;
          if (a.antLoad || hill.progress < 1 || (a.energy < (a.id === hill.queen ? 40 : hill.queen ? 28 : 50) && (pantry[source] ?? 0) > 0)) {
            need = hill;
            target = undefined;
            stationary = Math.hypot(a.x - hill.x, a.z - hill.z) < 0.65;
            if (a.antLoad) {
              needState = "Carrying food to hill";
              if (a.antLoad.points) markTrail(a.antLoad.points, a);
              if (stationary) {
                if (a.antLoad.source && a.antLoad.points && remainsIds.has(a.antLoad.source))
                  hill.antTrail = { source: a.antLoad.source, points: a.antLoad.points, expires: this.time + 45 };
                pantry[a.antLoad.food] = (pantry[a.antLoad.food] ?? 0) + a.antLoad.energy;
                delete a.antLoad;
              }
            } else if (hill.progress < 1) {
              needState = "Building ant hill";
              if (stationary) hill.progress = Math.min(1, hill.progress + dt * 0.18);
            } else {
              needState = stationary ? "Eating at hill" : "Returning home";
              if (stationary) {
                const meal = Math.min(pantry[source] ?? 0, dt * 5);
                pantry[source] = (pantry[source] ?? 0) - meal;
                if (source === "crop") a.energy += meal; // Already recorded at harvest.
                else ingest(this.foodTotals, a, source, meal);
              }
            }
          } else if (a.id === hill.queen) {
            need = hill;
            target = undefined;
            stationary = Math.hypot(a.x-hill.x,a.z-hill.z) < 0.55;
            needState = stationary ? "Tending brood" : "Returning home";
          } else if (!restDue && !social && !["Eating remains", "Seeking remains", "Drinking"].includes(needState)) {
            if (!scout && (hill.antTrail || (a.energy >= 60 && (!hill.queen || (pantry[source] ?? 0) >= 15)))) {
              target = undefined;
              need = hill.antTrail ? nextTrailPoint(hill.antTrail, a) : hill;
              needState = hill.antTrail ? "Following ant trail" : "Waiting at hill";
              stationary = !hill.antTrail && Math.hypot(a.x - hill.x, a.z - hill.z) < 0.8;
            } else if (scout && !need && !target) {
              needState = "Scouting for food";
            }
          }
        }
        if (!deep && !thirsty && !a.nursery && a.oxygen >= 50 &&
            disease.compelled(a, diseasePatch, currentLand.fungus)) {
          const drive = diseaseTarget(a, animalGrid.near(a.x, a.z, 8), other => canReachPrey(other, a));
          if (drive) {
            need = drive.animal;
            needState = drive.state;
            threat = undefined;
            target = undefined;
            stationary = Math.hypot(need.x - a.x, need.z - a.z) <= 0.55;
            if (stationary && drive.state === "Spreading infection") spreadInfection(a, drive.animal, dt);
          }
        }
        const desired = need
          ? Math.atan2(need.z - a.z, need.x - a.x)
          : threat
            ? Math.atan2(a.z - threat.z, a.x - threat.x)
            : target
              ? Math.atan2(target.z - a.z, target.x - a.x)
              : a.angle;
        const delta = Math.atan2(
          Math.sin(desired - a.angle),
          Math.cos(desired - a.angle),
        );
        const inputs = [
          target ? 1 - distance / foodRange : 0,
          Math.sin(delta),
          Math.cos(delta),
          a.energy / 100,
          threat ? 1 : 0,
          1,
        ];
        const activity = evaluateBrain(g, inputs);
        this.brainActivity.set(a.id, activity);
        const [steer, drive] = activity.outputs;
        const turnRate = a.species === "bird" ? 1.45 : a.species === "cat" ? 1.35 :
          a.species === "fox" ? 1.25 : a.species === "wolf" ? 1.15 : 1;
        // A weak inherited-compatible reflex prevents the founding population from starving before selection starts.
        if (needState !== "Sleeping" && !(stationary && a.species === "crocodile"))
          a.angle +=
            (delta * (need ? 3 : 1.7) * turnRate +
              (need ? 0 : steer * 0.45) +
              (target || threat ? 0 : Math.sin(a.age + a.id) * 0.7)) *
            dt;
        let effort = clamp(g.activity * 0.65 + 0.25 + drive * 0.25, 0.08, 1);
        if (hunter && !need && !threat)
          effort = burst > 1 ? 1 : huntingState === "Stalking" ? 0.35 : 0.3;
        const wolfRoaming = a.species === "wolf" && huntingState === "Searching for prey" && !threat;
        if (wolfRoaming) effort = 0.82;
        if (strike && !need && !threat && target) a.angle = Math.atan2(target.z - a.z, target.x - a.x);
        if (threat || (strike && !need)) effort = 1;
        const insectHunt = (a.species === "frog" || (a.species === "bird" && a.birdDiet === "insectivore")) &&
          !need && !threat && target && "genes" in target &&
          (isInsect(target.species) || target.species === "spider" ||
            (a.species === "bird" && target.species === "scorpion"));
        if (insectHunt && !stationary) {
          a.angle += delta * Math.min(0.5, dt * 3);
          effort = 1;
          // Hold position for the last part of the descent instead of flying past the catch.
          if (a.species === "bird" && distance < reach * 0.75) stationary = true;
        }
        const mouseHunter = a.species === "fox" || a.species === "cat" || a.species === "snake" ||
          (a.species === "bird" && a.birdDiet === "raptor");
        const mousePrey = mouseHunter && !need && !threat && !stationary &&
          target && "genes" in target && target.species === "mouse" &&
          canReachPrey(a, target) && grownBodySize(target) < grownBodySize(a)
          ? target : undefined;
        const shorePrey = a.species === "bird" && a.birdDiet === "raptor" &&
          !need && !threat && !stationary && target && "genes" in target &&
          (target.species === "frog" || target.species === "turtle") &&
          canReachPrey(a, target) ? target : undefined;
        const diving = (mousePrey || shorePrey) && a.species === "bird" && distance < 5;
        const lunging = mousePrey && a.species === "snake" && distance < 2.5 && a.stamina > 25;
        const pursued = mousePrey ?? shorePrey;
        if (pursued && (diving || lunging || burst > 1)) {
          a.angle = Math.atan2(pursued.z - a.z, pursued.x - a.x);
          effort = distance < reach * 0.75 ? 0 : 1;
          if (diving) {
            if (a.altitude > 0.6) burst = 1.8;
            huntingState = mousePrey ? "Diving for mouse" : "Hunting";
          }
          if (lunging) {
            burst = 2.2;
            huntingState = "Striking at mouse";
          }
        }
        const aerialPrey = a.species === "bird" && a.birdDiet === "insectivore" &&
          target && "genes" in target && isFlyingInsect(target.species) && !need && !threat
          ? target : undefined;
        if (aerialPrey && !stationary && distance < 5 && a.stamina > 25) {
          burst = 1.8;
          a.stamina = Math.max(0, a.stamina - dt * 4);
        }
        if (a.species === "bird") {
          const landing =
            stationary ||
            (target && distance < 2 && !need) ||
            (needState === "Seeking water" &&
              need &&
              Math.hypot(need.x - a.x, need.z - a.z) < 2);
          const roosting =
            [
              "Sleeping",
              "Seeking sleep",
              "In nest",
              "Returning to young",
              "Guarding brood",
              "Feeding young",
              "Preparing nursery",
            ].includes(needState) && restAltitude > 0;
          const flightTarget = (a.webHeldUntilAge ?? 0) > a.age ? a.altitude : threat
            ? 4
            : roosting
              ? restAltitude
              : eggAltitude !== undefined && (needState === "Seeking eggs" || needState === "Eating eggs")
                ? eggAltitude
              : aerialPrey && distance < Math.min(7, g.sense)
                ? aerialPrey.altitude
                : landing || diving
                ? 0
                : 3;
          a.altitude = clamp(
            a.altitude + clamp(flightTarget - a.altitude, -dt * (diving ? 6 : 3), dt * 3),
            0,
            5,
          );
        }
        if (isFlyingInsect(a.species)) {
          const landing = stationary || (target && distance < 1.5) || (need && Math.hypot(need.x - a.x, need.z - a.z) < 1);
          const trapped = (a.webHeldUntilAge ?? 0) > a.age;
          const altitude = trapped ? 0 : threat ? 1.4 : landing ? 0 : 0.9;
          a.altitude += clamp(altitude - a.altitude, -dt, dt);
        }
        // Once a spiderling launches, incidental prey sightings don't turn it
        // back toward the brood. Urgent needs and bad weather can interrupt it.
        if (a.webScout?.natal && !threat && !thirsty && !restDue && !a.mealEnergy &&
            (!need || ["Searching for prey", "Seeking habitat", "Seeking worms", "Foraging worms"].includes(needState))) {
          target = undefined;
          needState = "Searching for prey";
        }
        const ballooning = a.webScout?.silk && !!a.webScout && !threat && !thirsty && !restDue &&
          !social && !target && needState === "Searching for prey" && conditions.rain < 0.2;
        if (a.species === "spider") {
          if (ballooning) {
            if (a.webScout?.natal) delete a.natalDispersal;
            a.angle = Math.atan2(a.webScout!.z - a.z, a.webScout!.x - a.x);
            needState = "Ballooning on silk";
            a.stamina = Math.max(0, a.stamina - dt);
          }
          a.altitude = clamp(a.altitude + (ballooning ? 1 : -2) * dt, 0, 1.2);
        }
        const speed = ballooning ? 2.4 :
          (stationary ? 0 : 1) *
          ((a.webHeldUntilAge ?? 0) > a.age ? 0 : 1) *
          ((a.stungUntilAge ?? 0) > a.age ? 0.25 : 1) *
          g.speed *
          burst *
          ageAgility(a) *
          illnessSpeed(a) *
          (hunter ? 1 : 0.65 + (0.35 * a.stamina) / 100) *
          (a.altitude > 0.6 ? 1.8 : 1) *
          thermal.speed *
          effort *
          SPECIES[a.species].speed *
          Math.sqrt(g.stride * g.cadence) *
          (a.species === "snake" ? 1 : Math.sqrt(g.limbs));
        if (!hunter)
          a.stamina = clamp(
            a.stamina +
              dt *
                (stationary ? 4 : -(0.12 + 0.7 * speed * speed) / g.endurance),
            0,
            100,
          );
        a.distance += speed * dt;
        if (a.species === "fish" && speed > 0 && depthAt(a.x, a.z) > 0.1)
          a.angle = turnFromBank(a, a.angle, depthAt, a.id);
        const nx = a.x + Math.cos(a.angle) * speed * dt,
          nz = a.z + Math.sin(a.angle) * speed * dt;
        if (
          !aquatic(a.species) &&
          !SPECIES[a.species].capabilities.flies &&
          !deep &&
          !ballooning &&
          !threat &&
          !(
            a.crossingZ !== null &&
            Math.abs(nz - a.crossingZ) < 1.5 &&
            depthAt(nx, nz) <= 0.25 + 0.5 * g.swimming
          ) &&
          depthAt(nx, nz) > 0.25
        ) {
          a.angle += Math.PI / 2;
        } else if (
          a.species === "fish" &&
          isFishWater(a.x, a.z, depthAt) &&
          !isFishWater(nx, nz, depthAt)
        ) {
          a.angle += Math.PI / 2;
        } else {
          if (a.species === "bug" && speed > 0) recordBugStep(a, this.time);
          a.x = nx;
          a.z = nz;
        }

        const radius = Math.hypot(a.x, a.z);
        if (radius > WORLD_RADIUS) {
          a.x *= WORLD_RADIUS / radius;
          a.z *= WORLD_RADIUS / radius;
          if (speed > 0) a.angle += Math.PI * 0.65;
        }
        a.energy -=
          dt *
          thermal.metabolism * (isFlyingInsect(a.species) || a.species === "ant" ? 0.28 : 1) *
          (a.species === "scorpion" && stationary &&
            (huntingState === "Waiting in ambush" || ["Sleeping", "In den", "Sheltering"].includes(needState))
            ? 0.14 : ambusher && stationary && (huntingState === "Waiting in ambush" || needState === "Sleeping")
            ? 0.24 : needState === "Sleeping" ? 0.65 : 1) *
          (hunter
            ? stationary
              ? 0.18
              : 0.45
            : a.species === "crocodile"
              ? 0.25
              : aquatic(a.species)
                ? 0.5
                : 1) *
          (0.025 *
            (g.insulation * g.insulation + g.waterproofing * g.waterproofing) +
            0.015 * g.endurance * g.endurance +
            0.02 * g.longevity * g.longevity +
            0.015 / g.maturation +
            0.025 * (g.droughtTolerance + g.immunity + g.swimming) +
            0.075 * g.size * g.length +
            (wolfRoaming ? 0.055 : 0.09) * speed * speed * g.size +
            0.02 * g.cadence * g.cadence +
            (a.species === "snake" ? 0 : 0.025 * g.limbs) +
            0.005 * g.neurons +
            0.001 * g.neurons * 8 +
            0.004 * g.sense +
            eyesightCost(g.eyesight) +
            0.01 * g.digging * g.digging);
        a.energy -=
          dt *
          (a.altitude > 0.6 && needState !== "Sleeping" ? 0.08 * g.size : 0);
        if (!aquatic(a.species)) {
          a.energy -=
            dt *
            (a.wetness * 0.04 + (contact ? 0.12 * (1 - 0.6 * g.swimming) : 0));
          if (contact)
            a.stamina = Math.max(
              0,
              a.stamina - dt * 2 * (1 - 0.5 * g.swimming),
            );
        }
        if (a.energy <= 0) a.deathCause = "starvation";
        a.energy -=
          dt *
          (a.species === "snake"
            ? Math.max(0, 5 - a.bodyTemperature, a.bodyTemperature - 38)
            : Math.max(0, 15 - localTemp) * (1 - 0.7 * g.insulation) +
              Math.max(0, localTemp - 31) * (1 + 0.4 * g.insulation)) *
          0.025 *
          (1 - 0.85 * shelter);
        if (a.energy <= 0 && !a.deathCause) a.deathCause = "exposure";
        a.energy -= dt * (a.hydration < 15 ? 0.8 : 0);
        if (a.energy <= 0 && !a.deathCause) a.deathCause = "dehydration";
        const submerged =
          a.species === "fish"
            ? depthAt(a.x, a.z) < 0.1
            : !aquatic(a.species) &&
              a.altitude < 0.5 &&
              depthAt(a.x, a.z) > 0.25;
        a.oxygen = clamp(
          a.oxygen +
            dt *
              (submerged
                ? -(a.species === "bird" ? 0.7 : 6) * (1 - 0.75 * g.swimming)
                : 20),
          0,
          100,
        );
        if (a.oxygen <= 0 && !a.deathCause) {
          a.energy = 0;
          a.deathCause = a.species === "fish" ? "stranding" : "drowning";
        }
        disease.update(a, diseasePatch, currentLand.fungus, dt);
        if (a.energy <= 0 && !a.deathCause) a.deathCause = "disease";
        if (a.energy <= 0) continue;
        a.state =
          needState ||
          huntingState ||
          (threat
            ? "Fleeing"
            : target
              ? "genes" in target
                ? "Hunting"
                : "Foraging"
              : effort < 0.35
                ? "Resting"
                : "Exploring");
        if (
          (aerialPrey ? Math.abs(a.altitude - aerialPrey.altitude) < 0.45 : a.altitude < 0.6) &&
          !needState &&
          target &&
          (pursued ? Math.hypot(pursued.x - a.x, pursued.z - a.z) : distance) < reach &&
          (!("genes" in target) || (!shelteredInAntHill(target) && ((a.species !== "frog" && a.species !== "scorpion" &&
            !((a.species === "snake" || a.species === "bird") && target.species === "frog") &&
            target.species !== "turtle") || canReachPrey(a, target)))) &&
          (a.species !== "scorpion" || (strike && a.age >= (a.nextStingAge ?? 0))) &&
          (!("genes" in target) || !target.webOwnerId || target.webOwnerId === a.id || (target.webHeldUntilAge ?? 0) <= target.age)
        ) {
          if (!("genes" in target)) {
            const p = target as Plant;
            const { removed, eaten: bite } = harvestPlant(p, a, dt, this.treeBrowseDamage);
            if (bite > 0 && !a.seedCargo && this.random() < dt * 0.25)
              collectSeed(this.seedBank, a, p, a.species === "mouse" && a.energy >= 55 ? "cache" : "gut", this.time);
            if (isInsect(a.species) && bite > 0 && a.energy < ANIMAL_ENERGY_CAPACITY) markInsectFeeding(a);
            ingestPlantFood(this.foodTotals, a, p, bite);
            if (a.species === "bug") {
              const soil = this.weather.land![landIndex(p.x, p.z)];
              soil.litter = clamp(soil.litter + removed * 0.008, 0, 1);
            }
            if (bite > 0) a.state = "Eating";
          } else {
            const prey = target as Animal;
            const preyLarger = ambusher && grownBodySize(prey) > grownBodySize(a);
            const bite =
              dt *
              (5 + g.aggression * 12) *
              g.size *
              (burst > 1 ? 4 : 1);
            const protectedBaby =
              prey.age < maturityAge(prey) &&
              (!laysEggs(prey.species) || prey.species === "bird") &&
              this.animals.some(
                (p) =>
                  p.id === prey.parent &&
                  p.energy > 0 &&
                  Math.hypot(p.x - prey.x, p.z - prey.z) < 3,
              );
            let damage = bite * ageVulnerability(prey) * illnessVulnerability(prey);
            const swallowedWhole = insectHunt &&
              grownBodySize(prey) < grownBodySize(a);
            const decisiveCatch = !!mousePrey && !protectedBaby;
            if (swallowedWhole || decisiveCatch) damage = prey.energy;
            if (a.species === "spider" && retrieving && isInsect(prey.species) &&
                prey.webOwnerId === a.id && (prey.webHeldUntilAge ?? 0) > prey.age) {
              damage = prey.energy;
            }
            if (a.species === "scorpion") {
              const accuracy = clamp(0.87 - distance * 0.15 + (ageVulnerability(prey) * illnessVulnerability(prey) - 1) * 0.12, 0.45, 0.95);
              const landed = this.random() < accuracy;
              a.nextStingAge = a.age + (landed ? 1.8 : 3);
              damage = landed ? (preyLarger ? ANIMAL_ENERGY_CAPACITY * 0.35 : prey.energy) : 0;
              if (!landed) {
                prey.sensedThreat = a.id;
                prey.nextSenseAt = 0;
              }
            }
            const actualBite = Math.min(prey.energy, damage * (protectedBaby ? 0.25 : 1));
            if (actualBite > 0 && isInsect(prey.species)) a.hasEatenBug = true;
            if (ambusher && actualBite > 0 && (burst > 1 || preyLarger))
              prey.stungUntilAge = prey.age + 3;
            prey.energy -= actualBite;
            if (prey.energy <= 0) {
              prey.deathCause = "predation";
              prey.killedBy = a.id;
              if (hunter || ambusher) {
                a.mealEnergy = mealYield(prey, a);
                a.mealSpecies = prey.species;
                a.mealX = prey.x;
                a.mealZ = prey.z;
                a.mealTime = 90;
                a.restTimer = 0;
              }
            }
            if (!hunter && !ambusher) {
              const wholeCatch = (swallowedWhole || decisiveCatch) && actualBite > 0 && prey.energy <= 0;
              const fraction = wholeCatch ? 1 : actualBite / ANIMAL_ENERGY_CAPACITY;
              ingest(this.foodTotals, a, prey.species, fraction * mealYield(prey, a) * preyEfficiency(a));
            }
            a.state = (hunter || a.mealEnergy > 0)
              ? a.mealEnergy > 0
                ? "Returning to catch"
                : huntingState || "Stalking"
              : huntingState || "Hunting";
          }
        }
        if (hill?.queen && a.id !== hill.queen && !a.antLoad && a.energy > 35 &&
            (a.state === "Eating" || a.state === "Eating mushrooms")) {
          const surplus = Math.min(12, a.energy - 30);
          a.antLoad = { food: "crop", energy: surplus };
          a.energy -= surplus;
        }
        a.energy = Math.min(a.energy, ANIMAL_ENERGY_CAPACITY);
        if (
          (!this.naturalReproduction || !usesMate(a.species)) && !(a.species === "ant" && hill?.queen) &&
          a.energy >
            (isFlyingInsect(a.species) ? 42 : ["cat", "fox", "wolf", "snake", "crocodile"].includes(a.species)
              ? 70
              : 74) &&
          a.age >= maturityAge(a) &&
          a.cooldown <= 0 &&
          canReproduce(a) &&
          hasBreedingHealth(a) &&
          !broods.has(a.id) &&
          (a.species !== "bird" ||
            !nurseryTrees.has(a.roost) ||
            (() => {
              const site = treeRestSite(
                nurseryTrees.get(a.roost)!,
                a.id,
                this.weather.land,
              );
              return (
                Math.hypot(a.x - site.x, a.z - site.z) < 0.7 &&
                Math.abs(a.altitude - site.altitude) < 0.3
              );
            })()) &&
          (needState !== "Preparing nursery" ||
            (stationary && Math.abs(a.altitude - restAltitude) < 0.2))
        ) {
          const eggs = laysEggs(a.species);
          if (eggs && !this.layClutch(a)) a.cooldown = 2;
          else {
            a.energy -= isFlyingInsect(a.species) ? 14 : 32;
            if (a.species !== "bug")
              a.cooldown = isFlyingInsect(a.species) ? 22 : a.species === "mouse" ? MOUSE_BIRTH_RECOVERY : 40;
            if (eggs) continue;
            const baby = this.addAnimal(a.kind, a);
            animalById.set(baby.id, baby);
            const siblings = youngByParent.get(a.id);
            if (siblings) siblings.push(baby);
            else youngByParent.set(a.id, [baby]);
            this.births++;
            if (baby.generation > 1 && this.births % 8 === 0)
              this.events.unshift(
                `Generation ${baby.generation} ${SPECIES[a.species].label} born · ${baby.genes.neurons} neurons`,
              );
          }
        }
        if (a.age > lifespan(a)) {
          a.energy = 0;
          a.deathCause = "old_age";
        }
      }
    if (
      this.naturalReproduction &&
      Math.floor(this.time + 1e-8) > Math.floor(previousTime + 1e-8)
    ) {
      const reproductionStart = profiling ? performance.now() : 0;
      const planning = findMates?.(this.animals);
      if (planning)
        return planning.then((neighbors) => {
          stepReproduction(this, depthAt, neighbors);
          measured("simulation: reproduction", reproductionStart);
          this.#finishStep(animalsStart);
        });
      stepReproduction(this, depthAt);
      measured("simulation: reproduction", reproductionStart);
    }
    this.#finishStep(animalsStart);
  }
  #finishStep(animalsStart: number) {
    for (const animal of this.animals)
      this.highestGeneration = Math.max(
        this.highestGeneration,
        animal.generation,
      );
    const before = this.animals.length;
    for (const animal of this.animals)
      if (animal.energy <= 0) {
        animal.energy = 0;
        animal.deathCause ??= "unknown";
        animal.diedAt = this.time;
        this.deathCounts[animal.deathCause]++;
        this.deceased.push(animal);
        rememberAnimal(this.evolution, animal, this.time);
        if (this.weather.land) {
          this.carcasses.push({
            id: animal.id,
            x: animal.x,
            z: animal.z,
            size: Math.max(
              0.1,
              animal.genes.size *
                SPECIES[animal.species].size *
                growthScale(animal) *
                (animal.deathCause === "predation" ? 0.2 : 1),
            ),
            decay: 0,
          });
        }
        this.brainActivity.delete(animal.id);
      }
    measured("simulation: animals", animalsStart);
    this.animals = this.animals.filter((a) => a.energy > 0);
    // Keep recent history plus all direct parents of living creatures, bounded for browser storage.
    if (this.deceased.length > 1200) {
      const pendingMates = new Set(
        this.animals.flatMap((a) => a.reproductive?.mate ?? []),
      );
      const parents = new Set(
        this.animals.flatMap((a) => [a.parent, a.otherParent, a.reproductive?.previousMate]),
      );
      const protectedRecords = this.deceased.filter(
        (a) => parents.has(a.id) && !pendingMates.has(a.id),
      );
      const recent = this.deceased.filter(
        (a) => !parents.has(a.id) && !pendingMates.has(a.id),
      );
      this.deceased = [
        ...recent,
        ...protectedRecords,
        ...this.deceased.filter((a) => pendingMates.has(a.id)),
      ].slice(-1200);
    }
    this.deaths += before - this.animals.length;
    this.events = this.events.slice(0, 5);
    if (this.time - (this.history.at(-1)?.time ?? 0) >= 5) this.record();
  }
  record() {
    recordEvolution(this);
    const grazers = this.animals.filter((a) => a.kind === "grazer");
    const avg = (f: (a: Animal) => number) =>
      grazers.reduce((s, a) => s + f(a), 0) / (grazers.length || 1);
    this.history.push({
      ...populationCounts(this.animals, this.plants.length),
      time: this.time,
      grazers: grazers.length,
      hunters: this.animals.length - grazers.length,
      speed: avg((a) => a.genes.speed),
      brain: avg((a) => a.genes.neurons),
      growth:
        this.plants.reduce((s, p) => s + p.growth, 0) /
        (this.plants.length || 1),
    });
    if (this.history.length > 180) this.history.shift();
  }
}
