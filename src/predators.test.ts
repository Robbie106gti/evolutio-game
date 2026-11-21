import { recordApproach, recordBugStep } from "./bug-routes.ts";
import { canHunt, canHuntAt, maturityAge as turtleMaturity } from "./biology.ts";
import { habitat, waterDepth } from "./ecology.ts";
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
const roaming = setup("wolf");
Object.assign(roaming.predator, { x: -67, z: 5, angle: Math.PI, age: 60 });
roaming.world.time = 90;
roaming.world.weather.cloud = 0;
roaming.world.step(0.1);
const roamGoal = roaming.predator.wolfSearch;
assert(roamGoal && roamGoal.x > -68 && Math.hypot(roamGoal.x, roamGoal.z) < 69,
  "An empty-handed wolf picks a route away from the island edge");
const startDistance = roaming.predator.distance;
for (let i = 0; i < 60; i++) roaming.world.step(0.1);
assert(roaming.predator.distance - startDistance > 3 && roaming.predator.wolfSearch === roamGoal,
  "A hungry wolf travels steadily toward its search destination");
const roamSave = encodeSave({ world: roaming.world, rate: 1, paused: true, selected: 0 });
assert(JSON.stringify(decodeSave(roamSave).world.animals[0].wolfSearch) === JSON.stringify(roamGoal),
  "A wolf keeps its route when reloaded");

