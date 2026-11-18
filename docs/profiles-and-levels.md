# Profiles and levels

## Species and shared behavior

`profiles.ts` defines animal family capabilities and profile builders. `species.ts` resolves each existing species using those defaults plus explicit overrides. Profiles are frozen recursively; per-animal genes and state remain separate mutable records.

- Mammals inherit live birth and den nurseries.
- Birds inherit flight, eggs and nest nurseries.
- Fish/amphibians inherit aquatic behavior and water-dependent eggs.
- Reptiles inherit egg laying; turtles and crocodiles override aquatic behavior without changing snake or family defaults.
- Insects inherit egg laying without a nursery.

`laysEggs`, `aquatic`, clutch sizes, incubation durations and egg-water requirements now read profiles. Other specialized decisions still live in their existing systems; this is not a new all-purpose behavior engine or a change to thermoregulation.

Plants resolve from grass/shrub/tree families into the existing nine numeric varieties. The existing `kind` and `variety` save identifiers are unchanged. Resolved profiles include family growth/nutrition defaults and variety desert adaptation. A cactus and acacia retain their established drought adaptation. The definitions currently preserve all prior balancing values.

Fungi have a separate decomposer family. Their profile supplies litter-based growth, drying, decomposition, bite rate, nutrition and hydration to the existing soil and feeding systems. Fungi remain per-cell patches, with no new individual mushroom genomes or lineages in this change. Adding separately evolving fungi later requires extending that state model and its save migration.

To add an animal species, define its stable ID in `model.ts`, resolve its profile in `species.ts`, and explicitly supply its life history, founding/genetic defaults, renderer support, population limit and tests. Family inheritance reduces common configuration; it does not automatically provide meshes or special behavior for new species.

## Level definitions

`levels.ts` owns definitions, their registry and progress helpers. Only the existing sandbox is registered. A definition contains:

- Stable ID and definition revision, display name, sandbox/challenge mode.
- Seed and terrain preset. The current supported preset is `verdant-island`; different terrain layouts/sizes require implementing a new generator and compatible rendering/water support first.
- Initial global moisture/cloud values, plant spawn attempts, ordered animal founder counts.
- Species available for manual introduction and enabled island tools.
- Objectives based on elapsed simulation time, births, plant count or highest living generation.

Plant attempts are not guaranteed successful plants: placement still respects water and terrain. Weather then evolves through the existing regional climate system. Definition climate values are initial conditions, not permanent climate locks. Species availability limits the player's introduction action; it does not delete animals already present in a save or change predator diets.

Create a level with `defineLevel`, then register it in `LEVELS`. Example:

```ts
const grove = defineLevel({
  ...SANDBOX,
  id: "first-grove",
  revision: 1,
  name: "First Grove",
  mode: "challenge",
  seed: 123,
  availableSpecies: ["mouse"],
  initial: { plantAttempts: 180, animals: [["mouse", 12]] },
  tools: ["inspect", "water", "plants"],
  objectives: [
    { id: "first-birth", label: "Raise a new generation", metric: "births", target: 1 },
  ],
});
// Add `"first-grove": grove` to LEVELS to make saves for this ID loadable.
const world = new World(undefined, grove); // uses grove.seed
const progress = initialProgress(grove);
```

`updateLevelProgress` consumes a read-only metric snapshot. It records objective completion once and reports challenge completion. Sandbox never completes. This foundation does not yet include a level-selection menu, tutorial presentation, reward system, or automatic next-level transition. Add those in the UI/controller layer without putting mission checks inside animal updates.

The app initializes/resumes progress, updates it alongside its journal, disables unavailable tool buttons, and checks permissions again in `applyIslandTool`. Reset uses the current definition and its seed rather than hardcoding a new sandbox. Starting another level should be an explicit user action; loading never starts a different level silently.

## Persistence

Save version 27 stores `{ id, revision, completedObjectives }` next to the World snapshot. The World keeps its immutable definition in a private field, so configuration is not duplicated in the saved ecosystem.

All supported pre-27 saves are assigned sandbox revision 1. Saved animals, genes, plants, soil/fungi, weather, dens, eggs, lineage and simulation random state are restored normally; migration does not reseed the island. The browser storage key is unchanged.

