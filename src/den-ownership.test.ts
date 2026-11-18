import { World } from "./sim.ts";
import { FIRST_GROVE } from "./levels.ts";
import { reconcileDens } from "./nursery.ts";
import { maturityAge } from "./biology.ts";
function check(v: unknown, m: string) {
  if (!v) throw new Error(m);
}
const w = new World(123, FIRST_GROVE);
w.animals = w.animals.slice(0, 4);
const [owner, adult, young, orphan] = w.animals;
w.dens = [{ id: 90000, owner: owner.id, x: -30, z: 0, progress: 1 }];
for (const a of w.animals) {
  a.home = 90000;
  a.x = -30;
  a.z = 0;
  a.age = maturityAge(a) + 1;
  a.nursery = null;
}
adult.parent = owner.id;
young.parent = owner.id;
young.age = 1;
orphan.parent = 999999;
orphan.age = 1;
reconcileDens(w.animals, w.dens, []);
check(owner.home === 90000, "Owner keeps its den");
check(adult.home === 0, "Independent adult leaves inherited den");
check(young.home === 90000, "Dependent young keep parent home");
check(orphan.home === 0, "Orphans do not inherit a stranger's den");
owner.energy = 0;
adult.home = 90000;
reconcileDens(w.animals, w.dens, []);
check(
  w.dens[0].owner === adult.id && adult.home === 90000,
  "Nearby independent adult can reuse a vacant den",
);
young.age = maturityAge(young) + 1;
young.home = 90000;
orphan.parent = young.id;
orphan.nursery = {
  kind: "den",
  site: 90000,
  owner: young.id,
  x: -30,
  z: 0,
  altitude: 0,
};
reconcileDens(w.animals, w.dens, []);
check(young.home === 90000, "Nursing parent is not evicted from its brood");
console.log(
  "Den ownership, adult dispersal, orphan cleanup and nursery protection passed",
);
