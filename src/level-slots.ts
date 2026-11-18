import { packSave, unpackSave } from "./save-codec.ts";
import { SAVE_KEY, encodeSave, decodeSave, type Session } from "./save.ts";
import { LEVELS, levelComplete } from "./levels.ts";
export interface SlotStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
// A failed restore leaves only a temporary world in memory. Never save that
// world over the unreadable slot, but allow other independent slots to open.
export function preserveBeforeSwitch(
  restoreFailed: boolean,
  saveCurrent: () => boolean,
) {
  if (!restoreFailed && !saveCurrent())
    throw new Error(
      "Your current island could not be saved. Switching was cancelled to protect it.",
    );
}
// Keep the original key as the sandbox slot. Never rename/delete the user's island.
export function slotKey(id: string) {
  if (!Object.hasOwn(LEVELS, id)) throw new Error("Unknown level");
  return id === "sandbox" ? SAVE_KEY : `evolutio.level.${id}.v1`;
}
export function loadSlot(storage: SlotStorage, id: string): Session | null {
  const raw = storage.getItem(slotKey(id));
  if (raw === null) return null;
  const session = decodeSave(unpackSave(raw));
  if (session.world.level.id !== id)
    throw new Error("Saved island belongs to a different level");
  return session;
}
export function saveSlot(
  storage: SlotStorage,
  session: Session,
  expected?: string | null,
) {
  const key = slotKey(session.world.level.id);
  if (expected !== undefined && storage.getItem(key) !== expected)
    throw new Error(
      "This island was saved in another tab. Reload before continuing; its newer save is preserved.",
    );
  const raw = packSave(encodeSave(session));
  storage.setItem(key, raw);
  return raw;
}
export function unlocked(storage: SlotStorage, id: string) {
  if (id !== "predator-valley") return Object.hasOwn(LEVELS, id);
  // An existing valley can be continued even when restored without First Grove.
  if (storage.getItem(slotKey(id)) !== null) return true;
  const first = loadSlot(storage, "first-grove");
  return !!first?.level && levelComplete(LEVELS["first-grove"], first.level);
}
