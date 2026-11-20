import { World } from "./sim.ts";
import { encodeSave, decodeSave } from "./save.ts";
import { homeSites, homeInspector } from "./home-inspector.ts";

for (const source of ["dead plants", "carrion"] as const) {
  const w = new World(52);
  w.animals = []; w.dens = []; w.plants = []; w.eggs = [];
  w.naturalReproduction = true;
  const ants = [0, 1].map(i => {
    const a = w.addAnimal("grazer", undefined, "ant");
    Object.assign(a, { x: -30 + i * 0.25, z: 25, energy: 72, cooldown: 100 });
    return a;
  });
  Object.assign(w.dens.find(d => d.pantry)!, { x: -30, z: 25 });
  for (let i = 0; i < 60; i++) w.step(0.1);
  const hill = w.dens.find(d => d.pantry);
  if (!hill || hill.progress < 1 || ants.some(a => a.home !== hill.id)) throw Error("Workers failed to build a shared hill");
  const remains = { id: w.nextId++, x: hill.x + 2, z: hill.z, size: 1, decay: 0 };
  if (source === "carrion") w.carcasses.push(remains);
  else w.plantRemains.push({ ...remains, kind: "tree", variety: 0 });
  let carried = false;
  for (let i = 0; i < 450 && !hill.pantry![source]; i++) {
    w.step(0.1);
    if (ants.some(a => a.antLoad?.food === source)) carried = true;
  }
  if (!carried || !hill.pantry![source]) throw Error("No worker delivered " + source);
  const save = decodeSave(encodeSave({world:w,rate:1,paused:true,selected:0})).world;
  const site = homeSites(save).find(s => s.site === hill.id)!;
  if (!homeInspector(save, site).includes("Ant hill") ||
      save.dens.find(d => d.id === hill.id)?.pantry?.[source] !== hill.pantry![source]) throw Error("Hill or pantry lost on reload");
  const stored = hill.pantry![source];
  w.carcasses = []; w.plantRemains = [];
  Object.assign(ants[0], { x: hill.x, z: hill.z, energy: 40 });
  delete ants[0].antLoad;
  w.step(0.1);
  if (hill.pantry![source] >= stored || !(w.foodTotals.ant?.[source]! > 0)) throw Error("Shared meal was not consumed");
}
console.log("Ant workers build, carry both foods, share the pantry and retain the hill on reload");

const colony = new World(52);
colony.animals = []; colony.dens = [];
const workers = Array.from({length: 24}, (_, i) => {
  const ant = colony.addAnimal("grazer", undefined, "ant");
  Object.assign(ant, { age: 20, energy: 80, sex: i % 2 ? "male" : "female", x: -30, z: 25 });
  return ant;
});
const original = colony.dens.find(d => d.pantry)!;
Object.assign(original, { progress: 1, x: -30, z: 25 });
colony.time = 29.95;
colony.step(0.1);
const daughter = colony.dens.find(d => d.pantry && d !== original);
if (!daughter || workers.filter(a => a.home === daughter.id).length !== 6 ||
    workers.filter(a => a.home === original.id).length !== 18 || daughter.progress !== 0)
  throw Error("A mature colony should send six existing ants to build a separate hill");
for (let i = 0; i < 450 && daughter.progress < 1; i++) colony.step(0.1);
if (daughter.progress < 1) throw Error("Dispersing workers failed to reach and finish the daughter hill");

const brood = new World(52);
brood.animals = []; brood.eggs = []; brood.dens = []; brood.plants = [];
brood.naturalReproduction = true;
const pair = ["female", "male"].map(sex => {
  const ant = brood.addAnimal("grazer", undefined, "ant");
  Object.assign(ant, { x: -30, z: 25, sex, age: 24, cooldown: 0, energy: 75 });
  return ant;
});
const nest = brood.dens.find(d => d.pantry)!;
Object.assign(nest, { x: -30, z: 25, progress: 1 });
brood.time = 0.95;
brood.step(0.1);
if (nest.queen !== pair[0].id || brood.eggsLaid) throw Error("An empty pantry must not fund a queen clutch");
pair[1].antLoad = { food: "carrion", energy: 20 };
for (let i = 0; i < 20 && !brood.eggsLaid; i++) brood.step(0.1);
if (!brood.eggsLaid || nest.pantry!.carrion >= 20 ||
    !brood.eggs.some(e => e.embryo.parent === nest.queen && e.buried && e.embryo.home === nest.id))
  throw Error("A delivered meal must pay for a queen brood inside its hill");
const reload = decodeSave(encodeSave({world:brood,paused:true,selected:0,rate:1})).world;
if (reload.dens.find(d=>d.id===nest.id)?.queen !== nest.queen) throw Error("Queen lost on reload");
const queen = pair[0];
Object.assign(queen, { cooldown: 0, energy: 75 });
Object.assign(nest.pantry!, { carrion: 1.5, "dead plants": 0, crop: 0 });
const laid = brood.eggsLaid;
brood.time = Math.floor(brood.time) + 0.95;
brood.step(0.1);
if (brood.eggsLaid !== laid + 3 || nest.pantry!.carrion !== 0)
  throw Error("A small colony can spend its limited pantry on a small brood");
