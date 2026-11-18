import { type Genes, type Species } from "./model.ts";
import { DAY_LENGTH } from "./ecology.ts";
export type RhythmGenes = Pick<
  Genes,
  "activityPhase" | "twilightBias" | "activeFraction"
>;
// Broad gameplay starting tendencies; each founder and lineage can diverge.
export function rhythmDefaults(species: Species): RhythmGenes {
  const [activityPhase, twilightBias, activeFraction] = {
    mouse: [0.75, 0.15, 0.55],
    cat: [0.75, 0.85, 0.55],
    fox: [0.75, 0.45, 0.55],
    wolf: [0.75, 0.65, 0.6],
    bug: [0.25, 0.2, 0.65],
    bird: [0.25, 0.1, 0.55],
    snake: [0.25, 0.1, 0.5],
    fish: [0.25, 0.35, 0.65],
    turtle: [0.25, 0.1, 0.5],
    crocodile: [0.75, 0.3, 0.55],
    frog: [0.75, 0.25, 0.55],
  }[species];
  return { activityPhase, twilightBias, activeFraction };
}
export const wrapPhase = (phase: number) => ((phase % 1) + 1) % 1;
export const phaseDelta = (a: number, b: number) => {
  const d = a - b;
  return d > 0.5 ? d - 1 : d < -0.5 ? d + 1 : d;
};
export function dailyRhythm(g: RhythmGenes, time: number) {
  const phase = wrapPhase(time / DAY_LENGTH + 0.2);
  const score =
    (1 - g.twilightBias) * Math.cos((phase - g.activityPhase) * Math.PI * 2) +
    g.twilightBias * Math.cos(phase * Math.PI * 4);
  return {
    phase,
    score,
    active: score >= Math.cos(Math.PI * g.activeFraction),
  };
}
export function rhythmLabel(g: RhythmGenes) {
  return g.twilightBias > 0.6
    ? "Dawn & dusk"
    : Math.abs(phaseDelta(g.activityPhase, 0.25)) <= 0.25
      ? "Mostly daytime"
      : "Mostly nighttime";
}