New-format saves with an unknown level/revision, invalid objective IDs, or missing progress are rejected rather than treated as sandbox. The existing failed-load overwrite protection remains in place. If a shipped level revision changes, add an explicit progress migration before accepting it; never reuse an ID for a different scenario. Encoding also checks that the World and progress refer to the same definition.

## Verification

The pre-existing sandbox SHA-256 checkpoints for seeds 88, 7823 and 42 (300 ticks each) match after the profile/definition changes. `profiles-levels.test.ts` checks family overrides, frozen nested profiles, plant variety identity, fungal resources, custom initialization/seed, disabled tools, objective completion, legacy sandbox migration, deterministic continuation and rejection of unsupported level data. Existing migration and ecosystem regression suites remain applicable.

## Playable progression and evolution (version 28)

The island picker now includes the original sandbox, First Grove (plants and mice), and Predator Valley (unlocked by completing First Grove). Tutorial objectives advance in order: inspect a plant, inspect a mouse, plant food, add water, and reach three births. The UI owns these interactions; simulation updates remain independent of tutorials.

Each level has a separate browser save slot. Sandbox retains its original key. Slots use a compressed envelope while accepting older plain JSON saves; version 28 migrates the mouse diet and lineage fields. Failed writes cancel switching, and stale tabs cannot overwrite a newer slot value. This supersedes the version 27 persistence and menu limitations above.

Mouse diet preference mutates and affects plant nutrition and hunting. Sustained changes over three generations create named ecological branches, including small/large plant eaters, omnivores and hunters. These are ecological lineages, not reproductive isolation: reproduction remains asexual. Branch metadata survives saving and the death of ancestors.

Advance generations offers 10, 100 or 1,000 generations of real simulation in bounded batches. The target uses the highest living animal generation when started, tracks subsequent peaks, and can be stopped. Extinction or ten simulation days without generation progress stops advancement. Large targets can take substantial time. The world is saved, but a running advance request is not persisted.

`progression.test.ts` covers save separation, compression, stale writes, ordered unlocks, migration, mouse feeding trade-offs and branches, and generation advancement termination.

## Use-dependent animal inheritance (version 29)

`expression.ts` tracks six bounded recent-use marks separately from DNA: speed (fleeing/sprinting), endurance (active movement states), digging (digging/burying), waterproofing (wetness), insulation (cold exposure), and immunity (infection). Marks approach current use over 30 simulation seconds and fade over 90 seconds when use drops. Updates use elapsed simulation time, including sleeping animals, rather than perception decisions.

At conception, each marked trait has a maximum 60% chance to retain the parent's exact value instead of the ordinary mutation candidate. No value is automatically increased. A newborn/egg receives 35% of the parent's marks; the embryo does not train while incubating. This is a deliberate game abstraction inspired by epigenetics, not a model of RNA rewriting DNA. Other genes and neural weights retain their existing inheritance rules. Plants and fungi are unchanged.

The inspector displays current activation and exact-copy probabilities. Version 29 persists marks for living animals, archived relatives and embryos; older saves initialize them to zero. Tests cover elapsed-time equivalence, decay, copying limits, migration, validation and deterministic continuation.

## Plant stress memory (version 30)

Grass, bushes and trees now track drought and flood expression separately from their tolerance values. Soil moisture below 0.22 activates drought memory; standing-water depth activates flood memory, reaching full exposure at 0.5 m. Exposure matters even when a tolerant plant avoids damage. Marks rise over 30 simulation seconds and fade over 90 seconds, using the existing staggered growth elapsed time.

Offspring have up to a 60% chance to preserve each activated parental tolerance unchanged and inherit 35% of parental memory. Dormant seed-bank entries snapshot the parent's marks independently; no training or decay happens while dormant, and inheritance is applied when they germinate through the existing seed-template system. Growth costs and mutation remain in effect; stress does not automatically improve tolerance. The plant inspector shows activation and preservation chances. Version 30 initializes legacy plant and seed marks to zero and validates saved marks.

## Evolving visual models

`appearance.ts` maps existing inherited traits to bounded visual proportions. Mammal insulation affects coat bulk and ear size; eyesight affects eye size; juveniles have larger relative heads. Drought tolerance narrows plant crowns, and flood tolerance/defence affect trunk thickness. These are illustrative visual mappings, not additional mechanics or new genes. Tree rest sites share crown width so perches follow the new silhouette.

