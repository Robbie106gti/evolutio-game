import { World } from "./sim.ts";
import { FIRST_GROVE } from "./levels.ts";
import { mouseAppearance } from "./mouse-appearance.ts";
import { decodeSave, encodeSave } from "./save.ts";
function check(value: unknown, message: string) {
  if (!value) throw new Error(message);
}
const world = new World(124, FIRST_GROVE),
  parent = world.animals[0];
Object.assign(parent.genes, {
  earSize: 1.4,
  tailLength: 1.45,
  furShade: 0.27,
  patternScale: 1.4,
  markings: 0.85,
});
const baby = world.addAnimal(parent.kind, parent, "mouse");
for (const [key, limit] of [
  ["earSize", 0.035],
  ["tailLength", 0.04],
  ["furShade", 0.015],
  ["patternScale", 0.035],
  ["markings", 0.035],
] as const)
  check(
    Math.abs(parent.genes[key] - baby.genes[key]) <= limit + 1e-9,
    `Small inherited mutation: ${key}`,
  );
const look = mouseAppearance(parent.genes),
  smaller = mouseAppearance({
    ...parent.genes,
    earSize: 0.55,
    tailLength: 0.5,
    furShade: 0.68,
    patternScale: 0.6,
  });
check(
  look.ear > smaller.ear &&
    look.tail > smaller.tail &&
    look.patch > smaller.patch,
  "Silhouette and patch size follow genes",
);
check(
  look.coat.getHex() !== smaller.coat.getHex(),
  "Fur lightness changes colour",
);
const saved = encodeSave({ world, paused: true, selected: 0, rate: 1 });
check(
  decodeSave(saved).world.animals.at(-1)!.genes.tailLength ===
    baby.genes.tailLength,
  "Baby appearance persists",
);
const legacy = JSON.parse(saved);
legacy.version = 33;
for (const a of legacy.world.animals)
  for (const key of ["earSize", "tailLength", "furShade", "patternScale"])
    delete a.genes[key];
const migrated = decodeSave(JSON.stringify(legacy)).world;
check(
  migrated.seed === world.seed &&
    migrated.animals.length === world.animals.length,
  "Migration preserves population and RNG",
);
check(
  Number.isFinite(migrated.animals[0].genes.furShade),
  "Older saves receive finite appearance traits",
);
const broken = JSON.parse(saved);
broken.world.animals[0].genes.earSize = 500;
let rejected = false;
try {
  decodeSave(JSON.stringify(broken));
} catch {
  rejected = true;
}
check(rejected, "Invalid new traits rejected");
console.log(
  "Inherited mouse appearance, small mutations, colours and v33/v34 save compatibility passed",
);
