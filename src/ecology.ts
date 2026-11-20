import { landIndex } from "./terrain.ts";
import { recycleLitter } from "./decomposition.ts";
import { FUNGI } from "./profiles.ts";
import { type Animal, type Plant } from "./model.ts";
import {
  LAKES,
  SpatialGrid,
  WORLD_RADIUS,
  localTemperature,
  changingWeights,
  regionWeights,
  changingBiome,
  waterDistance,
  landFieldAt,
  LAND_SIDE,
  LAND_STEP,
  LAND_MIN,
  type LandCell,
  ROCKS,
  SPILLWAYS,
  RIVER_MIN,
  RIVER_MAX,
  riverX,
  riverWidth,
  riverWidthAt,
  riverDepthAt,
  riverFlow,
  segmentDistance,
  terrainHeight,
} from "./terrain.ts";
export const DAY_LENGTH = 180;
export interface Pond {
  flow: number;
  food: number;
  id: number;
  x: number;
  z: number;
  water: number;
  radius: number;
}
export interface Den {
  queen?: number;
  antTrail?: import("./ant-trails.ts").AntTrail;
  pantry?: { crop?: number; carrion: number; "dead plants": number };
  id: number;
  owner: number;
  x: number;
  z: number;
  progress: number;
}
export interface Weather {
  land?: LandCell[];
  moisture: number;
  cloud: number;
  raining: boolean;
}
export const initialPonds = (): Pond[] =>
  LAKES.map((p) => ({ ...p, water: 0.85, food: 1, flow: 0 }));
