import { recordApproach, recordBugStep } from "./bug-routes.ts";
import { canHunt } from "./biology.ts";
import { World, type Species, burstProfile, laysEggs } from "./sim.ts";
import { landAt, landIndex } from "./terrain.ts";
import { encodeSave, decodeSave } from "./save.ts";
function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
function setup(species: Species = "cat") {
  const world = new World(52);
  world.animals = [];
  world.plants = [];
  world.time = 0;
  const predator = world.addAnimal("hunter", undefined, species);
  predator.x = -30;
  predator.z = 25;
  predator.age = 30;
  predator.energy = 40;
  predator.hydration = 100;
  predator.cooldown = 1000;
  predator.genes.weights.fill(0);
  predator.genes.preferredMoisture = landAt(
    world.weather.land,
    -30,
    25,
  ).moisture;
  predator.genes.sense = 14;
  predator.genes.eyesight = 2;
  return { world, predator };
}
for (const species of ["cat", "fox", "wolf"] as const) {
  const { world, predator } = setup(species);
  predator.energy = 110;
  predator.stamina = 40;
  const x = predator.x,
    z = predator.z;
  for (let i = 0; i < 20; i++) world.step(0.1);
  assert(
    predator.x === x && predator.z === z && predator.stamina > 40,
    "Fed predators rest and recover stamina",
  );
  assert(
    predator.energy < 110 && predator.energy > 108,
    "Resting has a small nonzero energy cost",
  );
  assert(!laysEggs(species), "Mammalian predators have live young");
}
const { world, predator } = setup();
const prey = world.addAnimal("grazer", undefined, "mouse");
prey.x = -24;
prey.z = 25;
prey.age = 30;
prey.hydration = 100;
prey.cooldown = 1000;
prey.genes.speed = 0.5;
world.step(0.1);
assert(predator.state === "Stalking", "Hungry predators stalk distant prey");
prey.x = predator.x + 1;
prey.z = predator.z;
world.step(0.1);
assert(
  String(predator.state) === "Sprinting" && predator.stamina < 100,
  "Close prey triggers a stamina-consuming burst",
);
predator.stamina = 31;
prey.x = predator.x + 0.7;
prey.z = predator.z;
world.step(0.1);
assert(predator.restTimer > 0, "Exhaustion starts a recovery interval");
world.step(0.1);
assert(
  String(predator.state) === "Recovering",
  "Exhausted predators pause instead of endlessly sprinting",
);
const sting = setup("scorpion");
const caughtBug = sting.world.addAnimal("grazer", undefined, "bug");
Object.assign(caughtBug, { x: sting.predator.x + 0.3, z: sting.predator.z, age: 30, energy: 0.1 });
sting.world.step(0.1);
assert(caughtBug.killedBy === sting.predator.id && sting.predator.mealEnergy > 0, "Scorpion retains its kill");
assert(!sting.world.foodTotals.scorpion?.bug, "Sting damage does not also award a meal");
sting.world.step(0.1);
assert((sting.world.foodTotals.scorpion?.bug ?? 0) > 0, "Scorpion eats the retained catch before foraging for worms");
const lunge = setup("scorpion");
const distantBug = lunge.world.addAnimal("grazer", undefined, "bug");
Object.assign(distantBug, { x: lunge.predator.x + 2.6, z: lunge.predator.z, age: 30, energy: 40 });
const launchX = lunge.predator.x;
lunge.world.step(0.1);
assert(lunge.predator.state === "Sprinting" && lunge.predator.x > launchX &&
  !lunge.predator.nextStingAge && !distantBug.stungUntilAge,
  "Scorpion launches toward visible prey outside sting reach and must close the gap");
const missed = setup("scorpion");
const escaping = missed.world.addAnimal("grazer", undefined, "ant");
Object.assign(escaping, { x: missed.predator.x + 0.3, z: missed.predator.z, age: 30, energy: 40 });
missed.world.random = () => 0.99;
missed.world.step(0.1);
assert((missed.predator.nextStingAge ?? 0) > missed.predator.age &&
  escaping.energy > 39 && !escaping.stungUntilAge && !escaping.killedBy,
  "A missed sting leaves the ant mobile while the scorpion recovers");
const hunt = setup("fox");
const victim = hunt.world.addAnimal("grazer", undefined, "mouse");
victim.x = hunt.predator.x + 0.4;
victim.z = hunt.predator.z;
victim.energy = 0.1;
victim.age = 30;
const energy = hunt.predator.energy;
hunt.world.step(0.1);
assert(
  hunt.predator.mealEnergy > 0 && hunt.predator.energy < energy,
  "A kill creates food rather than instant attack energy",
);
const meal = hunt.predator.mealEnergy,
  before = hunt.predator.energy;
