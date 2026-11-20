import { energyPercent } from "./food-energy.ts";
import { lineageBadge } from "./lineage-identity.ts";
import { EXPRESSED_TRAITS } from "./expression.ts";
import { dailyRhythm, rhythmLabel, phaseDelta } from "./rhythm.ts";
import { type Animal, type Genes, type BrainActivity } from "./model.ts";
import type { World } from "./sim.ts";
import { reproductiveSex, usesMate } from "./reproduction.ts";
import {
  lifeStage,
  lifespan,
  growthScale,
  maturityAge,
  nurseryAge,
  reproductiveEnd,
  bodyNeeds,
  ageAgility,
  burstProfile,
  perceptionInterval,
} from "./biology.ts";
import { SPECIES, DEATH_LABELS } from "./species.ts";

import {
  habitat,
  camouflage,
  regionalClimate,
  eyesightCost,
} from "./ecology.ts";

import { changingBiome } from "./terrain.ts";

export const TRAITS = [
  ["dietAffinity", "Mouse meat preference"],
  ["endurance", "Endurance"],
  ["maturation", "Maturation time"],
  ["longevity", "Longevity"],
  ["insulation", "Coat insulation"],
  ["waterproofing", "Water resistance"],
  ["preferredMoisture", "Preferred moisture"],
  ["droughtTolerance", "Drought tolerance"],
  ["immunity", "Immunity"],
  ["swimming", "Swimming"],
  ["speed", "Speed"],
  ["size", "Adult size"],
  ["sense", "Sensing range"],
  ["eyesight", "Eyesight"],
  ["digging", "Digging skill"],
  ["activity", "Activity"],
  ["activityPhase", "Daily activity phase"],
  ["twilightBias", "Dawn/dusk preference"],
  ["activeFraction", "Activity window"],
  ["aggression", "Aggression"],
  ["neurons", "Neurons"],
  ["length", "Body length"],
  ["limbs", "Limbs / wings"],
  ["stride", "Stride"],
  ["cadence", "Cadence"],
  ["hue", "Colour shift"],
  ["markings", "Markings"],
  ["earSize", "Ear size"],
  ["tailLength", "Tail length"],
  ["furShade", "Fur lightness"],
  ["patternScale", "Marking size"],
] as const;
export function traitChanges(child: Genes, parent: Genes) {
  return TRAITS.map(([key, label]) => ({
    key,
    label,
    value: child[key],
    parent: parent[key],
    delta:
      key === "activityPhase"
        ? phaseDelta(child[key], parent[key])
        : child[key] - parent[key],
  }));
}
const format = (v: number) => v.toFixed(2);
function brainDiagram(a: Animal, activity?: BrainActivity) {
  const g = a.genes,
    labels = [
      "Food nearby",
      "Turn sine",
      "Turn cosine",
      "Energy",
      "Danger",
      "Bias",
    ];
  const y = (i: number, n: number) => 40 + (i * 190) / Math.max(1, n - 1);
  const wire = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    w: number,
    label: string,
  ) =>
    `<path d="M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}" fill="none" stroke="${w >= 0 ? "#698e72" : "#c27d61"}" stroke-opacity="${0.12 + Math.min(Math.abs(w) / 3, 1) * 0.65}" stroke-width="${0.4 + Math.min(Math.abs(w), 3) * 0.65}"><title>${label}: ${w.toFixed(3)}</title></path>`;
  const node = (x: number, cy: number, v: number | undefined, label: string) =>
    `<circle cx="${x}" cy="${cy}" r="${6 + Math.abs(v ?? 0) * 2}" fill="${v === undefined ? "#a6b0a0" : v >= 0 ? "#698e72" : "#c27d61"}" stroke="#f7f7ef" stroke-width="2"><title>${label}${v === undefined ? "" : ": " + v.toFixed(3)}</title></circle>`;
  let wires = "",
    nodes = "";
  for (let j = 0; j < g.neurons; j++) {
    for (let k = 0; k < 6; k++)
      wires += wire(
        91,
        y(k, 6),
        180,
        y(j, g.neurons),
        g.weights[j * 8 + k],
        `${labels[k]} → neuron ${j + 1}`,
      );
    for (let k = 0; k < 2; k++)
      wires += wire(
        180,
        y(j, g.neurons),
        263,
        y(k, 2),
        g.weights[j * 8 + 6 + k],
        `Neuron ${j + 1} → ${k ? "drive" : "turn"}`,
      );
    nodes += node(180, y(j, g.neurons), activity?.hidden[j], `Neuron ${j + 1}`);
  }
  labels.forEach((label, i) => {
    nodes +=
      `<text x="2" y="${y(i, 6) + 3}" font-size="9">${label}</text>` +
      node(91, y(i, 6), activity?.inputs[i], label);
  });
  ["Turn", "Drive"].forEach((label, i) => {
    nodes +=
      node(263, y(i, 2), activity?.outputs[i], label) +
      `<text x="279" y="${y(i, 2) + 3}" font-size="10">${label}</text>`;
  });
  return `<svg viewBox="0 0 318 255" role="img" aria-label="Neural network: six inputs, ${g.neurons} hidden neurons, two movement outputs"><text x="2" y="15" font-size="9">SENSE</text><text x="158" y="15" font-size="9">PROCESS</text><text x="263" y="15" font-size="9">ACT</text>${wires}${nodes}</svg><p>${g.neurons} neurons · ${g.weights.length} weights · ${activity ? "Latest simulation signals" : "Inherited wiring; signals appear when running"}</p><p class="brain-key">Green: positive · Rust: negative · Thicker: stronger weight</p><p>The brain adjusts turning and effort alongside a food-seeking reflex. More neurons also cost energy.</p>`;
}
export function renderAnimalInspector(
  panel: HTMLElement,
  a: Animal,
  world: World,
  follow = true,
  compact = false,
) {
  const peers = world.animals.filter(b => b.species === a.species);
  const index = peers.findIndex(b => b.id === a.id);
  const alive = index >= 0;
  if (panel.dataset.animal !== String(a.id)) {
    panel.dataset.animal = String(a.id);
    panel.scrollTop = 0;
    panel.innerHTML = `<button class="close" data-close-inspect aria-label="Close inspection">×</button><div id="animal-summary"></div><div id="species-navigation"></div><div id="animal-camera"></div><div id="animal-life"></div><details class="inspector-section"><summary>Needs &amp; habitat</summary><div id="animal-environment"></div></details><details class="inspector-section"><summary>Brain activity</summary><div id="animal-brain"></div></details><details class="inspector-section"><summary>Genes &amp; inheritance</summary><div id="animal-traits"></div></details><details class="inspector-section"><summary>Family album</summary><div id="animal-family"></div></details>`;
  }
  const set = (id: string, html: string) => {
    const el = panel.querySelector<HTMLElement>("#" + id)!;
    if (el.innerHTML !== html) el.innerHTML = html;
  };
  const count = peers.length;
  const label = SPECIES[a.species].label;
  const peerButton = (direction: "Previous" | "Next", id?: number) =>
    '<button data-peer="' + direction + '" aria-label="' + direction + ' living ' + label +
    '" ' + (id && id !== a.id ? 'data-animal="' + id + '"' : 'disabled') + '>' + direction + '</button>';
  set("species-navigation", '<nav class="species-navigation" aria-label="Browse this species">' +
    peerButton("Previous", peers[alive ? (index + count - 1) % count : count - 1]?.id) +
    '<span>' + label + ' &middot; ' + (alive ? (index + 1) + ' of ' + count : count + ' living') + '</span>' +
    peerButton("Next", peers[alive ? (index + 1) % count : 0]?.id) + '</nav>');
  const sleepLocation =
    a.species === "bird"
      ? a.roost
        ? `Tree nest #${a.roost}`
        : "Ground nest"
      : world.dens.some(
            (d) =>
              d.id === a.home &&
              d.progress >= 1 &&
              Math.hypot(d.x - a.x, d.z - a.z) < 1,
          )
        ? `Den #${a.home}`
        : "Resting in cover";
  const stage = lifeStage(a),
    grown = Math.round(((growthScale(a) - 0.4) / 0.6) * 100);
  set(
    "animal-summary",
    `<div class="eyebrow">${SPECIES[a.species].label.toUpperCase()} #${a.id} · GENERATION ${a.generation}</div>${a.mouseLineage ? `<p>${lineageBadge(a.mouseLineage.id)} · lineage #${a.mouseLineage.id}</p>` : ""}<h3>${alive ? a.state : "A life remembered"}</h3>${!alive ? `<p class="death-detail">${DEATH_LABELS[a.deathCause ?? "unknown"]}${a.killedBy ? " · predator #" + a.killedBy : ""}${a.diedAt !== undefined ? " · island time " + a.diedAt.toFixed(0) + "s" : ""}</p>` : ""}<span class="stage stage-${stage.toLowerCase()}">${stage}${alive ? "" : " · Deceased"}</span><p class="rhythm-status">${rhythmLabel(a.genes)} · ${alive ? (a.state === "Sleeping" ? `Asleep — recovering stamina · ${sleepLocation}` : dailyRhythm(a.genes, world.time).active ? "Active hours" : "Rest hours · awake for other needs") : "Inherited daily rhythm"}</p>`,
  );
  set(
    "animal-camera",
    `<div class="camera-buttons">${alive ? `<button data-toggle-follow aria-pressed="${follow}">${follow ? "Stop following" : "Follow animal"}</button>` : '<span class="muted">This animal has died. Choose a living relative below.</span>'}<button data-toggle-details aria-expanded="${!compact}">${compact ? "Explore details" : "Less detail"}</button></div>`,
  );
  set(
    "animal-life",
    `<div class="animal-vitals"><div><b>${energyPercent(a.energy)}%</b><span>Energy</span></div><div><b>${a.hydration.toFixed(0)}%</b><span>Hydration</span></div><div><b>${a.stamina.toFixed(0)}%</b><span>Stamina</span></div></div><p>${alive ? "Age" : "Lived"} ${a.age.toFixed(1)} simulation seconds${alive ? "" : " · Family record"}</p><div class="age-track"><i style="width:${Math.min(100, (a.age / lifespan(a)) * 100)}%"></i></div><div class="age-labels"><span>Baby</span><span>Adult at ${maturityAge(a).toFixed(0)}s</span><span>Elder</span></div><p class="life-detail">Reproductive window ${maturityAge(a).toFixed(0)}–${reproductiveEnd(a).toFixed(0)}s · Max age ${lifespan(a).toFixed(0)}s. ${grown < 100 ? `${grown}% grown toward inherited adult size.` : "Fully grown."} ${stage === "Elder" ? "A silver coat marks old age." : "Babies are small and pale; elders turn silver."}</p>`,
  );
  const terrain = habitat(a, world.plants, world.weather.land),
    conditions = regionalClimate(world.time, world.weather, a.x, a.z),
    home = world.dens.find((d) => d.id === a.home);
  set(
    "animal-environment",
    `<div class="section-label">SURVIVAL & COVER</div>${a.seedCargo ? "<p>" + ({cache: "Carrying a seed to bury", gut: "Digesting food containing a seed", attached: "A seed is clinging to this animal"})[a.seedCargo.mode] + ".</p>" : ""}<p>Food fuels movement, senses and the brain. Surplus energy pays for offspring; scarcity reduces reproduction and can cause starvation.</p>${a.species === "bug" ? "<p>Bugs gather at food patches, strip foliage and eat remains. Their waste becomes litter; fungi and worms recycle it into nutrients for plants.</p>" : ""}<p>${a.nursery ? `Dependent young: ${a.nursery.kind === "nest" ? "Nest" : "Den"}. Leaves nursery at ${nurseryAge(a).toFixed(0)}s. Parent brings food and water.` : ""}</p><p>Daily rhythm: ${rhythmLabel(a.genes)}. Hunger, thirst and danger override sleep. Activity timing, dawn/dusk preference and activity window mutate in offspring.</p><p>${changingBiome(world.weather.land, a.x, a.z)} / ${terrain.name} · Camouflage ${Math.round(camouflage(a, terrain) * 100)}% · Cover ${Math.round(terrain.cover * 100)}%</p><p>Water ${Math.round(a.hydration)}% · Outside ${conditions.temperature.toFixed(0)}°C · ${conditions.period} · ${conditions.rain > 0.2 ? "Local rain" : "Dry weather"} · Sunshine ${Math.round(conditions.sunlight * 100)}% · Soil ${Math.round(conditions.moisture * 100)}%</p><p>${a.species === "snake" ? `Body ${a.bodyTemperature.toFixed(1)}°C · Cold slows movement, metabolism and water use. Sunshine warms it; excess heat is dangerous.` : ""}</p><p>${a.species === "bird" ? `${a.birdDiet === "raptor" ? "Bird of prey · hunts mice, fish, small frogs and young turtles" : "Insect-eating bird · insects, worms and small arachnids"} · Altitude ${a.altitude.toFixed(1)}m` : ""}</p><p>${world.eggs.filter((e) => e.embryo.parent === a.id).length} unhatched eggs (${world.eggs.filter((e) => e.embryo.parent === a.id && e.concealment > 0.3).length} concealed) · ${["mouse", "cat", "fox", "wolf"].includes(a.species) ? "Young stay in available dens, then follow their parent; care uses parental food and water" : a.species === "bird" ? "Nest chicks are fed and guarded until fledging" : "Egg layers: larger clutches, fewer survivors"}</p><p>${burstProfile(a.species) ? `Stamina ${a.stamina.toFixed(0)}% · Catch remaining ${a.mealEnergy.toFixed(0)} energy · Recovery ${a.restTimer.toFixed(0)}s` : ""}</p><p>Wetness ${(a.wetness * 100).toFixed(0)}% · ${a.crossingZ !== null ? "Heading for a safer river crossing" : "Wet fur/scales increase cooling and energy use"}</p><p>Hunger ${(bodyNeeds(a, conditions.temperature).hunger * 100).toFixed(0)}% · Thirst ${(bodyNeeds(a, conditions.temperature).thirst * 100).toFixed(0)}% · Fatigue ${(bodyNeeds(a, conditions.temperature).fatigue * 100).toFixed(0)}%</p><p>Looks for food and threats every ${Math.round(perceptionInterval(a) * 10)} ticks; nearby danger wakes it sooner.</p><p>Age agility ${(ageAgility(a) * 100).toFixed(0)}% · Adults evade predators best.</p><p>Infection ${(a.infection * 100).toFixed(0)}% · Breath ${a.oxygen.toFixed(0)}% · Preferred moisture ${(a.genes.preferredMoisture * 100).toFixed(0)}%</p><p>Eyesight ${a.genes.eyesight.toFixed(2)} · ${eyesightCost(a.genes.eyesight).toFixed(3)} energy/s upkeep</p><p>${home ? `Home #${home.id} · ${home.progress >= 1 ? "Ready" : Math.round(home.progress * 100) + "% dug"} · ${Math.hypot(home.x - a.x, home.z - a.z).toFixed(1)}m away` : "No den · Uses vegetation for cover or digs when exposed."}</p><p>Colour and pattern matching reduce detection; moving exposes you. Night and cover help concealment. Drinking and shelter-seeking use survival instincts.</p>`,
  );
  set(
    "animal-brain",
    brainDiagram(a, alive ? world.brainActivity.get(a.id) : undefined),
  );
  const all = [...world.animals, ...world.deceased],
    parent = all.find((b) => b.id === a.parent);
  const rows = parent
    ? traitChanges(a.genes, parent.genes)
    : TRAITS.map(([key, label]) => ({
        key,
        label,
        value: a.genes[key],
        parent: undefined,
        delta: undefined,
      }));
  set(
    "animal-traits",
    `${a.mouseLineage ? `<p>Mouse branch ${a.mouseLineage.id ? "#" + a.mouseLineage.id : "ancestral"} · ${a.mouseLineage.niche} · Origin generation ${a.mouseLineage.originGeneration}<br>Meat preference ${Math.round(a.genes.dietAffinity * 100)}% · ${a.genes.dietAffinity >= 0.8 ? "Prey specialist" : a.genes.dietAffinity >= 0.3 ? "Plants and small prey" : "Plant eater"}</p>` : ""}<p>${parent ? `Compared with parent #${parent.id}. Changes are trade-offs, not automatic improvements.` : a.parent ? "Parent predates the available records; comparison unavailable." : "Founder: no parent to compare with."}</p><p><b>Inherited expression memory</b><br>${EXPRESSED_TRAITS.map((key) => `${key}: ${Math.round(a.expression[key] * 100)}% activation (${Math.round(a.expression[key] * 60)}% exact-copy chance)`).join(" · ")}</p><p>Recent use protects these traits from mutation; it does not make them stronger. Babies inherit 35% of the memory, which fades without reuse. A simplified game mechanic inspired by epigenetics.</p><table class="gene-table"><thead><tr><th>Trait</th><th>Parent</th><th>This animal</th><th>Change</th></tr></thead><tbody>${rows.map((r) => `<tr><th>${r.label}</th><td>${r.parent === undefined ? "—" : r.key === "neurons" ? r.parent : format(r.parent)}</td><td>${r.key === "neurons" ? r.value : format(r.value)}</td><td class="${r.delta === undefined ? "" : r.delta > 0 ? "delta-up" : r.delta < 0 ? "delta-down" : ""}">${r.delta === undefined ? "—" : Math.abs(r.delta) < 0.0005 ? "0" : (r.delta > 0 ? "+" : "") + (r.key === "neurons" ? r.delta : r.delta.toFixed(3))}</td></tr>`).join("")}</tbody></table>${parent ? `<p>${a.genes.weights.slice(0, parent.genes.weights.length).filter((w, i) => Math.abs(w - parent.genes.weights[i]) > 0.000001).length} shared weights changed · ${Math.max(0, a.genes.weights.length - parent.genes.weights.length)} added · ${Math.max(0, parent.genes.weights.length - a.genes.weights.length)} removed.</p>` : ""}`,
  );
  const member = (b: Animal) =>
    `<button class="family-member" data-animal="${b.id}"><b>${SPECIES[b.species].label} #${b.id}</b><span>Gen ${b.generation} · ${world.animals.some((c) => c.id === b.id) ? lifeStage(b) : "Deceased"} ↗</span></button>`;
  const children = all
    .filter((b) => b.parent === a.id || b.otherParent === a.id)
    .sort((a, b) => b.id - a.id);
  const parents = [a.parent, a.otherParent].flatMap((id) => {
    if (!id) return [];
    const record = all.find((animal) => animal.id === id);
    return record
      ? member(record)
      : `<p>Parent #${id} · Record unavailable</p>`;
  });
  const breeding =
    world.naturalReproduction && usesMate(a.species)
      ? `<p>${reproductiveSex(a) === "female" ? "Female" : "Male"}${a.reproductive?.transitionDue !== undefined ? " · Changing sex" : a.reproductive?.due !== undefined ? " · Expecting young" : ""}</p>`
      : "";
  set(
    "animal-family",
    `${breeding}<div class="family-label">${a.cloned ? "Clone parent" : "Genetic parents"}</div>${parents.join("") || "<p>Founding animal</p>"}${a.parent && !a.otherParent && !a.cloned ? "<p>One parent recorded.</p>" : ""}<div class="family-label">Offspring · ${children.length} recorded</div>${children.length ? children.map(member).join("") : "<p>No recorded offspring yet.</p>"}<p class="archive-note">Living animals and up to 1,200 deceased relatives are kept.</p>`,
  );
}