for (const preySpecies of ["scorpion", "spider", "frog", "turtle"] as const) {
  const hunt = setup("bird");
  const predator = hunt.predator;
  const prey = hunt.world.addAnimal("grazer", undefined, preySpecies);
  const insectEater = preySpecies === "scorpion" || preySpecies === "spider";
  Object.assign(predator, { birdDiet: insectEater ? "insectivore" : "raptor", angle: 0, altitude: 0 });
  predator.genes.size = 1;
  Object.assign(prey, { x: predator.x + 0.25, z: predator.z, age: 0, energy: 0.5, altitude: 0 });
  prey.genes.size = 0.7;
  assert(canHuntAt(predator, prey, () => 0), "The applicable bird type can hunt small " + preySpecies);
  if (!insectEater)
    assert(!canHuntAt(predator, prey, () => 0.5), "Deeper water shelters " + preySpecies);
  hunt.world.step(0.1);
  assert(prey.killedBy === predator.id && !!hunt.world.foodTotals.bird?.[preySpecies],
    "The bird can catch and eat a small " + preySpecies);
}
// Start in cruising flight. A grounded bird and weakened prey would also pass
// a contact-only test, even if the approach or whole-meal credit broke.
{
  const { world, predator } = setup("bird");
  world.time = 90;
  Object.assign(predator, { age: 60, energy: 35, birdDiet: "raptor", angle: 0, altitude: 3 });
  predator.genes.size = 1;
  const frog = world.addAnimal("hunter", undefined, "frog");
  Object.assign(frog, { x: predator.x + 3, z: predator.z, age: 40, energy: 80, hydration: 100 });
  Object.assign(frog.genes, { size: 0.8, speed: 0.6 });
  for (let i = 0; i < 120 && !frog.killedBy; i++) world.step(0.1);
  assert(frog.killedBy === predator.id && predator.altitude > 0.1 &&
    (world.foodTotals.bird?.frog ?? 0) > 40, "A raptor swoops on a healthy frog and eats a substantial meal");
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
prey.x = predator.x + 2.5;
prey.z = predator.z;
world.step(0.1);
assert(
  String(predator.state) === "Sprinting" && predator.stamina < 100,
  "Close prey triggers a stamina-consuming burst",
);
predator.stamina = 31;
prey.x = predator.x + 2.5;
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
sting.world.random = () => 0.3; // Exercise a landed sting; the miss is tested separately.
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
const nurseryEdge = new World(52);
nurseryEdge.animals = [];
nurseryEdge.plants = [];
const shelter = nurseryEdge.addPlant(undefined, -30, 25, "bush")!;
const founder = nurseryEdge.addAnimal("hunter", undefined, "scorpion");
assert(Math.hypot(founder.x - shelter.x, founder.z - shelter.z) < 1 &&
  habitat(founder, [shelter], nurseryEdge.weather.land).cover >= 0.15 &&
  waterDepth(nurseryEdge.ponds, founder.x, founder.z, nurseryEdge.weather.land) < 0.1,
  "Scorpion founders prefer covered feeding sites on dry ground");
const spiderShelter = nurseryEdge.addPlant(undefined, -36, 25, "bush")!;
const spiderFounder = nurseryEdge.addAnimal("hunter", undefined, "spider");
assert(Math.hypot(spiderFounder.x - spiderShelter.x, spiderFounder.z - spiderShelter.z) < 1 &&
  habitat(spiderFounder, [spiderShelter], nurseryEdge.weather.land).cover >= 0.15 &&
  Math.hypot(spiderFounder.x - founder.x, spiderFounder.z - founder.z) >= 2.5,
  "Spider founders choose cover outside a nearby predator's strike range");
const laterScorpion = nurseryEdge.addAnimal("hunter", undefined, "scorpion");
assert(Math.hypot(laterScorpion.x - spiderFounder.x, laterScorpion.z - spiderFounder.z) >= 2.5,
  "Scorpions introduced later also leave space around spider founders");

const scoutingYoung = setup("scorpion");
const juvenile = scoutingYoung.predator;
const emptyHide = scoutingYoung.world;
emptyHide.time = 90;
emptyHide.weather.cloud = 0;
emptyHide.addPlant(undefined, juvenile.x + 0.3, juvenile.z, "bush");
for (const cell of emptyHide.weather.land!) cell.worms = 0;
Object.assign(juvenile, { age: 10, energy: 24, lastPreyAt: 89 });
emptyHide.step(0.1);
assert(juvenile.state === "Waiting in ambush", "A young scorpion gives a sheltered site time to produce prey");
juvenile.lastPreyAt = 86.95;
const beforeScout = { x: juvenile.x, z: juvenile.z };
emptyHide.step(0.1);
assert(String(juvenile.state) === "Searching for prey" &&
  Math.hypot(juvenile.x - beforeScout.x, juvenile.z - beforeScout.z) > 0,
  "A hungry young scorpion leaves cover just after three seconds without a catch");
for (const species of ["scorpion", "spider"] as const) {
  const encounter = setup(species);
  const insect = encounter.world.addAnimal("grazer", undefined, "mosquito");
  Object.assign(insect, { x: encounter.predator.x + 0.3, z: encounter.predator.z, age: 18, altitude: 0.9 });
  if (species === "spider") {
    encounter.predator.web = { x: insect.x, z: insect.z, prey: 0, expires: 20 };
    assert(!canHunt(encounter.predator, insect), "Airborne prey needs to intersect a web");
  } else {
    assert(canHunt(encounter.predator, insect), "Low hovering insect is within tail reach");
    insect.altitude = 1.4;
    assert(!canHunt(encounter.predator, insect), "A high escape clears the sting");
    insect.altitude = 0.9;
  }
  encounter.world.step(0.1);
  assert(species === "spider" ? insect.webOwnerId === encounter.predator.id :
    !!encounter.predator.nextStingAge, "A low hover triggers a web catch or sting attempt");
}
const frogHunt = setup("scorpion");
const bankFrog = frogHunt.world.addAnimal("hunter", undefined, "frog");
Object.assign(bankFrog, { x: frogHunt.predator.x + 0.3, z: frogHunt.predator.z, age: 40, energy: 85, altitude: 0 });
Object.assign(frogHunt.predator, { age: 70, angle: 0 });
frogHunt.predator.genes.size = bankFrog.genes.size = 1;
assert(canHuntAt(frogHunt.predator, bankFrog, () => 0.1), "Scorpions can hunt a somewhat larger frog on a bank");
assert(!canHuntAt(frogHunt.predator, bankFrog, () => 0.3), "Deeper water protects frogs from scorpions");
frogHunt.world.random = () => 0;
frogHunt.world.step(0.1);
assert(bankFrog.energy > 0 && bankFrog.energy < 60 && !!bankFrog.stungUntilAge,
  "A sting injures and slows a larger frog, leaving a chance to escape");
Object.assign(bankFrog, { x: frogHunt.predator.x + 0.2, z: frogHunt.predator.z, energy: 24 });
Object.assign(frogHunt.predator, { nextStingAge: 0, nextSenseAt: 0, angle: 0 });
for (let i = 0; i < 12 && !frogHunt.world.foodTotals.scorpion?.frog; i++)
  frogHunt.world.step(0.1);
assert(bankFrog.killedBy === frogHunt.predator.id && !!frogHunt.world.foodTotals.scorpion?.frog,
  "A scorpion can finish the catch and feed on a frog");
const silkHunter = setup("spider").predator;
silkHunter.genes.size = 1;
const smallMouse = frogHunt.world.addAnimal("grazer", undefined, "mouse");
Object.assign(smallMouse, { age: turtleMaturity(smallMouse), altitude: 0 });
smallMouse.genes.size = 0.67;
assert(canHunt(silkHunter, smallMouse), "A spider can tackle prey a little larger than itself");
smallMouse.genes.size = 1;
assert(!canHunt(silkHunter, smallMouse), "Much larger mice are still out of reach");

const snakeHunt = setup("snake");
const edgeFrog = snakeHunt.world.addAnimal("hunter", undefined, "frog");
Object.assign(edgeFrog, { x: snakeHunt.predator.x + 0.3, z: snakeHunt.predator.z, age: 30, energy: 1, altitude: 0 });
snakeHunt.predator.genes.size = edgeFrog.genes.size = 1;
assert(canHuntAt(snakeHunt.predator, edgeFrog, () => 0.2), "Snakes can hunt frogs at the water's edge");
assert(!canHuntAt(snakeHunt.predator, edgeFrog, () => 0.4), "Snakes cannot hunt frogs in deeper water");
snakeHunt.world.time = 70;
snakeHunt.world.weather.cloud = 0;
Object.assign(snakeHunt.predator, { angle: 0, bodyTemperature: 27, energy: 35 });
for (let i = 0; i < 12 && !snakeHunt.world.foodTotals.snake?.frog; i++) snakeHunt.world.step(0.1);
assert(edgeFrog.killedBy === snakeHunt.predator.id && !!snakeHunt.world.foodTotals.snake?.frog,
  "A snake catches a small frog and feeds");

for (const insect of ["fly", "mosquito"] as const) {
  const {world, predator} = setup("bird");
  Object.assign(predator, { birdDiet: "insectivore", altitude: 1 });
  const prey = world.addAnimal("grazer", undefined, insect);
  Object.assign(prey, { x: predator.x + 0.2, z: predator.z, altitude: 1, age: 15 });
  world.step(0.1);
  assert(predator.altitude > 0.6 && prey.killedBy === predator.id &&
    (world.foodTotals.bird?.[insect] ?? 0) > 0, "Bird eats " + insect + " in flight");
}
for (const insect of ["bug", "fly", "mosquito", "ant"] as const) {
  const {world, predator} = setup("frog");
  predator.genes.size = 1.6;
  const prey = world.addAnimal("grazer", undefined, insect);
  prey.genes.size = 0.5;
  Object.assign(prey, { x: predator.x + 0.2, z: predator.z, altitude: 1.5, age: 15 });
  assert(!canHunt(predator, prey), "High flight clears the frog");
  prey.altitude = insect === "fly" || insect === "mosquito" ? 0.9 : 0;
  world.step(0.1);
  assert(prey.killedBy === predator.id && (world.foodTotals.frog?.[insect] ?? 0) > 0,
    "Frog catches and eats " + insect);
}
const withoutSilk = setup("spider");
const hover = withoutSilk.world.addAnimal("grazer", undefined, "mosquito");
Object.assign(hover, {x: withoutSilk.predator.x + 1.6, z: withoutSilk.predator.z, altitude: 0.9});
withoutSilk.world.step(0.1);
assert(hover.webOwnerId === withoutSilk.predator.id, "A nearby hovering insect prompts a web without a preselected feeding patch");
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
for (const species of ["fox", "cat", "snake", "bird"] as const) {
  const encounter = setup(species);
  const hunter = encounter.predator;
  hunter.age = 100;
  if (species === "snake") {
    hunter.bodyTemperature = 30;
    hunter.energy = 30;
  }
  if (species === "bird") {
    hunter.birdDiet = "raptor";
    hunter.altitude = 3;
  }
  hunter.genes.size = 1.3;
  const mouse = encounter.world.addAnimal("grazer", undefined, "mouse");
  const distance = species === "bird" ? 3 : species === "snake" ? 2.1 : 0.7;
  Object.assign(mouse, { x: hunter.x + distance, z: hunter.z, age: 30, energy: 100 });
  mouse.genes.size = 1;
  encounter.world.step(0.1);
  if (species === "snake" || species === "bird") {
    const attack = species === "snake" ? "Striking at mouse" : "Diving for mouse";
    assert(hunter.state === attack && !mouse.killedBy, `${species} starts ${attack} outside contact range`);
    for (let i = 0; i < 15 && !mouse.killedBy; i++) encounter.world.step(0.1);
  }
  assert(mouse.killedBy === hunter.id, `${species} can finish a close catch on a healthy adult mouse (${hunter.state}, ${Math.hypot(hunter.x - mouse.x, hunter.z - mouse.z).toFixed(2)} units away)`);
  assert(
    species === "fox" || species === "cat" ? hunter.mealEnergy > 0 : (encounter.world.foodTotals[species]?.mouse ?? 0) > 0,
    `${species} gets food from the mouse it catches`,
  );
}
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

const scavenger = setup("scorpion");
const body = { id: scavenger.world.nextId++, x: scavenger.predator.x + 0.2, z: scavenger.predator.z, size: 2, decay: 0 };
scavenger.world.carcasses.push(body);
scavenger.world.plantRemains.push({ ...body, id: scavenger.world.nextId++, x: scavenger.predator.x, kind: "tree", variety: 0 });
scavenger.world.step(0.1);
assert(body.decay > 0 && (scavenger.world.foodTotals.scorpion?.carrion ?? 0) > 0 &&
  !scavenger.world.foodTotals.scorpion?.["dead plants"], "Scorpion eats finite carrion beside plant litter");

for (const species of ["bird", "frog"] as const) {
  const {world, predator} = setup(species);
  predator.birdDiet = "insectivore";
  predator.genes.size = 0.7;
  const spider = world.addAnimal("hunter", undefined, "spider");
  Object.assign(spider, { x: predator.x + 0.2, z: predator.z, age: 40, energy: 40, altitude: 0 });
  spider.genes.size = 2;
  assert(!canHunt(predator, spider), "Oversized spider is unsuitable for " + species);
  spider.genes.size = 0.4;
  world.step(0.1);
  assert(spider.killedBy === predator.id && (world.foodTotals[species]?.spider ?? 0) > 0,
    species + " catches and swallows a small spider");
}

const eggRaid = setup("snake");
const embryo = eggRaid.world.addAnimal("hunter", undefined, "bird");
eggRaid.world.animals.pop();
Object.assign(embryo, { x: eggRaid.predator.x, z: eggRaid.predator.z, altitude: 0, age: 0 });
const exposed = { embryo, health: 100, duration: 60, age: 2, concealment: 0, buried: false };
eggRaid.world.eggs = [{ ...exposed, buried: true }, exposed];
eggRaid.world.time = 0.95;
eggRaid.world.random = () => 0.05;
eggRaid.world.step(0.1);
assert(eggRaid.world.eggs.length === 1 && eggRaid.world.eggs[0].buried &&
  (eggRaid.world.foodTotals.snake?.eggs ?? 0) > 0, "Only an exposed egg yields food");

const idleCroc = setup("crocodile");
const idlePond = idleCroc.world.ponds[0];
Object.assign(idleCroc.predator, { x: idlePond.x, z: idlePond.z, angle: 1.1, energy: 125 });
idleCroc.world.step(0.1);
assert(idleCroc.predator.x === idlePond.x && idleCroc.predator.z === idlePond.z &&
  idleCroc.predator.angle === 1.1, "Stationary crocodiles hold their heading in water");

for (const sex of ["female", "male"] as const) {
  const {world, predator: mosquito} = setup("mosquito");
  Object.assign(mosquito, { age: 20, sex, altitude: 0, energy: 40 });
  const host = world.addAnimal("grazer", undefined, "mouse");
  Object.assign(host, { x: mosquito.x + 0.2, z: mosquito.z, age: 20, energy: 80 });
  host.genes.dietAffinity = 0;
  world.step(0.1);
  assert(!!world.foodTotals.mosquito?.blood === (sex === "female"),
    "Only female mosquitoes take a blood meal");
  assert(!!mosquito.mosquitoFed === (sex === "female"), "A successful meal enables later egg-laying");
  assert(host.energy > 70, "A blood meal leaves the host alive");
}

const entrance = setup("scorpion");
const nestWorker = entrance.world.addAnimal("grazer", undefined, "ant");
Object.assign(nestWorker, { x: entrance.predator.x, z: entrance.predator.z, age: 25, energy: 60 });
const refuge = entrance.world.dens.find(d => d.id === nestWorker.home)!;
Object.assign(refuge, { x: nestWorker.x, z: nestWorker.z, progress: 1 });
entrance.world.step(0.1);
assert(!entrance.predator.nextStingAge && !nestWorker.killedBy,
  "Scorpion cannot sting an ant under its own completed hill");

const frogRaid = setup("frog");
const protectedAnt = frogRaid.world.addAnimal("grazer", undefined, "ant");
Object.assign(protectedAnt, { x: frogRaid.predator.x + 0.3, z: frogRaid.predator.z, age: 25, energy: 2 });
const antHill = frogRaid.world.dens.find(d => d.id === protectedAnt.home)!;
Object.assign(antHill, { x: protectedAnt.x, z: protectedAnt.z, progress: 1 });
frogRaid.world.step(0.1);
assert(!protectedAnt.killedBy && !frogRaid.world.foodTotals.frog?.ant, "A completed hill also shelters ants from frogs");
antHill.progress = 0;
frogRaid.predator.nextSenseAt = 0;
frogRaid.world.step(0.1);
assert(!!protectedAnt.killedBy || !!frogRaid.world.foodTotals.frog?.ant, "An incomplete nest does not protect exposed ants");

for (const species of ["cat", "fox", "wolf"] as const) {
  const { world, predator } = setup(species);
  const turtle = world.addAnimal("grazer", undefined, "turtle");
  predator.genes.size = 1.5;
  turtle.genes.size = 0.8;
  turtle.age = 0;
  assert(canHuntAt(predator, turtle, () => 0.1), species + " can take a small hatchling at the bank");
  assert(!canHuntAt(predator, turtle, () => 0.5), "Deep water shelters the hatchling");
  turtle.age = turtleMaturity(turtle) / 2;
  assert(canHunt(predator, turtle) === (species !== "cat"), "Juvenile turtle eligibility follows predator type");
  turtle.age = turtleMaturity(turtle);
  assert(!canHunt(predator, turtle), "Mature turtles have shell protection");
}

const fledgling = setup("bird");
Object.assign(fledgling.predator, { age: 15, altitude: 2.5, birdDiet: "insectivore" });
const eggBug = fledgling.world.addAnimal("grazer", undefined, "bug");
fledgling.world.animals.pop();
Object.assign(eggBug, { x: fledgling.predator.x + 0.35, z: fledgling.predator.z, altitude: 0 });
fledgling.world.eggs = [{ embryo: eggBug, age: 0, health: 100, duration: 30, buried: false, concealment: 0 }];
for (let i=0; i<40 && fledgling.world.eggs.length; i++) fledgling.world.step(0.1);
assert(!fledgling.world.eggs.length && (fledgling.world.foodTotals.bird?.eggs ?? 0)>0,
  "Hungry fledgling lands above insect eggs and pecks a meal");

const pursuit = setup("bird");
Object.assign(pursuit.predator, { age: 15, altitude: 2.5, birdDiet: "insectivore", angle: 0 });
const parentBird = pursuit.world.addAnimal("hunter", undefined, "bird");
Object.assign(parentBird, { x: pursuit.predator.x - 8, z: pursuit.predator.z, energy: 130, age: 40 });
pursuit.predator.parent = parentBird.id;
const airborneFly = pursuit.world.addAnimal("grazer", undefined, "fly");
Object.assign(airborneFly, { x: pursuit.predator.x + 2, z: pursuit.predator.z, age: 12, altitude: 0.9, angle: 0 });
airborneFly.genes.size = 0.5;
landAt(pursuit.world.weather.land, pursuit.predator.x, pursuit.predator.z).fungus = 0.9;
for (let i=0;i<70 && airborneFly.energy>0;i++) pursuit.world.step(0.1);
assert(airborneFly.killedBy === pursuit.predator.id, "Independent young bird pursues a moving fly before following its parent");

const encounter = new World(52);
encounter.animals = [];
encounter.plants = [];
const curious = encounter.addAnimal("grazer", undefined, "bug");
const stillFrog = encounter.addAnimal("hunter", undefined, "frog");
Object.assign(curious, { x: -30, z: 25, age: 60, energy: 65, hydration: 100, angle: 0 });
Object.assign(curious.genes, { activeFraction: 1, preferredMoisture: 0.4 });
Object.assign(stillFrog, { x: -28, z: 25, age: 50, energy: 130, hydration: 100, visiblyMoving: false, state: "Resting" });
encounter.time = 97 - curious.id % 16;
encounter.step(0.1);
assert(curious.state === "Investigating frog" && !curious.sensedThreat,
  "An idle bug can investigate a sitting frog without recognizing it as a predator");
Object.assign(stillFrog, { visiblyMoving: true, x: curious.x + 1, z: curious.z });
encounter.step(0.1);
assert(String(curious.state) === "Fleeing" && curious.sensedThreat === stillFrog.id,
  "Movement reveals the frog and interrupts curiosity");
