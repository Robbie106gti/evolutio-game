import { waterDepth as gaitWaterDepth } from "./ecology.ts";
import { lineageIdentity, lineageBadge } from "./lineage-identity.ts";
import { LineageOverlay } from "./lineage-overlay.ts";
import { recordEvolution } from "./evolution-history.ts";
import { evolutionJournal, type EvolutionView } from "./evolution-view.ts";
import "./evolution.css";
import {
  populationCounts,
  POPULATION_SERIES,
  drawPopulationChart,
} from "./population-history.ts";
import { supportsApproximation } from "./approximate.ts";
import {
  islandStorage,
  readBrowserSlot,
  saveBrowserSlot,
  saveJumpBackup,
  restoreJumpBackup,
  hasJumpBackup,
} from "./browser-storage.ts";
import {
  introduceAnimals,
  establishedOmnivores,
} from "./animal-introduction.ts";
import { GenerationAdvance } from "./generation-advance.ts";
import {
  loadSlot,
  unlocked,
  slotKey,
  preserveBeforeSwitch,
} from "./level-slots.ts";
import { levelCards, lessonContent } from "./level-screen.ts";
import {
  LEVELS,
  initialProgress,
  updateLevelProgress,
  type LevelObjective,
} from "./levels.ts";
import { APP_SHELL } from "./app-shell.ts";
import { homeSites, homeInspector } from "./home-inspector";
import { applyIslandTool, type IslandTool } from "./island-tools";
import { profiling, measured, timingReport } from "./profiling";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { World } from "./sim.ts";
import { DEATH_LABELS, PLANTS, PLANT_VARIETIES, SPECIES } from "./species.ts";
import {
  type DeathCause,
  type Species,
  type PlantKind,
  type Animal,
} from "./model.ts";
import { OrganismMeshes } from "./meshes";
import { encodeSave, decodeSave, type Session } from "./save.ts";
import "./style.css";
import "./island-controls.css";
import "./reading-panels.css";
import { renderAnimalInspector } from "./inspector";
import { FamilyOverlay } from "./family-overlay";
import { BreedingView, breedingAnimals } from "./breeding-view.ts";
import { selectedFamily, followShift } from "./family";
import { EnvironmentView } from "./environment-view";
import { climate, regionalClimate, DAY_LENGTH } from "./ecology";
import {
  WORLD_RADIUS,
  riverFlow,
  terrainHeight,
  LAND_MIN,
  LAND_SIDE,
  LAND_STEP,
} from "./terrain";
import { SkyView } from "./sky-view";
import { addBiomes } from "./terrain-view";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = APP_SHELL;
const profilePanel = document.createElement("details");
profilePanel.hidden = !profiling;
profilePanel.innerHTML =
  '<summary>Performance diagnostics</summary><pre id="runtime-profile" style="white-space:pre-wrap;font-size:11px"></pre>';
document.querySelector("aside")!.append(profilePanel);
let generationAdvance: GenerationAdvance | null = null;
let advanceWorker: Worker | null = null;
let islandTransition: "switch" | "advance" | "recovery" | "import" | null =
  null;
let world = new World(undefined, undefined, true);
let levelProgress = initialProgress(world.level);
let rate = 1,
  paused = false,
  selected = 0,
  activeTool: IslandTool = "inspect";
let selectedHome: string | null = null,
  watchedHome: string | null = null;
let followEnabled = true,
  compactInspector = true;
const $ = (id: string) => document.getElementById(id)!;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#bad4d0");
scene.fog = new THREE.Fog("#bad4d0", 150, 330);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
camera.position.set(80, 98, 94);
let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch {
  $("scene").innerHTML =
    '<div class="error">This island needs WebGL. Please enable hardware acceleration or try another browser.</div>';
  throw new Error("WebGL unavailable");
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
$("scene").appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 8;
controls.maxDistance = 240;
controls.maxPolarAngle = Math.PI * 0.46;
controls.target.set(0, 0, 0);
controls.enablePan = false;
const ambient = new THREE.HemisphereLight(0xfff7dc, 0x668b80, 2.5);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffecd2, 3);
sun.position.set(-35, 70, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {
  left: -80,
  right: 80,
  top: 80,
  bottom: -80,
});
sun.shadow.bias = -0.001;
scene.add(sun);
const mat = (color: string) =>
  new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
const water = new THREE.Mesh(new THREE.PlaneGeometry(350, 350), mat("#99bfc0"));
water.rotation.x = -Math.PI / 2;
water.position.y = -1.5;
scene.add(water);
function cylinder(radius: number, depth: number, y: number, color: string) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius + 0.8, depth, 72, 1, true),
    mat(color),
  );
  m.position.y = y;
  m.receiveShadow = true;
  scene.add(m);
  return m;
}
cylinder(WORLD_RADIUS + 1.8, 1.5, -0.7, "#d9cba6");
cylinder(WORLD_RADIUS + 0.8, 0.7, 0.15, "#839c64");
cylinder(WORLD_RADIUS + 0.2, 0.15, 0.56, "#9cad76");
const rim = new THREE.Mesh(
  new THREE.RingGeometry(WORLD_RADIUS - 2, WORLD_RADIUS + 0.2, 144),
  mat("#9cad76"),
);
rim.rotation.x = -Math.PI / 2;
rim.position.y = 0.65;
rim.receiveShadow = true;
scene.add(rim);
// Decorative stones have no collision or food value.
for (let i = 0; i < 30; i++) {
  const a = i * 2.4,
    r = WORLD_RADIUS + 0.5 + Math.sin(i) * 0.6;
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.3 + (i % 4) * 0.15),
    mat("#b5b4a0"),
  );
  rock.position.set(Math.cos(a) * r, 0.5, Math.sin(a) * r);
  rock.scale.y = 0.65;
  rock.castShadow = true;
  scene.add(rock);
}
const updateBiomes = addBiomes(scene);
const environmentView = new EnvironmentView(scene, world);
const skyView = new SkyView($("world"));
const organisms = new OrganismMeshes(scene);
const familyOverlay = new FamilyOverlay(scene);
const breedingView = new BreedingView(scene);
const lineageOverlay = new LineageOverlay(scene);
let showLineages = false;
const selection = new THREE.Mesh(
  new THREE.RingGeometry(0.9, 1, 40),
  new THREE.MeshBasicMaterial({ color: "#fff3ba", side: THREE.DoubleSide }),
);
selection.rotation.x = -Math.PI / 2;
selection.visible = false;
scene.add(selection);
const panKeys = new Set<string>();
let fastPan = false;
window.addEventListener("keydown", (e) => {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key))
    return;
  if (
    (e.target as HTMLElement)?.closest(
      "input,select,textarea,[contenteditable=true],dialog[open]",
    )
  )
    return;
  e.preventDefault();
  panKeys.add(e.key);
  fastPan = e.shiftKey;
  followEnabled = false;
});
window.addEventListener("keyup", (e) => {
  panKeys.delete(e.key);
  fastPan = e.shiftKey;
});
window.addEventListener("blur", () => panKeys.clear());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) panKeys.clear();
});
let meshWorld: World | undefined,
  meshTime = -1,
  meshSelection = -1,
  meshPlants = -1,
  meshAnimals = -1;
