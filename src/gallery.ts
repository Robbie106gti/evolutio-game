import * as THREE from "three";
import { World } from "./sim.ts";
import { OrganismMeshes } from "./meshes.ts";
import { SPECIES, PLANTS, PLANT_PROFILES } from "./species.ts";
import { terrainHeight } from "./terrain.ts";
import type { Animal, Plant, PlantKind, Species } from "./model.ts";

const select = document.querySelector<HTMLSelectElement>("#species")!,
  pose = document.querySelector<HTMLSelectElement>("#pose")!,
  canvas = document.querySelector("canvas")!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color("#e0e8dc");
scene.add(new THREE.HemisphereLight(0xfff6e0, 0x759281, 1.8));
const sun = new THREE.DirectionalLight(0xfff3d8, 2);
sun.position.set(4, 8, 6);
scene.add(sun);
const camera = new THREE.OrthographicCamera(-4, 4, 2, -2, 0.1, 100);
const meshes = new OrganismMeshes(scene),
  world = new World(88);
const animals = new Map<Species, Animal>(),
  plants = new Map<string, Plant>();
function group(label: string) {
  const el = document.createElement("optgroup");
  el.label = label;
  select.append(el);
  return el;
}
const fauna = group("Animals"),
  flora = group("Plants");
for (const species of Object.keys(SPECIES) as Species[]) {
  const a = world.addAnimal(SPECIES[species].kind, undefined, species);
  Object.assign(a, { angle: 0.18, age: 120, x: 0, z: 0, altitude: 0 });
  Object.assign(a.genes, { size: 1.1, length: 1.1, markings: 0.85 });
  animals.set(species, a);
  fauna.append(new Option(SPECIES[species].label, species));
}
for (const kind of Object.keys(PLANT_PROFILES) as PlantKind[])
  for (const [i, profile] of PLANT_PROFILES[kind].entries()) {
    const p = {
      ...world.plants[0],
      kind,
      variety: i,
      x: 0,
      z: 0,
      age: 120,
      health: 100,
      energy: 70,
    } as Plant;
    const key = kind + i;
    plants.set(key, p);
    flora.append(new Option(profile.label, key));
  }
const snake = animals.get("snake")!,
  sleeper = { ...snake, id: snake.id + 100000, state: "Sleeping" as const };
let time = 0,
  last = 0,
  paused = matchMedia("(prefers-reduced-motion: reduce)").matches;
const button = document.querySelector<HTMLButtonElement>("#pause")!;
function updateButton() {
  button.textContent = paused ? "Play" : "Pause";
}
button.onclick = () => {
  paused = !paused;
  updateButton();
};
updateButton();
function options() {
  time = 0;
  const featured = select.value === "featured";
  document.getElementById("pose-label")!.hidden = featured;
  pose.replaceChildren();
  for (const s of plants.has(select.value)
    ? [
        "Mature",
        "Growing",
        "Old age",
        "Withering",
      ]
    : ["Exploring", "Sleeping", "Eating"])
    pose.add(new Option(s, s));
  document.querySelector("figcaption")!.textContent = featured
    ? "Slithering snake　 ·　 Sleeping snake　 ·　 Crawling bug"
    : select.selectedOptions[0].text;
}
pose.onchange = () => { time = 0; };
select.onchange = options;
options();
function frame(now: number) {
  if (!paused) time += Math.min(0.05, (now - last) / 1000);
  last = now;
  const featured = select.value === "featured",
    plant = plants.get(select.value);
  const list = featured
    ? [snake, sleeper, animals.get("bug")!]
    : plant
      ? []
      : [animals.get(select.value as Species)!];
  for (const [i, a] of list.entries()) {
    a.x = featured ? (i - 1) * 2.45 : 0;
    a.z = 0;
    a.distance = featured || pose.value === "Exploring" ? time * 0.8 : 0;
    a.age = 120 + time;
    a.state = featured
      ? i === 1
        ? "Sleeping"
        : "Exploring"
      : (pose.value as Animal["state"]);
  }
  if (plant) {
    const profile = PLANTS[plant.kind];
    const progress = Math.min(1, (time % 14) / 12);
    plant.age =
      pose.value === "Growing"
        ? profile.maturity * (0.05 + 0.92 * ((time % 7) / 7))
        : pose.value === "Old age"
          ? ((0.63 + 0.365 * progress) * profile.lifespan) / (0.6 + plant.growth * 0.3)
          : profile.maturity * 2;
    plant.health = pose.value === "Withering" ? 100 - 97 * progress : 100;
  }
  const width = canvas.clientWidth,
    height = canvas.clientHeight;
  renderer.setSize(width, height, false);
  const half = Math.max(
    featured ? 4.35 : plant?.kind === "tree" ? 3 : 2.2,
    (width / height) * (plant?.kind === "tree" ? 2.8 : 1.2),
  );
  camera.left = -half;
  camera.right = half;
  camera.top = (half * height) / width;
  camera.bottom = -camera.top;
  const y = terrainHeight(0, 0) + (plant?.kind === "tree" ? 1.7 : 0.35);
  camera.position.set(0, y + 4, 7);
  camera.lookAt(0, y, 0);
  camera.updateProjectionMatrix();
  meshes.update(list, plant ? [plant] : [], time, plant?.id);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
