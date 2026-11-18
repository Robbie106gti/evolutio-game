import { readFileSync } from "node:fs";
import { decodeSave } from "../src/save.ts";
import { waterDepth, surfaceDepth } from "../src/ecology.ts";
import { aquatic } from "../src/biology.ts";
const w = decodeSave(
  readFileSync("reports/water-mice-check.json", "utf8"),
).world;
const mice = w.animals.filter((a) => a.species === "mouse");
const rows = mice.map((a) => ({
  id: a.id,
  depth: waterDepth(w.ponds, a.x, a.z, w.weather.land),
  surface: surfaceDepth(w.weather.land, a.x, a.z),
  swimming: a.genes.swimming,
  wetness: a.wetness,
  oxygen: a.oxygen,
  state: a.state,
  aquatic: aquatic(a.species),
}));
console.log(
  JSON.stringify(
    {
      mice: mice.length,
      visiblyWet: rows.filter((a) => a.depth > 0.025).length,
      deep: rows.filter((a) => a.depth > 0.25).length,
      maxDepth: Math.max(...rows.map((a) => a.depth)),
      swimmingMean: rows.reduce((s, a) => s + a.swimming, 0) / rows.length,
      wetExamples: rows
        .filter((a) => a.depth > 0.025)
        .sort((a, b) => b.depth - a.depth)
        .slice(0, 6),
    },
    null,
    2,
  ),
);
