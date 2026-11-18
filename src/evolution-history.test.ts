import { World } from "./sim.ts";
import { FIRST_GROVE } from "./levels.ts";
import { decodeSave, encodeSave } from "./save.ts";
import {
  ancestorChain,
  recordEvolution,
  rememberAnimal,
  readEvolutionArchive,
} from "./evolution-history.ts";
import { evolutionJournal } from "./evolution-view.ts";
function check(value: unknown, message: string) {
  if (!value) throw new Error(message);
}
const w = new World(123, FIRST_GROVE);
const parent = w.animals[0];
const child = w.addAnimal(parent.kind, parent, "mouse");
recordEvolution(w);
check(
  w.evolution.family.find((a) => a.id === child.id)?.parent === parent.id,
  "Birth retains parent",
);
parent.diedAt = 20;
rememberAnimal(w.evolution, parent, 20);
w.animals = w.animals.filter((a) => a.id !== parent.id);
w.deceased = [];
check(
  w.evolution.family.find((a) => a.id === parent.id)?.died === 20,
  "Death survives recent-death pruning",
);
const seed = w.seed;
recordEvolution(w);
check(w.seed === seed, "Recording does not consume simulation randomness");
const raw = encodeSave({ world: w, rate: 1, paused: true, selected: 0 });
const restored = decodeSave(raw).world;
check(
  JSON.stringify(w.evolution) === JSON.stringify(restored.evolution),
  "Journal roundtrip",
);
const legacy = JSON.parse(raw);
delete legacy.world.evolution;
legacy.world.time = 200;
const migrated = decodeSave(JSON.stringify(legacy)).world;
check(migrated.evolution.since === 200, "Legacy history begins at migration");
check(migrated.evolution.family.length > 0, "Legacy living families recovered");
const path = ancestorChain(
  w.evolution.family,
  child.id,
  (r) => r.parent || null,
);
check(
  path.chain.some((a) => a.id === parent.id),
  "Ancestor traversal retains dead parents",
);
check(
  ancestorChain([{ id: 1, parent: 2 }], 1, (r) => r.parent).missing === 2,
  "Missing ancestors explicit",
);
check(
  ancestorChain([{ id: 1, parent: 1 }], 1, (r) => r.parent).truncated,
  "Cycles terminate",
);
let rejected = false;
try {
  readEvolutionArchive({
    ...w.evolution,
    family: [...w.evolution.family, w.evolution.family[0]],
  });
} catch {
  rejected = true;
}
check(rejected, "Duplicate IDs rejected");
for (const tab of ["overview", "branches", "family"] as const)
  check(
    evolutionJournal(w, {
      tab,
      branch: 0,
      animal: child.id,
      trait: 0,
    }).includes("Evolution journal"),
    "Journal view renders",
  );
console.log(
  "Evolution history: birth/death, ancestry, legacy saves, roundtrip and views passed",
);
