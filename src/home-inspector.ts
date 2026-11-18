import { careVisuals } from "./care-visuals.ts";
import { nurseryAge } from "./biology.ts";
import { SPECIES } from "./species.ts";
import { type World } from "./sim.ts";
import { type Animal } from "./model.ts";
import { treeRestSite } from "./resting.ts";
export interface HomeSite {
  key: string;
  kind: "nest" | "den";
  owner: number;
  site: number;
  x: number;
  z: number;
  altitude: number;
}
export function homeSites(world: World): HomeSite[] {
  const sites = new Map<string, HomeSite>();
  for (const den of world.dens)
    sites.set(`den:${den.id}`, {
      key: `den:${den.id}`,
      kind: "den",
      owner: den.owner,
      site: den.id,
      x: den.x,
      z: den.z,
      altitude: 0,
    });
  const trees = new Map(
    world.plants
      .filter((p) => p.kind === "tree" && p.health > 0)
      .map((p) => [p.id, p]),
  );
  for (const a of [
    ...world.eggs.map((e) => e.embryo),
    ...world.animals.filter((a) => a.nursery),
    ...world.animals.filter((a) => !a.nursery),
  ]) {
    if (a.species !== "bird") continue;
    const n = a.nursery?.kind === "nest" ? a.nursery : null;
    const owner = n?.owner ?? a.id,
      site = n?.site ?? a.roost,
      key = `nest:${owner}`;
    if (sites.has(key)) continue;
    const tree = trees.get(site);
    if (!tree && !n && a.state !== "Sleeping") continue;
    sites.set(key, {
      key,
      kind: "nest",
      owner,
      site,
      ...(tree
        ? treeRestSite(tree, owner, world.weather.land)
        : { x: n?.x ?? a.x, z: n?.z ?? a.z, altitude: n?.altitude ?? 0 }),
    });
  }
  return [...sites.values()];
}
export function homeContents(world: World, home: HomeSite) {
  const belongs = (a: Animal) =>
    a.nursery?.kind === home.kind &&
    (home.kind === "nest"
      ? a.nursery.owner === home.owner
      : a.nursery.site === home.site);
  const babies = world.animals.filter(belongs),
    eggs = world.eggs.filter((e) => belongs(e.embryo));
  const ids = new Set([
    home.owner,
    ...babies.map((a) => a.parent),
    ...eggs.map((e) => e.embryo.parent),
  ]);
  const parents = [...ids]
    .map(
      (id) =>
        world.animals.find((a) => a.id === id) ??
        world.deceased.find((a) => a.id === id),
    )
    .filter((a): a is Animal => !!a);
  const living = (a: Animal) => world.animals.includes(a) && a.energy > 0;
  const nearby = (a: Animal) =>
    living(a) && Math.hypot(a.x - home.x, a.z - home.z) < 3;
  return { babies, eggs, parents, living, nearby };
}
export function homeInspector(world: World, home: HomeSite): string {
  const { babies, eggs, parents, living, nearby } = homeContents(world, home);
  const care = careVisuals(world.animals);
  const parentName = (id: number) => {
    const p = parents.find((a) => a.id === id);
    return p
      ? `${SPECIES[p.species].label} #${id}${living(p) ? "" : " (deceased)"}`
      : `#${id} (not in family records)`;
  };
  const den = world.dens.find((d) => d.id === home.site);
  return `<button class="close" data-close-inspect aria-label="Close inspection">×</button><div class="eyebrow">FAMILY HOME</div><h3>${home.kind === "nest" ? "Bird nest" : "Den"} #${home.kind === "nest" ? home.owner : home.site}</h3><p>${home.kind === "den" ? (den && den.progress < 1 ? `Under construction: ${Math.round(den.progress * 100)}%` : "Completed shelter") : home.site ? `Tree #${home.site}` : "Ground nest"} · ${eggs.length} eggs · ${babies.length} dependent young</p><p>${parents.some(nearby) ? "Parent nearby — young receive reduced predation damage." : "No parent nearby — young are not currently guarded."} Shelter does not guarantee safety.</p><div class="section-label">PARENTS</div>${parents.map((p) => `<div class="nursery-member"><b>${parentName(p.id)}</b><p>${living(p) ? `${p.state}${care.get(p.id)?.carrying ? " — carrying food" : ""} · ${Math.hypot(p.x - home.x, p.z - home.z).toFixed(1)}m from home · Energy ${Math.round(p.energy)}` : "No longer able to provide care"}</p>${living(p) ? `<button data-watch-parent="${p.id}">Follow parent ↗</button>` : `<button data-animal="${p.id}">Family record</button>`}</div>`).join("") || "<p>Parent records unavailable.</p>"}<div class="section-label">EGGS</div>${eggs.map((e) => `<p>Egg #${e.embryo.id} · ${Math.min(100, Math.floor((e.age / e.duration) * 100))}% incubated · Health ${Math.round(e.health)}%<br>Parent: ${parentName(e.embryo.parent)}<br>Hatches in about ${Math.max(0, e.duration - e.age).toFixed(0)} simulation seconds.</p>`).join("") || "<p>No eggs in this home.</p>"}<div class="section-label">YOUNG</div>${babies.map((b) => `<div class="nursery-member"><button data-animal="${b.id}">${SPECIES[b.species].label} #${b.id} ↗</button><p>${care.get(b.id)?.chewing ? "Receiving food / chewing · " : care.get(b.id)?.begging ? "Begging · " : ""}${b.energy < 25 ? "Very hungry" : b.energy < 50 ? "Hungry" : "Fed"} · Energy ${Math.round(b.energy)} · ${b.hydration < 35 ? "Thirsty" : "Water"} ${Math.round(b.hydration)}%<br>Parent: ${parentName(b.parent)}<br>${parents.some((p) => p.id === b.parent && nearby(p)) ? "Protected by nearby parent" : "Parent away — no parental protection"} · Leaves nursery in ${Math.max(0, nurseryAge(b) - b.age).toFixed(0)}s</p></div>`).join("") || "<p>No dependent young. They may have grown up and left.</p>"}<p class="muted">Feeding transfers the parent's own food and water reserves. Genetic parents are shown in the family record.</p>`;
}
