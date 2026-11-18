# Architecture review and development guide

This pass reviewed simulation rules, environment and terrain, rendering, UI, persistence, tests, and tooling. The main concern is coupling: adding one species or behavior currently requires navigating several large functions. The existing spatial queries, staggered updates, deterministic random source, instanced meshes, and behavioral tests are useful foundations worth preserving.

## Changes made in this pass

| Module | Owns | Dependency rule |
| --- | --- | --- |
| `src/model.ts` | Animal, plant, egg, genome and other shared types | Types only; no World or Three.js dependency |
| `src/animal-state.ts` | Valid animal-state names, union type and save validator | One source for compile-time and runtime checks |
| `src/species.ts` | Species/plant profiles, defaults and life-history settings | Depends only on model types |
| `src/biology.ts` | Diet, growth, ageing, reproduction and perception helpers | Pure functions over model data and profiles |
| `src/brain.ts` | Neural evaluation | Pure function; no world, rendering or UI dependency |
| `src/nursery.ts` | Nursery occupancy and food/water transfer | Explicit context; mutates named animals, no World dependency |
| `src/app-shell.ts` | Initial app HTML | UI structure; no simulation loop |
| `src/sim.ts` | World state, random source and simulation orchestration | Imports domain rules; compatibility re-exports remain for existing tools/tests |

Production consumers now import domain types and rules directly rather than importing the World implementation just to use a type or a constant. `World` remains a compatibility facade; new code should use the smaller modules.

TypeScript now checks unused variables/parameters and consistent file-name casing, and preserves explicit type/value import distinctions. `strict` was already enabled. Animal states are now a string-literal union, so a misspelled state is a compiler error and a newly added state no longer needs a second handwritten save whitelist.

`npm test` automatically discovers test files and runs each in a separate process, serially. `npm run test:quick` excludes only the long stability suite. A failing child process fails the command. New test files no longer need to be added to two long package scripts.

## Highest-value next improvements

| Priority | Area and evidence | Next step | Safeguard / trade-off |
| --- | --- | --- | --- |
| 1 | Animal decisions in `World.step` still share many mutable locals (`need`, `target`, `stationary`, `needState`) | Extract sensing, needs, behavior choice, movement, metabolism and reproduction one at a time; use an explicit decision result | Preserve update order, priority rules, random-call order and urgent danger/thirst overrides. Avoid an entirely new AI framework in one change. |
| 1 | Selection in `main.ts` uses positive entity IDs, negative mushroom-cell IDs and a separate home key | Use a discriminated union such as `animal`, `plant`, `fungus`, `home`, `none`; put selection/follow transitions in a controller | Keep saved selection compatibility at the persistence boundary. Test clicking home → following parent → returning, including deaths and lost nests. |
| 1 | `save.ts` mixes 26 versions of migration with validation, and decoded JSON flows through `any` | Separate legacy migration, unknown-input validation, typed current snapshot and World restoration | Keep old saves loadable and failed-restore overwrite protection. Do not simply cast JSON to `World`. Add representative old-version fixtures before reorganizing migration order. |
| 2 | Journal and nursery panels rebuild HTML every UI refresh | Compute one UI snapshot per refresh; update only changed text/rows; keep focused buttons and scroll position stable | DOM work is already gated to 400ms. Measure before adding a reactive framework. Never interpolate unescaped future user-controlled names. |
| 2 | `meshes.ts` combines allocation, plants, nests, species geometry and poses | Separate buffer/instance management, plant rendering and animal pose builders | Retain shared geometries/materials and instancing. A component per animal should not become a mesh/draw call per body part. |
| 2 | Nest placement and occupant grouping are repeated in simulation, rendering and inspectors | Build a shared nursery query/index with explicit lifetime | Do not cache live occupants indefinitely: death, hatch, tree loss and flooding invalidate it. Share computed data where call cadence matches. |
| 2 | Render paths repeatedly filter/map arrays and allocate colours, maps and temporary arrays | Profile allocations and reuse frame buffers where measured | Selected plants currently bypass the slower plant-mesh cadence. Bound that update to the selected item or a timed refresh rather than forcing every plant to rebuild. |
| 2 | Save serialization and localStorage writes are synchronous; plants have resource limits rather than a small fixed cap | Measure save duration/size on older, densely vegetated islands; add export/import backup before changing storage | Worker serialization or IndexedDB may help large worlds, but add migration and ownership complexity. Don't promise browser-independent persistence from localStorage. |
| 3 | The app installs global listeners, an animation loop and an autosave timer without an explicit disposal owner | Add a boot/dispose lifecycle and keep resource handles; dispose controls, GPU assets, listeners and timers on teardown | Most useful for HMR, embedded views and future route changes; current full-page loads already release resources. |
| 3 | Many renderer and UI assumptions are covered only indirectly by simulation tests | Add a small browser smoke suite for home picking, follow/return, save restoration, pause and mobile layout | Pure matrix tests cannot prove a visible mouthful is readable or that a nested button can be clicked. |

## Family inheritance, species and common behavior

Shared defaults are useful, but the inheritance hierarchy should primarily describe species definitions rather than turn every living animal into a subclass instance. This is a proposed next step; this pass extracted the existing profiles without changing their values or adding salmon/trout.

