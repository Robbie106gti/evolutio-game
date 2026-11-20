import { pondFoodQuery } from "./pond-food.ts";
import { availableWorms, eatWorms, recycleLitter } from "./decomposition.ts";
import { initialLandscape } from "./terrain.ts";

const pond = { x: 0, z: 0, id: 1, radius: 2, water: 1, food: 1, flow: 0 };
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
import { initialPonds } from "./ecology.ts";

const bankDepth = (x: number) => Math.max(0, 1 - x);
const fish = { x: 0.8, z: 0 };
const heading = turnFromBank(fish, 0, bankDepth, 1);
check(bankDepth(fish.x + Math.cos(heading)) > bankDepth(fish.x));
check(turnFromBank({ x: -5, z: 0 }, 0.2, bankDepth, 1) === 0.2);
const pools = initialPonds();
check(!!crabShoreTarget({ x: -45, z: -35 }, pools, () => 0));
check(!crabShoreTarget(fish, pools, bankDepth));