function draw(dt: number) {
  if (advanceWorker) return;
  if (panKeys.size) {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(
      forward,
      new THREE.Vector3(0, 1, 0),
    );
    const move = forward
      .multiplyScalar(
        Number(panKeys.has("ArrowUp")) - Number(panKeys.has("ArrowDown")),
      )
      .add(
        right.multiplyScalar(
          Number(panKeys.has("ArrowRight")) - Number(panKeys.has("ArrowLeft")),
        ),
      );
    move
      .normalize()
      .multiplyScalar(
        Math.min(
          60,
          Math.max(8, camera.position.distanceTo(controls.target) * 0.35),
        ) *
          dt *
          (fastPan ? 2 : 1),
      );
    controls.target.add(move);
    camera.position.add(move);
  }
  if (
    meshWorld !== world ||
    meshTime !== world.time ||
    meshSelection !== selected ||
    meshPlants !== world.plants.length ||
    meshAnimals !== world.animals.length
  ) {
    const environmentStart = profiling ? performance.now() : 0;
    environmentView.update(world, selected, scene, sun, ambient);
    skyView.update(world.time, world.weather);
    (water.material as THREE.MeshStandardMaterial).color
      .set("#243e58")
      .lerp(
        new THREE.Color("#92c6de"),
        Math.min(1, climate(world.time, world.weather).sunlight * 2),
      );
    updateBiomes(world);
    measured("environment meshes + terrain", environmentStart);
    renderer.shadowMap.needsUpdate = true;
    meshSelection = selected;
    meshPlants = world.plants.length;
    meshAnimals = world.animals.length;
    const organismStart = profiling ? performance.now() : 0;
    organisms.update(
      world.animals,
      world.plants,
      performance.now() / 1000,
      selected,
      world.weather.land,
      world.plantRemains,
      world.eggs.map((e) => e.embryo),
      world.carcasses,
      (x, z) => gaitWaterDepth(world.ponds, x, z, world.weather.land),
    );
    measured("organism meshes", organismStart);
    meshWorld = world;
    meshTime = world.time;
  }
  const item =
    (selectedHome
      ? homeSites(world).find((h) => h.key === selectedHome)
      : undefined) ??
    world.animals.find((a) => a.id === selected) ??
    world.plants.find((p) => p.id === selected) ??
    world.plantRemains.find((p) => p.id === selected) ??
    (selected < 0 && world.weather.land?.[-selected - 1]
      ? {
          x: LAND_MIN + ((-selected - 1) % LAND_SIDE) * LAND_STEP,
          z: LAND_MIN + Math.floor((-selected - 1) / LAND_SIDE) * LAND_STEP,
        }
      : undefined);
  selection.visible = !!item;
  if (item) {
    selection.position.set(
      item.x,
      terrainHeight(item.x, item.z, world.weather.land) +
        ("altitude" in item ? item.altitude : 0) +
        0.04,
      item.z,
    );
    selection.scale.setScalar(
      "genes" in item ? item.genes.size : selected < 0 ? 2.5 : 1,
    );
  }
  lineageOverlay.update(world, showLineages, selected);
  const family = familyOverlay.update(world, selected);
  breedingView.draw(world);
  if (followEnabled && family.living) {
    const shift = followShift(controls.target, family.living, dt);
    controls.target.add(new THREE.Vector3(shift.x, shift.y, shift.z));
    camera.position.add(new THREE.Vector3(shift.x, shift.y, shift.z));
  }
  controls.update();
  const label = $("follow-label");
  label.hidden = !family.living;
  if (family.living) {
    const point = new THREE.Vector3(
      family.living.x,
      terrainHeight(family.living.x, family.living.z, world.weather.land) +
        1.35 +
        family.living.altitude,
      family.living.z,
    ).project(camera);
    const bounds = renderer.domElement.getBoundingClientRect();
    label.hidden =
      point.z > 1 ||
      point.z < -1 ||
      Math.abs(point.x) > 0.95 ||
      Math.abs(point.y) > 0.85;
    label.style.left = `${((point.x + 1) * bounds.width) / 2}px`;
    label.style.top = `${((1 - point.y) * bounds.height) / 2}px`;
    label.textContent = `#${family.living.id} ${family.living.mouseLineage ? lineageIdentity(family.living.mouseLineage.id).name : SPECIES[family.living.species].label} · G${family.living.generation} · ${family.living.state}`;
  }
  const renderStart = profiling ? performance.now() : 0;
  renderer.render(scene, camera);
  measured("render submission (not GPU time)", renderStart);
}
const ray = new THREE.Raycaster(),
  pointer = new THREE.Vector2();
