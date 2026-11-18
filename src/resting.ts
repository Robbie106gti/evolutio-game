import { plantLifeVisuals } from "./state-visuals.ts";
import { plantAppearance } from "./appearance.ts";
import { type Plant } from "./model.ts";
import { terrainHeight, type LandCell } from "./terrain.ts";
// Match the growing tree's visual scale; branch nests sit just outside the foliage.
export function treeRestSite(tree: Plant, birdId: number, land?: LandCell[]) {
  const life = plantLifeVisuals(tree);
  const size = life.size;
  const angle = birdId * 2.399;
  const reach =
    (tree.variety === 2 ? 3.05 : tree.variety === 1 ? 2.8 : 1.5) *
    size *
    plantAppearance(tree).crown *
    life.foliage;
  const x = tree.x + Math.cos(angle) * reach;
  const z = tree.z + Math.sin(angle) * reach;
  const height =
    (tree.variety === 2 ? 3.6 : 3.2) * size * (0.85 + tree.defense * 0.4);
  return {
    x,
    z,
    altitude: Math.max(
      0.6,
      Math.min(
        4.8,
        terrainHeight(tree.x, tree.z, land) +
          height -
          terrainHeight(x, z, land),
      ),
    ),
  };
}
export function safeDenRoute(
  from: { x: number; z: number },
  to: { x: number; z: number },
  depthAt: (x: number, z: number) => number,
) {
  if (depthAt(to.x, to.z) >= 0.1) return false;
  for (let i = 1; i <= 6; i++) {
    const t = i / 6;
    if (
      depthAt(from.x + (to.x - from.x) * t, from.z + (to.z - from.z) * t) > 0.25
    )
      return false;
  }
  return true;
}
