import {
  lineageIdentity,
  lineageBadge,
  mousePortrait,
  lineageLooks,
} from "./lineage-identity.ts";
import type { World } from "./sim.ts";
import { SPECIES } from "./species.ts";
import {
  ancestorChain,
  evolutionSnapshot,
  JOURNAL_TRAITS,
  type EvolutionArchive,
} from "./evolution-history.ts";
import type { MouseNiche } from "./mouse-lineages.ts";
export interface EvolutionView {
  tab: "overview" | "branches" | "family";
  branch: number;
  animal: number;
  trait: number;
}
const labels = [
  "Speed",
  "Body size",
  "Brain neurons",
  "Swimming",
  "Insulation",
  "Diet affinity",
];
const nicheName: Record<MouseNiche, string> = {
  "plant eater": "Herbivore lineage",
  "small plant eater": "Small herbivores",
  "large plant eater": "Large herbivores",
  omnivore: "Omnivore lineage",
  hunter: "Hunting lineage",
};
const day = (time: number) => 1 + Math.floor(time / 180);
const fmt = (n: number) => n.toFixed(2);
const delta = (a: number, b: number) =>
  `${a - b >= 0 ? "+" : ""}${(a - b).toFixed(2)}`;
export function evolutionJournal(w: World, state: EvolutionView) {
  const archive = w.evolution,
    now = evolutionSnapshot(w),
    first = archive.samples.find((s) => s.mice > 0);
  const living = new Map(w.animals.map((a) => [a.id, a]));
  const populations = new Map<number, number>(),
    eggs = new Map<number, number>();
  for (const a of w.animals)
    if (a.mouseLineage)
      populations.set(
        a.mouseLineage.id,
        (populations.get(a.mouseLineage.id) ?? 0) + 1,
      );
  for (const e of w.eggs)
    if (e.embryo.mouseLineage)
      eggs.set(
        e.embryo.mouseLineage.id,
        (eggs.get(e.embryo.mouseLineage.id) ?? 0) + 1,
      );
  const branches = new Map(archive.branches.map((b) => [b.id, b]));
  const name = (id: number) => `${lineageIdentity(id).name} · #${id}`;
  const representatives = new Map<number, (typeof w.animals)[number]>();
  for (const a of w.animals)
    if (a.mouseLineage && !representatives.has(a.mouseLineage.id))
      representatives.set(a.mouseLineage.id, a);
  const count = (id: number) =>
    `${populations.get(id) ?? 0} alive${eggs.has(id) ? ` · ${eggs.get(id)} eggs` : ""}`;
  const active = [...populations].sort((a, b) => b[1] - a[1]);
  const branchButton = (id: number) =>
    `<button class="evo-node ${id === state.branch ? "chosen" : ""}" data-evo-branch="${id}">${representatives.has(id) ? mousePortrait(representatives.get(id)!.genes) : ""}<b>${lineageBadge(id)}</b><span>#${id} · ${branches.has(id) ? nicheName[branches.get(id)!.niche] : "Earlier lineage"}</span><span>${branches.has(id) ? `Appeared G${branches.get(id)!.generation} · ` : "History not retained · "}${count(id)}</span></button>`;
  let content = "";
  if (state.tab === "overview") {
    content = `<div class="evo-summary"><div><b>${w.highestGeneration}</b><span>generation reached</span></div><div><b>${active.length}</b><span>living mouse lineages</span></div><div><b>${w.animals.length}</b><span>living animals</span></div></div><div class="evo-columns"><section><h3>Who thrives now?</h3>${
      active
        .slice(0, 8)
        .map(
          ([id, n]) =>
            `<div class="evo-branch-row">${branchButton(id)}<div class="evo-share" style="--share:${(100 * n) / Math.max(1, now.mice)}%"></div><small>${Math.round((n / Math.max(1, now.mice)) * 100)}% of living mice</small></div>`,
        )
        .join("") || "<p>No living mouse lineages.</p>"
    }${active.length > 8 ? `<button data-evo-tab="branches">Explore all ${active.length} living lineages →</button>` : ""}</section><section><h3>How have mice changed?</h3><p>Living mouse averages${first ? ` · compared with day ${day(first.time)}, G${first.generation}` : ""}.</p><table class="evo-table"><thead><tr><th>Trait</th><th>Now</th><th>Change</th></tr></thead><tbody>${labels.map((label, i) => `<tr><th>${label}</th><td>${now.mice ? fmt(now.traits[i]) : "—"}</td><td>${first && now.mice ? delta(now.traits[i], first.traits[i]) : "—"}</td></tr>`).join("")}</tbody></table><label>Trait history <select id="evo-trait">${labels.map((label, i) => `<option value="${i}" ${state.trait === i ? "selected" : ""}>${label}</option>`).join("")}</select></label>${traitChart(archive, now, state.trait)}<h3>Plant evolution</h3><p>${w.plants.length} plants · ${new Set(w.plants.map((p) => p.kind + ":" + p.variety)).size} current plant varieties</p><p>Average growth ${fmt(now.plantTraits[0])} · defence ${fmt(now.plantTraits[1])} · flood tolerance ${fmt(now.plantTraits[2])}.</p></section></div>`;
  } else if (state.tab === "branches") {
    const branch = branches.get(state.branch),
      path = ancestorChain(archive.branches, state.branch, (b) => b.parentId);
    const children = archive.branches
      .filter((b) => b.parentId === state.branch && b.id !== state.branch)
      .sort(
        (a, b) => (populations.get(b.id) ?? 0) - (populations.get(a.id) ?? 0),
      );
    const members = w.animals.filter(
      (a) => a.mouseLineage?.id === state.branch,
    );
    content = `<label>Living lineage <select id="evo-lineage"><option value="${state.branch}">${name(state.branch)}</option>${active
      .filter(([id]) => id !== state.branch)
      .map(
        ([id, n]) => `<option value="${id}">${name(id)} · ${n} alive</option>`,
      )
      .join(
        "",
      )}</select></label><div class="evo-columns"><section><h3>Lineage tree</h3><p>A new mouse branch is recorded after a changed ecological niche persists for three inherited generations. These are lineages, not proven separate species.</p><ol class="evo-tree">${path.missing !== null ? `<li class="evo-gap">Earlier lineage #${path.missing}: record unavailable</li>` : ""}${path.truncated ? '<li class="evo-gap">Earlier ancestry omitted from this view</li>' : ""}${path.chain
      .slice()
      .reverse()
      .map((b) => `<li>${branchButton(b.id)}</li>`)
      .join("")}</ol><h4>Branches descended from this lineage</h4>${
      children
        .slice(0, 30)
        .map((b) => branchButton(b.id))
        .join("") || "<p>No descendant branch records retained yet.</p>"
    }${children.length > 30 ? `<p>Showing 30 of ${children.length} recorded child branches.</p>` : ""}</section><section><h3>${lineageBadge(state.branch)}</h3><p>Lineage #${state.branch} · ${branch ? nicheName[branch.niche] : "Earlier lineage"}</p><div class="lineage-portraits">${members
      .slice(0, 3)
      .map(
        (a) =>
          `<figure>${mousePortrait(a.genes)}<figcaption>#${a.id} · G${a.generation}</figcaption></figure>`,
      )
      .join(
        "",
      )}</div><p>${lineageLooks(members)}</p>${members.length ? `<p class="muted">Adult appearance diagrams from these mice’s inherited genes. Age, wetness and illness also affect their appearance on the island. Members of one lineage can vary.</p><button class="primary" data-evo-locate="${state.branch}">Find this family on the island ↗</button>` : ""}<p>${count(state.branch)}${!members.length && !eggs.has(state.branch) ? " · no current members" : ""}.</p>${branch ? `<p>First split: generation ${branch.generation}. ${branch.traits ? "Founder traits retained." : "Founder traits were not retained in the older save."}</p>` : "<p>This older branch is referenced by descendants, but its own record is unavailable.</p>"}${
      members.length
        ? `<table class="evo-table"><thead><tr><th>Trait</th><th>Living average</th><th>Founder</th></tr></thead><tbody>${labels.map((label, i) => `<tr><th>${label}</th><td>${fmt(members.reduce((s, a) => s + a.genes[JOURNAL_TRAITS[i]], 0) / members.length)}</td><td>${branch?.traits ? fmt(branch.traits[i]) : "—"}</td></tr>`).join("")}</tbody></table><h4>Meet this family</h4>${members
            .slice(0, 8)
            .map(
              (a) =>
                `<button class="evo-node" data-evo-family="${a.id}">Mouse #${a.id} · G${a.generation}<span>${a.state}</span></button>`,
            )
            .join("")}`
        : ""
    }${branch && archive.family.some((a) => a.id === branch.id) ? `<button data-evo-family="${branch.id}">View the founder’s family →</button>` : ""}</section></div>`;
  } else {
    const records = new Map(archive.family.map((a) => [a.id, a]));
    const a = records.get(state.animal),
      path = ancestorChain(
        archive.family,
        state.animal,
        (r) => r.parent || null,
        20,
      );
    const children = archive.family
      .filter((r) => r.parent === state.animal)
      .sort(
        (a, b) =>
          Number(living.has(b.id)) - Number(living.has(a.id)) || b.id - a.id,
      );
    const node = (id: number) => {
      const r = records.get(id)!;
      return `<button class="evo-node ${id === state.animal ? "chosen" : ""}" data-evo-family="${id}"><b>${SPECIES[r.species].label} #${id} · G${r.generation}</b><span>${living.has(id) ? living.get(id)!.state : r.died !== null ? `Died on day ${day(r.died)}` : "Not present in the current population"}</span></button>`;
    };
    const parent = a ? records.get(a.parent) : undefined;
    content = `<div class="evo-columns"><section><h3>Family tree</h3><p>The simulation records one genetic parent per offspring. Select any relative to explore their family.</p><ol class="evo-tree">${path.missing !== null ? `<li class="evo-gap">Parent #${path.missing}: record unavailable</li>` : ""}${path.truncated ? '<li class="evo-gap">Showing the nearest 20 generations. Select an older ancestor to go farther.</li>' : ""}${path.chain
      .slice()
      .reverse()
      .map((r) => `<li>${node(r.id)}</li>`)
      .join(
        "",
      )}</ol></section><section><h3>${a ? `${SPECIES[a.species].label} #${a.id}` : "Select an animal"}</h3>${a ? `<p>Generation ${a.generation} · born around day ${day(a.born)}.</p>${living.has(a.id) ? `<button class="primary" data-evo-watch="${a.id}">Watch on island ↗</button>` : ""}${a.branch !== null ? `<button data-evo-branch="${a.branch}">Explore lineage →</button>` : ""}<h4>Inherited traits</h4><table class="evo-table"><thead><tr><th>Trait</th><th>This animal</th><th>From parent</th></tr></thead><tbody>${labels.map((label, i) => `<tr><th>${label}</th><td>${fmt(a.traits[i])}</td><td>${parent ? delta(a.traits[i], parent.traits[i]) : "Unknown"}</td></tr>`).join("")}</tbody></table>` : "<p>Select an animal on the island, then reopen the journal.</p>"}<h4>Recorded offspring · ${children.length}</h4>${
      children
        .slice(0, 40)
        .map((r) => node(r.id))
        .join("") || "<p>No offspring records retained.</p>"
    }${children.length > 40 ? "<p>Showing the most recent 40, with living offspring first.</p>" : ""}</section></div>`;
  }
  return `<header><p class="eyebrow">YOUR ISLAND’S STORY · DAY ${day(w.time)}</p><h2 id="evolution-title">Evolution journal</h2><button class="evo-close" data-evo-close aria-label="Close evolution journal">×</button></header><nav aria-label="Evolution views">${(
    [
      ["overview", "Overview"],
      ["branches", "Lineage tree"],
      ["family", "Family tree"],
    ] as const
  )
    .map(
      ([key, label]) =>
        `<button data-evo-tab="${key}" aria-pressed="${state.tab === key}">${label}</button>`,
    )
    .join(
      "",
    )}<button data-evo-refresh>Refresh snapshot</button></nav><p class="evo-coverage">Journal recording began on day ${day(archive.since)}. ${archive.since > 0 ? "Earlier ancestry is limited to records retained in this save." : "Founder history is recorded from the start."} ${archive.trimmed ? "Some older records have been compacted; gaps are marked." : ""} Counts describe this snapshot; the island continues running.</p>${content}`;
}
function traitChart(
  archive: EvolutionArchive,
  now: ReturnType<typeof evolutionSnapshot>,
  trait: number,
) {
  const points = [
    ...archive.samples.filter((s) => s.mice > 0 && s.time < now.time),
    ...(now.mice ? [now] : []),
  ];
  if (points.length < 2 || points.at(-1)!.time - points[0].time < 5)
    return '<p class="evo-gap">Collecting trait history. Earlier trait averages cannot be reconstructed from this save.</p>';
  const start = points[0].time,
    end = points.at(-1)!.time,
    min = Math.min(...points.map((s) => s.traits[trait])),
    max = Math.max(...points.map((s) => s.traits[trait])),
    span = Math.max(0.1, max - min);
  const line = points
    .map(
      (s, i) =>
        `${i ? "L" : "M"}${45 + ((s.time - start) / (end - start)) * 505},${110 - ((s.traits[trait] - min) / span) * 85}`,
    )
    .join(" ");
  return `<svg class="evo-chart" viewBox="0 0 600 155" role="img" aria-label="${labels[trait]} history from ${fmt(points[0].traits[trait])} to ${fmt(now.traits[trait])}"><path d="M45 20V115H555" stroke="#c6d2bf" fill="none"/><path d="${line}" stroke="#426b57" stroke-width="3" fill="none"/><text x="3" y="30">${fmt(max)}</text><text x="3" y="115">${fmt(min)}</text><text x="45" y="145">Day ${day(start)}</text><text x="480" y="145">Day ${day(end)}</text></svg>`;
}