const brushPositions = new Float32Array(48 * 3);
const brushGeometry = new THREE.BufferGeometry();
brushGeometry.setAttribute(
  "position",
  new THREE.BufferAttribute(brushPositions, 3),
);
const brushPreview = new THREE.LineLoop(
  brushGeometry,
  new THREE.LineBasicMaterial({
    color: "#fff5c4",
    depthTest: false,
    transparent: true,
    opacity: 0.85,
  }),
);
brushPreview.visible = false;
brushPreview.frustumCulled = false;
brushPreview.renderOrder = 20;
scene.add(brushPreview);
let lastBrushMove = 0;
renderer.domElement.addEventListener("pointermove", (e) => {
  if (activeTool === "inspect") {
    brushPreview.visible = false;
    return;
  }
  if (performance.now() - lastBrushMove < 50) return;
  lastBrushMove = performance.now();
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.set(
    ((e.clientX - bounds.left) / bounds.width) * 2 - 1,
    (-(e.clientY - bounds.top) / bounds.height) * 2 + 1,
  );
  ray.setFromCamera(pointer, camera);
  const hit = ray.intersectObject(
    scene.children.find((o) => o.userData.isTerrain)!,
  )[0]?.point;
  brushPreview.visible = !!hit;
  if (!hit) return;
  const radius = Number(($("brush-radius") as HTMLInputElement).value);
  for (let i = 0; i < 48; i++) {
    const angle = (i / 48) * Math.PI * 2,
      x = hit.x + Math.cos(angle) * radius,
      z = hit.z + Math.sin(angle) * radius;
    brushPositions.set(
      [x, terrainHeight(x, z, world.weather.land) + 0.08, z],
      i * 3,
    );
  }
  brushGeometry.attributes.position.needsUpdate = true;
});
renderer.domElement.addEventListener("pointerleave", () => {
  brushPreview.visible = false;
});
const downPointers = new Set<number>();
let islandTap: { id: number; x: number; y: number } | null = null;
renderer.domElement.addEventListener("pointerdown", (e) => {
  downPointers.add(e.pointerId);
  islandTap =
    downPointers.size === 1 && e.isPrimary && e.button === 0
      ? { id: e.pointerId, x: e.clientX, y: e.clientY }
      : null;
});
function movedBeyondTap(e: PointerEvent) {
  return (
    islandTap &&
    Math.hypot(e.clientX - islandTap.x, e.clientY - islandTap.y) >
      (e.pointerType === "touch" ? 10 : 6)
  );
}
renderer.domElement.addEventListener("pointermove", (e) => {
  if (islandTap?.id === e.pointerId && movedBeyondTap(e)) islandTap = null;
});
for (const event of ["pointercancel", "lostpointercapture"] as const) {
  renderer.domElement.addEventListener(event, (e) => {
    downPointers.delete(e.pointerId);
    if (islandTap?.id === e.pointerId) islandTap = null;
  });
}
renderer.domElement.addEventListener("pointerup", (e) => {
  const tapped = islandTap?.id === e.pointerId && !movedBeyondTap(e);
  downPointers.delete(e.pointerId);
  islandTap = null;
  if (!tapped) return;
  const r = renderer.domElement.getBoundingClientRect();
  pointer.set(
    ((e.clientX - r.left) / r.width) * 2 - 1,
    (-(e.clientY - r.top) / r.height) * 2 + 1,
  );
  ray.setFromCamera(pointer, camera);
  if (activeTool !== "inspect") {
    const ground = scene.children.find((o) => o.userData.isTerrain)!;
    const hit = ray.intersectObject(ground)[0]?.point;
    if (hit) {
      const [kind, variety] = (
        $("plant-kind") as HTMLSelectElement
      ).value.split(":");
      const plantsBefore = world.plants.length;
      const message = applyIslandTool(
        world,
        activeTool,
        hit.x,
        hit.z,
        Number(($("brush-radius") as HTMLInputElement).value),
        Number(($("brush-strength") as HTMLInputElement).value) / 100,
        ($("brush-mode") as HTMLSelectElement).value === "remove",
        kind as PlantKind,
        Number(variety),
      );
      $("tool-feedback").textContent = message;
      if (($("brush-mode") as HTMLSelectElement).value !== "remove") {
        if (activeTool === "plants" && world.plants.length > plantsBefore)
          lessonAction("plant");
        if (
          activeTool === "water" &&
          Math.hypot(hit.x, hit.z) <= WORLD_RADIUS - 2
        )
          lessonAction("water");
      }
      meshTime = -1;
      updateBiomes(world, true);
      updateUI();
      draw(0);
      saveIsland();
    }
    return;
  }
  for (const mesh of organisms.pickables) mesh.computeBoundingSphere();
  environmentView.mushrooms.computeBoundingSphere();
  environmentView.stems.computeBoundingSphere();
  for (const mesh of [
    environmentView.dens,
    environmentView.holes,
    environmentView.eggs,
  ])
    mesh.computeBoundingSphere();
  const hits = ray.intersectObjects([
    environmentView.dens,
    environmentView.holes,
    environmentView.eggs,
    ...organisms.pickables,
    environmentView.mushrooms,
    environmentView.stems,
  ]);
  if (hits.length) {
    const h = hits[0];
    selectedHome = null;
    if (h.object === environmentView.dens || h.object === environmentView.holes)
      selectedHome = `den:${world.dens[h.instanceId!].id}`;
    else if (h.object === organisms.nests || h.object === organisms.perches)
      selectedHome = `nest:${organisms.ids.get(h.object)![h.instanceId!]}`;
    else if (h.object === environmentView.eggs) {
      const n = world.eggs[h.instanceId!]?.embryo.nursery;
      if (n)
        selectedHome = n.kind === "nest" ? `nest:${n.owner}` : `den:${n.site}`;
    }
    if (selectedHome) {
      selected = 0;
      watchedHome = selectedHome;
      updateUI();
      return;
    }
    if (h.object === environmentView.eggs) return;
    selected =
      h.object === environmentView.mushrooms ||
      h.object === environmentView.stems
        ? -environmentView.mushroomCells[h.instanceId!] - 1
        : organisms.ids.get(h.object)![h.instanceId!];
    updateUI();
  } else {
    // Small creatures remain easy to select on touch screens and at distant zoom.
    let nearest = 18;
    for (const organism of [...world.animals, ...world.plants]) {
      const projected = new THREE.Vector3(
        organism.x,
        terrainHeight(organism.x, organism.z, world.weather.land) + 0.4,
        organism.z,
      ).project(camera);
      const distance = Math.hypot(
        ((projected.x + 1) * r.width) / 2 + r.left - e.clientX,
        ((1 - projected.y) * r.height) / 2 + r.top - e.clientY,
      );
      if (distance < nearest) {
        nearest = distance;
        selected = organism.id;
      }
    }
    updateUI();
  }
});
function trait(label: string, value: number, max: number, text: string) {
  return `<div class="trait"><div><span>${label}</span><b>${text}</b></div><div class="track"><i style="width:${Math.min(100, (value / max) * 100)}%"></i></div></div>`;
}
function updateUI() {
  // Saved simulation age keeps welcome copy out of established islands.
  document.querySelector("main")!.classList.toggle("settled", world.time >= 90);
  if (advanceWorker) return;
  $("restore-jump").hidden = !hasJumpBackup(world.level.id);
  const mode = $("generation-mode") as HTMLSelectElement;
  const supported = supportsApproximation(world);
  mode.options[1].disabled = !supported;
  if (!supported) mode.value = "detailed";
  $("generation-mode-help").textContent = !supported
    ? "Approximate mode currently supports islands with mice and bugs only."
    : mode.value === "approximate"
      ? "Experimental: estimates local feeding and migration. Keeps individuals and genes; skips brain decisions and exact paths. A recovery save is kept."
      : "Detailed simulates individual encounters.";
  $("lesson").hidden = world.level.mode === "sandbox";
  $("scarcity").hidden = world.level.mode !== "sandbox";
  document.querySelector<HTMLElement>(".challenge")!.hidden =
    world.level.mode !== "sandbox";
  document.querySelector<HTMLElement>(".footer")!.textContent =
    `Seed ${world.level.seed} · All life simulated on your device`;

  const options = world.level.availableSpecies
    .map(
      (species) =>
        `<option value="${species}">${SPECIES[species].label}</option>`,
    )
    .join("");
  if ($("animal-kind").innerHTML !== options)
    $("animal-kind").innerHTML = options;
  $("level-name").textContent =
    world.level.name + (world.level.mode === "sandbox" ? " · SANDBOX" : "");
  updateLevelProgress(world.level, levelProgress, {
    time: world.time,
    births: world.births,
    bugs: world.animals.filter((a) => a.species === "bug").length,
    omnivoreMice: establishedOmnivores(world),
    plants: world.plants.length,
    generation: Math.max(1, ...world.animals.map((a) => a.generation)),
  });
  if (world.level.mode === "challenge") {
    if (world.plants.some((p) => p.id === selected))
      lessonAction("inspectPlant");
    if (world.animals.some((a) => a.id === selected && a.species === "mouse"))
      lessonAction("inspectMouse");
    const html = lessonContent(levelProgress);
    if ($("lesson").innerHTML !== html) $("lesson").innerHTML = html;
  }
  document
    .querySelectorAll<HTMLButtonElement>("[data-tool]")
    .forEach(
      (b) =>
        (b.disabled = !world.level.tools.includes(
          b.dataset.tool as IslandTool,
        )),
    );

  const plantFood = world.plants.reduce((n, p) => n + p.energy, 0);
  const plantCapacity = world.plants.reduce(
    (n, p) => n + PLANTS[p.kind].capacity,
    0,
  );
  const depletedPlants = world.plants.filter((p) => p.depletion > 0).length;
  const weather = climate(world.time, world.weather);
  const regions = [
    ["Forest", -25, 0],
    ["Plains", 0, 20],
    ["Desert", 30, -15],
  ] as const;
  const regionalSummary = regions
    .map(([name, x, z]) => {
      const c = regionalClimate(world.time, world.weather, x, z);
      return `${name}: ${c.temperature.toFixed(0)}°C, ${c.rain > 0.2 ? "rain" : "dry"}, soil ${Math.round(c.moisture * 100)}%`;
    })
    .join(" · ");
  $("weather-panel").innerHTML =
    `<div><b>${weather.period} · ${weather.temperature.toFixed(0)}°C</b><span>Regional weather</span></div><p>Day ${1 + Math.floor(world.time / DAY_LENGTH)} · Soil moisture ${Math.round(world.weather.moisture * 100)}% · Clouds ${Math.round(world.weather.cloud * 100)}%</p><p>${paused ? "Paused" : `Running ${measuredSpeed.toFixed(1)}× / requested ${rate}× · 30 fps render limit`}</p><p>Freshwater ${Math.round((world.ponds.reduce((s, p) => s + p.water, 0) / 3) * 100)}% · ${world.dens.filter((d) => d.progress >= 1).length} dens ready / ${world.dens.length} started</p><p>${regionalSummary}</p><p>River flow ${riverFlow(world.ponds).toFixed(1)}× · Lake outlets ${world.ponds.filter((p) => p.flow > 0.04).length}/3 · Eggs laid ${world.eggsLaid.toLocaleString()} · Developing eggs ${world.eggs.length} · Births ${world.births} · Egg losses ${world.eggsLost} · Dormant seeds ${world.seedBank.length} · Plant losses: drought ${world.plantDeaths.drought} · flooding ${world.plantDeaths.flooding} · disease ${world.plantDeaths.disease} · competition ${world.plantDeaths.competition} · depletion ${world.plantDeaths.depletion}</p><p>Stored plant food ${Math.round(plantFood).toLocaleString()} / ${Math.round(plantCapacity).toLocaleString()} energy · Depleted plants ${depletedPlants} / ${world.plants.length}</p><small>Ground colour tracks changing habitats. Mushrooms mark damp decomposition; dense wet patches can spread mould.</small><small>Gold home ring marks your selected animal’s den. Rain refills lakes; high lakes spill into the river. The waterfall and evaporation supply clouds that drift inland.</small>`;

  const family = selectedFamily(world, selected),
    watch = $("family-watch");
  watch.hidden = !family.selected;
  if (family.selected) {
    const chip = (a: Animal, role: string) =>
      `<button data-family-animal="${a.id}" class="family-chip ${role}">${role === "parent" ? "Parent" : "Child"} #${a.id} · G${a.generation}<small>${a.state}</small></button>`;
    const content = `<div class="watch-title">${family.living ? (followEnabled ? "Following" : "Selected") + " #" + selected + " · Generation " + family.selected.generation : "Family of #" + selected + " · Deceased"}</div><div class="family-colors"><span>◉ Selected</span><span>◉ Parent</span><span>◉ Offspring</span></div><div class="family-chips">${[family.parent, family.otherParent].map((parent) => (parent ? chip(parent, "parent") : "")).join("") || '<span class="empty-family">' + (family.selected.parent ? "No living parent" : "Founder") + "</span>"}${family.children.map((a) => chip(a, "child")).join("") || '<span class="empty-family">No living offspring yet</span>'}</div><div class="watch-tip">Orbit and zoom while following. Tap a relative to switch.</div>`;
    if (watch.innerHTML !== content) watch.innerHTML = content;
  }
  ($("youngest") as HTMLButtonElement).disabled = world.animals.length === 0;
  const breeding = breedingAnimals(world);
  breedingView.setAnimals(breeding);
  $("enable-breeding").hidden = world.naturalReproduction;
  $("breeding-guide").hidden = !world.naturalReproduction;
  ($("watch-breeding") as HTMLButtonElement).disabled = breeding.length === 0;
  const sleepers = world.animals.filter((a) => a.state === "Sleeping");
  $("sleepers").textContent = `Watch a sleeper · ${sleepers.length} asleep`;
  ($("sleepers") as HTMLButtonElement).disabled = sleepers.length === 0;
  const grazers = world.animals.filter((a) => a.kind === "grazer");
  const avg = (f: (a: Animal) => number) =>
    grazers.reduce((s, a) => s + f(a), 0) / (grazers.length || 1);
  $("population").textContent = "" + world.animals.length;
  $("plants").textContent = "" + world.plants.length;
  $("generation").textContent = "" + world.highestGeneration;
  $("day").textContent =
    `Simulation day ${1 + Math.floor(world.time / DAY_LENGTH)}`;
  const populations = populationCounts(world.animals, world.plants.length);
  $("counts").innerHTML = POPULATION_SERIES.map(
    (s) =>
      `<span style="color:${s.color}"><i aria-hidden="true" style="border-color:${s.color};border-style:${s.dash.length ? "dashed" : "solid"}"></i>${populations[s.key]} ${s.label}</span>`,
  ).join("");
  drawPopulationChart(
    $("chart") as HTMLCanvasElement,
    world.history,
    world.time,
    populations,
  );
  const initial = world.history[0];
  const speed = avg((a) => a.genes.speed),
    brain = avg((a) => a.genes.neurons);
  $("traits").innerHTML =
    trait(
      "Grazer speed",
      speed,
      2.5,
      `${speed.toFixed(2)} · ${speed >= initial.speed ? "+" : ""}${(speed - initial.speed).toFixed(2)}`,
    ) +
    trait("Grazer brain size", brain, 12, `${brain.toFixed(1)} neurons`) +
    trait(
      "Plant growth",
      world.plants.reduce((s, p) => s + p.growth, 0) /
        (world.plants.length || 1),
      1.7,
      `${world.plantBirths} seedlings born`,
    );
  $("mortality").innerHTML = `<div class="death-counts">${
    (Object.keys(DEATH_LABELS) as DeathCause[])
      .filter((k) => world.deathCounts[k] > 0)
      .map(
        (k) => `<span>${DEATH_LABELS[k]} <b>${world.deathCounts[k]}</b></span>`,
      )
      .join("") || "<p>No deaths recorded yet.</p>"
  }</div><p class="muted">Recorded cause is the event that depleted energy, or old age. Older deaths stay unclassified.</p>${world.deceased
    .slice(-4)
    .reverse()
    .map(
      (a) =>
        `<button class="death-record" data-dead="${a.id}">${SPECIES[a.species].label} #${a.id} · G${a.generation}<small>${DEATH_LABELS[a.deathCause ?? "unknown"]} · age ${a.age.toFixed(0)}s${a.killedBy ? " · predator #" + a.killedBy : ""}</small></button>`,
    )
    .join("")}`;
  $("species-list").innerHTML = (Object.keys(SPECIES) as Species[])
    .filter(
      (s) =>
        world.level.availableSpecies.includes(s) ||
        world.animals.some((a) => a.species === s),
    )
    .map((species) => {
      const group = world.animals.filter((a) => a.species === species),
        profile = SPECIES[species];
      const foods = Object.entries(world.foodTotals[species] ?? {}).sort((a, b) => b[1] - a[1]);
      const total = foods.reduce((sum, [, energy]) => sum + energy, 0);
      const intake = foods.map(([food, energy]) => `${food} ${Math.round(energy / total * 100)}%`).join(" · ");
      return `<button class="species-card" data-species="${species}" ${group.length ? "" : "disabled"}><b>${profile.label} <span>${group.length}</span></b><small>${species === "bird" ? `${group.filter((a) => a.birdDiet === "raptor").length} birds of prey · ${group.filter((a) => a.birdDiet === "insectivore").length} insect eaters · powered flight` : `${profile.diet} · ${profile.gait}`}</small>${intake ? `<small>Energy eaten since tracking began · ${intake}</small>` : ""}</button>`;
    })
    .join("");
  ($("introduce") as HTMLButtonElement).disabled =
    world.level.availableSpecies.every((s) =>
      world.animals.some((a) => a.species === s),
    ) &&
    (!world.level.availableSpecies.includes("bird") ||
      ["raptor", "insectivore"].every((role) =>
        world.animals.some((a) => a.species === "bird" && a.birdDiet === role),
      ));
  const branches = new Map<
    number,
    { id: number; label: string; count: number }
  >();
  for (const a of world.animals)
    if (a.mouseLineage) {
      const key = a.mouseLineage.id;
      const row = branches.get(key);
      if (row) row.count++;
      else
        branches.set(key, {
          id: a.id,
          label: `${lineageBadge(key)} · ${a.mouseLineage.niche} · #${key}`,
          count: 1,
        });
    }
  $("mouse-branches").innerHTML =
    [...branches.values()]
      .map(
        (b) =>
          `<button class="species-card" data-branch-animal="${b.id}"><b>${b.label}</b><small>${b.count} living mice · inspect branch ↗</small></button>`,
      )
      .join("") || '<p class="muted">No living mouse branches.</p>';
  $("plant-lineages").innerHTML = (Object.keys(PLANTS) as PlantKind[])
    .map((kind) => {
      const plants = world.plants.filter((p) => p.kind === kind);
      const mean =
        plants.reduce((n, p) => n + p.growth, 0) / (plants.length || 1);
      return `<div class="plant-row"><b>${PLANTS[kind].label}</b><span>${plants.length} alive · Gen ${plants.length ? Math.max(...plants.map((p) => p.generation)) : "—"}</span><small>Mean growth ${mean.toFixed(2)} · ${kind === "grass" ? "Quick spreading" : kind === "bush" ? "Rich foliage" : "Long lived"}</small></div>`;
    })
    .join("");
  const notes =
    world.animals.length === 0
      ? [
          "The animal population has died out. Family and cause-of-death records remain available.",
        ]
      : world.events.length
        ? world.events.slice(0, 2)
        : [
            "The founders are exploring. The first babies will inherit their own small differences.",
          ];
  $("events").replaceChildren(
    ...[
      `${world.births} births · ${world.deaths} deaths · ${Math.floor(world.time)} seconds of island life`,
      ...notes,
    ].map((text) => {
      const note = document.createElement("p");
      note.className = "note";
      note.textContent = text;
      return note;
    }),
  );
  const panel = $("inspect");
  if (selected) selectedHome = null;
  const home = selectedHome
    ? homeSites(world).find((h) => h.key === selectedHome)
    : undefined;
  if (home) {
    panel.hidden = false;
    panel.classList.remove("compact");
    delete panel.dataset.animal;
    panel.innerHTML = homeInspector(world, home);
  } else if (selectedHome) {
    panel.hidden = false;
    panel.classList.remove("compact");
    delete panel.dataset.animal;
    panel.innerHTML =
      '<button class="close" data-close-inspect>×</button><h3>This nest is no longer here.</h3><p>Its occupants have left or its tree has disappeared.</p>';
  } else if (selected) {
    panel.hidden = false;
    const a =
        world.animals.find((a) => a.id === selected) ??
        world.deceased.find((a) => a.id === selected),
      p = world.plants.find((p) => p.id === selected);
    const remains = world.plantRemains.find((p) => p.id === selected);
    const carcass = world.carcasses.find((c) => c.id === selected);
    if (carcass) {
      panel.classList.remove("compact");
      panel.innerHTML = `<button class="close" data-close-inspect aria-label="Close inspection">×</button><div class="eyebrow">RETURNING TO THE SOIL</div><h3>Animal remains #${carcass.id}</h3><p>${Math.round(carcass.decay * 100)}% consumed or decomposed</p><p>Bugs feed here. Decomposition and bug waste become litter, which fungi and worms recycle into soil nutrients.</p>`;
      return;
    }
    if (remains) {
      panel.classList.remove("compact");
      panel.hidden = false;
      panel.innerHTML = `<button class="close" data-close-inspect aria-label="Close inspection">×</button><div class="eyebrow">RETURNING TO THE SOIL</div><h3>Dead ${PLANT_VARIETIES[remains.kind][remains.variety]}</h3><p>${Math.round(remains.decay * 100)}% decomposed</p><p>Bugs feed on these remains. Mushrooms colonize damp wood, while fungi and worms recycle litter into nutrients for new plants.</p>`;
      return;
    }
    const fungalCell =
      selected < 0 ? world.weather.land?.[-selected - 1] : undefined;
    if (fungalCell) {
      panel.classList.remove("compact");
      panel.innerHTML = `<button class="close" data-close-inspect aria-label="Close inspection">×</button><div class="eyebrow">DECOMPOSERS · PATCH ${-selected}</div><h3>Mushroom patch</h3><p>Fungal cover ${Math.round(fungalCell.fungus * 100)}% · Soil moisture ${Math.round(fungalCell.moisture * 100)}% · Decaying litter ${Math.round(fungalCell.litter * 100)}% · Worms ${Math.round(fungalCell.worms * 100)}% · Soil nutrients ${Math.round((fungalCell.nutrients ?? 0.5) * 100)}%</p><p>Fungi and worms recycle damp litter into soil nutrients that plants use to grow. Mushrooms feed mice, bugs and insect-eating birds. Dense fungal growth can spread infection. These caps show a shared soil patch, not individual plant lineages.</p><p>Use Water, Soil or Mushrooms to encourage growth, or Remove mode to thin it.</p>`;
    } else if (a) {
      panel.classList.toggle("compact", compactInspector);
      renderAnimalInspector(panel, a, world, followEnabled, compactInspector);
    } else {
      panel.classList.remove("compact");
      delete panel.dataset.animal;
      panel.innerHTML =
        '<button class="close" id="close-inspect" aria-label="Close inspection">×</button>' +
        (p
          ? `<div class="eyebrow">${PLANTS[p.kind].label.toUpperCase()} #${p.id} · GENERATION ${p.generation}</div><h3>${PLANT_VARIETIES[p.kind][p.variety]} lineage</h3><p>Energy ${p.energy.toFixed(0)} · Age ${Math.floor(p.age)} · Health ${p.health.toFixed(0)}% · Infection ${(p.infection * 100).toFixed(0)}%</p><p>Sunlight, water and soil nutrients support growth. Grazing removes edible foliage. Stored reserves can help regrowth, but prolonged depletion can kill this plant.</p><p>Stored reserves ${p.reserves.toFixed(1)} · Depletion stress ${p.depletion.toFixed(0)}s · ${p.depletion > 0 ? "Recovering from depletion; prolonged stress risks death" : "Not depleted"}</p><p>Drought tolerance ${p.droughtTolerance.toFixed(2)} · Flood tolerance ${p.floodTolerance.toFixed(2)} · Disease resistance ${p.resistance.toFixed(2)}</p><p><b>Expression memory</b><br>Drought: ${Math.round(p.expression.droughtTolerance * 100)}% active · ${Math.round(p.expression.droughtTolerance * 60)}% exact-copy chance<br>Flooding: ${Math.round(p.expression.floodTolerance * 100)}% active · ${Math.round(p.expression.floodTolerance * 60)}% exact-copy chance</p><p>Seeds retain activated tolerance values more often, with 35% inherited memory. Memory fades without exposure; tolerance is not automatically increased.</p>${trait("Growth", p.growth, 1.7, p.growth.toFixed(2))}${trait("Defence", p.defense, 0.8, p.defense.toFixed(2))}${trait("Seed spread", p.spread, 6, p.spread.toFixed(1) + "m")}<p>Parent ${p.parent ? "#" + p.parent : "founder"} · Seeds inherit this species and mutate its traits.</p>`
          : "<h3>A life completed.</h3><p>This organism is gone. Its descendants may still carry its traits.</p>");
      $("close-inspect").onclick = () => {
        selected = 0;
        panel.hidden = true;
      };
    }
  } else panel.hidden = true;
  if (selected && watchedHome && !panel.querySelector("[data-return-home]"))
    panel.insertAdjacentHTML(
      "beforeend",
      "<button data-return-home>← Return to nursery</button>",
    );
}
$("inspect").addEventListener("click", (e) => {
  const button = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (!button) return;
  if (button.hasAttribute("data-close-inspect")) {
    selectedHome = null;
    watchedHome = null;
    selected = 0;
    $("inspect").hidden = true;
  }
  if (button.dataset.watchParent) {
    selected = Number(button.dataset.watchParent);
    selectedHome = null;
    followEnabled = true;
    updateUI();
  }
  if (button.hasAttribute("data-return-home")) {
    selected = 0;
    selectedHome = watchedHome;
    const home = homeSites(world).find((h) => h.key === selectedHome);
    if (home) {
      const offset = camera.position.clone().sub(controls.target);
      controls.target.set(
        home.x,
        terrainHeight(home.x, home.z, world.weather.land) + home.altitude,
        home.z,
      );
      camera.position.copy(controls.target).add(offset);
    }
    updateUI();
  }
  if (button.dataset.animal) {
    selected = Number(button.dataset.animal);
    updateUI();
  }
  if (button.hasAttribute("data-toggle-follow")) {
    followEnabled = !followEnabled;
    updateUI();
  }
  if (button.hasAttribute("data-toggle-details")) {
    compactInspector = !compactInspector;
    $("inspect").scrollTop = 0;
    updateUI();
  }
  if (button.hasAttribute("data-focus-animal")) {
    const animal = world.animals.find((a) => a.id === selected);
    if (animal) {
      const offset = camera.position.clone().sub(controls.target);
      controls.target.set(animal.x, 0, animal.z);
      camera.position.copy(controls.target).add(offset);
    }
  }
});
$("family-watch").addEventListener("click", (e) => {
  const button = (e.target as HTMLElement).closest<HTMLButtonElement>(
    "[data-family-animal]",
  );
  if (button) {
    selected = Number(button.dataset.familyAnimal);
    updateUI();
  }
});
$("mortality").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-dead]");
  if (b) {
    selected = Number(b.dataset.dead);
    compactInspector = false;
    updateUI();
  }
});
$("species-list").addEventListener("click", (e) => {
  const button = (e.target as HTMLElement).closest<HTMLButtonElement>(
    "[data-species]",
  );
  if (button) {
    const animal = world.animals.find(
      (a) => a.species === button.dataset.species,
    );
    if (animal) {
      selected = animal.id;
      updateUI();
    }
  }
});
$("introduce").onclick = () => {
  let added = 0;
  for (const species of world.level.availableSpecies) {
    if (!world.animals.some((a) => a.species === species)) {
      const count = species === "bug" ? 12 : species === "bird" ? 6 : 4;
      for (let i = 0; i < count; i++) {
        world.addAnimal(SPECIES[species].kind, undefined, species);
        added++;
      }
    }
  }
  if (world.level.availableSpecies.includes("bird"))
    for (const role of ["raptor", "insectivore"] as const)
      if (
        !world.animals.some((a) => a.species === "bird" && a.birdDiet === role)
      )
        for (let i = 0; i < 4; i++) {
          world.addAnimal("hunter", undefined, "bird").birdDiet = role;
          added++;
        }
  $("wildlife-note").textContent =
    `Introduced ${added} founders. Their offspring inherit their species, body and brain.`;
  updateUI();
  saveIsland();
};
$("enable-breeding").onclick = () => {
  if (advanceWorker || islandTransition) return;
  world.naturalReproduction = true;
  updateUI();
  saveIsland();
};
$("watch-breeding").onclick = () => {
  const animals = breedingAnimals(world);
  const animal =
    animals[
      (animals.findIndex((candidate) => candidate.id === selected) + 1) %
        animals.length
    ];
  if (!animal) return;
  selected = animal.id;
  selectedHome = null;
  followEnabled = true;
  updateUI();
  $("world").scrollIntoView({ block: "start", behavior: "instant" });
};
$("youngest").onclick = () => {
  const animal = world.animals.reduce<Animal | undefined>(
    (best, a) => (!best || a.age < best.age ? a : best),
    undefined,
  );
  if (animal) {
    selected = animal.id;
    updateUI();
  }
};
$("sleepers").onclick = () => {
  const animal = world.animals.find((a) => a.state === "Sleeping");
  if (animal) {
    selected = animal.id;
    updateUI();
  }
};
$("pause").onclick = () => {
  paused = !paused;
  $("pause").textContent = paused ? "▶" : "Ⅱ";
  $("pause").setAttribute(
    "aria-label",
    paused ? "Resume simulation" : "Pause simulation",
  );
};
document.querySelectorAll<HTMLButtonElement>(".rate").forEach(
  (b) =>
    (b.onclick = () => {
      rate = Number(b.dataset.rate);
      document
        .querySelectorAll(".rate")
        .forEach((n) => n.classList.remove("active"));
      b.classList.add("active");
    }),
);
function chooseTool(tool: IslandTool) {
  if (!world.level.tools.includes(tool)) return;
  activeTool = tool;
  brushPreview.visible = false;
  document
    .querySelectorAll<HTMLButtonElement>("[data-tool]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.tool === tool)),
    );
  const description: Record<IslandTool, string> = {
    inspect: "Explore: tap an animal, plant or mushroom patch to inspect it.",
    water:
      "Water: pour onto the ground. Runoff flows downhill into hollows and channels. Remove drains it.",
    soil: "Soil: add fertile litter and grass cover. Remove strips it back.",
    sand: "Sand: make dry, free-draining ground. Remove reduces the sandy layer.",
    plants:
      "Plant: choose a variety, then tap to plant a patch. Remove clears that family.",
    fungus: "Mushrooms: encourage fungal growth. Remove thins the patch.",
    disease:
      "Disease: infect nearby life. Remove reduces infection and fungal load.",
    raise: "Raise: build gentle hills. Remove lowers them.",
    dig: "Dig: carve a hollow or broad channel. Connect it to water or wait for rain. Remove raises it.",
  };
  $("world").dataset.tool = tool;
  $("tool-help").textContent = description[tool];
  $("plant-options").hidden = tool !== "plants";
  $("desktop-hint").textContent =
    tool === "inspect"
      ? "Drag to orbit · Arrow keys to pan · Tap life to inspect"
      : "Tap the island to apply the brush · Drag to orbit · Esc to explore";
  $("touch-hint").textContent =
    tool === "inspect"
      ? "Tap life to inspect · Drag to orbit · Pinch to zoom"
      : "Tap to apply · Drag to orbit · Pinch to zoom";
  renderer.domElement.style.cursor = tool === "inspect" ? "grab" : "crosshair";
}
document
  .querySelectorAll<HTMLButtonElement>("[data-tool]")
  .forEach((b) => (b.onclick = () => chooseTool(b.dataset.tool as IslandTool)));