Mammals use two leg segments and lifted return strokes, with distance-driven cadence/stride. Faces have muzzles and noses; foxes/wolves no longer also receive the generic segmented tail. Birds flap from simulation age while airborne, folding wings on the ground. Wet coats darken. Conifer layers, clustered broadleaf crowns, dryland crowns and forked trunks share merged geometries. A small canopy-only shader sway uses simulation time and stops when paused; plant matrix refresh cadence remains unchanged.

Animal details remain in the existing three geometry batches. Limb capacity increased to 10,000 instances. This improves draw-call efficiency but increases per-frame instance transforms and triangles; no FPS improvement is claimed. `appearance.test.ts` checks bounded phenotype direction, foot motion, 560-animal buffer capacity, finite extreme-trait transforms and render purity. `reports/evolution-models.html` is an isolated live model showcase that does not read/write saved islands.

## Behaviour and life-stage visuals

`state-visuals.ts` centralizes render-only state interpretation. Stalking crouches and shortens stride; sprinting extends stride and adds a small bound. Feeding/drinking lower the head and animate a mouth cue. Digging/burying stop walking, animate mammal forefeet and show three reusable soil flecks. Drying shakes wet bodies; infection dulls coats. Frogs hop and extend hind legs on land-moving states, with hops suppressed for river-crossing/escape states. Existing sleep, nursery and parental-care poses remain. All animations use saved age/distance, so pause freezes them. These are lightweight procedural cues, not a full skeletal animation system or foot-to-terrain IK.

Plant structure now scales with age toward species maturity. Energy affects foliage fullness instead of trunk size. Drought memory plus damage produces ochre foliage and wilt; flood memory plus damage produces paler yellow-green foliage. These cues represent recent exposure, not an instantaneous hydrology measurement. Mature tree height stays stable, perches share the new scale, and new dead remains retain age-based size. Older saves need no field migration. Existing decay continues stripping foliage and collapsing remains.

The isolated `reports/life-states.html` gallery uses live renderer code without touching island saves. Tests enumerate all species/state pairs for finite transforms and pause stability, and check directional poses, frog hops and plant growth. Shared geometry batches and staggered plant updates remain in use.

## Worker generation advancement

Generation jumps now run the same World.step simulation in a dedicated module Web Worker. The main animation loop exits while it owns the island: no mesh updates, WebGL draws, journal/brain refreshes or foreground simulation. Only progress messages update the small status panel. Batches now have a soft 40 ms work budget and immediately schedule the next batch with a zero-delay timer. The former 75 ms idle throttle has been removed. Yielding lets pause/stop messages run; an individual simulation step cannot be interrupted. Progress includes measured simulation seconds per wall-clock second. A worker improves UI responsiveness, not the intrinsic compute cost of evolution.

The starting island is saved before launch. Worker snapshots arrive on pause, every 30 seconds, and on stop/completion; saves contain normal World state and RNG continuity. Editing and island switching are disabled until the worker returns ownership. Stop restores the worker's latest state and pauses the island. Hidden tabs pause and request a checkpoint. Abrupt closure can lose work since the last completed checkpoint. Worker failure retains the latest received state. The actual-worker test in `scripts/test-generation-worker.mjs` compares its simulated result against foreground stepping and exercises pause/stop restoration.

## Resource-limited animal populations

Animal reproduction and egg hatching no longer check a total, species or bird-role population ceiling. Food/energy requirements, parental reproductive cost, cooldowns, maturation, nursery requirements, age, thirst, disease and predation remain unchanged. Scarcity can cause population overshoot and crashes; equilibrium is not guaranteed. MAX_ANIMALS now applies only to validation of the initial founder budget in level definitions, not population growth. Manual introduction of missing species also no longer checks a total population ceiling.

Save loading accepts populations above the former 560 limit. Animal parts and eyes now use the same dynamic buffer growth as vegetation before writing instances. `population-resources.test.ts` verifies reproduction above 600 mice, round-trip saves and rendering 1,800 sleeping animals beyond the old mesh allocation. The change removes artificial limits; it does not claim that long-term ecological balance or unlimited population performance has been established.

## Browser persistence and omnivore lesson (version 31)

Browser saves now use IndexedDB (`evolutio-islands`, `slots` store). Startup reads those slots before starting the game, with legacy localStorage slots as a fallback. Legacy records are retained. Writes compare the expected prior value within the transaction and report success only after commit; level switching and generation advancement await persistence. Export backup downloads the current session as JSON. Invalid existing slots remain preserved rather than being silently replaced.

