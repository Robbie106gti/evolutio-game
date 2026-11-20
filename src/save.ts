import {
  createEvolutionArchive,
  recordEvolution,
  readEvolutionArchive,
} from "./evolution-history.ts";
import { RECOVERY } from "./plant-recovery.ts";
import {
  PLANT_EXPRESSION_TRAITS,
  plantExpressionMarks,
} from "./plant-expression.ts";
import { EXPRESSED_TRAITS, expressionMarks } from "./expression.ts";
import { MOUSE_NICHES, inheritMouseLineage } from "./mouse-lineages.ts";
import {
  LEVELS,
  initialProgress,
  readLevelProgress,
  type LevelProgress,
} from "./levels.ts";
import { isAnimalState } from "./animal-state.ts";
import { rhythmDefaults } from "./rhythm.ts";
import { World } from "./sim.ts";
import {
  DEATH_LABELS,
  PLANTS,
  SPECIES,
  APPEARANCE_DEFAULTS,
  ADAPTATION_DEFAULTS,
} from "./species.ts";
import { maturityAge, lifespan } from "./biology.ts";
import { type Species, type Animal } from "./model.ts";
import { WORLD_RADIUS } from "./terrain.ts";
import { initialLandscape, LAND_SIDE } from "./terrain.ts";
import { initialPonds } from "./ecology.ts";

