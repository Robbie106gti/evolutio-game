import type { Animal } from "./model.ts";
import { SPECIES } from "./species.ts";
export const DIET_GROUPS = [
  "herbivores",
  "omnivores",
  "carnivores",
  "detritivores",
] as const;
export type DietGroup = (typeof DIET_GROUPS)[number];
export type PopulationCounts = Record<DietGroup, number> & { plants: number };
export const POPULATION_SERIES = [
  { key: "herbivores", label: "Herbivores", color: "#927128", dash: [] },
  { key: "omnivores", label: "Omnivores", color: "#7750a0", dash: [8, 4] },
  { key: "carnivores", label: "Carnivores", color: "#bc533d", dash: [2, 4] },
  {
    key: "detritivores",
    label: "Detritivores",
    color: "#387d8a",
    dash: [10, 3, 2, 3],
  },
  { key: "plants", label: "Plants", color: "#477642", dash: [] },
] as const;
// Categories describe the game's available food sources, not real-world taxonomy.
export function dietGroup(a: Animal): DietGroup {
  if (a.species === "fly" || a.species === "ant" || a.species === "bug") return "detritivores";
  if (a.species === "mouse")
    return a.genes.dietAffinity < 0.3
      ? "herbivores"
      : a.genes.dietAffinity < 0.8
        ? "omnivores"
        : "carnivores";
  // Insect-eating birds also consume mushrooms; raptors only hunt animals.
  if (a.species === "bird")
    return a.birdDiet === "raptor" ? "carnivores" : "omnivores";
  // The current aquatic-food pool grows with sunlight and water.
  if (a.species === "fish" || a.species === "turtle") return "herbivores";
  return SPECIES[a.species].prey.length
    ? SPECIES[a.species].plants
      ? "omnivores"
      : "carnivores"
    : "herbivores";
}
export function populationCounts(
  animals: readonly Animal[],
  plants: number,
): PopulationCounts {
  const counts: PopulationCounts = {
    herbivores: 0,
    omnivores: 0,
    carnivores: 0,
    detritivores: 0,
    plants,
  };
  for (const a of animals) counts[dietGroup(a)]++;
  return counts;
}
export type PopulationSample = { time: number } & Partial<PopulationCounts>;
export function completePopulationSample(
  h: PopulationSample,
): h is { time: number } & PopulationCounts {
  return POPULATION_SERIES.every(
    ({ key }) =>
      typeof h[key] === "number" && Number.isFinite(h[key]) && h[key]! >= 0,
  );
}
export function drawPopulationChart(
  canvas: HTMLCanvasElement,
  history: readonly PopulationSample[],
  now: number,
  counts: PopulationCounts,
) {
  const c = canvas.getContext("2d");
  if (!c) return;
  const samples = history.filter(completePopulationSample);
  const points = [
    ...samples.filter((h) => h.time < now),
    { time: now, ...counts },
  ];
  const start = points[0].time,
    span = Math.max(1, now - start),
    left = 64,
    right = 548;
  c.clearRect(0, 0, 560, 280);
  c.font = "20px system-ui";
  const panel = (
    keys: readonly (keyof PopulationCounts)[],
    top: number,
    bottom: number,
    title: string,
  ) => {
    const max = Math.max(
      10,
      ...points.map((p) => Math.max(...keys.map((k) => p[k]))),
    );
    const ceiling = Math.ceil(max / 10) * 10;
    c.fillStyle = "#496354";
    c.textAlign = "left";
    c.fillText(title, left, top - 10);
    c.strokeStyle = "#dce4d6";
    c.lineWidth = 1;
    c.setLineDash([]);
    for (const [y, label] of [
      [top, String(ceiling)],
      [bottom, "0"],
    ] as const) {
      c.beginPath();
      c.moveTo(left, y);
      c.lineTo(right, y);
      c.stroke();
      c.textAlign = "right";
      c.fillText(label, left - 8, y + 5);
    }
    for (const series of POPULATION_SERIES) {
      if (!keys.includes(series.key)) continue;
      if (points.every((p) => p[series.key] === 0)) continue;
      c.strokeStyle = series.color;
      c.fillStyle = series.color;
      c.lineWidth = 2.5;
      c.setLineDash([...series.dash]);
      c.beginPath();
      points.forEach((p, j) => {
        const x =
            now === start
              ? right
              : left + ((p.time - start) / span) * (right - left),
          y = bottom - (p[series.key] / ceiling) * (bottom - top);
        if (j) c.lineTo(x, y);
        else c.moveTo(x, y);
      });
      c.stroke();
      const last = points.at(-1)!;
      c.beginPath();
      c.arc(
        now === start
          ? right
          : left + ((last.time - start) / span) * (right - left),
        bottom - (last[series.key] / ceiling) * (bottom - top),
        3,
        0,
        Math.PI * 2,
      );
      c.fill();
    }
  };
  panel(DIET_GROUPS, 30, 130, "Animals by diet");
  panel(["plants"], 177, 250, "Plants · separate scale");
  c.setLineDash([]);
  c.fillStyle = "#496354";
  c.textAlign = "left";
  c.fillText(
    now - start < 5
      ? "Collecting history…"
      : `${((now - start) / 60).toFixed(1)} simulation min ago`,
    left,
    275,
  );
  c.textAlign = "right";
  c.fillText("Now", right, 275);
  canvas.setAttribute(
    "aria-label",
    `Population history. ${POPULATION_SERIES.map((s) => `${counts[s.key]} ${s.label.toLowerCase()}`).join(", ")}. Animal and plant plots use separate scales.`,
  );
}
