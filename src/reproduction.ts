import { canReproduce } from "./biology.ts";
import type { Animal, Genes, Species } from "./model.ts";
import { SpatialGrid } from "./terrain.ts";
import type { World } from "./sim.ts";

const modes = {
  mouse: "litter",
  fox: "litter",
  snake: "eggs",
  fish: "eggs",
  turtle: "eggs",
} as const;
type ReproductiveSpecies = keyof typeof modes;
export function usesMate(species: Species): species is ReproductiveSpecies {
  return Object.hasOwn(modes, species);
}

export function reproductiveSex(a: Pick<Animal, "id" | "sex">) {
  return a.sex ?? (Math.imul(a.id, 0x9e3779b1) >>> 31 ? "female" : "male");
}

export function mixGenes(
  first: Genes,
  second: Genes,
  random: () => number,
): Genes {
  const mixed = { ...first };
  for (const key of Object.keys(first) as (keyof Genes)[]) {
    if (key !== "weights" && random() < 0.5) mixed[key] = second[key];
  }
  mixed.weights = Array.from(
    { length: mixed.neurons * 8 },
    (_, i) =>
      (random() < 0.5
        ? (first.weights[i] ?? second.weights[i])
        : (second.weights[i] ?? first.weights[i])) ?? 0,
  );
  return mixed;
}

export type MatePosition = Pick<Animal, "id" | "species" | "x" | "z" | "sex">;
export type MateNeighborhoods = Map<number, number[]>;
const distance = (a: MatePosition, b: MatePosition) =>
  Math.hypot(a.x - b.x, a.z - b.z);
function nearbyMates<T extends MatePosition>(grid: SpatialGrid<T>, a: T) {
  const range = a.species === "fish" ? 12 : 20;
  return grid
    .near(a.x, a.z, range)
    .filter(
      (b) =>
        b.id !== a.id && b.species === a.species && distance(a, b) <= range,
    );
}
export function findMateNeighborhoods(
  animals: MatePosition[],
  start = 0,
  end = animals.length,
): MateNeighborhoods {
  const grid = new SpatialGrid(animals, 12);
  const result: MateNeighborhoods = new Map();
  for (let i = start; i < end; i++) {
    const animal = animals[i];
    if (reproductiveSex(animal) === "female")
      result.set(
        animal.id,
        nearbyMates(grid, animal).map((a) => a.id),
      );
  }
  return result;
}
export const reproductiveAdults = (animals: Animal[]) =>
  animals.filter((a) => usesMate(a.species) && a.energy > 0 && canReproduce(a));
const unreadyStates = new Set([
  "Fleeing",
  "Escaping water",
  "Drinking",
  "Seeking water",
  "Feeding young",
  "Guarding brood",
]);
const safe = (a: Animal) =>
  a.energy > 0 &&
  a.hydration >= 55 &&
  a.oxygen >= 50 &&
  !unreadyStates.has(a.state);

