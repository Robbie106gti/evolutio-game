# Evolutio

A TypeScript / Three.js artificial-life island. Watch animals inherit traits and small neural brains, plants compete for resources, and ecosystems change over generations.

## Run locally

Use Node.js 24:

```sh
npm ci
npm run dev
```

`npm run test:quick` runs regression tests. `npm run build` checks TypeScript and creates the production bundle. `npm run preview` previews it. `npm test` also runs the long stability simulation.

## Play

Choose First Grove for a guided start or Verdant Island for the sandbox. Each island has a separate browser save. Drag to orbit, scroll to zoom, and use arrow keys to pan. Click animals, plants, mushrooms, nests or dens to inspect them.

The evolution journal shows named mouse lineages, parents, offspring, and trait histories. Coats, markings, ears and tails are inherited with small mutations; optional family rings help locate relatives. The new ear, tail, lightness and patch-size genes currently affect appearance. Existing hue and marking genes also affect camouflage.

Generation advancement runs in a worker. Detailed mode simulates individual behaviour. Experimental approximate mode supports mice and bugs and trades behavioural fidelity for speed. Dense islands may use up to three mate-search helpers during fast-forward if a short timing comparison shows a benefit.

Use Save island and Export backup. Saves belong to the browser and site address: localhost and GitHub Pages have separate storage. Export a backup before clearing site data. Use Import backup to restore a downloaded JSON file to its original island slot. The game asks before replacing an existing island. The simulation runs entirely on the device, without a server or user accounts. IndexedDB stores islands; older save formats migrate on load.

This is a stylized simulation, not a scientific model. New islands use two-parent natural reproduction for all eleven animal species, with species-specific clutch sizes, maturation and reproductive lifespans. Mice and foxes can spar; mammals raise litters and birds return to their nest before laying. Reproduction requires energy investment and recovery time, with smaller, less frequent carnivore litters. Isolated female snakes can lay clone eggs, and a group of fish without a male can see a female change sex. Incubation warmth can affect hatchling sex in turtles. These are gameplay rules inspired by particular species. Existing islands keep their original rules until you choose Enable natural reproduction in the journal. Mouse ecological lineages are not proven separate species. Ancestry archives have bounded retention and label historical gaps. Dormant seeds can disperse from flooded parent locations onto suitable ground; bounded seed storage preserves room for slower-growing trees and bushes. Fungi and worms are patch resources. Resource availability and survival pressures govern populations; dense worlds can still be expensive.

## Code

- `src/sim.ts`: world state and simulation coordination.
- `src/species.ts`, `src/profiles.ts`, `src/levels.ts`: organism profiles and level definitions.
- `src/meshes.ts`, `src/mouse-appearance.ts`: instanced models and inherited appearance.
- `src/evolution-history.ts`, `src/evolution-view.ts`: ancestry archive and journal.
- `src/save.ts`, `src/browser-storage.ts`: validated saves and persistence.
- `src/generation-worker.ts`, `src/approximate.ts`: background advancement.

## Publishing

The Pages workflow tests and builds pushes to main, then deploys dist. In repository Settings / Pages, choose GitHub Actions as the source. Vite uses relative asset paths for repository subdirectories, including the worker bundle. See the [Vite deployment guide](https://vite.dev/guide/static-deploy).

Dependencies, build outputs, local saves, screenshots and benchmark captures in reports/ are excluded from Git. The docs/ folder contains historical implementation notes. Optional profiling scripts may require locally captured reports/ fixtures.