export const SAVE_KEY = "evolutio.island.v1";
export interface Session {
  world: World;
  rate: number;
  paused: boolean;
  selected: number;
  follow?: boolean;
  level?: LevelProgress;
}
export function encodeSave(session: Session): string {
  const progress = readLevelProgress(
    session.level ?? initialProgress(session.world.level),
  );
  if (
    progress.id !== session.world.level.id ||
    progress.revision !== session.world.level.revision
  )
    throw new Error("World and level progress do not match");
  return JSON.stringify({
    version: 36,
    savedAt: new Date().toISOString(),
    ...session,
    level: progress,
  });
}
export function decodeSave(raw: string): Session {
  const data = JSON.parse(raw);
  const fail = () => {
    throw new Error(
      "This island save is damaged or from an unsupported version.",
    );
  };
  const number = (x: unknown, min = 0, max = 1e12): x is number =>
    typeof x === "number" && Number.isFinite(x) && x >= min && x <= max;
  const id = (x: unknown) => number(x, 1) && Number.isInteger(x);
  const trailPoints = (value: unknown) =>
    Array.isArray(value) && value.length > 0 && value.length <= 64 &&
    value.every(p => p && number(p.x, -WORLD_RADIUS - 2, WORLD_RADIUS + 2) &&
      number(p.z, -WORLD_RADIUS - 2, WORLD_RADIUS + 2));
  const w = data?.world;
  if (
    ![
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
      22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
    ].includes(data?.version) ||
    !w ||
    (data.version >= 35 && typeof w.naturalReproduction !== "boolean") ||
    ![1, 3, 8].includes(data.rate) ||
    typeof data.paused !== "boolean" ||
    !number(data.selected, -LAND_SIDE * LAND_SIDE)
  )
    fail();
  const level =
    data.version < 27 ? initialProgress() : readLevelProgress(data.level);
  const expandIsland = data.version < 17 && w.weather?.land?.length === 144;
  if (expandIsland) {
    const expanded = initialLandscape();
    for (let z = 0; z < 12; z++)
      for (let x = 0; x < 12; x++)
        expanded[(z + 4) * LAND_SIDE + x + 4] = w.weather.land[z * 12 + x];
    w.weather.land = expanded;
  }
  if (data.version === 1 && w.deceased === undefined) w.deceased = [];
  if (data.follow !== undefined && typeof data.follow !== "boolean") fail();
  if (!Array.isArray(w.deceased) || w.deceased.length > 1200) fail();
  if (data.version < 4) {
    w.weather ??= { moisture: 0.7, cloud: 0.4, raining: false };
    w.ponds ??= initialPonds();
    w.dens ??= [];
  }
  if (data.version < 5) {
    w.ponds = initialPonds().map((p, i) => ({
      ...p,
      water: w.ponds[i]?.water ?? 0.85,
    }));
    w.deathCounts ??= {
      starvation: 0,
      predation: 0,
      dehydration: 0,
      exposure: 0,
      old_age: 0,
      unknown: w.deaths,
    };
  }
  if (data.version < 6) {
    w.weather.land ??= initialLandscape();
    w.deathCounts.drowning ??= 0;
    w.deathCounts.disease ??= 0;
    w.plantDeaths ??= { drought: 0, flooding: 0, disease: 0, old_age: 0 };
    for (const a of [...w.animals, ...w.deceased]) {
      a.infection ??= 0;
      a.oxygen ??= 100;
      a.genes = { ...ADAPTATION_DEFAULTS, ...a.genes };
    }
    for (const p of w.plants) {
      p.health ??= 100;
      p.infection ??= 0;
      p.droughtTolerance ??= 0.5;
      p.floodTolerance ??= 0.5;
      p.resistance ??= 0.5;
    }
  }
  if (data.version < 7)
    for (const a of [...w.animals, ...w.deceased]) a.bodyTemperature ??= 23;
  if (data.version < 8) {
    w.seedBank ??= [];
    for (const c of w.weather.land) c.worms ??= 0.4;
    const roles = new Map<number, string>();
    for (const a of [...w.animals, ...w.deceased].sort(
      (a: any, b: any) => a.id - b.id,
    )) {
      a.altitude ??= 0;
      a.birdDiet ??=
        roles.get(a.parent) ?? (a.id % 4 === 0 ? "raptor" : "insectivore");
      roles.set(a.id, a.birdDiet);
    }
  }
  if (data.version < 9) w.seedBank ??= [];
  if (data.version < 10) {
    w.eggs ??= [];
    w.eggsLaid ??= 0;
    w.eggsLost ??= 0;
    w.deathCounts.stranding ??= 0;
    for (const p of w.ponds) p.food ??= 1;
  }
  if (data.version < 11) {
    for (const a of [...w.animals, ...w.deceased]) a.nesting ??= 0;
    for (const e of w.eggs) {
      e.concealment ??= 0;
      e.buried ??= false;
      e.embryo.nesting ??= 0;
    }
  }
  if (data.version < 12)
    for (const a of [
      ...w.animals,
      ...w.deceased,
      ...w.eggs.map((e: any) => e.embryo),
    ]) {
      a.stamina ??= 100;
      a.restTimer ??= 0;
      a.mealEnergy ??= 0;
      a.mealX ??= a.x;
      a.mealZ ??= a.z;
      a.mealTime ??= 0;
    }
  if (data.version < 15) for (const p of w.ponds) p.flow ??= 0;
  if (data.version < 16)
    for (const a of [
      ...w.animals,
      ...w.deceased,
      ...w.eggs.map((e: any) => e.embryo),
    ]) {
      a.wetness ??= 0;
      a.crossingZ ??= null;
      a.crossingSide ??= 0;
    }
  if (
    !Array.isArray(w.eggs) ||
    !w.eggs.every(
      (e: any) =>
        e &&
        e.embryo &&
        number(e.age) &&
        number(e.duration, 1, 100) &&
        number(e.health, 0, 100) &&
        number(e.concealment, 0, 1) &&
        (e.incubationHeat === undefined ||
          (e.embryo.species === "turtle" &&
            number(e.incubationHeat, -10000, 10000))) &&
        typeof e.buried === "boolean",
    ) ||
    !number(w.eggsLaid) ||
    !number(w.eggsLost)
  )
    fail();
  if (
    !Array.isArray(w.weather?.land) ||
    w.weather.land.length !== LAND_SIDE * LAND_SIDE ||
    !w.weather.land.every(
      (c: any) =>
        c &&
        ["moisture", "forest", "grass", "fungus", "litter", "worms"].every(
          (k) => number(c[k], 0, 1),
        ) &&
        c.forest + c.grass <= 1.000001 &&
        (c.elevation === undefined || number(c.elevation, -5, 7)) &&
        (c.sand === undefined || number(c.sand, 0, 1)) &&
        (c.routeVisits === undefined || (Array.isArray(c.routeVisits) && c.routeVisits.length <= 12 &&
          c.routeVisits.every((v: any) => v && number(v.time) && Array.isArray(v.tiles) &&
            v.tiles.length <= 12 && v.tiles.every((t: number) => Number.isInteger(t) && number(t, 0, 65535))))) &&
        (c.approachCount === undefined || number(c.approachCount, 0, 12)) &&
        (c.mushroomVisits === undefined || (number(c.mushroomVisits, 1, 8) && number(c.mushroomTime) &&
          number(c.mushroomX, -WORLD_RADIUS, WORLD_RADIUS) && number(c.mushroomZ, -WORLD_RADIUS, WORLD_RADIUS))) &&
        (c.bugFeedTime === undefined || (number(c.bugFeedTime) && number(c.bugFeedX, -WORLD_RADIUS, WORLD_RADIUS) &&
          number(c.bugFeedZ, -WORLD_RADIUS, WORLD_RADIUS))) &&
        (c.nutrients === undefined || number(c.nutrients, 0, 1)) &&
        (c.surfaceWater === undefined || number(c.surfaceWater, 0, 1000)),
    )
  )
    fail();
  if (data.version < 33 && w.plantDeaths) w.plantDeaths.depletion = 0;
  if (data.version < 22 && w.plantDeaths) w.plantDeaths.competition ??= 0;
  if (
    !w.plantDeaths ||
    ![
      "drought",
      "flooding",
      "disease",
      "competition",
      "old_age",
      "depletion",
    ].every((k) => number(w.plantDeaths[k]))
  )
    fail();
  if (
    !w.deathCounts ||
    !Object.keys(DEATH_LABELS).every((k) => number(w.deathCounts[k]))
  )
    fail();
  if (
    !w.weather ||
    !number(w.weather.moisture, 0, 1) ||
    !number(w.weather.cloud, 0, 1) ||
    typeof w.weather.raining !== "boolean"
  )
    fail();
  if (
    !Array.isArray(w.ponds) ||
    w.ponds.length !== 3 ||
    !w.ponds.every(
      (p: any) =>
        id(p.id) &&
        number(p.x, -WORLD_RADIUS, WORLD_RADIUS) &&
        number(p.z, -WORLD_RADIUS, WORLD_RADIUS) &&
        number(p.water, 0, 1) &&
        number(p.flow, 0, 1) &&
        number(p.food, 0, 1) &&
        number(p.radius, 1, 10),
    )
  )
    fail();
  if (!Array.isArray(w.dens) || w.dens.length > 152) fail();
  if (
    !number(w.seed, 0, 4294967295) ||
    !id(w.nextId) ||
    !number(w.time) ||
    typeof w.scarcity !== "boolean"
  )
    fail();
  for (const key of ["births", "deaths", "plantBirths"])
    if (!number(w[key])) fail();
  if (
    !Array.isArray(w.animals) ||
    !Array.isArray(w.plants) ||
    w.plants.length > 100000
  )
    fail();
  const ids = new Set<number>();
  for (const d of w.dens) {
    if (
      !id(d.id) ||
      ids.has(d.id) ||
      d.id >= w.nextId ||
      !id(d.owner) ||
      !number(d.x, -WORLD_RADIUS, WORLD_RADIUS) ||
      !number(d.z, -WORLD_RADIUS, WORLD_RADIUS) ||
      !number(d.progress, 0, 1) ||
      (d.queen !== undefined && (!d.pantry || !id(d.queen) || d.queen >= w.nextId)) ||
      (d.antTrail !== undefined && (!d.pantry || !d.antTrail || !id(d.antTrail.source) ||
        !number(d.antTrail.expires) || !trailPoints(d.antTrail.points))) ||
      (d.pantry !== undefined && (!d.pantry || (d.pantry.crop !== undefined && !number(d.pantry.crop)) || !number(d.pantry.carrion) || !number(d.pantry["dead plants"])))
    )
      fail();
    ids.add(d.id);
  }
  for (const item of [
    ...w.animals,
    ...w.plants,
    ...w.deceased,
    ...w.eggs.map((e: any) => e.embryo),
  ]) {
    if (
      !id(item.id) ||
      ids.has(item.id) ||
      item.id >= w.nextId ||
      !number(item.parent) ||
      !id(item.generation) ||
      !number(item.x, -WORLD_RADIUS - 2, WORLD_RADIUS + 2) ||
      !number(item.z, -WORLD_RADIUS - 2, WORLD_RADIUS + 2) ||
      !number(item.energy, 0, 140) ||
      !number(item.age)
    )
      fail();
    ids.add(item.id);
  }
  for (const a of [
    ...w.animals,
    ...w.deceased,
    ...w.eggs.map((e: any) => e.embryo),
  ]) {
    if (
      (a.sex !== undefined && a.sex !== "female" && a.sex !== "male") ||
      (a.otherParent !== undefined &&
        (!id(a.otherParent) ||
          a.otherParent >= w.nextId ||
          a.otherParent === a.id ||
          a.otherParent === a.parent)) ||
      (a.cloned !== undefined &&
        (a.cloned !== true || a.otherParent !== undefined || !a.parent))
    )
      fail();
    if (a.reproductive !== undefined) {
      const r = a.reproductive;
      if (
        !r ||
        typeof r !== "object" ||
        Array.isArray(r) ||
        (r.target !== undefined &&
          (!id(r.target) || r.target >= w.nextId || r.target === a.id)) ||
        (r.previousMate !== undefined && (!id(r.previousMate) || r.previousMate >= w.nextId || r.previousMate === a.id)) ||
        (r.mate !== undefined &&
          (!id(r.mate) || r.mate >= w.nextId || r.mate === a.id)) ||
        (r.mate === undefined) !== (r.due === undefined) ||
        (r.due !== undefined && !number(r.due)) ||
        (r.rivalUntil !== undefined && !number(r.rivalUntil)) ||
        (r.transitionDue !== undefined &&
          (a.species !== "fish" || !number(r.transitionDue))) ||
        (r.isolatedSince !== undefined && !number(r.isolatedSince, 0, w.time))
      )
        fail();
      a.reproductive = {
        target: r.target,
        mate: r.mate,
        previousMate: r.previousMate,
        due: r.due,
        rivalUntil: r.rivalUntil,
        isolatedSince: r.isolatedSince,
        transitionDue: r.transitionDue,
      };
    }
    if (data.version < 4) {
      a.hydration ??= 90;
      a.home ??= 0;
      a.genes.eyesight ??= 1;
      a.genes.digging ??= 1;
    }
    if (data.version < 3) {
      a.species ??= a.kind === "grazer" ? "mouse" : "cat";
      a.distance ??= 0;
      a.genes = { ...APPEARANCE_DEFAULTS, ...a.genes };
    }
    if (data.version < 31) a.hasEatenBug = false;
    if (typeof a.hasEatenBug !== "boolean") fail();
    if (data.version < 29) a.expression = expressionMarks();
    if (
      !a.expression ||
      !EXPRESSED_TRAITS.every((key) => number(a.expression[key], 0, 1))
    )
      fail();
    if (data.version < 28) {
      a.genes.dietAffinity ??= 0;
      a.mouseLineage ??= inheritMouseLineage(a);
    }
    if (data.version < 26) {
      a.feedingTarget ??= 0;
      a.fedUntilAge ??= 0;
    }
    if (data.version < 25) a.nursery ??= null;
    if (data.version < 24) a.roost ??= 0;
    if (data.version < 23)
      a.genes = {
        ...rhythmDefaults(a.species in SPECIES ? a.species : "mouse"),
        ...a.genes,
      };
    if (data.version < 18) {
      a.nextSenseAt ??= 0;
      a.sensedTarget ??= 0;
      a.sensedThreat ??= 0;
      a.sensedHungry ??= false;
    }
    if (data.version < 17) {
      a.genes.insulation ??= 0.4;
      a.genes.waterproofing ??= 0.4;
    }
    if (data.version < 14) a.genes.endurance ??= 1;
    if (
      data.version < 13 &&
      (a.genes.maturation === undefined || a.genes.longevity === undefined)
    ) {
      const oldLife = 720 / (0.65 + a.genes.size * 0.35),
        oldAge = a.age;
      a.genes.maturation ??= 1;
      a.genes.longevity ??= 1;
      if (w.animals.includes(a))
        a.age =
          oldAge < 15
            ? (oldAge / 15) * maturityAge(a)
            : maturityAge(a) +
              ((oldAge - 15) / (oldLife - 15)) * (lifespan(a) - maturityAge(a));
    }
    if (
      a.deathCause !== undefined &&
      !Object.hasOwn(DEATH_LABELS, a.deathCause)
    )
      fail();
    if (a.diedAt !== undefined && !number(a.diedAt)) fail();
    if (a.killedBy !== undefined && !id(a.killedBy)) fail();
    if (
      !number(a.nextSenseAt) ||
      !number(a.sensedTarget) ||
      !number(a.sensedThreat) ||
      typeof a.sensedHungry !== "boolean" ||
      !number(a.wetness, 0, 1) ||
      !(
        a.crossingZ === null || number(a.crossingZ, -WORLD_RADIUS, WORLD_RADIUS)
      ) ||
      ![-1, 0, 1].includes(a.crossingSide) ||
      !number(a.stamina, 0, 100) ||
      !number(a.restTimer, 0, 100) ||
      (a.mealSpecies !== undefined && !Object.hasOwn(SPECIES, a.mealSpecies)) ||
      (a.web !== undefined && (!a.web || a.species !== "spider" || !number(a.web.x, -WORLD_RADIUS, WORLD_RADIUS) ||
        !number(a.web.z, -WORLD_RADIUS, WORLD_RADIUS) || !number(a.web.expires) || !Number.isInteger(a.web.prey) || a.web.prey < 0)) ||
      (a.natalDispersal !== undefined && typeof a.natalDispersal !== "boolean") ||
      (a.lastPreyAt !== undefined && !number(a.lastPreyAt)) ||
      (a.webScout !== undefined && (!a.webScout || a.species !== "spider" ||
        !number(a.webScout.x, -WORLD_RADIUS, WORLD_RADIUS) || !number(a.webScout.z, -WORLD_RADIUS, WORLD_RADIUS) ||
        !number(a.webScout.until) || (a.webScout.natal !== undefined && typeof a.webScout.natal !== "boolean") ||
        (a.webScout.silk !== undefined && typeof a.webScout.silk !== "boolean"))) ||
      (a.webHeldUntilAge !== undefined && !number(a.webHeldUntilAge)) ||
      (a.walkTrail !== undefined && (!Array.isArray(a.walkTrail) || a.walkTrail.length > 12 ||
        !a.walkTrail.every((s: any) => s && Number.isInteger(s.tile) && number(s.tile, 0, 65535) && number(s.time)))) ||
      (a.lastMushroomTime !== undefined && !number(a.lastMushroomTime)) ||
      (a.lastMushroomCell !== undefined && !number(a.lastMushroomCell, 0, LAND_SIDE * LAND_SIDE - 1)) ||
      (a.stungUntilAge !== undefined && !number(a.stungUntilAge)) ||
      !number(a.mealEnergy, 0, 140) ||
      !number(a.mealTime, 0, 100) ||
      !number(a.mealX, -WORLD_RADIUS - 2, WORLD_RADIUS + 2) ||
      !number(a.mealZ, -WORLD_RADIUS - 2, WORLD_RADIUS + 2) ||
      !number(a.nesting, 0, 100) ||
      !number(a.altitude, 0, 5) ||
      !["raptor", "insectivore"].includes(a.birdDiet) ||
      !number(a.bodyTemperature, -20, 70) ||
      !number(a.infection, 0, 1) ||
      !number(a.oxygen, 0, 100)
    )
      fail();
    if (data.version < 34) {
      // Seed cosmetic traits from existing inherited morphology, without RNG or lineage recolouring.
      a.genes.earSize ??= 0.55 + (a.genes.limbs / 1.5) * 0.8;
      a.genes.tailLength ??= 0.5 + a.genes.length / 1.6;
      a.genes.furShade ??= 0.28 + a.genes.waterproofing * 0.36;
      a.genes.patternScale ??= 0.6 + a.genes.markings;
    }
    const g = a.genes;
    if (
      !Object.hasOwn(SPECIES, a.species) ||
      !(
        a.mouseLineage === null ||
        (a.species === "mouse" &&
          a.mouseLineage &&
          number(a.mouseLineage.id, 0, w.nextId - 1) &&
          Number.isInteger(a.mouseLineage.id) &&
          number(a.mouseLineage.parentId, 0, w.nextId - 1) &&
          Number.isInteger(a.mouseLineage.parentId) &&
          number(a.mouseLineage.originGeneration, 1, a.generation) &&
          Number.isInteger(a.mouseLineage.originGeneration) &&
          MOUSE_NICHES.includes(a.mouseLineage.niche) &&
          MOUSE_NICHES.includes(a.mouseLineage.candidate) &&
          number(a.mouseLineage.streak, 0, 3) &&
          Number.isInteger(a.mouseLineage.streak))
      ) ||
      !number(a.feedingTarget, 0, w.nextId - 1) ||
      !Number.isInteger(a.feedingTarget) ||
      !number(a.fedUntilAge) ||
      !number(a.hydration, 0, 100) ||
      !(
        a.nursery === null ||
        (a.nursery &&
          ["nest", "den"].includes(a.nursery.kind) &&
          number(a.nursery.site, 0, w.nextId - 1) &&
          Number.isInteger(a.nursery.site) &&
          id(a.nursery.owner) &&
          a.nursery.owner < w.nextId &&
          number(a.nursery.x, -WORLD_RADIUS, WORLD_RADIUS) &&
          number(a.nursery.z, -WORLD_RADIUS, WORLD_RADIUS) &&
          number(a.nursery.altitude, 0, 5))
      ) ||
      !number(a.roost, 0, w.nextId - 1) ||
      !Number.isInteger(a.roost) ||
      !number(a.home) ||
      (a.home !== 0 && !w.dens.some((d: any) => d.id === a.home)) ||
      SPECIES[a.species as Species].kind !== a.kind ||
      !number(a.distance) ||
      !["grazer", "hunter"].includes(a.kind) ||
      !number(a.angle, -1e12, 1e12) ||
      !number(a.cooldown, -1e12, 1e12) ||
      !isAnimalState(a.state) ||
      !g
    )
      fail();
    for (const [key, min, max] of [
      ["dietAffinity", 0, 1],
      ["endurance", 0.6, 1.6],
      ["maturation", 0.6, 1.6],
      ["longevity", 0.65, 1.6],
      ["insulation", 0, 1],
      ["waterproofing", 0, 1],
      ["preferredMoisture", 0.1, 0.9],
      ["droughtTolerance", 0, 1],
      ["immunity", 0, 1],
      ["swimming", 0, 1],
      ["speed", 0.5, 2.5],
      ["size", 0.5, 1.8],
      ["sense", 3, 14],
      ["activity", 0.05, 1],
      ["activityPhase", 0, 1],
      ["twilightBias", 0, 1],
      ["activeFraction", 0.35, 0.8],
      ["aggression", 0, 1],
      ["neurons", 2, 12],
      ["eyesight", 0.5, 2.2],
      ["digging", 0.5, 1.8],
      ["length", 0.6, 1.6],
      ["limbs", 0.6, 1.5],
      ["cadence", 0.6, 1.6],
      ["stride", 0.6, 1.5],
      ["hue", -0.18, 0.18],
      ["markings", 0, 1],
      ["earSize", 0.55, 1.55],
      ["tailLength", 0.5, 1.6],
      ["furShade", 0.24, 0.68],
      ["patternScale", 0.6, 1.6],
    ] as const)
      if (!number(g[key], min, max)) fail();
    if (
      !Number.isInteger(g.neurons) ||
      !Array.isArray(g.weights) ||
      g.weights.length !== g.neurons * 8 ||
      !g.weights.every((v: unknown) => number(v, -3, 3))
    )
      fail();
  }
  if (!Array.isArray(w.seedBank)) fail();
  const carriedSeeds = [];
  for (const a of w.animals) {
    if (a.nextBloodMealAge !== undefined && !number(a.nextBloodMealAge)) fail();
    if (a.antLoad !== undefined && (a.species !== "ant" || !a.antLoad ||
        !["carrion", "dead plants", "crop"].includes(a.antLoad.food) || !number(a.antLoad.energy) ||
        (a.antLoad.source !== undefined && !id(a.antLoad.source)) ||
        (a.antLoad.points !== undefined && !trailPoints(a.antLoad.points)))) fail();
    if (a.nextStingAge !== undefined && !number(a.nextStingAge)) fail();
    if (a.seedCargo === undefined) continue;
    if (!a.seedCargo || !["cache", "gut", "attached"].includes(a.seedCargo.mode) ||
        !number(a.seedCargo.pickedAt) || !a.seedCargo.seed) fail();
    carriedSeeds.push(a.seedCargo.seed);
  }
  for (const p of [...w.plants, ...w.seedBank, ...carriedSeeds]) {
    if (!p) fail();
    if (data.version < 30) p.expression = plantExpressionMarks();
    if (
      !p.expression ||
      !PLANT_EXPRESSION_TRAITS.every((key) => number(p.expression[key], 0, 1))
    )
      fail();
  }
  for (const p of [...w.plants, ...w.seedBank, ...carriedSeeds]) {
    if (!Object.hasOwn(RECOVERY, p.kind)) fail();
    const reserve = RECOVERY[p.kind as keyof typeof RECOVERY].reserve;
    if (data.version < 33) {
      p.reserves = reserve * 0.5;
      p.depletion = 0;
    }
    if (p.stripped !== undefined && typeof p.stripped !== "boolean") fail();
    if (!number(p.reserves, 0, reserve) || !number(p.depletion)) fail();
  }
  if (data.version < 19)
    for (const p of [...w.plants, ...w.seedBank]) p.lastGrowthAt ??= w.time;
  if (data.version < 20)
    for (const p of [...w.plants, ...w.seedBank]) p.variety ??= p.id % 3;
  for (const p of w.plants)
    if (
      !Number.isInteger(p.variety) ||
      !number(p.variety, 0, 2) ||
      !number(p.lastGrowthAt, 0, w.time) ||
      !Object.hasOwn(PLANTS, p.kind) ||
      !number(p.growth, 0.3, 1.7) ||
      !number(p.defense, 0, 0.8) ||
      !number(p.spread, 1, 6)
    )
      fail();
  if (
    !Array.isArray(w.events) ||
    w.events.length > 5 ||
    !w.events.every((e: unknown) => typeof e === "string" && e.length < 200)
  )
    fail();
  if (
    !Array.isArray(w.history) ||
    !w.history.length ||
    w.history.length > 180 ||
    !w.history.every(
      (h: Record<string, unknown>) =>
        h &&
        ["time", "grazers", "hunters", "speed", "brain", "growth"].every((k) =>
          number(h[k]),
        ) &&
        [
          "herbivores",
          "omnivores",
          "carnivores",
          "detritivores",
          "plants",
        ].every(
          (k) =>
            h[k] === undefined || (number(h[k], 0) && Number.isInteger(h[k])),
        ),
    )
  )
    fail();
  for (const p of w.plants)
    if (
      !number(p.health, 0, 100) ||
      !number(p.infection, 0, 1) ||
      !["droughtTolerance", "floodTolerance", "resistance"].every((k) =>
        number(p[k], 0, 1),
      )
    )
      fail();
  if (
    !Array.isArray(w.seedBank) ||
    w.seedBank.length > 240 ||
    ![...w.seedBank, ...carriedSeeds].every(
      (p: any) =>
        p &&
        id(p.id) &&
        (p.deposit === undefined || (p.deposit && number(p.deposit.time) && (p.deposit.owner === undefined || id(p.deposit.owner)))) &&
        number(p.variety, 0, 2) &&
        Number.isInteger(p.variety) &&
        Object.hasOwn(PLANTS, p.kind) &&
        number(p.x, -WORLD_RADIUS - 2, WORLD_RADIUS + 2) &&
        number(p.z, -WORLD_RADIUS - 2, WORLD_RADIUS + 2) &&
        number(p.growth, 0.3, 1.7) &&
        number(p.spread, 1, 6) &&
        number(p.defense, 0, 0.8) &&
        id(p.generation) &&
        ["droughtTolerance", "floodTolerance", "resistance"].every((k) =>
          number(p[k], 0, 1),
        ),
    )
  )
    fail();
  if (data.version < 22) w.plantRemains ??= [];
  if (
    !Array.isArray(w.plantRemains) ||
    w.plantRemains.length > 100000 ||
    !w.plantRemains.every(
      (p: any) =>
        p &&
        id(p.id) &&
        Object.hasOwn(PLANTS, p.kind) &&
        Number.isInteger(p.variety) &&
        number(p.variety, 0, 2) &&
        number(p.x, -WORLD_RADIUS - 2, WORLD_RADIUS + 2) &&
        number(p.z, -WORLD_RADIUS - 2, WORLD_RADIUS + 2) &&
        number(p.size, p.kind === "grass" ? 0.18 : 0.22, 1.1) &&
        number(p.decay, 0, 1),
    )
  )
    fail();
  if (data.version < 32) w.carcasses = [];
  if (
    !Array.isArray(w.carcasses) ||
    !w.carcasses.every(
      (c: any) =>
        c &&
        id(c.id) &&
        number(c.x, -WORLD_RADIUS - 2, WORLD_RADIUS + 2) &&
        number(c.z, -WORLD_RADIUS - 2, WORLD_RADIUS + 2) &&
        number(c.size, 0.1, 100) &&
        number(c.decay, 0, 1),
    )
  )
    fail();
  if (
    w.highestGeneration !== undefined &&
    (!number(w.highestGeneration, 1) || !Number.isInteger(w.highestGeneration))
  )
    fail();
  if (w.highestGeneration === undefined) {
    w.highestGeneration = 1;
    for (const a of [...w.animals, ...w.deceased] as Animal[])
      w.highestGeneration = Math.max(w.highestGeneration, a.generation);
  }
  // Rebuild only known fields; never copy arbitrary saved object properties onto the class.
  const world = new World(
    undefined,
    LEVELS[level.id],
    data.version >= 35 && w.naturalReproduction,
  );
  for (const key of [
    "seed",
    "highestGeneration",
    "weather",
    "ponds",
    "dens",
    "time",
    "nextId",
    "animals",
    "deceased",
    "plants",
    "seedBank",
    "plantRemains",
    "carcasses",
    "eggs",
    "eggsLaid",
    "eggsLost",
    "births",
    "deaths",
    "deathCounts",
    "plantBirths",
    "plantDeaths",
    "scarcity",
    "events",
    "history",
  ] as const)
    (world as unknown as Record<string, unknown>)[key] = w[key];
  if (w.foodTotals !== undefined) {
    if (!w.foodTotals || typeof w.foodTotals !== "object" || Array.isArray(w.foodTotals)) fail();
    const foods = new Set([...Object.keys(SPECIES), ...Object.keys(PLANTS), "worms", "mushrooms", "pond food", "dead plants", "carrion", "older catch", "eggs", "blood", "nectar", "fruit juice"]);
    for (const [species, diet] of Object.entries(w.foodTotals)) {
      if (!Object.hasOwn(SPECIES, species) || !diet || typeof diet !== "object" || Array.isArray(diet) ||
          !Object.entries(diet).every(([food, value]) => foods.has(food) && number(value))) fail();
    }
    world.foodTotals = w.foodTotals;
  }
  if (w.evolution !== undefined)
    world.evolution = readEvolutionArchive(w.evolution);
  else {
    world.evolution = createEvolutionArchive();
    world.evolution.since = world.time;
    recordEvolution(world);
  }
  // Older saves still record both parents of successful broods.
  const mothers = new Map(world.animals.filter(a => (a.species === "ant" || a.species === "fly") &&
    !a.reproductive?.previousMate).map(a => [a.id, a]));
  for (const child of world.evolution.family) {
    const mother = mothers.get(child.parent);
    if (mother && child.otherParent && child.species === mother.species)
      (mother.reproductive ??= {}).previousMate = child.otherParent;
  }
  if (data.version < 5) {
    const savedSeed = world.seed;
    world.seed = (world.seed ^ 0x91abf) >>> 0;
    for (let tries = 0; tries < 5000 && world.plants.length < 620; tries++) {
      const p = world.point();
      if (Math.hypot(p.x, p.z) > 25) world.addPlant(undefined, p.x, p.z);
    }
    world.seed = savedSeed;
  }
  if (expandIsland) {
    const savedSeed = world.seed;
    for (let i = 0; i < 1500; i++) {
      const p = world.point();
      if (Math.hypot(p.x, p.z) > 45) world.addPlant(undefined, p.x, p.z);
    }
    world.seed = savedSeed;
  }
  return {
    world,
    level,
    rate: data.rate,
    paused: data.paused,
    selected: data.selected,
    follow: data.follow ?? true,
  };
}