const clamp = (x: number, min = 0, max = 1) => Math.max(min, Math.min(max, x));
export function climate(time: number, weather: Weather) {
  const phase = (time / DAY_LENGTH + 0.2) % 1;
  const sunlight = Math.max(0, Math.sin(phase * Math.PI * 2));
  const light = 0.1 + 0.9 * sunlight * (1 - weather.cloud * 0.35);
  const temperature =
    12 +
    22 * sunlight +
    5 * Math.sin(time / 800) -
    weather.cloud * 3 -
    (weather.raining ? 4 : 0);
  return {
    phase,
    sunlight,
    light,
    temperature,
    period: sunlight < 0.12 ? "Night" : sunlight < 0.45 ? "Twilight" : "Day",
  };
}
// A moving weather front; derived from saved simulation time, so reloads preserve it.
export function regionalClimate(
  time: number,
  weather: Weather,
  x: number,
  z: number,
) {
  const w = changingWeights(weather.land, x, z);
  const aridity =
    regionWeights(x, z).desert *
    (1 - 0.8 * Math.exp(-Math.max(0, waterDistance(x, z)) / 4));
  const front = Math.sin(time / 95 - x / 19 + z / 35);
  const cloud = clamp(
    weather.cloud +
      front * 0.23 +
      w.forest * 0.12 -
      aridity * 0.32 -
      w.desert * 0.04,
  );
  const rain = clamp((cloud - 0.62) / 0.25) * (1 - 0.7 * aridity);
  const moisture = weather.land
    ? landFieldAt(weather.land, x, z, "moisture")
    : clamp(
        weather.moisture + w.forest * 0.12 - w.desert * 0.22 + front * 0.08,
      );
  const c = climate(time, { cloud, moisture, raining: rain > 0.2 });
  const sunshine = c.sunlight * (1 - 0.75 * cloud);
  const groundHeat =
    2 * Math.sin(x / 12) * Math.cos(z / 15) +
    2 * sunshine -
    2 * c.sunlight * cloud;
  return {
    ...c,
    sunlight: sunshine,
    temperature: weather.land
      ? c.temperature + w.desert * 6 - w.forest * 3 + groundHeat
      : localTemperature(c.temperature, x, z) + groundHeat,
    cloud,
    moisture,
    rain,
  };
}
export function stepWater(
  time: number,
  dt: number,
  weather: Weather,
  ponds: Pond[],
) {
  const c = climate(time, weather);
  if (weather.cloud > 0.76) weather.raining = true;
  if (weather.cloud < 0.28) weather.raining = false;
  let evaporation = 0;
  for (const pond of ponds) {
    const overflow = clamp((pond.water - 0.86) / 0.14);
    pond.flow = clamp(pond.flow + dt * (overflow - pond.flow) * 0.035);
    pond.food = clamp(pond.food + dt * 0.04 * (0.3 + c.sunlight) * pond.water);
    const evaporated = Math.min(pond.water, dt * (0.0005 + 0.002 * c.sunlight));
    pond.water = clamp(
      pond.water -
        evaporated -
        pond.flow * 0.005 * dt +
        regionalClimate(time, weather, pond.x, pond.z).rain * 0.014 * dt,
    );
    evaporation += evaporated;
  }
  weather.cloud = clamp(
    weather.cloud +
      evaporation * 0.55 +
      dt * riverFlow(ponds) * (0.00035 + 0.00045 * c.sunlight) -
      (weather.raining ? dt * 0.007 : 0),
  );
  weather.moisture = clamp(
    weather.moisture +
      dt * (weather.raining ? 0.016 : -(0.0006 + 0.001 * c.sunlight)),
  );
}
const habitatRockGrid = new SpatialGrid(ROCKS, 8);
export function habitat(
  a: Pick<Animal, "x" | "z">,
  plants: Plant[],
  land?: LandCell[],
) {
  const biome = changingBiome(land, a.x, a.z);
  let cover = biome === "Forest" ? 0.2 : 0,
    hue = 0.23,
    pattern = 0.25,
    name: string = biome;
  if (biome === "Forest") {
    hue = 0.35;
    pattern = 0.8;
  }
  if (biome === "Desert" || Math.hypot(a.x, a.z) > WORLD_RADIUS - 3) {
    hue = 0.1;
    pattern = 0.05;
    name = biome === "Desert" ? "Desert" : "Bare shore";
  }
  for (const p of plants) {
    const d = Math.hypot(p.x - a.x, p.z - a.z);
    const radius = p.kind === "tree" ? 2.8 : p.kind === "bush" ? 1.7 : 0.8;
    const strength =
      (p.kind === "tree" ? 0.9 : p.kind === "bush" ? 0.65 : 0.18) *
      Math.max(0, 1 - d / radius);
    if (strength > cover) {
      cover = strength;
      hue = p.kind === "tree" ? 0.35 : p.kind === "bush" ? 0.28 : 0.23;
      pattern = p.kind === "grass" ? 0.25 : 0.8;
      name =
        p.kind === "tree"
          ? "Tree cover"
          : p.kind === "bush"
            ? "Bush cover"
            : "Grassland";
    }
  }
  for (const rock of habitatRockGrid.near(a.x, a.z, 3)) {
    if (
      Math.abs(a.x - rock.x) > rock.radius + 1 ||
      Math.abs(a.z - rock.z) > rock.radius + 1
    )
      continue;
    const strength =
      0.8 *
      Math.max(
        0,
        1 - Math.hypot(a.x - rock.x, a.z - rock.z) / (rock.radius + 1),
      );
    if (strength > cover) {
      cover = strength;
      hue = 0.1;
      pattern = 0.6;
      name = "Rock shelter";
    }
  }
  const sand = biome === "Desert" || name === "Bare shore" || (land?.[landIndex(a.x, a.z)]?.sand ?? 0) > 0.3;
  return { cover, hue, pattern, name, sand };
}
export function camouflage(a: Animal, terrain: ReturnType<typeof habitat>) {
  const base = {
    mouse: 0.09,
    cat: 0.07,
    fox: 0.065,
    wolf: 0.12,
    spider: 0.18, scorpion: 0.12, crab: 0.08,
    mosquito: 0.12, fly: 0.55, ant: 0.04,
    bug: 0.29,
    bird: a.birdDiet === "raptor" ? 0.08 : 0.57,
    snake: 0.22,
    fish: 0.52,
    turtle: 0.24,
    crocodile: 0.18,
    frog: 0.3,
  }[a.species];
  const hue = (base + a.genes.hue + 1) % 1;
  const raw = Math.abs(hue - terrain.hue);
  const difference = Math.min(raw, 1 - raw);
  return clamp(
    0.7 * (1 - clamp(difference / 0.3)) +
      0.3 * (1 - Math.abs(a.genes.markings - terrain.pattern)),
  );
}
export function concealedAmbush(a: Animal, terrain: ReturnType<typeof habitat>) {
  return a.state === "Waiting in ambush" &&
    (a.species === "spider" || a.species === "scorpion") &&
    (terrain.cover >= 0.15 || (a.species === "spider" ? terrain.sand : terrain.name === "Desert"));
}

