import { World } from "./sim.ts";
import { initialPonds, waterDepth, stepWater } from "./ecology.ts";
import {
  riverX,
  riverDepthAt,
  riverWidthAt,
  SPILLWAYS,
  RIVER_MAX,
  WORLD_RADIUS,
  landAt,
} from "./terrain.ts";
import { encodeSave, decodeSave } from "./save.ts";
function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
const ponds = initialPonds();
assert(waterDepth(ponds, riverX(10), 10) > 0.25, "The river is real water");
assert(
  riverDepthAt(0, ponds) < riverDepthAt(10, ponds) &&
    riverWidthAt(0, ponds) < riverWidthAt(10, ponds),
  "Fords are shallower and narrower",
);
assert(
  Math.abs(Math.hypot(riverX(RIVER_MAX), RIVER_MAX) - WORLD_RADIUS) < 0.01,
  "The river reaches the island edge",
);
const middle = SPILLWAYS[2][8];
assert(
  waterDepth(ponds, middle.x, middle.z) === 0,
  "An inactive outlet is dry land",
);
ponds[2].flow = 1;
assert(
  waterDepth(ponds, middle.x, middle.z) > 0.2,
  "An overflowing lake connects to the river with physical water",
);
const wet = initialPonds(),
  dry = initialPonds();
wet[0].water = 1;
dry[0].water = 0.2;
const weather = { moisture: 0.7, cloud: 0.2, raining: false };
for (let i = 0; i < 200; i++) stepWater(i * 0.1, 0.1, weather, wet);
assert(
  wet[0].flow > 0 && wet[0].water < 1,
  "Full lakes discharge and lose water",
);
dry[0].flow = 1;
for (let i = 0; i < 600; i++)
  stepWater(i * 0.1, 0.1, { moisture: 0, cloud: 0, raining: false }, dry);
assert(dry[0].flow < 0.15, "Channels dry gradually as lake levels fall");
const world = new World(5);
world.animals = [];
world.plants = [];
const a = world.addAnimal("grazer", undefined, "mouse");
a.x = riverX(10) - 3;
a.z = 10;
a.energy = 60;
a.hydration = 100;
a.stamina = 100;
a.age = 40;
a.genes.sense = 14;
a.genes.swimming = 0.1;
a.genes.preferredMoisture = landAt(world.weather.land, a.x, a.z).moisture;
const food = world.addPlant(undefined, riverX(10) + 4, 10, "grass")!;
Object.assign(food, { age: 10, seedFood: 3 });
world.step(0.1);
assert(
  a.crossingZ !== null &&
    riverDepthAt(a.crossingZ, world.ponds) < riverDepthAt(10, world.ponds),
  "A weak swimmer selects a shallow crossing to reach food",
);
let crossedWet = false;
for (let i = 0; i < 300; i++) {
  world.step(0.1);
  crossedWet ||= a.wetness > 0;
}
assert(
  crossedWet && a.x > riverX(a.z) && a.crossingZ === null,
  "An animal actually completes its ford crossing",
);
const wetAfterCrossing = a.wetness;
for (let i = 0; i < 100; i++) world.step(0.1);
assert(a.wetness < wetAfterCrossing, "Wet animals dry after leaving water");
a.crossingZ = 0;
a.crossingSide = 1;
a.z = a.crossingZ;
a.x = riverX(a.z);
world.step(0.1);
assert(a.wetness > 0, "Crossing wets a terrestrial animal");
const raw = encodeSave({ world, rate: 1, paused: true, selected: a.id });
assert(
  JSON.stringify(decodeSave(raw).world) === JSON.stringify(world),
  "Outlet flow, wetness and crossing plans persist",
);
console.log(
  "River water, fords, island-edge flow, lake outlets, drying, crossing selection and save persistence passed",
);
