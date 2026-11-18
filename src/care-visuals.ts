import { type Animal } from "./model.ts";
// Visual food is a portion of the existing energy reserve, not a second inventory.
export function careVisuals(animals: Animal[]) {
  const need = new Map<number, number>();
  for (const a of animals)
    if (a.nursery && a.energy > 0)
      need.set(
        a.parent,
        (need.get(a.parent) ?? 0) + Math.max(0, 65 - a.energy),
      );
  const byId = new Map(animals.map((a) => [a.id, a]));
  return new Map(
    animals.map((a) => {
      const recipient = byId.get(a.feedingTarget);
      const feeding =
        a.state === "Feeding young" &&
        recipient?.parent === a.id &&
        !!recipient.nursery;
      const carrying =
        a.state === "Returning to young" || feeding
          ? Math.min(12, Math.max(0, a.energy - 48), need.get(a.id) ?? 0)
          : 0;
      const chewing = !!a.nursery && a.fedUntilAge > a.age;
      const begging =
        !!a.nursery && a.energy < 50 && !chewing && a.state !== "Sleeping";
      return [
        a.id,
        {
          feeding,
          carrying,
          chewing,
          begging,
          recipient: feeding ? recipient : undefined,
        },
      ];
    }),
  );
}
export function babyOffset(a: Animal) {
  const angle = a.id * 2.399;
  return a.nursery
    ? { x: Math.cos(angle) * 0.22, z: Math.sin(angle) * 0.22 }
    : { x: 0, z: 0 };
}