hunt.world.step(0.1);
assert(
  hunt.predator.mealEnergy < meal &&
    hunt.predator.mealEnergy > 0 &&
    hunt.predator.energy > before,
  "Eating a catch restores energy gradually",
);
assert(
  hunt.predator.state === "Feeding on catch",
  "Feeding is visible in the animal state",
);
const saved = encodeSave({
  world: hunt.world,
  paused: true,
  rate: 1,
  selected: hunt.predator.id,
});
assert(
  JSON.stringify(decodeSave(saved).world) === JSON.stringify(hunt.world),
  "Stamina, recovery and the catch survive save/load exactly",
);
const old = JSON.parse(saved);
old.version = 11;
for (const a of [...old.world.animals, ...old.world.deceased])
  for (const key of [
    "stamina",
    "restTimer",
    "mealEnergy",
    "mealX",
    "mealZ",
    "mealTime",
  ])
    delete a[key];
assert(
  decodeSave(JSON.stringify(old)).world.animals[0].stamina === 100,
  "Older saves receive safe predator defaults",
);
assert(
  burstProfile("cat")!.boost > burstProfile("wolf")!.boost &&
    burstProfile("cat")!.drain > burstProfile("wolf")!.drain,
  "Cats burst harder while wolves sustain longer chases",
);
console.log(
  "Rest, stalking, sprint stamina, recovery, finite meals, species differences and save migration passed",
);

const { maturityAge, lifespan, canReproduce } = await import("./sim.ts");
const histories = new World(8),
  bug = histories.animals.find((a) => a.species === "bug")!,
  turtle = histories.animals.find((a) => a.species === "turtle")!;
assert(
  maturityAge(bug) < maturityAge(turtle) && lifespan(bug) < lifespan(turtle),
  "Species have distinct life histories",
);
const family = setup("cat");
const parent = family.predator;
parent.energy = 110;
parent.cooldown = 0;
parent.age = maturityAge(parent) - 0.2;
family.world.step(0.1);
assert(family.world.births === 0, "Juveniles cannot reproduce");
parent.age = maturityAge(parent) + 0.1;
family.world.step(0.1);
assert(
  Number(family.world.births) === 1,
  "Mature well-fed adults can reproduce",
);
parent.age = lifespan(parent) * 0.9;
assert(
  !canReproduce(parent),
  "Reproductive aging ends fertility before maximum lifespan",
);
const oldLife = lifespan(parent);
parent.genes.longevity = 1.6;
assert(lifespan(parent) > oldLife, "Inherited longevity changes maximum age");
const child = family.world.animals.find((a) => a.parent === parent.id)!;
assert(
  child.genes.maturation !== parent.genes.maturation &&
    child.genes.endurance >= 0.6 &&
    child.genes.endurance <= 1.6,
  "Life history and endurance traits mutate in offspring",
);
const prior = JSON.parse(
  encodeSave({
    world: family.world,
    rate: 1,
    paused: true,
    selected: parent.id,
  }),
);
prior.version = 12;
for (const a of prior.world.animals) {
  delete a.genes.maturation;
  delete a.genes.longevity;
  delete a.genes.endurance;
}
const migrated = decodeSave(JSON.stringify(prior));
assert(
  migrated.world.animals.every(
    (a) => Number.isFinite(lifespan(a)) && a.genes.endurance === 1,
  ),
  "Old life histories migrate to finite species-appropriate defaults",
);
const thirsty = setup("mouse");
thirsty.predator.stamina = 0;
thirsty.predator.hydration = 5;
thirsty.predator.energy = 90;
const pond = thirsty.world.ponds[0];
thirsty.predator.x = pond.x + pond.radius * Math.sqrt(pond.water) * 1.15 + 0.3;
thirsty.predator.z = pond.z;
thirsty.world.step(0.1);
assert(
  thirsty.predator.state === "Drinking" && thirsty.predator.hydration > 5,
  "Urgent thirst overrides resting from fatigue",
);
console.log(
  "Species life histories, reproductive windows, evolving endurance and urgent body needs passed",
);
for (const species of ["spider", "scorpion"] as const) {
  const { world, predator } = setup(species);
  const bug = world.addAnimal("grazer", undefined, "bug");
  Object.assign(bug, { x: predator.x + 0.6, z: predator.z, age: 30, energy: 25, cooldown: 1000 });
  predator.state = "Waiting in ambush";
  predator.angle = Math.PI;
  for (let i = 0; i < 100; i++) world.step(0.1);
  assert(bug.killedBy === predator.id && (world.foodTotals[species]?.bug ?? 0) > 0,
    species + " should capture and feed on a passing bug");
}
const trap = setup("spider");
trap.world.carcasses.push({ id: trap.world.nextId++, x: trap.predator.x + 3, z: trap.predator.z, size: 1, decay: 0 });
trap.world.step(0.1);
assert(trap.predator.state === "Searching for prey", "Spider scouts a nearby edible carcass");
trap.predator.x = trap.world.carcasses[0].x;
trap.predator.z = trap.world.carcasses[0].z;
trap.world.step(0.1);
assert(String(trap.predator.state) === "Waiting in ambush", "Spider waits at insect food");
for (const species of ["bug", "mouse", "bird"] as const) {
  const { world, predator } = setup("spider");
  const visitor = world.addAnimal("grazer", undefined, species);
  Object.assign(visitor, { x: predator.x + 1, z: predator.z, age: 0, energy: 20, altitude: 0 });
  visitor.genes.size = 0.6;
  predator.genes.size = 1.4;
  predator.web = { x: visitor.x, z: visitor.z, expires: world.time + 45, prey: 0 };
  world.step(0.1);
  assert(!canHunt({ ...predator, id: predator.id + 10000 }, visitor) && canHunt(predator, visitor),
    "Only the web owner can take live trapped prey");
  assert(predator.web.prey === visitor.id && visitor.webHeldUntilAge! > visitor.age, "Small ground visitor sticks: " + species);
}
const patchTrap = setup("spider");
const patchX = patchTrap.predator.x + 1;
const patchZ = patchTrap.predator.z;
Object.assign(patchTrap.world.weather.land![landIndex(patchX, patchZ)], {
  approachCount: 2, approachX: patchX - 0.5, approachZ: patchZ, fungus: 0.8, mushroomVisits: 3, mushroomX: patchX, mushroomZ: patchZ, mushroomTime: 0,
});
patchTrap.world.step(0.1);
assert(patchTrap.predator.web?.x === patchX - 0.5, "Spider sets its web on the approach to a revisited patch");
const oversized = patchTrap.world.addAnimal("grazer", undefined, "mouse");
Object.assign(oversized, { x: patchX, z: patchZ, age: 30 });
oversized.genes.size = 2;
patchTrap.world.step(0.1);
assert(!patchTrap.predator.web.prey && !oversized.webHeldUntilAge, "Oversized visitors pass the web");

