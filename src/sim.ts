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
  plantEfficiency,
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
  landIndex,
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
  eyesightCost,
  initialPonds,
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
import { SPECIES, PLANTS, PLANT_PROFILES } from "./species.ts";
import {
  canHunt,
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
  eggsLost = 0;
  evolution = createEvolutionArchive();
  highestGeneration = 1;
  births = 0;
  deaths = 0;
  plantBirths = 0;
  scarcity = false;
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
  ) {
    this.#level = level;
    this.seed = seed ?? level.seed;
    this.weather.moisture = level.climate.moisture;
    this.weather.cloud = level.climate.cloud;
    for (let i = 0; i < level.initial.plantAttempts; i++) this.addPlant();
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
    const genes = parent ? this.mutate(parent.genes) : this.genes();
    if (parent) retainExpressedGenes(genes, parent, () => this.random());
    if (!parent) {
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
      genes.preferredMoisture = clamp(
        {
          mouse: 0.58,
          cat: 0.5,
          fox: 0.52,
          wolf: 0.55,
          bug: 0.72,
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
        (waterDepth(this.ponds, p.x, p.z, this.weather.land) > 0.1 ||
          Math.abs(
            landAt(this.weather.land, p.x, p.z).moisture -
              genes.preferredMoisture,
          ) > 0.25);
        tries++
      )
        Object.assign(p, this.point());
    }
    if (aquatic(species) && !parent) {
      const pond = this.ponds[Math.floor(this.random() * this.ponds.length)];
      const angle = this.range(0, Math.PI * 2);
      const r = species === "fish" ? pond.radius * 0.5 : pond.radius * 0.95;
      p.x = pond.x + Math.cos(angle) * r;
      p.z = pond.z + Math.sin(angle) * r;
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
      home: parent?.home ?? 0,
      id: this.nextId++,
      parent: parent?.id ?? 0,
      kind: SPECIES[species].kind,
      species,
      distance: 0,
      ...p,
      angle: this.range(0, 6.28),
      energy: parent ? 24 : 80,
      age: 0,
      generation: parent ? parent.generation + 1 : 1,
      cooldown: 15,
      genes,
      state: "Exploring",
    };
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
    const profile = PLANTS[kind];
    const variety = parent
      ? this.random() < 0.03
        ? (parent.variety + 1) % 3
        : parent.variety
      : (requestedVariety ??
        (weights.desert > 0.4
          ? kind === "grass"
            ? 0
            : 2
          : Math.floor(this.random() * 3)));
    const desertAdapted =
      weights.desert > 0.4 || PLANT_PROFILES[kind][variety].desertAdapted;
    this.plants.push({
      expression: plantExpressionMarks(parent?.expression),
      variety,
      lastGrowthAt: this.time,
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
  layClutch(parent: Animal, available = Infinity) {
    const profile = SPECIES[parent.species];
    for (let n = 0; n < Math.min(profile.clutchSize, available); n++) {
      const embryo = this.addAnimal(parent.kind, parent, undefined, true);
      this.animals.pop();
      const waterEgg = SPECIES[parent.species].capabilities.waterEggs;
      if (waterEgg) {
        const pond = this.ponds.reduce((best, p) =>
          Math.hypot(p.x - parent.x, p.z - parent.z) <
          Math.hypot(best.x - parent.x, best.z - parent.z)
            ? p
            : best,
        );
        embryo.x = pond.x + this.range(-1, 1);
        embryo.z = pond.z + this.range(-1, 1);
      } else if (
        waterDepth(this.ponds, embryo.x, embryo.z, this.weather.land) > 0.1
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
      this.eggsLaid++;
    }
    if (parent.species === "snake") {
      parent.energy -= 4;
      parent.nesting = 8 / parent.genes.digging;
    }
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
  step(dt: number, approximate = false) {
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
    if (
      Math.floor(this.time / 2) > Math.floor((this.time - dt) / 2) &&
      this.seedBank.length
    ) {
      const index = Math.floor(this.random() * this.seedBank.length),
        seed = this.seedBank[index];
      if (
        landAt(this.weather.land, seed.x, seed.z).moisture > 0.3 &&
        depthAt(seed.x, seed.z) < 0.1 &&
        this.addPlant(seed)
      )
        this.seedBank.splice(index, 1);
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
    for (const egg of this.eggs) {
      updateNursery(egg.embryo, nurseryContext, true);
      egg.age += dt;
      const a = egg.embryo,
        wet = depthAt(a.x, a.z) > a.altitude + 0.1;
      const waterEgg = SPECIES[a.species].capabilities.waterEggs;
      const moisture = landAt(this.weather.land, a.x, a.z).moisture;
      if (waterEgg !== wet) egg.health -= dt * 3;
      if (!waterEgg && moisture < 0.08)
        egg.health -=
          dt * (1 - a.genes.droughtTolerance) * (1 - 0.6 * egg.concealment);
      if (egg.age >= egg.duration && egg.health > 0) {
        const survival =
          a.species === "bird" ? 0.8 : a.species === "bug" ? 0.25 : 0.4;
        if (
          this.random() <
          survival + 0.15 * a.genes.immunity + 0.2 * egg.concealment
        ) {
          this.animals.push(a);
          this.births++;
        } else this.eggsLost++;
      } else if (egg.health <= 0) this.eggsLost++;
    }
    this.eggs = this.eggs.filter((e) => e.health > 0 && e.age < e.duration);
    if (Math.floor(previousTime) !== Math.floor(this.time))
      reconcileDens(this.animals, this.dens, this.eggs);
    const indexStart = profiling ? performance.now() : 0;
    const remainsGrid = new SpatialGrid<EdibleRemains>(
      [...this.plantRemains, ...this.carcasses],
      8,
    );
    const plantGrid = new SpatialGrid(this.plants);
    const plantPressure = new Float64Array(400);
    const treeShade = new Float64Array(400);
    for (const p of this.plants) {
      const i = landIndex(p.x, p.z);
      plantPressure[i] += p.kind === "tree" ? 2 : p.kind === "bush" ? 1.2 : 0.7;
      if (p.kind === "tree") treeShade[i] += Math.min(1, p.age / 90);
    }
    const animalGrid = new SpatialGrid(this.animals, 8);
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
      p.age += dt;
      if (
        p.age > PLANTS[p.kind].maturity &&
        p.energy > PLANTS[p.kind].capacity * 0.6 &&
        p.depletion === 0 &&
        Math.floor(p.age / 60) > Math.floor((p.age - dt) / 60) &&
        this.seedBank.length < 240
      ) {
        this.seedBank.push({ ...p, expression: { ...p.expression } });
        p.energy -= PLANTS[p.kind].seedCost * 0.2;
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
      const drought = cell.moisture < 0.22 * (1 - 0.7 * p.droughtTolerance);
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
              ? -0.65 * (1 - 0.8 * p.droughtTolerance)
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
          (0.1 + 0.9 * cell.moisture) *
          availableLight) /
          (1 + competition * 0.65)) *
        (0.55 + 0.45 * plantClimate.sunlight) *
        plantProductivity(p.x, p.z) *
        (p.health / 100) *
        feedPlantSoil(this.weather.land![patch], growthDt, p.kind === "tree") *
        (1 -
          0.15 * p.droughtTolerance -
          0.1 * p.floodTolerance -
          0.1 * p.resistance) *
        1.4;
      p.energy -= growthDt * profile.growth * 0.08 * (1 + competition);
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
        if (this.addPlant(p)) {
          p.energy -= profile.seedCost + p.spread * 0.5;
          plantPressure[patch] +=
            p.kind === "tree" ? 2 : p.kind === "bush" ? 1.2 : 0.7;
        }
      }
      p.energy = clamp(p.energy, 0, profile.capacity);
    }
    this.plants = this.plants.filter((p) => {
      if (p.health <= 0) {
        this.leavePlantRemains(p);
        return false;
      }
      if (p.age < PLANTS[p.kind].lifespan / (0.6 + p.growth * 0.3)) return true;
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
    const animalsStart = profiling ? performance.now() : 0;
    if (approximate) stepApproximateAnimals(this, dt, depthAt);
    else
      for (const a of [...this.animals]) {
        if (a.energy <= 0) continue;
        const g = a.genes;
        if (a.roost && !plantById.has(a.roost)) a.roost = 0;
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
          !restDue &&
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
        a.cooldown -= dt;
        let target: Plant | Animal | undefined =
          animalById.get(a.sensedTarget) ?? plantById.get(a.sensedTarget);
        let threat = animalById.get(a.sensedThreat);
        let distance = target
          ? Math.hypot(target.x - a.x, target.z - a.z)
          : g.sense;
        const invalidTarget =
          !!target &&
          (target.energy <= ("genes" in target ? 0 : 2) ||
            (!("genes" in target) && target.health <= 0));
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
                p.energy > 2 &&
                p.health > 0 &&
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
                  canHunt(a, b) &&
                  Math.hypot(b.x - a.x, b.z - a.z) < 2,
              )));
        const urgentThreat = predatorGrid.findNear(
          a.x,
          a.z,
          2,
          (b) =>
            b.energy > 0 &&
            canHunt(b, a) &&
            Math.hypot(b.x - a.x, b.z - a.z) < 2 &&
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
            (!target || invalidTarget || distance > g.sense)) ||
          (a.sensedThreat !== 0 && (!threat || threat.energy <= 0)) ||
          urgentThreat ||
          urgentFood
        ) {
          target = undefined;
          distance = g.sense;

          const considerTarget = (b: Plant | Animal) => {
            const d = Math.hypot(b.x - a.x, b.z - a.z);
            if (
              d < distance &&
              (!("genes" in b) ||
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
              for (const p of plantGrid.near(a.x, a.z, g.sense))
                if (p.energy > 2 && p.health > 0) considerTarget(p);
            if (huntsAnimals(a))
              for (const b of animalGrid.near(a.x, a.z, g.sense))
                if (b.energy > 0 && canHunt(a, b)) considerTarget(b);
          }

          threat = predatorGrid.findNear(
            a.x,
            a.z,
            g.sense,
            (b) =>
              canHunt(b, a) &&
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
        const thirsty =
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
        if (
          a.hydration <
            (["Drinking", "Seeking water"].includes(a.state) ? 90 : 55) &&
          water
        ) {
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
              a.species !== "bird" &&
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
              a.species !== "bird" &&
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
        if (a.species === "bug" && hungry && !a.nursery && !threat && !need) {
          const food = remainsGrid.findNear(
            a.x,
            a.z,
            Math.min(g.sense, 10),
            (r) =>
              r.decay < 1 &&
              Math.hypot(a.x - r.x, a.z - r.z) <= Math.min(g.sense, 10) &&
              depthAt(r.x, r.z) < 0.15,
          );
          if (food) {
            need = food;
            target = undefined;
            stationary = Math.hypot(a.x - food.x, a.z - food.z) < 0.65;
            needState = stationary ? "Eating remains" : "Seeking remains";
            if (stationary) {
              const cell = this.weather.land![landIndex(food.x, food.z)];
              const bite = consumeRemains(
                food,
                dt * DETRITUS_BITE_RATE,
                cell,
                true,
              );
              a.energy = Math.min(150, a.energy + bite * DETRITUS_NUTRITION);
              a.hydration = Math.min(100, a.hydration + bite * 2);
            }
          }
        }
        if (
          ((a.species === "mouse" && eatsPlants(a)) ||
            a.species === "bug" ||
            (a.species === "bird" && a.birdDiet === "insectivore")) &&
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
              a.energy = Math.min(
                150,
                a.energy + bite * FUNGI.mushroom.nutrition,
              );
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
        if (
          (a.species === "frog" ||
            (a.species === "bird" && a.birdDiet === "insectivore")) &&
          a.energy < 110 &&
          !a.nursery &&
          !restDue &&
          !threat &&
          !need
        ) {
          const cell = this.weather.land?.[landIndex(a.x, a.z)];
          if (cell && cell.worms > 0.04 && depthAt(a.x, a.z) < 0.1) {
            need = { x: a.x, z: a.z };
            needState = "Foraging worms";
            stationary = true;
            if (a.altitude < 0.5) {
              const bite = Math.min(cell.worms, dt * 0.025);
              cell.worms -= bite;
              a.energy += bite * 110;
              a.hydration = Math.min(100, a.hydration + bite * 12);
            }
          } else if (!target) {
            let best = 0.06;
            for (let j = 0; j < 8; j++) {
              const x = a.x + Math.cos((j * Math.PI) / 4) * 6,
                z = a.z + Math.sin((j * Math.PI) / 4) * 6;
              const food = landAt(this.weather.land, x, z).worms;
              if (
                Math.hypot(x, z) < WORLD_RADIUS - 1 &&
                food > best &&
                depthAt(x, z) < 0.1
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
        const currentLand = landAt(this.weather.land, a.x, a.z);
        const mismatch = Math.abs(currentLand.moisture - g.preferredMoisture);
        if (
          deep ||
          (!need && !threat && (a.energy > 85 || !target) && mismatch > 0.18)
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
          const wet = depthAt(a.x, a.z) > a.altitude + 0.1;
          if (wet) a.hydration = Math.min(100, a.hydration + dt * 8);
          if (
            (a.species === "fish" || a.species === "turtle") &&
            wet &&
            a.energy < 110 &&
            !restDue &&
            pond.food > 0.01
          ) {
            const bite = Math.min(pond.food, dt * 0.002);
            pond.food -= bite;
            a.energy += bite * 300;
            need = { x: a.x, z: a.z };
            needState = "Aquatic feeding";
            stationary = true;
          }
          if (!wet && (a.species === "fish" || a.hydration < 65)) {
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
            animalGrid.near(baby.x, baby.z, 3).some((p) => canHunt(p, baby))
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
              d.progress >= 1 &&
              Math.hypot(d.x - a.x, d.z - a.z) < Math.max(18, g.sense * 3) &&
              (aquatic(a.species)
                ? depthAt(d.x, d.z) < 0.1
                : safeDenRoute(a, d, depthAt));
            let den = home && usable(home) ? home : undefined;
            if (!den) {
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
        if (hunter) {
          if (!need && !threat) {
            if (a.mealEnergy > 0) {
              const atCatch = Math.hypot(a.mealX - a.x, a.mealZ - a.z) < 1;
              need = { x: a.mealX, z: a.mealZ };
              needState = atCatch ? "Feeding on catch" : "Returning to catch";
              stationary = atCatch;
              if (atCatch) {
                const bite = Math.min(a.mealEnergy, dt * 3);
                a.mealEnergy -= bite;
                a.energy += bite;
                a.hydration = Math.min(100, a.hydration + bite * 0.2);
                if (a.mealEnergy <= 0) a.restTimer = 15;
              }
            } else if (!hungry || a.stamina < 30) {
              stationary = true;
              huntingState =
                a.restTimer > 0 || a.stamina < 60 ? "Recovering" : "Resting";
              target = undefined;
            } else if (target) {
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
            } else huntingState = "Searching for prey";
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
          a.species !== "bird" &&
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
          target ? 1 - distance / g.sense : 0,
          Math.sin(delta),
          Math.cos(delta),
          a.energy / 100,
          threat ? 1 : 0,
          1,
        ];
        const activity = evaluateBrain(g, inputs);
        this.brainActivity.set(a.id, activity);
        const [steer, drive] = activity.outputs;
        // A weak inherited-compatible reflex prevents the founding population from starving before selection starts.
        if (needState !== "Sleeping")
          a.angle +=
            (delta * (need ? 3 : 1.7) +
              (need ? 0 : steer * 0.45) +
              (target || threat ? 0 : Math.sin(a.age + a.id) * 0.7)) *
            dt;
        let effort = clamp(g.activity * 0.65 + 0.25 + drive * 0.25, 0.08, 1);
        if (hunter && !need && !threat)
          effort = burst > 1 ? 1 : huntingState === "Stalking" ? 0.35 : 0.3;
        if (threat) effort = 1;
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
          const flightTarget = threat
            ? 4
            : roosting
              ? restAltitude
              : landing
                ? 0
                : 3;
          a.altitude = clamp(
            a.altitude + clamp(flightTarget - a.altitude, -dt * 2, dt * 2),
            0,
            5,
          );
        }
        const speed =
          (stationary ? 0 : 1) *
          g.speed *
          burst *
          ageAgility(a) *
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
        const nx = a.x + Math.cos(a.angle) * speed * dt,
          nz = a.z + Math.sin(a.angle) * speed * dt;
        if (
          !aquatic(a.species) &&
          a.species !== "bird" &&
          !deep &&
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
          depthAt(a.x, a.z) > 0.1 &&
          depthAt(nx, nz) < 0.1
        ) {
          a.angle += Math.PI / 2;
        } else {
          a.x = nx;
          a.z = nz;
        }

        const radius = Math.hypot(a.x, a.z);
        if (radius > WORLD_RADIUS) {
          a.x *= WORLD_RADIUS / radius;
          a.z *= WORLD_RADIUS / radius;
          a.angle += Math.PI * 0.65;
        }
        a.energy -=
          dt *
          thermal.metabolism *
          (needState === "Sleeping" ? 0.65 : 1) *
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
            0.09 * speed * speed * g.size +
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
        const infectious = animalGrid.findNear(
          a.x,
          a.z,
          2,
          (b) =>
            b.id !== a.id &&
            b.infection > 0.45 &&
            Math.hypot(b.x - a.x, b.z - a.z) < 2,
        );
        a.infection = clamp(
          a.infection +
            dt *
              ((infectious ? 0.025 : 0) + currentLand.fungus * 0.05) *
              (1 - g.immunity) -
            dt * (0.012 + g.immunity * 0.025),
          0,
          1,
        );
        if (a.infection > 0.35) a.energy -= dt * a.infection * 0.12;
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
          a.altitude < 0.6 &&
          !needState &&
          target &&
          distance < 0.65 + g.size * 0.35 * g.length
        ) {
          if (!("genes" in target)) {
            const p = target as Plant;
            const bite = Math.min(
              Math.max(0, p.energy),
              (dt * (a.species === "bug" ? 18 : 9)) / (1 + p.defense * 4),
            );
            p.energy = Math.max(0, p.energy - bite);
            a.energy +=
              bite *
              PLANTS[p.kind].nutrition *
              plantEfficiency(a) *
              (a.species === "bug" ? 0.55 : 1);
            if (a.species === "bug") {
              const soil = this.weather.land![landIndex(p.x, p.z)];
              soil.litter = clamp(soil.litter + bite * 0.008, 0, 1);
            }
            a.hydration = Math.min(100, a.hydration + bite * 0.3);
            a.state = "Eating";
          } else {
            const prey = target as Animal;
            const bite =
              dt *
              (5 + g.aggression * 12) *
              g.size *
              (hunter && burst > 1 ? 4 : 1);
            const protectedBaby =
              prey.age < maturityAge(prey) &&
              (!laysEggs(prey.species) || prey.species === "bird") &&
              this.animals.some(
                (p) =>
                  p.id === prey.parent &&
                  p.energy > 0 &&
                  Math.hypot(p.x - prey.x, p.z - prey.z) < 3,
              );
            const actualBite = Math.min(
              prey.energy,
              bite * ageVulnerability(prey) * (protectedBaby ? 0.25 : 1),
            );
            if (actualBite > 0 && prey.species === "bug") a.hasEatenBug = true;
            prey.energy -= actualBite;
            if (prey.energy <= 0) {
              prey.deathCause = "predation";
              prey.killedBy = a.id;
              if (hunter) {
                a.mealEnergy = 55 + prey.genes.size * 35;
                a.mealX = prey.x;
                a.mealZ = prey.z;
                a.mealTime = 90;
                a.restTimer = 0;
              }
            }
            if (!hunter) a.energy += actualBite * preyEfficiency(a);
            a.state = hunter
              ? a.mealEnergy > 0
                ? "Returning to catch"
                : huntingState || "Stalking"
              : "Hunting";
          }
        }
        a.energy = Math.min(a.energy, 140);
        if (
          a.energy >
            (["cat", "fox", "wolf", "snake", "crocodile"].includes(a.species)
              ? 70
              : 74) &&
          a.age >= maturityAge(a) &&
          a.cooldown <= 0 &&
          canReproduce(a) &&
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
          a.energy -= 32;
          a.cooldown = 40;
          if (laysEggs(a.species)) {
            this.layClutch(a);
            continue;
          }
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
        if (a.age > lifespan(a)) {
          a.energy = 0;
          a.deathCause = "old_age";
        }
      }
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
      const parents = new Set(this.animals.map((a) => a.parent));
      const protectedRecords = this.deceased.filter((a) => parents.has(a.id));
      this.deceased = [
        ...this.deceased
          .filter((a) => !parents.has(a.id))
          .slice(-(1200 - protectedRecords.length)),
        ...protectedRecords,
      ];
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