export function detectionRange(
  observer: Animal,
  prey: Animal,
  terrain: ReturnType<typeof habitat>,
  light: number,
  sheltered = false,
) {
  if (concealedAmbush(prey, terrain)) return Math.min(0.9, 0.45 * observer.genes.eyesight);
  const concealment = camouflage(prey, terrain);
  const motion = [
    "Resting",
    "Sleeping",
    "Sheltering",
    "Digging",
    "Eating",
    "Drinking",
  ].includes(prey.state)
    ? 1
    : 1.2;
  // Moving ground prey can be sensed through the substrate even in darkness.
  const groundHunter = observer.species === "scorpion" || observer.species === "spider";
  const vibrationRange = groundHunter && !sheltered &&
    prey.altitude < 0.1 &&
    motion > 1 && !["Waiting in ambush", "Eating remains", "Eating mushrooms"].includes(prey.state)
    ? observer.species === "spider" ? observer.genes.sense * 0.8
      : Math.min(5, observer.genes.sense * 0.65)
    : 0;
  return Math.max(
    0.8, vibrationRange,
    (prey.species === "bug" ? 0.65 : 1) *
      observer.genes.sense *
      observer.genes.eyesight *
      (0.22 + 0.78 * light) *
      (1 - 0.62 * concealment) *
      (1 - 0.35 * terrain.cover) *
      motion *
      (sheltered ? 0.25 : 1),
  );
}
export const eyesightCost = (eyesight: number) => 0.035 * eyesight * eyesight;

