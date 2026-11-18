import { World, SPECIES } from "./sim.ts";
import { homeSites, homeContents, homeInspector } from "./home-inspector.ts";
import { treeRestSite } from "./resting.ts";
import { OrganismMeshes } from "./meshes.ts";
import * as THREE from "three";
function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
const w = new World(88);
w.animals = [];
w.plants = [];
w.eggs = [];
w.dens = [];
const bird = w.addAnimal(SPECIES.bird.kind, undefined, "bird");
bird.x = -30;
bird.z = 25;
const tree = w.addPlant(undefined, -30, 25, "tree", 1)!;
check(tree, "Fixture tree exists");
tree.age = 70;
tree.energy = 85;
bird.roost = tree.id;
Object.assign(bird, treeRestSite(tree, bird.id, w.weather.land));
w.layClutch(bird, 2);
const nest = homeSites(w).find((h) => h.key === `nest:${bird.id}`)!;
check(
  nest && homeContents(w, nest).eggs.length === 2,
  "Nest resolves both eggs",
);
const baby = w.eggs.pop()!.embryo;
w.animals.push(baby);
baby.energy = 12;
baby.hydration = 20;
let html = homeInspector(w, nest);
check(
  html.includes("Very hungry") &&
    html.includes("Thirsty") &&
    html.includes("Protected by nearby parent"),
  "Young report hunger, thirst and actual parental protection",
);
check(
  html.includes(`data-watch-parent="${bird.id}"`) &&
    html.includes("% incubated"),
  "Parent follow and egg progress available",
);
bird.x += 8;
bird.state = "Returning to young";
html = homeInspector(w, nest);
check(
  html.includes("Parent away — no parental protection") &&
    html.includes("Returning to young"),
  "Away parent is not falsely shown guarding",
);
const meshes = new OrganismMeshes(new THREE.Scene());
meshes.update(
  w.animals,
  w.plants,
  0,
  0,
  w.weather.land,
  [],
  w.eggs.map((e) => e.embryo),
);
check(
  meshes.ids.get(meshes.nests)?.[0] === bird.id,
  "Nest pick identifies owner, not the first egg",
);
w.animals = w.animals.filter((a) => a !== bird);
w.deceased.push(bird);
check(
  homeSites(w).some((h) => h.key === nest.key),
  "Orphaned nursery remains selectable",
);
check(
  homeInspector(w, nest).includes("(deceased)"),
  "Deceased parent is identified",
);
const mouse = w.addAnimal("grazer", undefined, "mouse");
mouse.x = -30;
mouse.z = 25;
const den = {
  id: w.nextId++,
  owner: mouse.id,
  x: mouse.x,
  z: mouse.z,
  progress: 1,
};
w.dens.push(den);
mouse.home = den.id;
const pup = w.addAnimal("grazer", mouse);
const home = homeSites(w).find((h) => h.key === `den:${den.id}`)!;
check(
  homeContents(w, home).babies.includes(pup),
  "Den shows its dependent young",
);
pup.nursery = null;
check(
  homeContents(w, home).babies.length === 0,
  "Grown young disappear from occupants",
);
check(
  homeInspector(w, home).includes("No dependent young"),
  "Empty den remains inspectable",
);
console.log(
  "Selectable home identity, eggs, hunger, protection, returning/deceased parents and empty dens passed",
);