for (const id of ["radius", "strength"])
  $("brush-" + id).oninput = () => {
    $("brush-" + id + "-value").textContent =
      ($("brush-" + id) as HTMLInputElement).value +
      (id === "radius" ? " m" : "%");
  };
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") chooseTool("inspect");
});
chooseTool("inspect");
$("reset").onclick = () => {
  if (advanceWorker || islandTransition) return;
  if (
    !confirm(
      "Start a new island? This replaces your saved island in this browser.",
    )
  )
    return;
  generationAdvance?.cancel();
  $("advance-generations").textContent = "Run";
  world = new World(world.level.seed, world.level, true);
  selectedHome = null;
  watchedHome = null;
  levelProgress = initialProgress(world.level);
  saveBlocked = false;
  acc = 0;
  chooseTool("inspect");
  selected = 0;
  paused = false;
  $("pause").textContent = "Ⅱ";
  $("pause").setAttribute("aria-label", "Pause simulation");
  setChallenge(false);
  updateUI();
  saveIsland();
};
function setChallenge(value: boolean) {
  world.scarcity = value;
  $("challenge-title").textContent = value ? "Lean times" : "Room to grow";
  $("challenge-text").textContent = value
    ? "Plants regrow more slowly. Which strategies can make every meal count?"
    : "Food is plentiful. Give your first generations time to settle in.";
  $("scarcity").innerHTML = value
    ? "Restore abundant food <span>→</span>"
    : "Try lean times <span>→</span>";
}
$("scarcity").onclick = () => {
  setChallenge(!world.scarcity);
  saveIsland();
};
// This is a view preference, independent of island saves.
let journalCollapsed = false;
try {
  journalCollapsed =
    localStorage.getItem("evolutio.journal-collapsed") === "true";
} catch {
  /* Storage can be unavailable. */
}
function updateJournalVisibility() {
  $("island-journal").hidden = journalCollapsed;
  document
    .querySelector("main")!
    .classList.toggle("journal-collapsed", journalCollapsed);
  $("journal-verb").textContent = journalCollapsed ? "Show " : "Hide ";
  $("journal-toggle").setAttribute(
    "aria-label",
    journalCollapsed ? "Show journal" : "Hide journal",
  );
  $("journal-toggle").setAttribute("aria-expanded", String(!journalCollapsed));
}
$("journal-toggle").onclick = () => {
  journalCollapsed = !journalCollapsed;
  updateJournalVisibility();
  try {
    localStorage.setItem(
      "evolutio.journal-collapsed",
      String(journalCollapsed),
    );
  } catch {
    /* Toggling still works without persistence. */
  }
};
updateJournalVisibility();
const guide = $("guide") as HTMLDialogElement;
$("help").onclick = () => guide.showModal();
$("close-guide").onclick = $("begin").onclick = () => guide.close();
new ResizeObserver(() => {
  const r = $("scene").getBoundingClientRect();
  camera.aspect = r.width / r.height;
  camera.fov = THREE.MathUtils.radToDeg(
    2 *
      Math.atan(
        Math.tan(THREE.MathUtils.degToRad(40) / 2) / Math.min(1, camera.aspect),
      ),
  );
  camera.updateProjectionMatrix();
  renderer.setSize(r.width, r.height);
}).observe($("scene"));
let last = performance.now(),
  acc = 0,
  lastUI = 0,
  lastFrame = 0,
  measuredSpeed = 0,
  speedStart = performance.now(),
  simulatedSinceMeasure = 0;