export function waterDepth(
  ponds: Pond[],
  x: number,
  z: number,
  land?: LandCell[],
) {
  let depth = 0;
  for (const p of ponds)
    depth = Math.max(
      depth,
      p.radius * Math.sqrt(p.water) * 1.15 - Math.hypot(x - p.x, z - p.z),
    );
  if (
    z > RIVER_MIN &&
    z < RIVER_MAX &&
    Math.abs(x - riverX(z)) < riverWidthAt(z, ponds)
  )
    depth = Math.max(
      depth,
      riverDepthAt(z, ponds) *
        Math.sqrt(
          Math.max(0, 1 - ((x - riverX(z)) / riverWidthAt(z, ponds)) ** 2),
        ),
    );
  for (const p of ponds)
    if (p.flow > 0.04) {
      const path = SPILLWAYS[p.id - 1];
      if (!path) continue;
      if (Math.abs(z - p.z) > 3) continue;
      for (let i = 1; i < path.length; i++)
        if (
          segmentDistance(x, z, path[i - 1], path[i]) <
          0.15 + p.flow * 0.75
        ) {
          depth = Math.max(depth, 0.12 + p.flow * 0.55);
          break;
        }
    }
  if (land && depth > 0) {
    const ground = terrainHeight(x, z, land);
    depth = ground > 0.72 ? 0 : depth + Math.max(0, 0.65 - ground);
  }
  return Math.max(0, depth, surfaceDepth(land, x, z));
}
export function stepLandscape(
  time: number,
  dt: number,
  weather: Weather,
  ponds: Pond[],
) {
  if (!weather.land) return;
  // Read the previous field for all cells, avoiding update-order effects.
  const next = weather.land.map((c, i) => {
    const x = LAND_MIN + (i % LAND_SIDE) * LAND_STEP,
      z = LAND_MIN + Math.floor(i / LAND_SIDE) * LAND_STEP;
    const local = regionalClimate(time, weather, x, z);
    const season = 0.5 + 0.5 * Math.sin(time / 380);
    const aridity =
      regionWeights(x, z).desert *
      (1 - 0.8 * Math.exp(-Math.max(0, waterDistance(x, z)) / 4));
    const retention = 1 - 0.75 * Math.max(aridity, c.sand ?? 0);
    const moisture = clamp(
      c.moisture +
        dt *
          (local.rain * 0.024 +
            0.0015 * Math.exp(-Math.max(0, waterDistance(x, z)) / 6) +
            (waterDepth(ponds, x, z, weather.land) > 0 ? 0.009 : 0) -
            (0.001 + 0.0017 * local.sunlight + season * 0.0008) *
              (1 - 0.3 * c.forest) *
              (1 + 1.2 * aridity) -
            Math.max(0, c.moisture - retention) * 0.012),
    );
    const forestTarget = clamp((moisture - 0.35) / 0.4) * (1 - 0.9 * aridity);
    const forest = clamp(
      c.forest +
        dt * (forestTarget - c.forest) * (moisture < 0.25 ? 0.004 : 0.0009),
    );
    const grassTarget = (1 - forest) * clamp((moisture - 0.12) / 0.3);
    const grass = clamp(
      c.grass + dt * (grassTarget - c.grass) * 0.004,
      0,
      1 - forest,
    );
    const fungus = clamp(
      c.fungus +
        dt *
          (moisture > FUNGI.mushroom.moistureThreshold
            ? FUNGI.mushroom.growth * c.litter * (1 - c.fungus)
            : -FUNGI.mushroom.drying * c.fungus),
    );
    const soil = { ...c, moisture, fungus };
    recycleLitter(soil, dt);
    const litter = soil.litter;
    return {
      ...c,
      moisture,
      forest,
      grass,
      fungus,
      litter,
      worms: soil.worms,
      nutrients: soil.nutrients,
    };
  });
  weather.land = next;
}

