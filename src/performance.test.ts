import { World, perceptionInterval } from "./sim.ts";
import { encodeSave, decodeSave } from "./save.ts";
import {
  landAt,
  initialLandscape,
  LAND_SIDE,
  LAND_MIN,
  LAND_STEP,
} from "./terrain.ts";
function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
const w = new World(91);
w.animals = [];
w.plants = [];
const a = w.addAnimal("grazer", undefined, "mouse");
a.state = "Resting";
assert(perceptionInterval(a) === 0.5, "Resting animals sense every fifth tick");
a.state = "Sprinting";
assert(perceptionInterval(a) === 0.1, "Chases sense every tick");
a.species = "turtle";
a.state = "Exploring";
assert(perceptionInterval(a) === 0.5, "Turtles use a slower cycle");
a.species = "mouse";
Object.assign(a, {
  x: -30,
  z: 10,
  energy: 110,
  hydration: 100,
  age: 40,
  state: "Resting",
});
w.step(0.1);
const next = a.nextSenseAt,
  age = a.age;
w.step(0.1);
assert(
  a.nextSenseAt === next && a.age > age,
  "Sensing sleeps while body time continues",
);
const cat = w.addAnimal("hunter", undefined, "cat");
Object.assign(cat, {
  x: a.x + 0.8,
  z: a.z,
  energy: 40,
  stamina: 100,
  restTimer: 0,
  mealEnergy: 0,
  age: 80,
});
w.step(0.1);
assert(
  a.sensedThreat === cat.id,
  "Nearby predators interrupt a sleeping perception cycle",
);
const restored = decodeSave(
  encodeSave({ world: w, rate: 1, paused: true, selected: a.id }),
).world;
for (let i = 0; i < 50; i++) {
  w.step(0.1);
  restored.step(0.1);
}
assert(
  JSON.stringify(w) === JSON.stringify(restored),
  "Scheduled perception resumes deterministically after saving",
);
// Optimized sampling agrees with the original bilinear algorithm.
const cells = initialLandscape();
for (let i = 0; i < 100; i++) {
  const x = -69 + i * 1.38,
    z = Math.sin(i) * 69;
  const gx = Math.max(
    0,
    Math.min(LAND_SIDE - 1.001, (x - LAND_MIN) / LAND_STEP),
  );
  const gz = Math.max(
    0,
    Math.min(LAND_SIDE - 1.001, (z - LAND_MIN) / LAND_STEP),
  );
  const ix = Math.floor(gx),
    iz = Math.floor(gz),
    tx = gx - ix,
    tz = gz - iz;
  const sampled = landAt(cells, x, z);
  for (const key of Object.keys(sampled) as (keyof typeof sampled)[]) {
    let expected = 0;
    for (const [dx, dz, weight] of [
      [0, 0, (1 - tx) * (1 - tz)],
      [1, 0, tx * (1 - tz)],
      [0, 1, (1 - tx) * tz],
      [1, 1, tx * tz],
    ])
      expected += (cells[(iz + dz) * LAND_SIDE + ix + dx][key] ?? 0) * weight;
    assert(
      Math.abs((sampled[key] ?? 0) - expected) < 1e-12,
      "Terrain interpolation is preserved",
    );
  }
}
console.log(
  "Adaptive sensing, urgent wakeups, continuous ageing, saved schedules and terrain sampling passed",
);

const weatherWorld = new World(19);
weatherWorld.animals = [];
weatherWorld.plants = [];
weatherWorld.seedBank = [];
const initialCloud = weatherWorld.weather.cloud;
weatherWorld.step(0.4);
assert(
  weatherWorld.weather.cloud === initialCloud,
  "Slow weather waits for the one-second gate",
);
const savedWeather = decodeSave(
  encodeSave({ world: weatherWorld, rate: 1, paused: true, selected: 0 }),
).world;
weatherWorld.step(0.6);
savedWeather.step(0.6);
assert(
  weatherWorld.weather.cloud !== initialCloud,
  "Weather advances at its gate",
);
assert(
  JSON.stringify(weatherWorld) === JSON.stringify(savedWeather),
  "Partial weather intervals survive saving",
);
console.log(
  "One-second weather and water gates preserve elapsed time and save continuity",
);
