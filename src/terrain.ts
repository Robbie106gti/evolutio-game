export const WORLD_RADIUS = 70;
// Initial level-founder budget only; reproduction and hatching are uncapped.
export const MAX_ANIMALS = 560;
// Initial rendering allocation, not a simulation population limit.
export const PLANT_INSTANCE_CAPACITY = 2000;
export function riverX(z: number) {
  return 2 + Math.sin(z / 9) * 4;
}
export const LAKES = [
  { id: 1, x: -15, z: -5, radius: 5 },
  { id: 2, x: 10, z: 20, radius: 6 },
  { id: 3, x: 21, z: -20, radius: 4 },
];
export const RIVER_MIN = (() => {
  let z = -WORLD_RADIUS;
  for (let i = 0; i < 8; i++)
    z = -Math.sqrt(WORLD_RADIUS ** 2 - riverX(z) ** 2);
  return z;
})();
export const RIVER_MAX = (() => {
  let z = WORLD_RADIUS;
  for (let i = 0; i < 8; i++) z = Math.sqrt(WORLD_RADIUS ** 2 - riverX(z) ** 2);
  return z;
})();
export const SPILLWAYS = LAKES.map((p) => {
  const end = riverX(p.z),
    start = p.x + Math.sign(end - p.x) * p.radius * 0.9;
  return Array.from({ length: 17 }, (_, i) => {
    const t = i / 16;
    return {
      x: start + (end - start) * t,
      z: p.z + Math.sin(t * Math.PI) * Math.sin(p.id * 2) * 1.5,
    };
  });
});
export const riverFlow = (ponds: readonly { flow: number }[]) =>
  1 + ponds.reduce((n, p) => n + p.flow, 0) * 0.5;
export const riverWidth = (ponds: readonly { flow: number }[]) =>
  1.3 + Math.min(0.9, (riverFlow(ponds) - 1) * 0.6);
