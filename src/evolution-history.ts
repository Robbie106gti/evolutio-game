import type { Animal, Species } from "./model.ts";
import type { World } from "./sim.ts";
import { MOUSE_NICHES, type MouseNiche } from "./mouse-lineages.ts";
import { SPECIES } from "./species.ts";
export const JOURNAL_TRAITS = [
  "speed",
  "size",
  "neurons",
  "swimming",
  "insulation",
  "dietAffinity",
] as const;
export interface FamilyRecord {
  id: number;
  parent: number;
  otherParent?: number;
  cloned?: true;
  generation: number;
  species: Species;
  branch: number | null;
  born: number;
  died: number | null;
  traits: number[];
}
export interface BranchRecord {
  id: number;
  parentId: number | null;
  generation: number;
  niche: MouseNiche;
  traits: number[] | null;
}
export interface EvolutionSample {
  time: number;
  generation: number;
  animals: number;
  plants: number;
  mice: number;
  traits: number[];
  plantTraits: number[];
}
export interface EvolutionArchive {
  version: 1;
  since: number;
  trimmed: boolean;
  family: FamilyRecord[];
  branches: BranchRecord[];
  samples: EvolutionSample[];
}
const FAMILY_LIMIT = 12000,
  BRANCH_LIMIT = 3000;
export function createEvolutionArchive(): EvolutionArchive {
  return {
    version: 1,
    since: 0,
    trimmed: false,
    family: [],
    branches: [],
    samples: [],
  };
}
const indexes = new WeakMap<
  EvolutionArchive,
  { family: Map<number, FamilyRecord>; branches: Map<number, BranchRecord> }
>();
function index(archive: EvolutionArchive) {
  let value = indexes.get(archive);
  if (!value) {
    value = {
      family: new Map(archive.family.map((r) => [r.id, r])),
      branches: new Map(archive.branches.map((r) => [r.id, r])),
    };
    indexes.set(archive, value);
  }
  return value;
}
export const animalTraits = (a: Animal) =>
  JOURNAL_TRAITS.map((k) => a.genes[k]);
