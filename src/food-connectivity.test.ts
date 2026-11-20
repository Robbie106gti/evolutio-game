import { pondFoodQuery } from "./pond-food.ts";
import { availableWorms, eatWorms, recycleLitter } from "./decomposition.ts";
import { initialLandscape } from "./terrain.ts";
import { World } from "./sim.ts";
import { decodeSave, encodeSave } from "./save.ts";
import { initialPonds, stepWater } from "./ecology.ts";

const pond = { x: 0, z: 0, id: 1, radius: 2, water: 1, food: 1, algae: 0.2, flow: 0 };
const depth = (x: number, z: number) =>
  Number(
    Math.hypot(x, z) < 2 ||
      (x >= 0 && x <= 7 && Math.abs(z) < 0.5) ||
      Math.hypot(x - 9, z) < 1,
  );
const source = pondFoodQuery([pond], depth);
check(source(9, 0) === undefined);
check(source(6, 0) === pond);
check(source(0, 0) === pond);
pond.food = 0;
check(source(6, 0) === undefined);
check(source(6, 0, "algae") === pond && source(9, 0, "algae") === undefined);

const soil = initialLandscape()[0];
Object.assign(soil, { moisture: 0.7, litter: 0, worms: 0.4 });
const initial = soil.worms;
for (let i = 0; i < 1000; i++) eatWorms(soil, 1);
check(availableWorms(soil) < 0.00001 && soil.worms >= 0.04);
const depleted = soil.worms;
for (let i = 0; i < 100; i++) recycleLitter(soil, 1);
check(soil.worms < depleted);
soil.litter = 1;
for (let i = 0; i < 100; i++) recycleLitter(soil, 1);
check(soil.worms > depleted && soil.worms < initial && soil.litter < 1);
console.log(
  "Connected pond feeding, isolated water, shared depletion and litter-funded worm recovery passed",
);

function check(condition: boolean) {
  if (!condition) throw new Error('Food resource regression');
}
import { crabShoreTarget, turnFromBank } from "./shore-movement.ts";

const bankDepth = (x: number) => Math.max(0, 1 - x);
const fish = { x: 0.8, z: 0 };
const heading = turnFromBank(fish, 0, bankDepth, 1);
check(bankDepth(fish.x + Math.cos(heading)) > bankDepth(fish.x));
check(turnFromBank({ x: -5, z: 0 }, 0.2, bankDepth, 1) === 0.2);
const pools = initialPonds();
check(!!crabShoreTarget({ x: -45, z: -35 }, pools, () => 0));
check(!crabShoreTarget(fish, pools, bankDepth));

const nursery = new World(91);
nursery.animals = [];
nursery.plants = [];
nursery.time = 90.1;
nursery.weather.cloud = 0;
for (const cell of nursery.weather.land!) cell.worms = 0.04;
const lake = nursery.ponds[0];
lake.food = 0;
lake.algae = 0.00045;
const fry = nursery.addAnimal("grazer", undefined, "fish");
const froglet = nursery.addAnimal("hunter", undefined, "frog");
const youngCrab = nursery.addAnimal("hunter", undefined, "crab");
for (const animal of [fry, froglet, youngCrab])
  Object.assign(animal, { x: -10.25, z: -5, age: 0, energy: 24, hydration: 100 });
nursery.step(0.1);
const total = () => (nursery.foodTotals.fish?.algae ?? 0) + (nursery.foodTotals.frog?.algae ?? 0) +
  (nursery.foodTotals.crab?.algae ?? 0);
check((nursery.foodTotals.fish?.algae ?? 0) > 0 && (nursery.foodTotals.frog?.algae ?? 0) > 0);
check((nursery.foodTotals.crab?.algae ?? 0) > 0 && youngCrab.state === "Aquatic feeding");
check(lake.algae === 0 && Math.abs(total() - 0.18) < 1e-10);
const consumed = total();
nursery.step(0.1);
check(total() === consumed);
for (const animal of [fry, froglet, youngCrab]) animal.age = 55;
lake.algae = 0.2;
nursery.step(0.1);
check(lake.algae === 0.2 && total() === consumed);
const save = encodeSave({ world: nursery, rate: 1, paused: true, selected: 0 });
const savedWorld = decodeSave(save).world;
check(savedWorld.ponds[0].algae === 0.2 && savedWorld.foodTotals.frog?.algae === nursery.foodTotals.frog?.algae);
const old = JSON.parse(save);
delete old.world.ponds[0].algae;
check((decodeSave(JSON.stringify(old)).world.ponds[0].algae ?? 0) > 0);
old.world.ponds[0].plankton = 0.13;
old.world.foodTotals.frog.plankton = old.world.foodTotals.frog.algae;
delete old.world.foodTotals.frog.algae;
const migrated = decodeSave(JSON.stringify(old)).world;
check(migrated.ponds[0].algae === 0.13 && !Object.hasOwn(migrated.ponds[0], "plankton"));
check(migrated.foodTotals.frog?.algae === nursery.foodTotals.frog?.algae &&
  !Object.hasOwn(migrated.foodTotals.frog ?? {}, "plankton"));

const full = { ...lake, water: 1, algae: 0 };
const empty = { ...lake, water: 0, algae: 0.2 };
stepWater(0, 1, { moisture: 0.7, cloud: 0, raining: false }, [full, empty]);
check(full.algae > 0 && empty.algae === 0);

console.log("Young fish, frogs and crabs share finite algae in wet ponds");
