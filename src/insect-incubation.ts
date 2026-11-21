import type { Egg, Species } from "./model.ts";
import { landAt, LAND_MIN, LAND_SIDE, LAND_STEP, WORLD_RADIUS, type LandCell } from "./terrain.ts";
import { regionalClimate, type Weather } from "./ecology.ts";
import { distributeEggSites } from "./egg-sites.ts";

type DormantEggSpecies = "bug" | "fly" | "mosquito";

export function hasDormantEggs(species: Species): species is DormantEggSpecies {
  return species === "bug" || species === "fly" || species === "mosquito";
}

export function insectEggPatch(index: number, species: DormantEggSpecies) {
  return index * 3 + (species === "bug" ? 0 : species === "fly" ? 1 : 2);
}

const shallowWater = (depth: number) => depth >= 0.025 && depth <= 0.65;
const moistSoil = (depth: number, moisture: number) => depth <= 0.1 && moisture >= 0.22;
const incubationMinimum = (species: DormantEggSpecies) =>
  species === "mosquito" ? 14 : species === "fly" ? 8 : 12;

export function insectEggTemperature(time: number, weather: Weather, index: number) {
  const x = LAND_MIN + (index % LAND_SIDE) * LAND_STEP;
  const z = LAND_MIN + Math.floor(index / LAND_SIDE) * LAND_STEP;
  return regionalClimate(time, weather, x, z).temperature;
}

export function insectEggCanDevelop(
  species: DormantEggSpecies, temperature: number, depth: number, moisture: number, litter: number,
) {
  if (temperature < incubationMinimum(species) || temperature > 39) return false;
  if (species === "mosquito") return shallowWater(depth);
  if (species === "fly") return depth <= 0.1 && moisture >= 0.3 && litter >= 0.035;
  return depth <= 0.1 && moisture >= 0.28;
}

export function insectNurseries(
  species: DormantEggSpecies,
  x: number,
  z: number,
  depthAt: (x: number, z: number) => number,
  land: LandCell[] | undefined,
  eggs: Egg[],
) {
  const sites: { x: number; z: number }[] = [];
  const distances = species === "fly" ? [0, 1, 2, 4, 6] : [0, 1, 2, 4, 6, 8, 12, 16];
  for (const distance of distances) {
    const directions = distance === 0 ? 1 : 16;
    for (let i = 0; i < directions; i++) {
      const angle = i * 2 * Math.PI / directions;
      const px = x + distance * Math.cos(angle), pz = z + distance * Math.sin(angle);
      if (Math.hypot(px, pz) >= WORLD_RADIUS) continue;
      const depth = depthAt(px, pz);
      if (species === "mosquito") {
        if (!shallowWater(depth)) continue;
      } else if (species === "fly") {
        const { moisture, litter } = landAt(land, px, pz);
        if (depth > 0.1 || moisture < 0.3 || litter < 0.035) continue;
      } else if (!moistSoil(depth, landAt(land, px, pz).moisture)) continue;
      sites.push({ x: px, z: pz });
    }
  }
  if (sites.length) return distributeEggSites(species, sites, eggs);
}

export function stepInsectEgg(
  egg: Egg,
  dt: number,
  temperature: number,
  depth: number,
  moisture: number,
  litter: number,
  patchEggs: number,
) {
  const species = egg.embryo.species;
  if (!hasDormantEggs(species)) return;
  const mosquito = species === "mosquito";
  if (insectEggCanDevelop(species, temperature, depth, moisture, litter)) {
    // Identical weather can wake a whole patch. Vary development across eggs
    // without using the world's random stream or storing extra save state.
    const stagger = (Math.imul(egg.embryo.id, 0x9e3779b1) >>> 0) / 0x100000000;
    // Flies can develop through mild nights in moist litter, avoiding a
    // synchronized pause and hatch wave across the whole island.
    const warmth = Math.min(
      1,
      (species === "fly" ? 0.72 : 0.4) + 0.12 * (temperature - incubationMinimum(species)),
    );
    // Crowded hatching sites spread recruitment over time. Hatchlings begin
    // feeding close to their egg, so each patch sets its own pace.
    const crowding = 1 + Math.max(0, patchEggs - 8) * 0.09;
    egg.age += (dt * (0.7 + 0.55 * stagger) * warmth) / crowding;
  } else {
    // Dry or cool eggs can wait for several island days, but a bank cannot
    // accumulate forever. Flooded land eggs and deep-water eggs decay faster.
    egg.health -= dt * (depth > (mosquito ? 0.65 : 0.1) ? 0.22 : 0.035);
  }
}
