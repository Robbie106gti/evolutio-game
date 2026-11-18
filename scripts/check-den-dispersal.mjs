import { readFileSync } from "node:fs";
import { decodeSave } from "../reports/population-chart-candidate/src/save.ts";
import { reconcileDens } from "../reports/population-chart-candidate/src/nursery.ts";
const w = decodeSave(
  readFileSync("reports/post-approximate-island.json", "utf8"),
).world;
const count = () => w.animals.filter((a) => a.home === 4475).length;
const before = count();
reconcileDens(w.animals, w.dens, w.eggs);
console.log({
  before,
  after: count(),
  owner: w.dens.find((d) => d.id === 4475)?.owner,
});