function frame(now: number) {
  requestAnimationFrame(frame);
  if (advanceWorker) {
    last = now;
    acc = 0;
    return;
  }
  if (document.hidden) {
    last = now;
    acc = 0;
    return;
  }
  if (now - lastFrame < 1000 / 30) return;
  lastFrame = now;
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (
    !paused &&
    !document.hidden &&
    !($("level-select") as HTMLDialogElement).open
  ) {
    acc = Math.min(0.4, acc + dt * rate);
    const stepStart = performance.now();
    while (acc >= 0.1) {
      const simulationStart = profiling ? performance.now() : 0;
      world.step(0.1);
      measured("simulation", simulationStart);
      acc -= 0.1;
      simulatedSinceMeasure += 0.1;
      if (performance.now() - stepStart >= 6) break;
    }
  }
  if (now - speedStart >= 1000) {
    measuredSpeed = simulatedSinceMeasure / ((now - speedStart) / 1000);
    simulatedSinceMeasure = 0;
    speedStart = now;
  }
  draw(dt);
  if (now - lastUI > 400) {
    const uiStart = profiling ? performance.now() : 0;
    updateUI();
    measured("journal + inspector", uiStart);
    if (profiling)
      $("runtime-profile").textContent = JSON.stringify(
        {
          animals: world.animals.length,
          plants: world.plants.length,
          actualSpeed: measuredSpeed,
          requestedSpeed: rate,
          drawCalls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          timings: timingReport(),
        },
        null,
        2,
      );
    lastUI = now;
  }
}
let saveBlocked = false;
let expectedSlotValue: string | null = null;
let pendingSave: Promise<boolean> | null = null;
function saveIsland(): Promise<boolean> {
  if (pendingSave) return pendingSave;
  pendingSave = writeIsland().finally(() => {
    pendingSave = null;
    ($("save") as HTMLButtonElement).disabled = false;
  });
  return pendingSave;
}
async function writeIsland() {
  if (advanceWorker || islandTransition === "import") return false;
  if (saveBlocked) return false;
  ($("save") as HTMLButtonElement).disabled = true;
  $("save-status").textContent = "Saving island…";
  try {
    expectedSlotValue = await saveBrowserSlot(
      {
        world,
        rate,
        paused,
        selected,
        follow: followEnabled,
        level: levelProgress,
      },
      expectedSlotValue,
    );
    $("save-status").textContent =
      `Saved ${world.level.name} at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    return true;
  } catch (error) {
    $("save-status").textContent =
      error instanceof Error
        ? error.message
        : "Could not save — browser storage is unavailable or full.";
    return false;
  }
}
try {
  expectedSlotValue = islandStorage.getItem(slotKey("sandbox"));
  const restored = loadSlot(islandStorage, "sandbox");
  if (restored) {
    world = restored.world;
    levelProgress = restored.level ?? initialProgress(world.level);
    rate = restored.rate;
    paused = restored.paused;
    selected = restored.selected;
    followEnabled = restored.follow ?? true;
    $("save-status").textContent = "Saved island restored";
  }
} catch (error) {
  console.error("Island restore failed", error);
  saveBlocked = true;
  $("save-status").textContent =
    "Save could not be loaded. It has not been overwritten. Save island to replace it.";
}
$("save").onclick = async () => {
  if (islandTransition === "import") return;
  if (saveBlocked) {
    if (!confirm("Replace the unreadable save with this island?")) return;
    saveBlocked = false;
    expectedSlotValue = islandStorage.getItem(slotKey(world.level.id));
  }
  saveIsland();
};
$("pause").textContent = paused ? "▶" : "Ⅱ";
$("pause").setAttribute(
  "aria-label",
  paused ? "Resume simulation" : "Pause simulation",
);
document
  .querySelectorAll<HTMLButtonElement>(".rate")
  .forEach((b) =>
    b.classList.toggle("active", Number(b.dataset.rate) === rate),
  );
setChallenge(world.scarcity);
setInterval(saveIsland, 10_000);
window.addEventListener("pagehide", saveIsland);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) saveIsland();
});
updateUI();
requestAnimationFrame(frame);

function lessonAction(metric: LevelObjective["metric"]) {
  if (world.level.mode === "sandbox") return;
  const before = levelProgress.completedObjectives.length;
  updateLevelProgress(world.level, levelProgress, { [metric]: 1 });
  if (levelProgress.completedObjectives.length > before) saveIsland();
}
async function showLevels() {
  if (advanceWorker || islandTransition) return;
  if (!saveBlocked) await saveIsland();
  if (advanceWorker || islandTransition) return;
  const dialog = $("level-select") as HTMLDialogElement;
  $("level-cards").innerHTML = levelCards(islandStorage);
  $("level-error").textContent = saveBlocked
    ? "Your sandbox save could not be loaded and is preserved. You can still start or continue another island."
    : "";
  if (!dialog.open) dialog.showModal();
}
$("levels-button").onclick = showLevels;
$("close-levels").onclick = () =>
  ($("level-select") as HTMLDialogElement).close();
$("lesson").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (!b) return;
  if (b.hasAttribute("data-show-levels")) {
    saveIsland();
    showLevels();
  }
  if (b.dataset.meetLesson) {
    const item =
      b.dataset.meetLesson === "plant"
        ? world.plants[0]
        : world.animals.find((a) => a.species === "mouse");
    if (item) {
      selected = item.id;
      selectedHome = null;
      updateUI();
    }
  }
});
$("level-cards").addEventListener("click", async (e) => {
  if (advanceWorker || islandTransition) return;
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>(
    "[data-open-level]",
  );
  if (!b) return;
  const id = b.dataset.openLevel!;
  islandTransition = "switch";
  try {
    if (!unlocked(islandStorage, id))
      throw new Error("Complete First Grove to unlock predators.");
    // Read destination before saving/switching. Invalid slots are never replaced silently.
    const destinationRaw = islandStorage.getItem(slotKey(id));
    const loaded = loadSlot(islandStorage, id);
    const savedCurrent = saveBlocked || (await saveIsland());
    preserveBeforeSwitch(saveBlocked, () => savedCurrent);
    const next: Session = loaded ?? {
      world: new World(undefined, LEVELS[id], true),
      level: initialProgress(LEVELS[id]),
      rate: 1,
      paused: false,
      selected: 0,
      follow: true,
    };
    if (id === world.level.id) {
      ($("level-select") as HTMLDialogElement).close();
      return;
    }
    // Verify destination storage succeeds before replacing the active session.
    const nextRaw = await saveBrowserSlot(next, destinationRaw);
    activateIsland(next, nextRaw);
    ($("level-select") as HTMLDialogElement).close();
    $("save-status").textContent =
      `${world.level.name} restored — separate save`;
  } catch (error) {
    $("level-error").textContent =
      error instanceof Error
        ? error.message
        : "Could not switch islands. Saves preserved.";
  } finally {
    islandTransition = null;
  }
});
function activateIsland(next: Session, saved: string) {
  generationAdvance?.cancel();
  $("advance-generations").textContent = "Run";
  expectedSlotValue = saved;
  world = next.world;
  levelProgress = next.level ?? initialProgress(world.level);
  rate = next.rate;
  paused = next.paused;
  selected = next.selected;
  followEnabled = next.follow ?? true;
  selectedHome = null;
  watchedHome = null;
  acc = 0;
  saveBlocked = false;
  chooseTool("inspect");
  $("pause").textContent = paused ? "▶" : "Ⅱ";
  $("pause").setAttribute(
    "aria-label",
    paused ? "Resume simulation" : "Pause simulation",
  );
  document
    .querySelectorAll<HTMLButtonElement>(".rate")
    .forEach((b) =>
      b.classList.toggle("active", Number(b.dataset.rate) === rate),
    );
  setChallenge(world.scarcity);
  updateUI();
}
showLevels();

function setAdvanceMode(active: boolean) {
  $("world").classList.toggle("advancing-offscreen", active);
  $("advance-overlay").hidden = !active;
  ($("generation-mode") as HTMLSelectElement).disabled = active;
  ($("generation-count") as HTMLSelectElement).disabled = active;
  ($("restore-jump") as HTMLButtonElement).disabled = active;
  $("scene").inert = active;
  $("inspect").inert = active;
  document.querySelector<HTMLElement>("aside")!.inert = active;
  document.querySelector<HTMLElement>(".island-controls")!.inert = active;
  ($("levels-button") as HTMLButtonElement).disabled = active;
  document
    .querySelectorAll<HTMLButtonElement>(".rate")
    .forEach((b) => (b.disabled = active));
}
function finishAdvance(message: string) {
  const returnFocus = $("advance-overlay").contains(document.activeElement);
  advanceWorker?.terminate();
  advanceWorker = null;
  generationAdvance?.cancel();
  paused = true;
  acc = 0;
  last = performance.now();
  setAdvanceMode(false);
  ($("advance-generations") as HTMLButtonElement).disabled = false;
  $("stop-background-advance").removeAttribute("aria-disabled");
  ($("pause-background-advance") as HTMLButtonElement).disabled = false;
  $("advance-generations").textContent = "Run";
  $("generation-status").textContent = message;
  $("pause").textContent = "▶";
  $("pause").setAttribute("aria-label", "Resume simulation");
  updateUI();
  draw(0);
  if (returnFocus) $("advance-generations").focus({ preventScroll: true });
}
$("generation-mode").onchange = updateUI;
$("restore-jump").onclick = async () => {
  if (advanceWorker || islandTransition) return;
  islandTransition = "recovery";
  paused = true;
  try {
    if (!(await saveIsland())) return;
    const restored = await restoreJumpBackup(
      {
        world,
        rate,
        paused: true,
        selected,
        follow: followEnabled,
        level: levelProgress,
      },
      expectedSlotValue,
    );
    expectedSlotValue = restored.raw;
    world = restored.session.world;
    levelProgress = restored.session.level ?? initialProgress(world.level);
    selected = restored.session.selected;
    selectedHome = null;
    watchedHome = null;
    finishAdvance(
      "Recovery restored. Your previous island is now the recovery save; swap again to return.",
    );
  } catch (error) {
    $("generation-status").textContent =
      error instanceof Error
        ? error.message
        : "Recovery failed; current island preserved.";
  } finally {
    islandTransition = null;
  }
};
$("stop-background-advance").onclick = () => $("advance-generations").click();
$("pause-background-advance").onclick = () => $("pause").click();
$("advance-generations").onclick = async () => {
  if (advanceWorker) {
    if ($("stop-background-advance").getAttribute("aria-disabled") === "true")
      return;
    advanceWorker.postMessage({ type: "stop" });
    ($("advance-generations") as HTMLButtonElement).disabled = true;
    $("stop-background-advance").setAttribute("aria-disabled", "true");
    ($("pause-background-advance") as HTMLButtonElement).disabled = true;
    $("background-mode").textContent = "Saving your island…";
    $("background-status").textContent = "Saving your island before returning.";
    return;
  }
  if (islandTransition) return;
  islandTransition = "advance";
  try {
    await startAdvance();
  } finally {
    islandTransition = null;
  }
};
async function startAdvance() {
  // Preserve a recoverable checkpoint before handing simulation ownership over.
  if (!(await saveIsland())) {
    $("generation-status").textContent =
      "Could not save the starting island. Resolve the save issue before advancing.";
    return;
  }
  const approximate =
    ($("generation-mode") as HTMLSelectElement).value === "approximate";
  if (approximate && !supportsApproximation(world)) {
    $("generation-status").textContent =
      "Approximate mode supports mice and bugs only.";
    return;
  }
  const count = Number(($("generation-count") as HTMLSelectElement).value);
  generationAdvance = new GenerationAdvance(world, count);
  const saved = encodeSave({
    world,
    rate,
    paused: true,
    selected,
    follow: followEnabled,
    level: levelProgress,
  });
  try {
    if (approximate) await saveJumpBackup(decodeSave(saved), expectedSlotValue);
    advanceWorker = new Worker(
      new URL("./generation-worker.ts", import.meta.url),
      { type: "module" },
    );
    const worker = advanceWorker;
    let pendingResult = Promise.resolve();
    function enqueueResult(handle: () => void | Promise<void>) {
      // Every write must use the slot value committed by the previous result.
      pendingResult = pendingResult
        .then(() => {
          if (advanceWorker === worker) return handle();
        })
        .catch((error: unknown) => {
          finishAdvance(
            "Jump stopped: " +
              (error instanceof Error
                ? error.message
                : "Could not restore result"),
          );
        });
    }
    worker.onmessage = ({ data: m }) => {
      enqueueResult(async () => {
        if (m.type === "error") {
          finishAdvance(
            "Jump interrupted; restored the latest checkpoint. " + m.message,
          );
          return;
        }
        if (m.save) {
          const restored = decodeSave(m.save);
          expectedSlotValue = await saveBrowserSlot(
            restored,
            expectedSlotValue,
          );
          // Keep the latest durable checkpoint if a later write fails.
          world = restored.world;
          levelProgress = restored.level ?? initialProgress(world.level);
          $("save-status").textContent = "Fast-forward progress saved";
        }
        const progress = $("generation-progress") as HTMLProgressElement;
        const completed = Math.max(
          0,
          Math.min(count, m.peak - generationAdvance!.start),
        );
        const label = `${completed} of ${count} generations`;
        if (progress.value !== completed)
          $("background-status").textContent = label;
        progress.value = completed;
        $("background-progress").textContent = label;
        $("background-detail").textContent =
          `${m.animals} animals · ${m.plants} plants${m.speed > 0 && !paused ? ` · ${m.speed.toFixed(1)}× speed` : ""}${m.helpers > 0 ? ` · ${m.helpers + 1} workers` : ""}`;
        if (m.type === "done")
          finishAdvance(
            `${approximate ? "Approximate · " : ""}${m.status} · Generation ${m.peak}`,
          );
      });
    };
    worker.onerror = () =>
      enqueueResult(() =>
        finishAdvance(
          "Worker failed; restored the latest checkpoint. Try reloading the game.",
        ),
      );
    paused = false;
    acc = 0;
    $("pause").textContent = "Ⅱ";
    $("pause").setAttribute("aria-label", "Pause simulation");
    $("advance-generations").textContent = "Stop";
    $("background-mode").textContent = approximate
      ? "Approximate fast-forward"
      : "Fast-forwarding";
    $("background-progress").textContent = `0 of ${count} generations`;
    const progress = $("generation-progress") as HTMLProgressElement;
    progress.max = count;
    progress.value = 0;
    $("background-detail").textContent = "Preparing your island…";
    $("background-status").textContent = "Fast-forward started.";
    $("pause-background-advance").textContent = "Pause";
    setAdvanceMode(true);
    $("pause-background-advance").focus({ preventScroll: true });
    worker.postMessage({
      type: "start",
      save: saved,
      count,
      approximate,
      paused: document.hidden,
    });
  } catch (error) {
    finishAdvance(
      "Could not start background simulation: " +
        (error instanceof Error ? error.message : "Worker unavailable"),
    );
  }
}
document.addEventListener("visibilitychange", () => {
  advanceWorker?.postMessage({
    type: "pause",
    paused: paused || document.hidden,
  });
});
$("pause").addEventListener("click", () => {
  advanceWorker?.postMessage({
    type: "pause",
    paused: paused || document.hidden,
  });
  if (advanceWorker) {
    const approximate =
      ($("generation-mode") as HTMLSelectElement).value === "approximate";
    $("background-mode").textContent = paused
      ? "Fast-forward paused"
      : approximate
        ? "Approximate fast-forward"
        : "Fast-forwarding";
    $("pause-background-advance").textContent = paused ? "Resume" : "Pause";
    $("background-status").textContent = paused
      ? "Fast-forward paused."
      : "Fast-forward resumed.";
  }
});

$("lineage-overlay-toggle").onclick = () => {
  showLineages = !showLineages;
  $("lineage-overlay-toggle").setAttribute(
    "aria-pressed",
    String(showLineages),
  );
  $("lineage-overlay-toggle").textContent = showLineages
    ? "Hide family colours"
    : "Show family colours";
  $("lineage-overlay-help").hidden = !showLineages;
};
const evolutionView: EvolutionView = {
  tab: "overview",
  branch: 0,
  animal: 0,
  trait: 0,
};
function renderEvolutionJournal() {
  recordEvolution(world);
  $("evolution-journal").innerHTML = evolutionJournal(world, evolutionView);
  $("evolution-journal").scrollTop = 0;
}
$("open-evolution").onclick = () => {
  const a = world.animals.find((a) => a.id === selected) ?? world.animals[0];
  evolutionView.animal = a?.id ?? 0;
  const counts = new Map<number, number>();
  for (const a of world.animals)
    if (a.mouseLineage)
      counts.set(a.mouseLineage.id, (counts.get(a.mouseLineage.id) ?? 0) + 1);
  evolutionView.branch =
    a?.id === selected
      ? (a.mouseLineage?.id ?? 0)
      : ([...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0);
  evolutionView.tab = "overview";
  renderEvolutionJournal();
  ($("evolution-journal") as HTMLDialogElement).showModal();
};
$("evolution-journal").addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "button",
  );
  if (!button) return;
  if (button.hasAttribute("data-evo-close")) {
    ($("evolution-journal") as HTMLDialogElement).close();
    return;
  }
  if (button.dataset.evoLocate !== undefined) {
    const member = world.animals
      .filter((a) => a.mouseLineage?.id === Number(button.dataset.evoLocate))
      .sort((a, b) => b.energy - a.energy)[0];
    if (!member) {
      renderEvolutionJournal();
      return;
    }
    selected = member.id;
    followEnabled = true;
    selectedHome = null;
    watchedHome = null;
    showLineages = true;
    $("lineage-overlay-toggle").setAttribute("aria-pressed", "true");
    $("lineage-overlay-toggle").textContent = "Hide family colours";
    $("lineage-overlay-help").hidden = false;
    ($("evolution-journal") as HTMLDialogElement).close();
    updateUI();
    return;
  }
  if (button.dataset.evoWatch !== undefined) {
    selected = Number(button.dataset.evoWatch);
    followEnabled = true;
    selectedHome = null;
    watchedHome = null;
    ($("evolution-journal") as HTMLDialogElement).close();
    updateUI();
    return;
  }
  if (button.dataset.evoTab)
    evolutionView.tab = button.dataset.evoTab as EvolutionView["tab"];
  if (button.dataset.evoBranch !== undefined) {
    evolutionView.branch = Number(button.dataset.evoBranch);
    evolutionView.tab = "branches";
  }
  if (button.dataset.evoFamily !== undefined) {
    evolutionView.animal = Number(button.dataset.evoFamily);
    evolutionView.tab = "family";
  }
  renderEvolutionJournal();
});
$("evolution-journal").addEventListener("change", (event) => {
  const input = event.target as HTMLSelectElement;
  if (input.id === "evo-lineage") evolutionView.branch = Number(input.value);
  if (input.id === "evo-trait") evolutionView.trait = Number(input.value);
  renderEvolutionJournal();
});

$("mouse-branches").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>(
    "[data-branch-animal]",
  );
  if (b) {
    selected = Number(b.dataset.branchAnimal);
    updateUI();
  }
});

// Exclusive dock panels keep controls and family context in one layout flow.
const dockPanels = Array.from(
  document.querySelectorAll<HTMLDetailsElement>(".island-controls details"),
);
for (const panel of dockPanels) {
  panel.addEventListener("toggle", () => {
    if (panel.open)
      for (const other of dockPanels) if (other !== panel) other.open = false;
  });
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      panel.open = false;
      panel.querySelector("summary")?.focus();
      event.stopPropagation();
    }
  });
}

$("add-animals").onclick = () => {
  if (advanceWorker) return;
  try {
    const species = ($("animal-kind") as HTMLSelectElement).value as Species;
    const count = introduceAnimals(
      world,
      species,
      Number(($("animal-count") as HTMLSelectElement).value),
    );
    $("animal-add-status").textContent =
      `Added ${count} ${SPECIES[species].label.toLowerCase()} founders. Their offspring must find food and survive.`;
    updateUI();
    saveIsland();
  } catch (error) {
    $("animal-add-status").textContent =
      error instanceof Error ? error.message : "Could not introduce animals.";
  }
};

$("export-island").onclick = () => {
  if (advanceWorker) return;
  const json = encodeSave({
    world,
    rate,
    paused,
    selected,
    follow: followEnabled,
    level: levelProgress,
  });
  const url = URL.createObjectURL(
    new Blob([json], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `evolutio-${world.level.id}-backup.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const backupFile = $("island-backup-file") as HTMLInputElement;
const importButton = $("import-island") as HTMLButtonElement;
const importStatus = $("import-status");
const maxBackupBytes = 128 * 1024 * 1024;
importButton.onclick = () => {
  if (!advanceWorker && !islandTransition) backupFile.click();
};
backupFile.onchange = async () => {
  const file = backupFile.files?.[0];
  backupFile.value = "";
  if (!file || advanceWorker || islandTransition) return;

  islandTransition = "import";
  importButton.setAttribute("aria-disabled", "true");
  importStatus.textContent = "Checking island backup…";
  try {
    if (file.size > maxBackupBytes)
      throw new Error("This backup is larger than the 128 MB import limit.");
    let next: Session;
    try {
      next = decodeSave(await file.text());
    } catch {
      throw new Error(
        "Choose a valid Evolutio backup JSON file from a supported version.",
      );
    }

    // Drain an autosave that was already running before reading the destination.
    await pendingSave;
    const { id, name } = next.world.level;
    const existing = await readBrowserSlot(id);
    const active = id === world.level.id;
    if (
      (existing !== null || active) &&
      !confirm(
        `Replace your ${name} island with this backup? This will overwrite any existing progress for ${name} in this browser.`,
      )
    ) {
      importStatus.textContent = "Import cancelled.";
      return;
    }

    const saved = await saveBrowserSlot(next, existing);
    if (active) {
      activateIsland(next, saved);
      $("save-status").textContent = `${name} restored from backup`;
      importStatus.textContent = `Imported ${name}.`;
    } else {
      importStatus.textContent = `Imported ${name}. Open it from Your islands.`;
    }
  } catch (error) {
    importStatus.textContent =
      error instanceof Error ? error.message : "Could not import this island.";
  } finally {
    islandTransition = null;
    importButton.removeAttribute("aria-disabled");
  }
};
