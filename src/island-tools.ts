import { type World } from "./sim.ts";
import { type PlantKind } from "./model.ts";
import { LAND_MIN, LAND_STEP, LAND_SIDE, WORLD_RADIUS } from "./terrain.ts";
export type IslandTool =
  | "inspect"
  | "water"
  | "sand"
  | "soil"
  | "plants"
  | "disease"
  | "fungus"
  | "raise"
  | "dig";
export function applyIslandTool(
  world: World,
  tool: IslandTool,
  x: number,
  z: number,
  radius: number,
  strength: number,
  remove: boolean,
  kind: PlantKind = "grass",
  variety = 0,
) {
  if (!world.level.tools.includes(tool))
    return "This tool is unavailable in this level.";
  if (Math.hypot(x, z) > WORLD_RADIUS - 2 || tool === "inspect")
    return "Choose a place on the island.";
  const clamp = (v: number, min = 0, max = 1) =>
    Math.max(min, Math.min(max, v));
  radius = clamp(radius, 3, 16);
  strength = clamp(strength, 0.1, 1);
  const amount = strength * (remove ? -1 : 1);
  world.weather.land = world.weather.land?.map((c, i) => {
    const distance = Math.hypot(
      LAND_MIN + (i % LAND_SIDE) * LAND_STEP - x,
      LAND_MIN + Math.floor(i / LAND_SIDE) * LAND_STEP - z,
    );
    const falloff = Math.max(0, 1 - distance / (radius + LAND_STEP * 0.6));
    if (!falloff) return c;
    const n = { ...c },
      v = amount * falloff;
    if (tool === "water") {
      n.moisture = clamp(n.moisture + v * 0.5);
      n.surfaceWater = Math.max(0, (n.surfaceWater ?? 0) + v * 0.6);
    }
    if (tool === "sand") {
      n.sand = clamp((n.sand ?? 0) + v * 0.6);
      n.grass = clamp(n.grass - v * 0.35, 0, 1 - n.forest);
      n.moisture = clamp(n.moisture - v * 0.15);
    }
    if (tool === "soil") {
      n.sand = clamp((n.sand ?? 0) - v * 0.6);
      n.litter = clamp(n.litter + v * 0.4);
      n.grass = clamp(n.grass + v * 0.3, 0, 1 - n.forest);
    }
    if (tool === "fungus" || tool === "disease")
      n.fungus = clamp(n.fungus + v * 0.5);
    if (tool === "raise" || tool === "dig")
      n.elevation = clamp(
        (n.elevation ?? 0) + v * (tool === "dig" ? -2 : 2),
        -5,
        7,
      );
    return n;
  });
  if (tool === "water")
    for (const p of world.ponds)
      if (Math.hypot(p.x - x, p.z - z) < radius + p.radius)
        p.water = clamp(p.water + amount * 0.25);
  if (tool === "disease")
    for (const a of [...world.animals, ...world.plants])
      if (Math.hypot(a.x - x, a.z - z) < radius)
        a.infection = clamp(a.infection + amount * 0.6);
  if (tool === "plants") {
    if (remove) {
      const old = world.plants.length;
      world.plants = world.plants.filter(
        (p) => p.kind !== kind || Math.hypot(p.x - x, p.z - z) > radius,
      );
      return `Removed ${old - world.plants.length} plants.`;
    }
    let added = 0;
    for (let i = 0; i < Math.ceil(strength * 18); i++) {
      const angle = world.range(0, Math.PI * 2),
        r = Math.sqrt(world.random()) * radius;
      const p = world.addPlant(
        undefined,
        x + Math.cos(angle) * r,
        z + Math.sin(angle) * r,
        kind,
        variety,
      );
      if (p) added++;
    }
    return added
      ? `Planted ${added}. Keep clicking to grow a patch.`
      : kind === "bush" && variety === 2
        ? "Try dry ground in the desert or along a sandy grassland edge."
        : "No planting space here. Try dry ground within the island.";
  }
  return tool === "water"
    ? "Added water flows downhill; low ground collects it. Nearby lake levels changed."
    : `${tool === "dig" ? "Lowered ground" : tool === "raise" ? "Raised ground" : tool === "disease" ? (remove ? "Reduced infection" : "Added infection") : tool === "fungus" ? "Changed the fungal patch" : "Changed the soil"}.`;
}
