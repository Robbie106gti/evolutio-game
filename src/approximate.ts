import { collectSeed, dropSeed } from "./seed-dispersal.ts";
import { ANIMAL_ENERGY_CAPACITY, worthBrowsing, harvestPlant, ingestPlantFood, ingest, mealYield } from "./food-energy.ts";
import type { World } from "./sim.ts";
import type { Animal, Plant } from "./model.ts";
import {
  canHunt,
  canReproduce,
  clamp,
  lifespan,
  ageAgility,
  ageVulnerability,
  maturityAge,
} from "./biology.ts";
import {
  eatsPlants,
  preyEfficiency,
} from "./mouse-lineages.ts";
import { SPECIES } from "./species.ts";
import { FUNGI } from "./profiles.ts";
import { regionalClimate, eyesightCost } from "./ecology.ts";
import {
  landIndex,
  LAND_SIDE,
  LAND_STEP,
  LAND_MIN,
  WORLD_RADIUS,
  waterDistance,
  riverDrinkPoint,
} from "./terrain.ts";
import { dailyRhythm } from "./rhythm.ts";
import { updateExpression } from "./expression.ts";
import { feedYoung } from "./nursery.ts";
import { diseaseTarget, hasBreedingHealth, illnessSpeed, illnessVulnerability, prepareAnimalDisease, spreadInfection } from "./animal-disease.ts";
import {
  consumeRemains,
  eatWorms,
  DETRITUS_BITE_RATE,
  DETRITUS_NUTRITION,
  type EdibleRemains,
} from "./decomposition.ts";

export function supportsApproximation(w: Pick<World, "animals" | "eggs">) {
  return (
    w.animals.every((a) => a.species === "mouse" || a.species === "bug") &&
    w.eggs.every(
      (e) => e.embryo.species === "mouse" || e.embryo.species === "bug",
    )
  );
}
export function encounterProbability(rate: number, dt: number) {
  return -Math.expm1(-Math.max(0, rate) * Math.max(0, dt));
}
interface Patch {
  plants: Plant[];
  animals: Animal[];
  remains: EdibleRemains[];
}
// Experimental patch encounters. Individuals and finite food pools remain real;
// exact paths, brain decisions and encounters are deliberately approximated.
import { courtshipEnergy, MOUSE_BIRTH_RECOVERY, usesMate } from "./reproduction.ts";

