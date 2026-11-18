import { mouseAppearance } from "./mouse-appearance.ts";
import type { Animal, Genes } from "./model.ts";
import { Color } from "three";
// Stable labels derived from existing IDs: no save migration or simulation RNG.
const places = [
  "Willow",
  "Clover",
  "Hazel",
  "Birch",
  "Moss",
  "Fern",
  "Reed",
  "Maple",
  "Thistle",
  "Bramble",
  "Cedar",
  "Aspen",
  "Acorn",
  "Heather",
  "Ivy",
  "Juniper",
];
const homes = [
  "brook",
  "dale",
  "bank",
  "wood",
  "grove",
  "hill",
  "field",
  "vale",
  "ridge",
  "hollow",
  "meadow",
  "glade",
  "creek",
  "marsh",
  "glen",
  "bend",
];
const families = [
  "Wanderers",
  "Whiskers",
  "Foragers",
  "Scouts",
  "Paws",
  "Tails",
  "Burrowers",
  "Rovers",
  "Explorers",
  "Scurriers",
  "Seekers",
  "Noses",
  "Runners",
  "Nestlings",
  "Ramblers",
  "Dwellers",
];
export function lineageIdentity(id: number) {
  const hash = Math.imul(id ^ (id >>> 16), 0x45d9f3b) >>> 0;
  return {
    name:
      id === 0
        ? "Island Founders"
        : `${places[hash % 16]}${homes[(hash >>> 4) % 16]} ${families[(hash >>> 8) % 16]}`,
    color: new Color().setHSL((hash % 360) / 360, 0.65, 0.48).getStyle(),
  };
}
export function lineageBadge(id: number) {
  const identity = lineageIdentity(id);
  return `<span class="lineage-badge"><i style="background:${identity.color}" aria-hidden="true"></i>${identity.name}</span>`;
}
export function mousePortrait(g: Genes) {
  // Standard adult diagram: same inherited coat hue, marking count and proportions as the mesh.
  const look = mouseAppearance(g);
  const coat = look.coat;
  const dark = coat.clone().multiplyScalar(0.28).getStyle();
  const light = coat.clone().lerp(new Color("#fff4dc"), 0.45).getStyle();
  const sx = 0.55 + Math.min(1.45, Math.max(0.45, g.size)) * 0.45;
  const length = 24 * g.length;
  const ear = 11 * look.ear;
  return `<svg class="mouse-portrait" viewBox="0 0 200 100" role="img" aria-label="Adult mouse appearance: size ${g.size.toFixed(2)}, body length ${g.length.toFixed(2)}, ${Math.floor(g.markings * 5)} back markings"><g transform="translate(100 58) scale(${sx})"><path d="M ${-length} 5 Q ${-length - 22 * look.tail} -4 ${-length - 42 * look.tail} 17" fill="none" stroke="${light}" stroke-width="4" stroke-linecap="round"/><ellipse cx="0" cy="0" rx="${length}" ry="${17 * (0.92 + g.insulation * 0.22)}" fill="${coat.getStyle()}"/><ellipse cx="${length + 9}" cy="-5" rx="16" ry="12" fill="${coat.getStyle()}"/><circle cx="${length + 2}" cy="-18" r="${ear}" fill="${light}"/><circle cx="${length + 15}" cy="-9" r="2.5" fill="#202c26"/><circle cx="${length + 25}" cy="-4" r="2.5" fill="${dark}"/><path d="M -12 15 v 5 h 9 M ${length + 1} 9 v 11 h 8" fill="none" stroke="${dark}" stroke-width="4" stroke-linecap="round"/>${Array.from({ length: Math.floor(g.markings * 5) }, (_, i) => `<ellipse cx="${(i - 2) * 8 * g.length}" cy="-9" rx="${5 * look.patch}" ry="8" fill="${dark}"/>`).join("")}</g></svg>`;
}
export function lineageLooks(members: Animal[]) {
  if (!members.length)
    return "No living mice available to show this lineage’s appearance.";
  const mean = (key: keyof Genes) =>
    members.reduce((sum, a) => sum + Number(a.genes[key]), 0) / members.length;
  return `${mean("size") < 0.75 ? "Small" : mean("size") > 1.25 ? "Large" : "Medium-sized"} bodies · ${mean("length") > 1.1 ? "longer" : mean("length") < 0.9 ? "shorter" : "balanced"} proportions · ${mean("insulation") > 0.65 ? "thicker" : "lighter"} coats · ${mean("earSize") > 1.1 ? "large" : mean("earSize") < 0.85 ? "small" : "medium"} ears · ${mean("tailLength") > 1.15 ? "long" : mean("tailLength") < 0.85 ? "short" : "medium"} tails · ${mean("markings") < 0.2 ? "mostly unmarked" : mean("markings") > 0.6 ? "strong back markings" : "some back markings"}`;
}