export function rememberAnimal(
  archive: EvolutionArchive,
  a: Animal,
  time: number,
) {
  const maps = index(archive);
  let record = maps.family.get(a.id);
  if (!record) {
    record = {
      id: a.id,
      parent: a.parent,
      ...(a.otherParent === undefined ? {} : { otherParent: a.otherParent }),
      ...(a.cloned ? { cloned: true } : {}),
      generation: a.generation,
      species: a.species,
      branch: a.mouseLineage?.id ?? null,
      born: Math.max(0, (a.diedAt ?? time) - a.age),
      died: a.diedAt ?? null,
      traits: animalTraits(a),
    };
    archive.family.push(record);
    maps.family.set(a.id, record);
  } else if (a.diedAt !== undefined) record.died = a.diedAt;
  const branch = a.mouseLineage;
  if (branch && !maps.branches.has(branch.id)) {
    const record: BranchRecord = {
      id: branch.id,
      parentId: branch.id === 0 ? null : branch.parentId,
      generation: branch.originGeneration,
      niche: branch.niche,
      traits: a.id === branch.id ? animalTraits(a) : null,
    };
    archive.branches.push(record);
    maps.branches.set(record.id, record);
  }
  if (archive.family.length > FAMILY_LIMIT) {
    for (const old of archive.family.splice(
      0,
      archive.family.length - FAMILY_LIMIT,
    ))
      maps.family.delete(old.id);
    archive.trimmed = true;
  }
  if (archive.branches.length > BRANCH_LIMIT) {
    for (const old of archive.branches.splice(
      0,
      archive.branches.length - BRANCH_LIMIT,
    ))
      maps.branches.delete(old.id);
    archive.trimmed = true;
  }
}
export function evolutionSnapshot(
  w: Pick<World, "animals" | "plants" | "time" | "highestGeneration">,
): EvolutionSample {
  const mice = w.animals.filter((a) => a.species === "mouse");
  return {
    time: w.time,
    generation: w.highestGeneration,
    animals: w.animals.length,
    plants: w.plants.length,
    mice: mice.length,
    traits: JOURNAL_TRAITS.map(
      (k) => mice.reduce((sum, a) => sum + a.genes[k], 0) / (mice.length || 1),
    ),
    plantTraits: (["growth", "defense", "floodTolerance"] as const).map(
      (k) =>
        w.plants.reduce((sum, p) => sum + p[k], 0) / (w.plants.length || 1),
    ),
  };
}
export function recordEvolution(w: World) {
  const archive = w.evolution;
  for (const a of w.deceased) rememberAnimal(archive, a, w.time);
  for (const a of w.animals) rememberAnimal(archive, a, w.time);
  const last = archive.samples.at(-1);
  if (
    !last ||
    w.highestGeneration > last.generation ||
    w.time - last.time >= 60
  ) {
    archive.samples.push(evolutionSnapshot(w));
    if (archive.samples.length > 512)
      archive.samples = archive.samples.filter(
        (_, i, all) => i % 2 === 0 || i === all.length - 1,
      );
  }
}
export function readEvolutionArchive(value: unknown): EvolutionArchive {
  const fail = () => {
    throw new Error("Invalid evolution journal in save");
  };
  if (!value || typeof value !== "object") return fail();
  const a = value as EvolutionArchive;
  const n = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0;
  const id = (v: unknown) => n(v) && Number.isSafeInteger(v);
  const vector = (v: unknown, length: number) =>
    Array.isArray(v) && v.length === length && v.every(n);
  if (
    a.version !== 1 ||
    !n(a.since) ||
    typeof a.trimmed !== "boolean" ||
    !Array.isArray(a.family) ||
    a.family.length > FAMILY_LIMIT ||
    !Array.isArray(a.branches) ||
    a.branches.length > BRANCH_LIMIT ||
    !Array.isArray(a.samples) ||
    a.samples.length > 512
  )
    return fail();
  if (
    !a.family.every(
      (r) =>
        r &&
        id(r.id) &&
        r.id > 0 &&
        id(r.parent) &&
        (r.otherParent === undefined ||
          (id(r.otherParent) &&
            r.otherParent > 0 &&
            r.otherParent !== r.id &&
            r.otherParent !== r.parent)) &&
        (r.cloned === undefined ||
          (r.cloned === true && r.parent > 0 && r.otherParent === undefined)) &&
        id(r.generation) &&
        r.generation > 0 &&
        Object.hasOwn(SPECIES, r.species) &&
        (r.branch === null || id(r.branch)) &&
        n(r.born) &&
        (r.died === null || n(r.died)) &&
        vector(r.traits, 6),
    )
  )
    return fail();
  if (
    !a.branches.every(
      (r) =>
        r &&
        id(r.id) &&
        (r.parentId === null || id(r.parentId)) &&
        id(r.generation) &&
        r.generation > 0 &&
        MOUSE_NICHES.includes(r.niche) &&
        (r.traits === null || vector(r.traits, 6)),
    )
  )
    return fail();
  if (
    !a.samples.every(
      (s) =>
        s &&
        n(s.time) &&
        id(s.generation) &&
        id(s.animals) &&
        id(s.plants) &&
        id(s.mice) &&
        vector(s.traits, 6) &&
        vector(s.plantTraits, 3),
    )
  )
    return fail();
  if (
    new Set(a.family.map((r) => r.id)).size !== a.family.length ||
    new Set(a.branches.map((r) => r.id)).size !== a.branches.length
  )
    return fail();
  // Rebuild known fields only.
  return {
    version: 1,
    since: a.since,
    trimmed: a.trimmed,
    family: a.family.map((r) => ({
      id: r.id,
      parent: r.parent,
      ...(r.otherParent === undefined ? {} : { otherParent: r.otherParent }),
      ...(r.cloned ? { cloned: true } : {}),
      generation: r.generation,
      species: r.species,
      branch: r.branch,
      born: r.born,
      died: r.died,
      traits: [...r.traits],
    })),
    branches: a.branches.map((r) => ({
      id: r.id,
      parentId: r.parentId,
      generation: r.generation,
      niche: r.niche,
      traits: r.traits ? [...r.traits] : null,
    })),
    samples: a.samples.map((s) => ({
      time: s.time,
      generation: s.generation,
      animals: s.animals,
      plants: s.plants,
      mice: s.mice,
      traits: [...s.traits],
      plantTraits: [...s.plantTraits],
    })),
  };
}
export function ancestorChain<T extends { id: number }>(
  records: readonly T[],
  start: number,
  parent: (r: T) => number | null,
  limit = 30,
) {
  const map = new Map(records.map((r) => [r.id, r])),
    seen = new Set<number>(),
    chain: T[] = [];
  let id: number | null = start,
    missing: number | null = null;
  while (id !== null && chain.length < limit && !seen.has(id)) {
    seen.add(id);
    const item = map.get(id);
    if (!item) {
      missing = id;
      break;
    }
    chain.push(item);
    id = parent(item);
  }
  return { chain, missing, truncated: id !== null && missing === null };
}