export function stepApproximateAnimals(
  w: World,
  dt: number,
  depthAt: (x: number, z: number) => number,
  disease = prepareAnimalDisease(w.animals),
) {
  if (!supportsApproximation(w))
    throw new Error("Approximate mode currently supports mice and bugs only.");
  const patches = new Map<number, Patch>();
  const patchAt = (x: number, z: number) => {
    const i = landIndex(x, z);
    let p = patches.get(i);
    if (!p) {
      p = { plants: [], animals: [], remains: [] };
      patches.set(i, p);
    }
    return p;
  };
  for (const p of w.plants) if (p.health > 0) patchAt(p.x, p.z).plants.push(p);
  const animals = w.animals.slice(),
    byId = new Map(animals.map((a) => [a.id, a]));
  for (const a of animals) {
    const p = patchAt(a.x, a.z);
    p.animals.push(a);
  }
  for (const r of [...w.plantRemains, ...w.carcasses])
    if (r.decay < 1) patchAt(r.x, r.z).remains.push(r);
  const broods = new Set([
    ...animals.filter((a) => a.nursery).map((a) => a.parent),
    ...w.eggs.map((e) => e.embryo.parent),
  ]);
  const climates = new Map<number, ReturnType<typeof regionalClimate>>();
  const sample = <T>(items: T[]) =>
    items[Math.floor(w.random() * items.length)];
  for (const a of animals) {
    if (a.energy <= 0) continue;
    const g = a.genes,
      i = landIndex(a.x, a.z),
      patch = patchAt(a.x, a.z),
      soil = w.weather.land![i];
    let c = climates.get(i);
    if (!c) {
      c = regionalClimate(
        w.time,
        w.weather,
        LAND_MIN + (i % LAND_SIDE) * LAND_STEP,
        LAND_MIN + Math.floor(i / LAND_SIDE) * LAND_STEP,
      );
      climates.set(i, c);
    }
    a.age += dt;
    if (a.seedCargo) dropSeed(w.seedBank, a, w.time, depthAt(a.x, a.z));
    a.cooldown -= dt;
    a.nextSenseAt = 0;
    a.sensedTarget = 0;
    a.sensedThreat = 0;
    a.crossingZ = null;
    const water = depthAt(a.x, a.z),
      home = w.dens.find((d) => d.id === a.home && d.progress >= 1);
    const sheltered =
      !!a.nursery || (!!home && Math.hypot(a.x - home.x, a.z - home.z) < 1.2);
    const cover = sheltered
      ? 1
      : clamp(soil.forest * 0.7 + soil.grass * 0.15, 0, 0.85);
    const drive = !a.nursery && a.hydration >= 55 && a.oxygen >= 50 &&
      water < 0.25 && disease.compelled(a, i, soil.fungus)
      ? diseaseTarget(a, patch.animals, other => canHunt(other, a)) : undefined;
    const sleep =
      !drive && !dailyRhythm(g, w.time).active && a.energy > 55 && a.hydration > 55;
    let speed =
      sleep || a.nursery
        ? 0
        : ((a.webHeldUntilAge ?? 0) > a.age ? 0 : 1) * ((a.stungUntilAge ?? 0) > a.age ? 0.25 : 1) * g.speed *
          SPECIES[a.species].speed *
          (0.25 + 0.75 * g.activity) *
          ageAgility(a) * illnessSpeed(a);
    a.state = sleep
      ? "Sleeping"
      : a.nursery
        ? a.nursery.kind === "nest"
          ? "In nest"
          : "In den"
        : "Foraging";
    a.wetness = clamp(
      a.wetness +
        dt *
          ((water > 0.05 ? 0.45 : c.rain * 0.06 * (1 - cover)) *
            (1 - 0.75 * g.waterproofing) -
            0.012 * (1 + c.sunlight + (sheltered ? 1 : 0))),
      0,
      1,
    );
    const temperature =
      c.temperature -
      a.wetness * (3 + 4 * (1 - c.sunlight)) * (1 - 0.6 * g.insulation);
    updateExpression(a, dt, temperature);
    a.energy -=
      dt *
      (sleep ? 0.65 : 1) *
      (0.025 * (g.insulation ** 2 + g.waterproofing ** 2) +
        0.015 * g.endurance ** 2 +
        0.02 * g.longevity ** 2 +
        0.015 / g.maturation +
        0.025 * (g.droughtTolerance + g.immunity + g.swimming) +
        0.075 * g.size * g.length +
        0.09 * speed * speed * g.size +
        0.02 * g.cadence ** 2 +
        0.025 * g.limbs +
        0.013 * g.neurons +
        0.004 * g.sense +
        eyesightCost(g.eyesight) +
        0.01 * g.digging ** 2);
    if (a.energy <= 0) {
      a.deathCause = "starvation";
      continue;
    }
    a.energy -=
      dt *
      (Math.max(0, 15 - temperature) * (1 - 0.7 * g.insulation) +
        Math.max(0, temperature - 31) * (1 + 0.4 * g.insulation)) *
      0.025 *
      (1 - 0.85 * cover);
    if (a.energy <= 0) {
      a.deathCause = "exposure";
      continue;
    }
    a.hydration = clamp(
      a.hydration -
        dt *
          (0.12 + 0.012 * Math.max(0, temperature - 22)) *
          (1 - 0.45 * g.droughtTolerance) *
          (1 - 0.45 * cover),
      0,
      100,
    );
    if (a.hydration < 90 && (water > 0.01 || waterDistance(a.x, a.z) < 2)) {
      a.hydration = Math.min(100, a.hydration + dt * 18);
      a.state = "Drinking";
    }
    if (a.hydration < 15) a.energy -= dt * 0.8;
    if (a.energy <= 0) {
      a.deathCause = "dehydration";
      continue;
    }
    a.oxygen = clamp(
      a.oxygen + dt * (water > 0.25 ? -6 * (1 - 0.75 * g.swimming) : 20),
      0,
      100,
    );
    if (a.oxygen <= 0) {
      a.energy = 0;
      a.deathCause = "drowning";
      continue;
    }
    disease.update(a, i, soil.fungus, dt);
    if (a.energy <= 0) {
      a.deathCause = "disease";
      continue;
    }
    const parent = byId.get(a.parent);
    if (
      a.nursery &&
      parent &&
      parent.energy > 0 &&
      landIndex(parent.x, parent.z) === i
    )
      feedYoung(parent, a, dt);
    const encounter = encounterProbability(
      (0.3 + speed * 0.25) * (g.sense / 8),
      dt,
    );
    if (!drive && !sleep && !a.nursery && a.energy < 112 && w.random() < encounter) {
      let ate = false;
      if (a.species === "bug" && patch.remains.length) {
        const remains = sample(patch.remains);
        if (remains.decay < 1 && depthAt(remains.x, remains.z) < 0.15) {
          const bite = consumeRemains(
            remains,
            dt * DETRITUS_BITE_RATE,
            soil,
            true,
          );
          ingest(w.foodTotals, a, "kind" in remains ? "dead plants" : "carrion", bite * DETRITUS_NUTRITION);
          a.hydration = Math.min(100, a.hydration + bite * 2);
          ate = bite > 0;
          a.state = "Eating remains";
        }
      }
      if (
        !ate &&
        a.species === "mouse" &&
        g.dietAffinity >= 0.3 &&
        patch.animals.length
      ) {
        const prey = sample(patch.animals);
        const guardian = byId.get(prey.parent);
        if (
          prey.energy > 0 &&
          canHunt(a, prey) &&
          w.random() <
            clamp(
              (((0.4 + 0.2 * g.eyesight) * ageVulnerability(prey) * g.speed) /
                (0.4 + prey.genes.speed * illnessSpeed(prey))) *
                (prey.age < maturityAge(prey) &&
                guardian &&
                guardian.energy > 0 &&
                landIndex(guardian.x, guardian.z) === i
                  ? 0.6
                  : 1),
              0.02,
              0.95,
            )
        ) {
          const bite = Math.min(
            prey.energy,
            dt * (5 + g.aggression * 12) * g.size * illnessVulnerability(prey),
          );
          prey.energy -= bite;
          ingest(w.foodTotals, a, prey.species, bite / ANIMAL_ENERGY_CAPACITY * mealYield(prey, a) * preyEfficiency(a));
          if (prey.species === "bug" && bite > 0) a.hasEatenBug = true;
          if (prey.energy <= 0) {
            prey.deathCause = "predation";
            prey.killedBy = a.id;
          } else prey.state = "Fleeing";
          ate = bite > 0;
          a.state = "Hunting";
        }
      }
      if (!ate && eatsPlants(a) && patch.plants.length) {
        const edible = (p: Plant) => worthBrowsing(p, a.energy, a.species) && depthAt(p.x, p.z) < 0.15;
        const sampled = sample(patch.plants);
        const p = edible(sampled) ? sampled : a.species === "mouse" ? patch.plants.find(edible) : undefined;
        if (p) {
          const { removed, eaten: bite } = harvestPlant(p, a, dt, w.treeBrowseDamage);
          if (bite > 0 && !a.seedCargo && w.random() < encounterProbability(0.25, dt))
            collectSeed(w.seedBank, a, p, a.species === "mouse" && a.energy >= 55 ? "cache" : "gut", w.time);
          ingestPlantFood(w.foodTotals, a, p, bite);
          if (a.species === "bug")
            soil.litter = clamp(soil.litter + removed * 0.008, 0, 1);
          ate = bite > 0;
          a.state = "Eating";
        }
      }
      if (!ate && a.species === "mouse" && g.dietAffinity >= 0.3 && water < 0.1) {
        const bite = eatWorms(soil, dt);
        if (bite > 0) {
          ingest(w.foodTotals, a, "worms", bite * 110);
          a.hydration = Math.min(100, a.hydration + bite * 12);
          a.state = "Foraging worms";
          ate = true;
        }
      }
      if (!ate && a.species === "bug" && soil.fungus > 0.025 && water < 0.15) {
        const bite = Math.min(soil.fungus, dt * FUNGI.mushroom.biteRate);
        soil.fungus -= bite;
        ingest(w.foodTotals, a, "mushrooms", bite * FUNGI.mushroom.nutrition);
        a.hydration = Math.min(
          100,
          a.hydration + bite * FUNGI.mushroom.hydration,
        );
        a.state = "Eating mushrooms";
      }
    }
    a.energy = Math.min(ANIMAL_ENERGY_CAPACITY, a.energy);
    if (drive) {
      a.state = drive.state;
      if (Math.hypot(drive.animal.x - a.x, drive.animal.z - a.z) <= 0.55) {
        if (drive.state === "Spreading infection") spreadInfection(a, drive.animal, dt);
        speed = 0;
      }
    }
    // Sample a local migration direction; no teleporting between habitat cells.
    if (speed > 0) {
      let angle = a.angle + w.range(-0.8, 0.8);
      if (a.hydration < 55) {
        const drink = riverDrinkPoint(a.x, a.z, w.ponds);
        angle = Math.atan2(drink.z - a.z, drink.x - a.x);
        a.state = "Seeking water";
      } else if (drive) {
        angle = Math.atan2(drive.animal.z - a.z, drive.animal.x - a.x);
      } else if (
        w.naturalReproduction &&
        a.reproductive?.target &&
        a.energy >= (a.species === "bug" ? courtshipEnergy(a) : 80)
      ) {
        const partner = byId.get(a.reproductive.target);
        if (partner && partner.energy > 0) {
          const retreating = (a.reproductive.rivalUntil ?? 0) > w.time;
          angle =
            Math.atan2(partner.z - a.z, partner.x - a.x) +
            (retreating ? Math.PI : 0);
          a.state = retreating ? "Retreating from rival" : "Courting";
        }
      }
      const reach = Math.min(LAND_STEP * 0.5, speed * dt * 1.5),
        nx = a.x + Math.cos(angle) * reach,
        nz = a.z + Math.sin(angle) * reach;
      const nextDepth = depthAt(nx, nz),
        next = w.weather.land![landIndex(nx, nz)];
      const habitatGain =
        Math.abs(soil.moisture - g.preferredMoisture) -
        Math.abs(next.moisture - g.preferredMoisture);
      if (
        Math.hypot(nx, nz) < WORLD_RADIUS - 1 &&
        (nextDepth < 0.25 || nextDepth < water) &&
        (habitatGain > -0.12 || w.random() < 0.15)
      ) {
        a.x = nx;
        a.z = nz;
        a.angle = angle;
        a.distance += reach;
        a.energy -=
          dt *
          (a.wetness * 0.04 +
            (nextDepth > 0.05 ? 0.12 * (1 - 0.6 * g.swimming) : 0));
      } else a.angle += Math.PI / 2;
    }
    if (a.energy <= 0) {
      a.deathCause = "starvation";
      continue;
    }
    if (a.age > lifespan(a)) {
      a.energy = 0;
      a.deathCause = "old_age";
      continue;
    }
    if (
      (!w.naturalReproduction || !usesMate(a.species)) &&
      a.energy > 74 &&
      a.hydration > 55 &&
      a.cooldown <= 0 &&
      canReproduce(a) &&
      hasBreedingHealth(a) &&
      !a.nursery &&
      !broods.has(a.id) &&
      water < 0.25
    ) {
      if (a.species === "bug" && !w.layClutch(a)) {
        a.cooldown = 2;
        continue;
      }
      a.energy -= 32;
      if (a.species !== "bug") a.cooldown = MOUSE_BIRTH_RECOVERY;
      if (a.species !== "bug") {
        w.addAnimal(a.kind, a);
        w.births++;
      }
    }
  }
}