First Grove revision 2 allows mouse and bug introductions in groups of 1, 5 or 12. Its additional objectives introduce 12 living bugs and establish three living omnivore-lineage mice that have actually eaten bugs. Version 31 saves feeding evidence; earlier saves initialize it to false. Revision 1 lesson progress retains completed objective IDs. Worker checkpoints update these objectives too.

## Decomposer food cycle (version 32)

Dead animals now leave finite carcasses independently of the bounded family archive. Predation leaves a smaller remainder. Bugs seek nearby accessible plant remains or carcasses through a spatial grid, eat a finite amount, and return a fraction as litter. Background decomposition uses the same remaining mass, so food cannot be consumed twice; exhausted remains disappear. Threats and urgent needs still take priority.

Fungi and the existing soil-patch worm population consume litter and release bounded soil nutrients. Worm growth depends on damp litter, with decline in dry or food-poor soil. Plants draw nutrients during growth; fertility modifies productivity without making newly migrated islands infertile. Nutrient values default to 0.5 for old terrain cells. This is an abstract recycling model, not a chemically conserved nutrient simulation.

Mushroom caps and stems attach to damp, fungus-colonized dead trees and follow their falling/shrinking transforms. They visualize the existing fungal patch resource, not a second food store. Carcasses have shrinking selectable meshes. The patch inspector shows worms and fertility. Rendering reuses staggered vegetation refresh and instanced meshes. Version 32 saves carcasses and soil nutrients; older saves start without invented historical carcasses. Tests cover finite consumption, bug feeding on both food types, worms, nutrient uptake, removal, migration, validation and render transforms.

## Plant depletion and recovery (version 33)

All plant types now store finite reserves and track elapsed depletion stress. Grass, bushes and trees have reserve capacities of 5/12/24 and grace periods of 18/30/45 simulation seconds. Low edible energy draws from reserves; healthy surplus replenishes them at an energy cost. Prolonged depletion reduces health and introduces a time-scaled mortality hazard using the world's seeded RNG. Any type may recover when grazing pressure subsides, or die under sustained depletion. Empty foliage reduces productivity to 15% of its foliage factor; soil nutrient productivity now ranges from 8% to 192%, retaining the previous 100% factor at the default 50% fertility. These factors multiply other light, moisture, health and competition limits.

Grazing can reach zero energy. Depleted plants cannot reproduce; reproduction requires health above 60. Periodic seed-bank deposits require surplus energy and cost 20% of seed cost instead of being free. Plant inspectors expose reserves and stress; the weather/habitat panel shows stored plant food, depleted counts and depletion deaths. Existing foliage rendering already responds to low energy.

Version 33 initializes legacy plants and seed templates with half reserves and no historical stress, preserving a recovery opportunity rather than retroactively killing plants. New state is validated and saved, including depletion death totals. Tests cover every plant type, energy transfer, survival/death branches, growth limits and deterministic continuation. This is a balance change; short-run population results do not establish a long-term equilibrium.

## Swarm feeding and visible stripping

The existing bug aggregation is retained. Bugs now clear detritus at 3 mass units per simulation second (previously 0.7), with 0.8 digestible energy per unit (previously 18). A swarm therefore clears a finite patch quickly rather than extracting enough energy from one carcass to support many descendants. Carcass mass is proportional to cubed visual size, and newly created carcass size includes species size and life stage. Typical insect remains are much smaller than mammal remains. Existing saves remain readable; historical carcasses adopt the revised food conversion.

Bug foliage consumption doubles, with 55% assimilation efficiency; feeding adds local litter as waste. Fungi and worms subsequently convert it into nutrients. Living plant foliage width now falls to 8% at empty reserves instead of retaining 65%, so severe stripping is visible while stems and recovery remain possible. This is still an abstract energy/nutrient model, not a complete conservation model.

The headless `swarm-balance.mjs` harness runs sandbox seed 7823 and First Grove seed 123 with twelve initial bugs for 1,800 seconds at the normal 0.1-second timestep. It records samples and saves without accessing browser storage. Its population stop is a benchmark guard only, not a game cap. `profile-swarm.mjs` alternates CPU measurements of the captured old crowded state and revised states. The old feeding implementation is archived under reports/swarm-baseline/src; replay from 150 to 180 seconds reproduced the original population, plant count and edible energy exactly before benchmarking.