export function segmentDistance(
  x: number,
  z: number,
  a: { x: number; z: number },
  b: { x: number; z: number },
) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    t = Math.max(
      0,
      Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)),
    );
  return Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
}
export function biomeAt(x: number, z: number) {
  if (LAKES.some((p) => Math.hypot(x - p.x, z - p.z) < p.radius)) return "Lake";
  if (z > RIVER_MIN && z < RIVER_MAX && Math.abs(x - riverX(z)) < 1.3)
    return "River";
  const w = regionWeights(x, z);
  if (w.forest > 0.5) return "Forest";
  if (w.desert > 0.5) return "Desert";
  return "Plains";
}
const smooth = (a: number, b: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export function regionWeights(x: number, z: number) {
  const forestEdge = -10 + 3 * Math.sin(z / 8) + 2 * Math.sin(z / 3.7);
  const forest = 1 - smooth(forestEdge - 7, forestEdge + 7, x);
  const desert =
    (1 - forest) *
    smooth(8 + 3 * Math.sin(z / 7), 23 + 3 * Math.sin(z / 7), x) *
    (1 - smooth(2, 17, z));
  return { forest, desert, plains: 1 - forest - desert };
}
export function waterDistance(x: number, z: number) {
  return Math.min(
    Math.abs(x - riverX(Math.max(RIVER_MIN, Math.min(RIVER_MAX, z)))) - 1.3,
    ...LAKES.map((p) => Math.hypot(x - p.x, z - p.z) - p.radius),
  );
}
export function localTemperature(temperature: number, x: number, z: number) {
  const w = regionWeights(x, z);
  return (
    temperature +
    w.desert * 6 -
    w.forest * 3 -
    2 * Math.exp(-Math.max(0, waterDistance(x, z)) / 3)
  );
}
export function plantProductivity(x: number, z: number) {
  const w = regionWeights(x, z);
  return 1 - 0.45 * w.desert + 0.1 * w.forest;
}
export function riverDrinkPoint(
  x: number,
  z: number,
  ponds: readonly { flow: number }[] = [],
) {
  const rz = Math.max(RIVER_MIN + 0.5, Math.min(RIVER_MAX - 0.5, z));
  return {
    x: riverX(rz) + (x < riverX(rz) ? -1 : 1) * (riverWidthAt(rz, ponds) + 0.3),
    z: rz,
  };
}
export class SpatialGrid<T extends { x: number; z: number }> {
  // Numeric rows avoid building a string key for every nearby-cell lookup.
  cells = new Map<number, Map<number, T[]>>();
  size: number;
  constructor(items: T[], size = 4) {
    this.size = size;
    for (const item of items) {
      const x = Math.floor(item.x / size),
        z = Math.floor(item.z / size);
      let row = this.cells.get(x);
      if (!row) {
        row = new Map();
        this.cells.set(x, row);
      }
      const cell = row.get(z);
      if (cell) cell.push(item);
      else row.set(z, [item]);
    }
  }
  findNear(
    x: number,
    z: number,
    radius: number,
    predicate: (item: T) => boolean,
  ): T | undefined {
    const minZ = Math.floor((z - radius) / this.size),
      maxZ = Math.floor((z + radius) / this.size);
    const maxX = Math.floor((x + radius) / this.size);
    for (let ix = Math.floor((x - radius) / this.size); ix <= maxX; ix++) {
      const row = this.cells.get(ix);
      if (!row) continue;
      for (let iz = minZ; iz <= maxZ; iz++) {
        const cell = row.get(iz);
        if (cell) for (const item of cell) if (predicate(item)) return item;
      }
    }
    return undefined;
  }
  near(x: number, z: number, radius: number) {
    const result: T[] = [];
    const minZ = Math.floor((z - radius) / this.size),
      maxZ = Math.floor((z + radius) / this.size);
    const maxX = Math.floor((x + radius) / this.size);
    for (let ix = Math.floor((x - radius) / this.size); ix <= maxX; ix++) {
      const row = this.cells.get(ix);
      if (!row) continue;
      for (let iz = minZ; iz <= maxZ; iz++) {
        const cell = row.get(iz);
        if (cell) for (const item of cell) result.push(item);
      }
    }
    return result;
  }
}

export interface LandCell {
  bugFeedX?: number;
  bugFeedZ?: number;
  bugFeedTime?: number;
  mushroomVisits?: number;
  routeVisits?: { time: number; tiles: number[] }[];
  approachCount?: number;
  approachX?: number;
  approachZ?: number;
  mushroomX?: number;
  mushroomZ?: number;
  mushroomTime?: number;
  nutrients?: number;
  surfaceWater?: number;
  elevation?: number;
  sand?: number;
  worms: number;
  moisture: number;
  forest: number;
  grass: number;
  fungus: number;
  litter: number;
}
export const LAND_SIDE = 20,
  LAND_STEP = 8,
  LAND_MIN = -76;
export function initialLandscape(): LandCell[] {
  return Array.from({ length: LAND_SIDE * LAND_SIDE }, (_, i) => {
    const w = regionWeights(
      LAND_MIN + (i % LAND_SIDE) * LAND_STEP,
      LAND_MIN + Math.floor(i / LAND_SIDE) * LAND_STEP,
    );
    return {
      elevation: 0,
      sand: 0,
      worms: 0.4,
      moisture: 0.65 + w.forest * 0.15 - w.desert * 0.3,
      forest: w.forest,
      grass: w.plains,
      fungus: 0.02,
      litter: 0.1,
      nutrients: 0.5,
    };
  });
}
export function landAt(
  cells: LandCell[] | undefined,
  x: number,
  z: number,
): Omit<LandCell, "routeVisits"> {
  if (!cells) {
    const w = regionWeights(x, z);
    return {
      elevation: 0,
      sand: 0,
      worms: 0.4,
      moisture: 0.7,
      forest: w.forest,
      grass: w.plains,
      fungus: 0,
      litter: 0,
    };
  }
  const gx = Math.max(
      0,
      Math.min(LAND_SIDE - 1.001, (x - LAND_MIN) / LAND_STEP),
    ),
    gz = Math.max(0, Math.min(LAND_SIDE - 1.001, (z - LAND_MIN) / LAND_STEP));
  const ix = Math.floor(gx),
    iz = Math.floor(gz),
    tx = gx - ix,
    tz = gz - iz;
  const i = iz * LAND_SIDE + ix;
  const a = cells[i],
    b = cells[i + 1],
    c = cells[i + LAND_SIDE],
    d = cells[i + LAND_SIDE + 1];
  const wa = (1 - tx) * (1 - tz),
    wb = tx * (1 - tz),
    wc = (1 - tx) * tz,
    wd = tx * tz;
  return {
    surfaceWater:
      (a.surfaceWater ?? 0) * wa +
      (b.surfaceWater ?? 0) * wb +
      (c.surfaceWater ?? 0) * wc +
      (d.surfaceWater ?? 0) * wd,
    elevation:
      (a.elevation ?? 0) * wa +
      (b.elevation ?? 0) * wb +
      (c.elevation ?? 0) * wc +
      (d.elevation ?? 0) * wd,
    sand:
      (a.sand ?? 0) * wa +
      (b.sand ?? 0) * wb +
      (c.sand ?? 0) * wc +
      (d.sand ?? 0) * wd,
    worms: a.worms * wa + b.worms * wb + c.worms * wc + d.worms * wd,
    moisture:
      a.moisture * wa + b.moisture * wb + c.moisture * wc + d.moisture * wd,
    forest: a.forest * wa + b.forest * wb + c.forest * wc + d.forest * wd,
    grass: a.grass * wa + b.grass * wb + c.grass * wc + d.grass * wd,
    fungus: a.fungus * wa + b.fungus * wb + c.fungus * wc + d.fungus * wd,
    nutrients:
      (a.nutrients ?? 0.5) * wa +
      (b.nutrients ?? 0.5) * wb +
      (c.nutrients ?? 0.5) * wc +
      (d.nutrients ?? 0.5) * wd,
    litter: a.litter * wa + b.litter * wb + c.litter * wc + d.litter * wd,
  };
}
// Interpolate only the requested field for frequent scalar terrain queries.
// Keep the same weights and arithmetic order as landAt.
export function landFieldAt(
  cells: LandCell[] | undefined,
  x: number,
  z: number,
  field: Exclude<keyof LandCell, "routeVisits">,
): number {
  if (!cells)
    return landAt(cells, x, z)[field] ?? (field === "nutrients" ? 0.5 : 0);
  const gx = Math.max(
    0,
    Math.min(LAND_SIDE - 1.001, (x - LAND_MIN) / LAND_STEP),
  );
  const gz = Math.max(
    0,
    Math.min(LAND_SIDE - 1.001, (z - LAND_MIN) / LAND_STEP),
  );
  const ix = Math.floor(gx),
    iz = Math.floor(gz),
    tx = gx - ix,
    tz = gz - iz;
  const i = iz * LAND_SIDE + ix;
  const wa = (1 - tx) * (1 - tz),
    wb = tx * (1 - tz),
    wc = (1 - tx) * tz,
    wd = tx * tz;
  const fallback = field === "nutrients" ? 0.5 : 0;
  return (
    (cells[i][field] ?? fallback) * wa +
    (cells[i + 1][field] ?? fallback) * wb +
    (cells[i + LAND_SIDE][field] ?? fallback) * wc +
    (cells[i + LAND_SIDE + 1][field] ?? fallback) * wd
  );
}
export function changingWeights(
  cells: LandCell[] | undefined,
  x: number,
  z: number,
) {
  if (!cells) return regionWeights(x, z);
  const c = landAt(cells, x, z);
  return {
    forest: c.forest,
    plains: c.grass,
    desert: Math.max(0, 1 - c.forest - c.grass),
  };
}
export function changingBiome(
  cells: LandCell[] | undefined,
  x: number,
  z: number,
) {
  const w = changingWeights(cells, x, z);
  return w.forest > 0.5 ? "Forest" : w.desert > 0.5 ? "Desert" : "Plains";
}
export function landIndex(x: number, z: number) {
  return (
    Math.max(
      0,
      Math.min(LAND_SIDE - 1, Math.round((z - LAND_MIN) / LAND_STEP)),
    ) *
      LAND_SIDE +
    Math.max(0, Math.min(LAND_SIDE - 1, Math.round((x - LAND_MIN) / LAND_STEP)))
  );
}

export const ROCKS = Array.from({ length: 64 }, (_, i) => {
  const angle = i * 2.399,
    r = i < 28 ? 10 + (i % 7) * 4.2 : 42 + (i % 7) * 3.5;
  return {
    x: Math.cos(angle) * r,
    z: Math.sin(angle) * r,
    radius: 0.8 + (i % 4) * 0.25,
    height: 0.55 + (i % 3) * 0.3,
  };
}).filter((p) => !["Lake", "River"].includes(biomeAt(p.x, p.z)));
export function rockAt(x: number, z: number) {
  return ROCKS.find((r) => Math.hypot(r.x - x, r.z - z) < r.radius);
}

export const FORDS = [-53, -25, 0, 27, 53];
export const fordStrength = (z: number) =>
  Math.max(...FORDS.map((f) => Math.exp(-(((z - f) / 2.4) ** 2))));
export const riverWidthAt = (z: number, ponds: readonly { flow: number }[]) =>
  riverWidth(ponds) * (1 - 0.58 * fordStrength(z));
export const riverDepthAt = (z: number, ponds: readonly { flow: number }[]) =>
  0.45 * (1 - 0.75 * fordStrength(z)) + 0.15 * (riverFlow(ponds) - 1);

export function terrainHeight(x: number, z: number, land?: LandCell[]) {
  let wetDistance = waterDistance(x, z) - 2;
  for (let k = 0; k < SPILLWAYS.length; k++) {
    if (Math.abs(z - LAKES[k].z) > 9) continue;
    const path = SPILLWAYS[k];
    for (let i = 1; i < path.length; i++)
      wetDistance = Math.min(
        wetDistance,
        segmentDistance(x, z, path[i - 1], path[i]) - 1.5,
      );
  }
  const wetFade = smooth(0, 5, wetDistance);
  const coastFade =
    1 - smooth(WORLD_RADIUS - 7, WORLD_RADIUS - 1, Math.hypot(x, z));
  const hills =
    1.8 +
    1.1 * Math.sin(x / 13) * Math.cos(z / 17) +
    0.7 * Math.sin((x + z) / 8);
  return Math.max(
    -1.2,
    0.65 +
      hills * wetFade * coastFade +
      (land ? landFieldAt(land, x, z, "elevation") : 0) * coastFade,
  );
}
