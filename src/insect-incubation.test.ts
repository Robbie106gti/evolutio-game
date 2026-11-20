import { landAt, landIndex } from "./terrain.ts";
import { decodeSave, encodeSave } from "./save.ts";
import { SPECIES, World } from "./sim.ts";
import { insectEggCanDevelop } from "./insect-incubation.ts";
import { initialPonds, waterDepth } from "./ecology.ts";
import { stepReproduction } from "./reproduction.ts";
import { eggSummary } from "./egg-summary.ts";

function check(ok: unknown, message: string) {
  if (!ok) throw new Error(message);
}
const pond = new World(39);
pond.animals = [];
const mosquito = pond.addAnimal("grazer", undefined, "mosquito");
Object.assign(mosquito, { x: -28, z: 28 });
pond.ponds = [];
for (const x of [-20, -36]) pond.weather.land![landIndex(x, 28)].surfaceWater = 0.08;
pond.random = () => 0;
pond.layClutch(mosquito, 12);
check(
  pond.eggs.length === 12 &&
    pond.eggs.every(({ embryo }) => {
      const depth = waterDepth(
        pond.ponds,
        embryo.x,
        embryo.z,
        pond.weather.land,
      );
      return depth >= 0.025 && depth <= 0.65;
    }),
  "Mosquitoes select nearby shallow water for their clutch when available",
);
const patches = new Set(pond.eggs.map(({ embryo }) => landIndex(embryo.x, embryo.z)));
check(patches.size >= 2, "Mosquito eggs are distributed across shallow nursery patches");

const dryIsland = new World(39);
dryIsland.animals = [];
dryIsland.ponds = [];
for (const cell of dryIsland.weather.land!) cell.moisture = 0;
const bug = dryIsland.addAnimal("grazer", undefined, "bug");
Object.assign(bug, { x: -28, z: 28 });
dryIsland.random = () => 0;
check(!dryIsland.layClutch(bug, 6) && dryIsland.eggsLaid === 0 && dryIsland.eggsLost === 0,
  "Bugs wait to lay when nearby soil is dry");
const mate = dryIsland.addAnimal("grazer", undefined, "bug");
Object.assign(bug, { sex: "female", energy: 60, reproductive: { mate: mate.id, due: 0 } });
stepReproduction(dryIsland, () => 0);
check(bug.energy === 60 && bug.reproductive?.mate === mate.id,
  "Unsuitable soil postpones a mated clutch without charging the laying cost");
const moistPatch = landIndex(-20, 28);
dryIsland.weather.land![moistPatch].moisture = 0.6;
check(dryIsland.layClutch(bug, 6) && dryIsland.eggs.length === 6 &&
  dryIsland.eggs.every(({ embryo }) => landAt(dryIsland.weather.land, embryo.x, embryo.z).moisture >= 0.22 &&
    waterDepth(dryIsland.ponds, embryo.x, embryo.z, dryIsland.weather.land) <= 0.1),
  "A bug clutch finds moist soil even when the parent is on dry ground");
stepReproduction(dryIsland, () => 0);
check(!bug.reproductive?.mate && dryIsland.eggs.some(e => e.embryo.otherParent === mate.id),
  "The postponed clutch retains both parents once the soil is suitable");
const bugs = (world: World) => eggSummary(world).find(row => row.species === "bug")!;
const bugEggsLaid = 6 + SPECIES.bug.clutchSize;
const initialBrood = bugs(dryIsland);
check(initialBrood.laid === bugEggsLaid && initialBrood.developing > 0 &&
  initialBrood.developing + initialBrood.waiting === dryIsland.eggs.length,
  "The journal counts eggs laid and separates developing eggs from eggs waiting for wetter soil");
dryIsland.weather.land![moistPatch].moisture = 0;
check(bugs(dryIsland).developing === 0 && bugs(dryIsland).waiting === dryIsland.eggs.length,
  "Drying changes the same live eggs from developing to waiting");
dryIsland.ponds = initialPonds();
const journalSave = encodeSave({ world: dryIsland, rate: 1, paused: true, selected: 0 });
check(bugs(decodeSave(journalSave).world).laid === bugEggsLaid, "Egg counts survive a save and reload");
const older = JSON.parse(journalSave);
delete older.world.eggsLaidBySpecies;
const oldRow = bugs(decodeSave(JSON.stringify(older)).world);
check(oldRow.laid === 0 && oldRow.waiting === dryIsland.eggs.length,
  "Older saves keep their current egg breakdown and start laid counts at zero");

for (const species of ["bug", "fly", "mosquito"] as const) {
  const world = new World(39);
  world.animals = [];
  world.plants = [];
  const embryo = world.addAnimal("grazer", undefined, species, true);
  world.animals.pop();
  Object.assign(embryo, { x: -28, z: 28 });
  const egg = {
    embryo,
    age: 11.95,
    duration: 12,
    health: 100,
    concealment: 0,
    buried: false,
  };
  world.eggs = [egg];
  const site = landIndex(embryo.x, embryo.z);
  world.random = () => 0;
  for (let i = 0; i < 200; i++) {
    Object.assign(world.weather.land![site], {
      moisture: 0.05,
      litter: 0,
      surfaceWater: 0,
    });
    world.step(0.1);
  }
  check(
    world.eggs.length === 1 &&
      world.births === 0 &&
      egg.age === 11.95 &&
      egg.health > 99,
    `${species} eggs wait through dry weather`,
  );

  const restored = decodeSave(
    encodeSave({ world, rate: 1, paused: true, selected: 0 }),
  ).world;
  check(
    restored.eggs[0]?.age === egg.age,
    "Incubation progress survives a save and reload",
  );
  const wetSoil = restored.weather.land![site];
  Object.assign(wetSoil, {
    moisture: 0.8,
    litter: 0.3,
    surfaceWater: species === "mosquito" ? 0.08 : 0,
  });
  restored.random = () => 0;
  restored.step(0.1);
  check(
    restored.births === 1 &&
      restored.eggs.length === 0 &&
      restored.eggsLost === 0,
    `${species} eggs hatch after conditions improve, even without adults`,
  );
}
const nursery = new World(39);
nursery.animals = [];
nursery.plants = [];
for (let i = 0; i < 24; i++) {
  const embryo = nursery.addAnimal("grazer", undefined, "fly", true);
  nursery.animals.pop();
  Object.assign(embryo, { x: -28, z: 28 });
  nursery.eggs.push({
    embryo,
    age: 0,
    duration: 12,
    health: 100,
    concealment: 0,
    buried: false,
  });
}
Object.assign(nursery.weather.land![landIndex(-28, 28)], {
  moisture: 0.8,
  litter: 0.3,
});
const single = decodeSave(
  encodeSave({ world: nursery, rate: 1, paused: true, selected: 0 }),
).world;
single.eggs = single.eggs.slice(0, 1);
single.step(0.1);
nursery.step(0.1);
check(
  nursery.eggs[0].age > 0 && nursery.eggs[0].age < single.eggs[0].age,
  "Crowded clutches take longer to develop than isolated eggs",
);
console.log(
  "Dry insect eggs wait, retain progress through saves, and hatch in their habitat",
);
check(!insectEggCanDevelop("fly", 7, 0, 0.6, 0.2) &&
  insectEggCanDevelop("fly", 16, 0, 0.6, 0.2),
  "Flies wait through cool weather, then resume in damp litter");
check(!insectEggCanDevelop("bug", 20, 0, 0.24, 0.1) &&
  insectEggCanDevelop("bug", 20, 0, 0.4, 0.1),
  "Bug eggs wait for a wetter spell");