// Coarse shallow-water field: one second gates, four conservative substeps.
// Water moves by hydraulic head (ground + depth), not by biome labels.
export function stepRunoff(
  time: number,
  dt: number,
  weather: Weather,
  ponds: Pond[],
) {
  const land = weather.land;
  if (!land) return;
  const bed = land.map((_, i) =>
    terrainHeight(
      LAND_MIN + (i % LAND_SIDE) * LAND_STEP,
      LAND_MIN + Math.floor(i / LAND_SIDE) * LAND_STEP,
      land,
    ),
  );
  const depths = land.map((c, i) => {
    const x = LAND_MIN + (i % LAND_SIDE) * LAND_STEP;
    const z = LAND_MIN + Math.floor(i / LAND_SIDE) * LAND_STEP;
    const local = regionalClimate(time, weather, x, z);
    const rain = local.rain * 0.003 * dt;
    const soak = Math.min(
      (c.surfaceWater ?? 0) + rain,
      dt * (0.001 + (1 - c.moisture) * 0.004),
    );
    c.moisture = clamp(c.moisture + soak * 2);
    return Math.max(
      0,
      (c.surfaceWater ?? 0) +
        rain -
        soak -
        dt * (0.0003 + local.sunlight * 0.001),
    );
  });
  for (let step = 0; step < 4; step++) {
    const delta = new Float64Array(land.length);
    for (let i = 0; i < land.length; i++) {
      const neighbours = [
        i % LAND_SIDE < LAND_SIDE - 1 ? i + 1 : -1,
        i < land.length - LAND_SIDE ? i + LAND_SIDE : -1,
      ];
      for (const j of neighbours) {
        if (j < 0) continue;
        const difference = bed[i] + depths[i] - bed[j] - depths[j];
        const from = difference > 0 ? i : j,
          to = difference > 0 ? j : i;
        // At most a quarter per edge: no negative depths, even with four outlets.
        const flow = Math.min(
          depths[from] * 0.24,
          Math.abs(difference) * Math.min(0.2, dt * 0.05),
        );
        delta[from] -= flow;
        delta[to] += flow;
      }
    }
    for (let i = 0; i < land.length; i++) {
      depths[i] = Math.max(0, depths[i] + delta[i]);
      const x = LAND_MIN + (i % LAND_SIDE) * LAND_STEP;
      const z = LAND_MIN + Math.floor(i / LAND_SIDE) * LAND_STEP;
      if (Math.hypot(x, z) > WORLD_RADIUS - 1) {
        depths[i] = 0;
        continue;
      }
      // River/lake boundary reservoirs exchange water with dug channels.
      const lake = ponds.find(
        (p) => Math.hypot(x - p.x, z - p.z) < p.radius * Math.sqrt(p.water),
      );
      const river = Math.abs(x - riverX(z)) < LAND_STEP * 0.5;
      if (river || lake) {
        const target = Math.max(0, 0.69 - bed[i]);
        const exchange = (target - depths[i]) * 0.2;
        depths[i] += exchange;
        if (lake) lake.water = clamp(lake.water - exchange * 0.003);
      }
    }
  }
  land.forEach((c, i) => {
    c.surfaceWater = depths[i];
  });
}

// Shared by rendering, animal water contact and plant flooding.
const surfaceBeds = new WeakMap<LandCell[], number[]>();
export function surfaceDepth(
  land: LandCell[] | undefined,
  x: number,
  z: number,
) {
  if (!land || Math.hypot(x, z) >= WORLD_RADIUS - 1) return 0;
  const depth = landFieldAt(land, x, z, "surfaceWater");
  if (depth < 0.005) return 0;
  let beds = surfaceBeds.get(land);
  if (!beds) {
    beds = land.map((_, i) =>
      terrainHeight(
        LAND_MIN + (i % LAND_SIDE) * LAND_STEP,
        LAND_MIN + Math.floor(i / LAND_SIDE) * LAND_STEP,
        land,
      ),
    );
    surfaceBeds.set(land, beds);
  }
  const gx = clamp((x - LAND_MIN) / LAND_STEP, 0, LAND_SIDE - 1.001);
  const gz = clamp((z - LAND_MIN) / LAND_STEP, 0, LAND_SIDE - 1.001);
  const ix = Math.floor(gx),
    iz = Math.floor(gz),
    tx = gx - ix,
    tz = gz - iz;
  const i = iz * LAND_SIDE + ix;
  const bed =
    beds[i] * (1 - tx) * (1 - tz) +
    beds[i + 1] * tx * (1 - tz) +
    beds[i + LAND_SIDE] * (1 - tx) * tz +
    beds[i + LAND_SIDE + 1] * tx * tz;
  return Math.min(
    depth * 2,
    Math.max(0, bed + depth - terrainHeight(x, z, land)),
  );
}

// Gameplay approximation of ectothermy; values are not species-specific physiology.
export function snakeThermal(
  body: number,
  air: number,
  sunlight: number,
  cover: number,
  dt: number,
) {
  const target = air + sunlight * 10 * (1 - cover);
  const temperature = body + (target - body) * (1 - Math.exp(-dt / 20));
  const warmth = clamp((temperature - 10) / 20);
  return {
    temperature,
    speed: 0.2 + 0.95 * warmth,
    metabolism: 0.12 + 0.38 * warmth,
    water: 0.2 + 0.4 * warmth,
  };
}

