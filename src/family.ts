import { type Animal } from "./model.ts";
import { type World } from "./sim.ts";

export function selectedFamily(
  world: Pick<World, "animals" | "deceased">,
  id: number,
) {
  const selected =
    world.animals.find((a) => a.id === id) ??
    world.deceased.find((a) => a.id === id);
  return {
    selected,
    living: world.animals.find((a) => a.id === id),
    parent: selected
      ? world.animals.find((a) => a.id === selected.parent)
      : undefined,
    children: selected
      ? world.animals
          .filter((a) => a.parent === selected.id)
          .sort((a, b) => b.id - a.id)
      : [],
  };
}
export function followShift(
  target: { x: number; y: number; z: number },
  animal: Pick<Animal, "x" | "z"> & { altitude?: number },
  dt: number,
) {
  const blend = 1 - Math.exp(-6 * Math.max(0, Math.min(dt, 0.1)));
  return {
    x: (animal.x - target.x) * blend,
    y: ((animal.altitude ?? 0) - target.y) * blend,
    z: (animal.z - target.z) * blend,
  };
}
