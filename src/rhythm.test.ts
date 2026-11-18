import { World, type Species, perceptionInterval } from "./sim.ts";
import { dailyRhythm, rhythmDefaults, phaseDelta } from "./rhythm.ts";
import { traitChanges, renderAnimalInspector } from "./inspector.ts";
import { encodeSave, decodeSave } from "./save.ts";
function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
assert(
  dailyRhythm(rhythmDefaults("bird"), 9).active &&
    !dailyRhythm(rhythmDefaults("bird"), 99).active,
  "Bird founders prefer day",
);
assert(
  !dailyRhythm(rhythmDefaults("mouse"), 9).active &&
    dailyRhythm(rhythmDefaults("mouse"), 99).active,
  "Mouse founders prefer night",
);
assert(
  dailyRhythm(rhythmDefaults("cat"), 54).active &&
    dailyRhythm(rhythmDefaults("cat"), 144).active,
  "Cats favour both twilight periods",
);
function setup(species: Species = "mouse") {
  const w = new World(81);
  w.animals = [];
  w.plants = [];
  w.eggs = [];
  w.seedBank = [];
  w.dens = [];
  w.time = 9;
  const a = w.addAnimal("grazer", undefined, species);
  a.x = -30;
  a.z = 25;
  a.age = 100;
  a.energy = 100;
  a.hydration = 100;
  a.stamina = 50;
  a.altitude = 0;
  Object.assign(a.genes, {
    activityPhase: 0.75,
    twilightBias: 0,
    activeFraction: 0.5,
  });
  w.weather.cloud = 0;
  return { w, a };
}
const { w, a } = setup();
const x = a.x,
  z = a.z;
w.step(0.1);
assert(
  a.state === "Sleeping" && a.x === x && a.z === z && a.stamina > 50,
  "An inactive, safe animal sleeps without moving and recovers stamina",
);
assert(perceptionInterval(a) === 0.5, "Sleep uses slower scheduled perception");
const encoded = encodeSave({
  world: w,
  rate: 1,
  paused: false,
  selected: a.id,
});
const loaded = decodeSave(encoded);
w.step(0.1);
loaded.world.step(0.1);
assert(
  JSON.stringify(w) === JSON.stringify(loaded.world),
  "Sleeping state and rhythm continue identically after reload",
);
a.energy = 45;
w.addPlant(undefined, a.x, a.z, "grass");
w.step(0.1);
assert(String(a.state) !== "Sleeping", "Hunger wakes a sleeping animal");
const danger = setup();
danger.w.step(0.1);
danger.a.nextSenseAt = danger.w.time + 100;
const cat = danger.w.addAnimal("hunter", undefined, "cat");
cat.x = danger.a.x + 1;
cat.z = danger.a.z;
cat.energy = 30;
cat.stamina = 100;
cat.restTimer = 0;
danger.w.step(0.1);
assert(
  danger.a.state !== "Sleeping" && danger.a.state === "Fleeing",
  "Nearby predator wakes a sleeper before its next scheduled scan",
);
const thirsty = setup();
thirsty.w.step(0.1);
thirsty.a.hydration = 20;
thirsty.w.step(0.1);
assert(
  thirsty.a.state !== "Sleeping" &&
    ["Seeking water", "Drinking"].includes(thirsty.a.state),
  "Thirst overrides sleep",
);
const daytime = setup();
daytime.w.step(0.1);
daytime.w.time = 99;
daytime.w.step(0.1);
assert(
  daytime.a.state !== "Sleeping",
  "The active window ends scheduled sleep",
);
const birds = setup("bird");
birds.a.altitude = 3;
for (let i = 0; i < 20; i++) birds.w.step(0.1);
assert(
  birds.a.state === "Sleeping" && birds.a.altitude === 0,
  "Birds land before sleeping",
);
const parent = setup();
const before = JSON.stringify(parent.a.genes);
const baby = parent.w.addAnimal("grazer", parent.a);
assert(
  JSON.stringify(parent.a.genes) === before &&
    Math.abs(
      phaseDelta(baby.genes.activityPhase, parent.a.genes.activityPhase),
    ) <= 0.0351,
  "Rhythm mutation is bounded and does not alter the parent",
);
assert(
  baby.genes.activeFraction >= 0.35 && baby.genes.activeFraction <= 0.8,
  "Inherited active windows stay bounded",
);
assert(
  traitChanges(baby.genes, parent.a.genes).some(
    (r) => r.key === "activityPhase",
  ),
  "Inspector includes inherited rhythm differences",
);
const wrap = parent.w.mutate({ ...parent.a.genes, activityPhase: 0.99 });
assert(
  wrap.activityPhase >= 0 && wrap.activityPhase < 1,
  "Phase mutations wrap around the daily clock",
);
parent.w.layClutch(parent.w.addAnimal("grazer", undefined, "bird"), 3);
parent.w.deceased.push({ ...parent.a, id: parent.w.nextId++, energy: 0 });
const legacy = JSON.parse(
  encodeSave({ world: parent.w, rate: 1, paused: true, selected: 0 }),
);
legacy.version = 22;
for (const item of [
  ...legacy.world.animals,
  ...legacy.world.deceased,
  ...legacy.world.eggs.map((e: any) => e.embryo),
]) {
  delete item.genes.activityPhase;
  delete item.genes.twilightBias;
  delete item.genes.activeFraction;
}
const migrated = decodeSave(JSON.stringify(legacy)).world;
for (const item of [
  ...migrated.animals,
  ...migrated.deceased,
  ...migrated.eggs.map((e) => e.embryo),
])
  assert(
    Number.isFinite(item.genes.activityPhase),
    "All saved animal generations migrate",
  );
const broken = JSON.parse(encoded);
broken.world.animals[0].genes.activeFraction = 2;
let rejected = false;
try {
  decodeSave(JSON.stringify(broken));
} catch {
  rejected = true;
}
assert(rejected, "Invalid rhythm genes are rejected");
// Minimal inspector adapter verifies the compact summary without a browser dependency.
const fragments = new Map<string, { innerHTML: string }>();
const panel = {
  dataset: { animal: String(a.id) },
  querySelector: (id: string) => {
    if (!fragments.has(id)) fragments.set(id, { innerHTML: "" });
    return fragments.get(id)!;
  },
};
a.state = "Sleeping";
renderAnimalInspector(panel as unknown as HTMLElement, a, w, true, true);
assert(
  fragments.get("#animal-summary")!.innerHTML.includes("Asleep") &&
    fragments.get("#animal-summary")!.innerHTML.includes("Mostly nighttime"),
  "Compact inspector clearly shows sleep and daily rhythm",
);
console.log(
  "Species rhythms, inheritance, sleep recovery, hunger/thirst/danger wakeups, landing, inspector and save migration passed",
);

const fish = setup("fish");
fish.a.x = fish.w.ponds[0].x;
fish.a.z = fish.w.ponds[0].z;
fish.a.wetness = 1;
fish.w.step(0.1);
assert(
  fish.a.state === "Sleeping",
  "Aquatic animals can sleep in water despite wetness",
);