const traffic = setup("bug");
const routeCell = traffic.world.weather.land![0];
for (const [visit, approach] of [[1, -32], [2, -34], [3, -32]]) {
  traffic.predator.walkTrail = [];
  traffic.predator.x = approach;
  recordBugStep(traffic.predator, visit);
  recordBugStep(traffic.predator, visit);
  traffic.predator.x = -30;
  recordApproach(routeCell, traffic.predator, visit, true);
  assert(routeCell.approachCount === (visit === 3 ? 2 : 0), "Only distinct visits over a shared tile establish a route");
}
assert(routeCell.approachX === -32, "The busiest actual approach wins");
const drifting = setup("spider");
drifting.world.time = 30;
drifting.world.weather.cloud = 0.05;
Object.assign(drifting.predator, { energy: 68, wetness: 0, lastPreyAt: 0, stamina: 100 });
drifting.predator.genes.size = 0.6;
drifting.world.step(0.1);
assert(drifting.predator.state === "Ballooning on silk" && drifting.predator.altitude > 0,
  "A light spider can leave a quiet site on the wind");
assert(drifting.predator.x > -30 && drifting.predator.z < 25, "Silk drifts with the weather front");
const brood = setup("spider");
brood.world.time = 30;
brood.world.weather.cloud = 0.05;
Object.assign(brood.predator, { age: 2, natalDispersal: true, energy: 30, wetness: 0, stamina: 100, lastPreyAt: 30 });
brood.world.step(0.1);
assert(brood.predator.webScout?.natal && !brood.predator.natalDispersal && brood.predator.altitude > 0,
  "Spiderlings launch before their first unproductive ambush");
for (let i = 0; i < 120; i++) brood.world.step(0.1);
assert(!brood.predator.webScout?.natal && brood.predator.altitude === 0 &&
  Math.hypot(brood.predator.x + 30, brood.predator.z - 25) > 6,
  "Dispersing spiderlings land away from the brood");
