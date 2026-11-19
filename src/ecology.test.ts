import { World } from "./sim.ts";
import {
  climate,
  camouflage,
  detectionRange,
  eyesightCost,
  stepWater,
  initialPonds,
} from "./ecology.ts";
import { encodeSave, decodeSave } from "./save.ts";
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const world = new World(17),
  predator = world.animals.find((a) => a.species === "cat")!,
  prey = world.animals.find((a) => a.species === "bug")!;
const grass = { hue: 0.23, pattern: 0.25, cover: 0.2, name: "Grassland", sand: false };
prey.genes.hue = -0.06;
prey.genes.markings = 0.25;
const matched = camouflage(prey, grass);
prey.genes.hue = 0.18;
assert(
  matched > camouflage(prey, grass),
  "Matching colour improves camouflage",
);
prey.genes.hue = -0.06;
prey.genes.markings = 0.9;
assert(
  matched > camouflage(prey, grass),
  "Matching markings improve camouflage",
);
predator.genes.eyesight = 0.5;
const poor = detectionRange(predator, prey, grass, 1);
predator.genes.eyesight = 2.2;
const sharp = detectionRange(predator, prey, grass, 1);
assert(
  sharp > poor && eyesightCost(2.2) > eyesightCost(0.5),
  "Better vision spots prey farther away and costs more",
);
assert(
  detectionRange(predator, prey, grass, 0.1) < sharp,
  "Night reduces visibility",
);
assert(
  detectionRange(predator, prey, grass, 1, true) < sharp,
  "Dens conceal their occupants",
);
const scorpion = world.animals.find(a => a.species === "scorpion")!;
const scouter = { ...scorpion, genes: { ...scorpion.genes, sense: 8, eyesight: 0.5 } };
const runner = { ...prey, state: "Fleeing" as const, altitude: 0 };
assert(detectionRange(scouter, runner, grass, 0) === 5, "Scorpions sense moving ground prey in darkness");
assert(detectionRange(scouter, { ...runner, state: "Sleeping" }, grass, 0) < 5 &&
  detectionRange(scouter, runner, grass, 0, true) < 5, "Resting and sheltered prey retain concealment");
const weather = { moisture: 0.7, cloud: 0.4, raining: false },
  ponds = initialPonds();
let rained = false,
  refilled = false,
  evaporated = false;
for (let i = 0; i < 6000; i++) {
  const before = ponds[0].water;
  stepWater(i * 0.1, 0.1, weather, ponds);
  rained ||= weather.raining;
  refilled ||= ponds[0].water > before;
  evaporated ||= ponds[0].water < before;
  assert(
    ponds.every((p) => p.water >= 0 && p.water <= 1) &&
      weather.moisture >= 0 &&
      weather.moisture <= 1,
    "Water quantities stay bounded",
  );
}
assert(
  rained && refilled && evaporated,
  "Evaporation leads to clouds and rain refills ponds",
);
assert(
  climate(0, weather).sunlight > climate(90, weather).sunlight,
  "Day and night vary with simulation time",
);
const homeWorld = new World(9);
homeWorld.plants = [];
homeWorld.animals = [homeWorld.animals.find((a) => a.species === "mouse")!];
homeWorld.time = 90;
const builder = homeWorld.animals[0];
builder.x = builder.z = 0;
builder.age = 20;
builder.energy = 100;
builder.cooldown = 1000;
builder.genes.activity = 0.2;
builder.genes.digging = 1.8;
homeWorld.time = 120 - (builder.id % 40);
let sheltered = false;
for (let i = 0; i < 400; i++) {
  homeWorld.step(0.1);
  sheltered ||= builder.state === "Sheltering";
}
assert(
  homeWorld.dens.length === 1 && homeWorld.dens[0].progress === 1 && sheltered,
  "Exposed ground animals spend time digging and use completed dens",
);
assert(builder.energy < 100, "Den construction and survival cost energy");
const child = homeWorld.addAnimal(builder.kind, builder);
assert(child.home === builder.home, "Offspring share their parent’s home");
builder.hydration = 10;
builder.x =
  homeWorld.ponds[0].x +
  homeWorld.ponds[0].radius * Math.sqrt(homeWorld.ponds[0].water) * 1.15 +
  0.3;
builder.z = homeWorld.ponds[0].z;
homeWorld.step(0.1);
assert(
  String(builder.state) === "Drinking" && builder.hydration > 10,
  "Thirsty animals drink freshwater",
);
const raw = encodeSave({
  world: homeWorld,
  rate: 1,
  paused: true,
  selected: builder.id,
});
const saved = decodeSave(raw);
assert(
  JSON.stringify(saved.world) === JSON.stringify(homeWorld),
  "Weather, water, dens and hydration persist exactly",
);
const legacy = JSON.parse(raw);
legacy.version = 3;
delete legacy.world.weather;
delete legacy.world.ponds;
delete legacy.world.dens;
for (const a of legacy.world.animals) {
  delete a.home;
  delete a.hydration;
  delete a.genes.eyesight;
  delete a.genes.digging;
}
const upgraded = decodeSave(JSON.stringify(legacy));
assert(
  upgraded.world.animals.every(
    (a) => a.hydration === 90 && a.genes.eyesight === 1,
  ) && upgraded.world.ponds.length === 3,
  "Old saves gain neutral survival defaults",
);
console.log(
  "Camouflage, eyesight trade-offs, daylight, water cycle, den building, drinking and save migration passed",
);

const { regionalClimate } = await import("./ecology.ts");
const { regionWeights, localTemperature } = await import("./terrain.ts");
for (let x = -40; x < 40; x += 0.5) {
  const w = regionWeights(x, 0);
  assert(
    Math.abs(w.forest + w.plains + w.desert - 1) < 1e-9,
    "Biome weights sum to one",
  );
  assert(
    Math.abs(localTemperature(20, x, 0) - localTemperature(20, x + 0.01, 0)) <
      0.05,
    "Temperature changes smoothly",
  );
}
const regionalWeather = { moisture: 0.7, cloud: 0.6, raining: false };
assert(
  regionalClimate(0, regionalWeather, -25, 0).moisture >
    regionalClimate(0, regionalWeather, 30, -15).moisture,
  "Forest retains more moisture than desert",
);
let differentRain = false;
for (let t = 0; t < 1000; t += 10) {
  const forest = regionalClimate(t, regionalWeather, -25, 0),
    desert = regionalClimate(t, regionalWeather, 30, -15);
  if (forest.rain > 0.2 !== desert.rain > 0.2) differentRain = true;
}
assert(differentRain, "Rain can affect one region while another remains dry");
console.log("Smooth biome transitions and regional weather passed");
