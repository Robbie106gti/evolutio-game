import { LEVELS, levelComplete, type LevelProgress } from "./levels.ts";
import { loadSlot, unlocked, type SlotStorage } from "./level-slots.ts";
const descriptions: Record<string, string> = {
  sandbox: "Your living island. All species and tools, with its own save.",
  "first-grove":
    "Begin with plants and mice. Inspect life, grow food, add water and watch a new generation.",
  "predator-valley":
    "Introduce cats and discover how food, prey and predators depend on one another.",
};
export function levelCards(storage: SlotStorage) {
  return Object.values(LEVELS)
    .map((level) => {
      let exists = false,
        complete = false,
        locked = false,
        error = false;
      try {
        const saved = loadSlot(storage, level.id);
        exists = !!saved;
        complete = !!saved?.level && levelComplete(level, saved.level);
        locked = !unlocked(storage, level.id);
      } catch {
        error = true;
      }
      return `<article class="level-card"><div class="eyebrow">${level.mode === "sandbox" ? "FREE PLAY" : complete ? "COMPLETED" : "GUIDED LESSON"}</div><h3>${level.name}</h3><p>${descriptions[level.id]}</p>${error && level.id === "sandbox" ? '<button data-recover-sandbox>Start a new sandbox</button><label>Open sandbox backup <input type="file" data-sandbox-backup accept=".json,application/json"></label><small>Your unreadable save will be archived first.</small>' : `<button data-open-level="${level.id}" ${locked || error ? "disabled" : ""}>${error ? "Save unavailable — preserved" : locked ? "Complete First Grove to unlock" : exists ? "Continue" : "Start"}</button>`}${level.id === "sandbox" ? "<small>Lessons never overwrite this island.</small>" : ""}</article>`;
    })
    .join("");
}
export function lessonContent(progress: LevelProgress) {
  const level = LEVELS[progress.id];
  if (level.mode === "sandbox") return "";
  const index = level.objectives.findIndex(
    (o) => !progress.completedObjectives.includes(o.id),
  );
  const hints: Record<string, string> = {
    "meet-plant":
      "Use Meet a plant below, or tap any plant on the island. Plants turn sunlight and water into food.",
    "meet-mouse":
      "Use Meet a mouse below. Energy fuels movement and reproduction; babies inherit traits.",
    "grow-food":
      "Open Shape & nurture, choose Plant, then tap dry land near mice. Drag to move the view.",
    "give-water":
      "Choose Water and tap the ground once. A little helps plants; too much can flood them.",
    "new-generation":
      "Choose Explore and watch. You can use 3× speed. Healthy mice reproduce when they have enough energy.",
    "introduce-bugs":
      "Open Wildlife, choose Bug, choose 12 and press Add animals. Keep plants available so bugs can reproduce.",
    "evolve-omnivores":
      "Support bugs and watch mice evolve. Three living mice must belong to an inherited omnivore branch and actually eat a bug. Diet must persist across three generations to establish a branch; mutations are not guaranteed.",
    survive:
      "Select a cat to follow its hunt. Plants support mice; mice support cats.",
    offspring:
      "Keep food available and watch families grow. All births count toward this goal.",
  };
  return index < 0
    ? `<h3>${level.name} complete</h3><p>${level.id === "first-grove" ? "Predator Valley is now unlocked. Your mice keep their own save." : "You have explored the basics of a food chain. Keep watching or return to your sandbox."}</p><button data-show-levels>Choose an island →</button>`
    : `<div class="eyebrow">${level.name} · STEP ${index + 1} OF ${level.objectives.length}</div><h3>${level.objectives[index].label}</h3><p>${hints[level.objectives[index].id] ?? "Watch your island grow."}</p>${index === 0 && level.id === "first-grove" ? '<button data-meet-lesson="plant">Meet a plant ↗</button>' : index === 1 && level.id === "first-grove" ? '<button data-meet-lesson="mouse">Meet a mouse ↗</button>' : ""}`;
}