```text
Animal profile
  Fish defaults       -> Salmon profile / Trout profile
  Mammal defaults     -> Mouse profile / Wolf profile
  Reptile defaults    -> Snake profile / Turtle profile
  Bird defaults       -> Insect-eating bird / Bird-of-prey profile

Resolved species profile + individual inherited genes + current body state
                              |
                    Shared behavior systems
                              |
                    A decision for this tick
```

These are gameplay groups, not a complete taxonomic tree. A profile holds common defaults such as temperature regulation, respiration, reproduction, diet and locomotion. A species overrides only its differences. Resolve/freeze the shared profile once; never let offspring mutation modify shared defaults. Genes belong to each individual and modify the ranges or tendencies allowed by its species. Arrays and nested objects need deliberate merge rules rather than an accidental shallow spread.

Common behavior should be reusable across groups. Swimming applies to fish, turtles, crocodiles and some mammals/birds; egg laying applies to birds, reptiles, fish and insects; basking and shelter use likewise overlap. A single `Animal -> Mammal/Reptile/Fish -> Species` class chain cannot express all those combinations cleanly without overrides and special cases. Small capability records and shared functions handle the overlap without forcing a class per combination.

For state management, the important boundary is one decision owner. Sensing/needs can propose intents; an explicit priority policy chooses a decision such as `flee`, `drink`, `return-to-young`, `feed-young`, `rest` or `forage`, with its target and movement/energy requirements. Start by preserving the current priority order exactly, and test interruptions such as a feeding parent detecting danger. Species profiles adjust preferences and constraints; they should not each implement their own complete update loop.

A discriminated union makes invalid decisions harder to express: `feed-young` needs a recipient ID, while `rest` does not. The current `AnimalState` union is a first safeguard for displayed/saved states, not a complete behavior state machine. Keep independent conditions such as wetness, infection, age and carrying food separate from the main activity; they can coexist.

Classes remain useful where there is resource ownership or lifecycle (World, renderer, camera controller). A shallow class hierarchy can also work if its subclasses have truly stable, substitutable behavior. In this project, plain serializable animal records plus composable systems fit the existing saves, tests and evolving traits better. This choice is about maintainability and compatibility, not a claim that JavaScript classes are inherently slow.

## Rules for subsequent changes

- Keep simulation data independent of Three.js objects and DOM elements. Rendering reads state; it must not decide who eats or reproduce animals.
- Keep seeded randomness inside World or an explicitly passed random source. Do not use `Math.random()` in simulation systems.
- Prefer domain modules and small functions with explicit inputs over a global utility bag, service locator, or event bus. Dependencies should point toward model/rules, not back toward `main.ts`.
- Document units and ranges for quantities: simulation seconds, world metres, energy, hydration 0–100, wetness 0–1, and angles in radians. Named thresholds should live with the owning system; avoid a global settings file containing unrelated constants.
- Treat behavior order as game logic. Sleeping, feeding, escape, thirst and habitat preferences are not interchangeable callbacks.
- Preserve elapsed-time accounting when changing decision gates. Skipping a decision must not skip ageing, hydration loss, disease or urgent threat checks.
- Keep caches scoped to a step or give them explicit invalidation. Mutating arrays without updating indexes is a correctness risk.
- Enable `noUncheckedIndexedAccess` incrementally after auditing grids, neural weight indexing, instance IDs and DOM lookups. Enabling it and adding non-null assertions everywhere would hide the risks rather than resolve them.
- Add tests for observable rules and edge cases, not the number of helper functions or a copy of an implementation formula.
- Separate a behavior-preserving refactor from balance changes. Snapshot differences are useful evidence only when deliberate rule changes are not mixed into the same pass.

## What not to introduce yet

A full entity-component-system rewrite, WebAssembly port, worker-based world simulation, or UI framework migration is not justified by modularity alone. They can be useful later, but first establish clear system boundaries and profile real target devices. Splitting TypeScript files improves maintenance; it does not inherently reduce CPU or JavaScript download size. Vite still reports a large bundled chunk, mostly requiring investigation of what ships and when; chunk splitting alone does not reduce total bytes.

## Validation

The before-refactor fingerprints are in `reports/refactor-baseline.json`; the matching post-refactor results are in `reports/refactor-verification.json`. Each compares SHA-256 of the complete serialized World after 300 ticks of 0.1s for seeds 88, 7823 and 42. This checks exact state, not just population totals; it is evidence for these runs, not proof of identical behavior for every seed.

All 19 test files passed in the full run, including the three-seed stability suite. Build, type checks and formatting checks passed. The normal suites also exercise inheritance, water and climate, care, rendering matrices, migration and deterministic long runs. Browser visuals were not changed by this refactor and were not rechecked interactively in this pass.

Run:

```sh
npm run typecheck
npm run format:check
npm run test:quick
npm test
npm run build
```

Use `npm run format` to apply the existing Prettier style. For performance work, use the existing `?profile=1` diagnostics and `scripts/profile.mjs`, compare the same population/seed, and report simulation time, render time, UI time and save time separately. A Node CPU profile does not measure browser GPU rendering or mobile performance.

## Follow-up implementation

The profile hierarchy and level-definition foundation have now been implemented. See [profiles and levels](profiles-and-levels.md) for the current module ownership and save version 27 behavior; the earlier hierarchy discussion above records the design rationale.
