import { Color } from "three";
import type { Genes } from "./model.ts";
// Shared by the 3D mouse and its journal portrait. No lineage-ID cosmetics.
export function mouseAppearance(g: Genes) {
  return {
    coat: new Color().setHSL((0.09 + g.hue + 1) % 1, 0.38, g.furShade),
    ear: g.earSize * (1.12 - g.insulation * 0.22),
    tail: g.tailLength,
    patch: g.patternScale,
    patches: Math.floor(g.markings * 5),
  };
}