// Exact-coordinate caches: no quantization at shorelines or cover boundaries.
export class CoverCache {
  private plants: Plant[] = [];
  private land: LandCell[] | undefined;
  private values = new Map<number, Map<number, ReturnType<typeof habitat>>>();
  prepare(
    plants: Plant[],
    land: LandCell[] | undefined,
    grid: SpatialGrid<Plant>,
  ) {
    if (
      land !== this.land ||
      plants.length !== this.plants.length ||
      plants.some((p, i) => p !== this.plants[i])
    ) {
      this.values.clear();
      this.plants = plants.slice();
      this.land = land;
    }
    return (a: { x: number; z: number }) => {
      let row = this.values.get(a.x);
      if (!row) {
        row = new Map();
        this.values.set(a.x, row);
      }
      let value = row.get(a.z);
      if (!value) {
        value = habitat(a, grid.near(a.x, a.z, 3), land);
        row.set(a.z, value);
      }
      return value;
    };
  }
}
export function createWaterQuery(ponds: Pond[], land?: LandCell[]) {
  let state: number[] = [];
  let radii: number[] = [];
  let maximumRiverWidth = 0;
  const rows = new Map<
    number,
    { width: number; depth: number; river: number }
  >();
  return (x: number, z: number) => {
    let dirty = state.length !== ponds.length * 6;
    for (let i = 0; i < ponds.length; i++) {
      const p = ponds[i],
        j = i * 6;
      dirty ||=
        state[j] !== p.water ||
        state[j + 1] !== p.flow ||
        state[j + 2] !== p.x ||
        state[j + 3] !== p.z ||
        state[j + 4] !== p.radius ||
        state[j + 5] !== p.id;
    }
    if (dirty) {
      state = ponds.flatMap((p) => [p.water, p.flow, p.x, p.z, p.radius, p.id]);
      radii = ponds.map((p) => p.radius * Math.sqrt(p.water) * 1.15);
      maximumRiverWidth = riverWidth(ponds);
      rows.clear();
    }
    let depth = 0;
    for (let i = 0; i < ponds.length; i++) {
      const dx = x - ponds[i].x,
        dz = z - ponds[i].z;
      if (Math.abs(dx) < radii[i] && Math.abs(dz) < radii[i])
        depth = Math.max(depth, radii[i] - Math.hypot(dx, dz));
    }
    // Most queries are dry land: skip ford exponentials and map allocations there.
    if (
      z > RIVER_MIN &&
      z < RIVER_MAX &&
      Math.abs(x - riverX(z)) < maximumRiverWidth
    ) {
      let row = rows.get(z);
      if (!row) {
        row = {
          width: riverWidthAt(z, ponds),
          depth: riverDepthAt(z, ponds),
          river: riverX(z),
        };
        rows.set(z, row);
      }
      if (Math.abs(x - row.river) < row.width)
        depth = Math.max(
          depth,
          row.depth *
            Math.sqrt(Math.max(0, 1 - ((x - row.river) / row.width) ** 2)),
        );
    }
    for (const p of ponds)
      if (p.flow > 0.04 && Math.abs(z - p.z) <= 3) {
        const path = SPILLWAYS[p.id - 1];
        if (!path) continue;
        for (let i = 1; i < path.length; i++)
          if (
            segmentDistance(x, z, path[i - 1], path[i]) <
            0.15 + p.flow * 0.75
          ) {
            depth = Math.max(depth, 0.12 + p.flow * 0.55);
            break;
          }
      }
    if (land && depth > 0) {
      const ground = terrainHeight(x, z, land);
      depth = ground > 0.72 ? 0 : depth + Math.max(0, 0.65 - ground);
    }
    return Math.max(0, depth, surfaceDepth(land, x, z));
  };
}