export function stepReproduction(
  world: World,
  depthAt: (x: number, z: number) => number,
  neighborhoods?: MateNeighborhoods,
) {
  const adults = reproductiveAdults(world.animals);
  const grid = neighborhoods ? undefined : new SpatialGrid(adults, 12);
  const adultById = neighborhoods
    ? new Map(adults.map((a) => [a.id, a]))
    : undefined;
  const pending = world.animals.filter(
    (a) => a.energy > 0 && a.reproductive?.mate !== undefined,
  );
  const parents = pending.length
    ? new Map([...world.deceased, ...world.animals].map((a) => [a.id, a]))
    : undefined;
  const dependents = new Set(
    [...world.animals, ...world.eggs.map((e) => e.embryo)]
      .filter((a) => a.nursery)
      .map((a) => a.parent),
  );
  const now = world.time;
  for (const a of adults) {
    if (a.reproductive) {
      if ((a.reproductive.rivalUntil ?? 0) <= now) {
        delete a.reproductive.target;
        delete a.reproductive.rivalUntil;
      }
    }
  }
  const report = (event: string) => world.events.unshift(event);
  for (const a of pending) {
    const state = a.reproductive!;
    if (state.due! > now || !safe(a)) continue;
    const mate = parents?.get(state.mate!);
    delete state.mate;
    delete state.due;
    if (!mate) continue;
    if (usesMate(a.species) && modes[a.species] === "eggs") {
      world.layClutch(a, Infinity, { mate });
      report(
        `${a.species[0].toUpperCase()}${a.species.slice(1)} #${a.id} laid eggs with parent #${mate.id}`,
      );
    } else {
      const count = 2 + Number(world.random() < 0.4);
      for (let i = 0; i < count; i++)
        world.addAnimal(a.kind, a, undefined, false, { mate });
      world.births += count;
      report(
        `${a.species === "mouse" ? "Mouse" : "Fox"} #${a.id} had ${count} young with parent #${mate.id}`,
      );
    }
    a.cooldown = 40;
  }

  const receptive = (a: Animal) =>
    safe(a) &&
    a.energy >= 76 &&
    a.cooldown <= 0 &&
    !a.nursery &&
    !dependents.has(a.id) &&
    a.reproductive?.mate === undefined;
  for (const a of adults) {
    const ready = receptive(a);
    if (
      reproductiveSex(a) !== "female" ||
      (!ready && a.reproductive?.isolatedSince === undefined)
    )
      continue;
    const near = neighborhoods
      ? (neighborhoods.get(a.id) ?? []).map((id) => adultById!.get(id)!)
      : nearbyMates(grid!, a);
    const males = near.filter((b) => reproductiveSex(b) === "male");
    if (a.species === "fish" && depthAt(a.x, a.z) < 0.2) {
      if (a.reproductive) {
        delete a.reproductive.isolatedSince;
        delete a.reproductive.transitionDue;
      }
      continue;
    }
    if (
      !males.length &&
      (a.species === "snake" || (a.species === "fish" && near.length))
    ) {
      if (!ready) continue;
      const state = (a.reproductive ??= {});
      state.isolatedSince ??= now;
      if (
        a.species === "snake" &&
        now - state.isolatedSince >= 50 &&
        depthAt(a.x, a.z) < 0.1
      ) {
        world.layClutch(a, 2, { clone: true });
        a.energy -= 24;
        a.cooldown = 40;
        delete state.isolatedSince;
        report(`Snake #${a.id} laid clone eggs after a long isolation`);
      } else if (
        a.species === "fish" &&
        now - state.isolatedSince >= 24 &&
        near.every(
          (b) =>
            a.genes.size > b.genes.size ||
            (a.genes.size === b.genes.size && a.id < b.id),
        )
      ) {
        if (state.transitionDue === undefined) {
          state.transitionDue = now + 8;
          report(`Fish #${a.id} is changing sex in a group without a male`);
        } else if (state.transitionDue <= now) {
          a.sex = "male";
          delete state.isolatedSince;
          delete state.transitionDue;
          report(`Fish #${a.id} is now male`);
        }
      }
      continue;
    }
    if (a.reproductive) {
      delete a.reproductive.isolatedSince;
      delete a.reproductive.transitionDue;
    }
    if (!ready) continue;
    let closest: Animal | undefined;
    let rival: Animal | undefined;
    for (const male of males) {
      if (
        !receptive(male) ||
        male.reproductive?.target ||
        male.reproductive?.rivalUntil ||
        (a.species === "fish" && depthAt(male.x, male.z) < 0.2)
      )
        continue;
      if (!closest || distance(a, male) < distance(a, closest)) {
        rival = closest;
        closest = male;
      } else if (!rival || distance(a, male) < distance(a, rival)) rival = male;
    }
    if (!closest) continue;
    if (
      (a.species === "mouse" || a.species === "fox") &&
      rival &&
      distance(a, rival) < 4 &&
      distance(a, closest) < 4
    ) {
      const score = (b: Animal) =>
        b.genes.size + b.genes.aggression * 0.4 + b.energy / 160;
      if (score(rival) > score(closest)) [closest, rival] = [rival, closest];
      closest.energy -= 3;
      rival.energy -= 5;
      (rival.reproductive ??= {}).rivalUntil = now + 12;
      rival.reproductive.target = closest.id;
      rival.state = "Retreating from rival";
      (closest.reproductive ??= {}).target = rival.id;
      closest.state = "Challenging rival";
      report(
        `${a.species === "mouse" ? "Mice" : "Foxes"} #${closest.id} and #${rival.id} sparred. #${rival.id} backed off.`,
      );
      continue;
    }
    (closest.reproductive ??= {}).target = a.id;
    if (distance(a, closest) > 2) continue;
    const state = (a.reproductive ??= {});
    state.mate = closest.id;
    state.due = now + (a.species === "mouse" ? 9 : 14);
    a.energy -= 16;
    closest.energy -= 6;
    closest.cooldown = 18;
    a.state = closest.state = "Courting";
    report(
      `${a.species[0].toUpperCase()}${a.species.slice(1)} #${a.id} paired with #${closest.id}`,
    );
  }
}
