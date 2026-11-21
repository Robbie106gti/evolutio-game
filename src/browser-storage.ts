import { slotKey, type SlotStorage } from "./level-slots.ts";
import { LEVELS } from "./levels.ts";
import { encodeSave, decodeSave, type Session } from "./save.ts";
import { packSave, unpackSave } from "./save-codec.ts";
const cache = new Map<string, string>();
let db: IDBDatabase;
export const islandStorage: SlotStorage = {
  getItem: (key) => cache.get(key) ?? null,
  setItem: () => {
    throw new Error("Use durable saving for browser slots");
  },
};
export async function initializeStorage() {
  db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("evolutio-islands", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("slots");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Close older island tabs and try again."));
  });
  for (const key of Object.values(LEVELS).flatMap((level) => [
    slotKey(level.id),
    jumpBackupKey(level.id),
  ])) {
    const raw = await readStoredValue(key);
    if (raw != null) cache.set(key, raw);
  }
  db.onversionchange = () => db.close();
}
async function readStoredValue(key: string) {
  const value = await new Promise<string | undefined>((resolve, reject) => {
    const request = db.transaction("slots").objectStore("slots").get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return value ?? localStorage.getItem(key);
}

export function readBrowserSlot(id: string) {
  return readStoredValue(slotKey(id));
}

export async function saveBrowserSlot(
  session: Session,
  expected: string | null,
) {
  const key = slotKey(session.world.level.id),
    raw = packSave(encodeSave(session));
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("slots", "readwrite"),
      store = tx.objectStore("slots");
    let conflict = false;
    const request = store.get(key);
    request.onsuccess = () => {
      const current = request.result ?? localStorage.getItem(key);
      if (current !== expected) {
        conflict = true;
        tx.abort();
        return;
      }
      store.put(raw, key);
    };
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () =>
      reject(
        new Error(
          conflict
            ? "Another tab saved this island. Its newer save is preserved; reload before saving again."
            : "Could not save the island. Browser storage is unavailable or full. Export a backup before closing.",
        ),
      );
  });
  cache.set(key, raw);
  return raw;
}

export function jumpBackupKey(id: string) {
  return slotKey(id) + ".pre-jump";
}
export function hasJumpBackup(id: string) {
  return cache.has(jumpBackupKey(id));
}
// Both recovery and the current island are kept. Restoring swaps them atomically.
async function writeRecovery(
  id: string,
  expected: string | null,
  backup: string,
  restore?: string,
) {
  const key = slotKey(id),
    recovery = jumpBackupKey(id),
    oldRecovery = cache.get(recovery);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("slots", "readwrite"),
      store = tx.objectStore("slots");
    let conflict = false;
    const request = store.get(key);
    request.onsuccess = () => {
      if ((request.result ?? localStorage.getItem(key)) !== expected) {
        conflict = true;
        tx.abort();
        return;
      }
      const check = store.get(recovery);
      check.onsuccess = () => {
        if (restore !== undefined && check.result !== oldRecovery) {
          conflict = true;
          tx.abort();
          return;
        }
        store.put(backup, recovery);
        if (restore !== undefined) store.put(restore, key);
      };
    };
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () =>
      reject(
        new Error(
          conflict
            ? "Another tab changed this island. Reload before continuing."
            : "Could not preserve the recovery save. Export a backup before continuing.",
        ),
      );
  });
  cache.set(recovery, backup);
  if (restore !== undefined) cache.set(key, restore);
}
export async function saveJumpBackup(
  session: Session,
  expected: string | null,
) {
  await writeRecovery(
    session.world.level.id,
    expected,
    packSave(encodeSave(session)),
  );
}
export async function restoreJumpBackup(
  current: Session,
  expected: string | null,
) {
  const id = current.world.level.id,
    raw = cache.get(jumpBackupKey(id));
  if (!raw) throw new Error("No recovery save for this island.");
  const session = decodeSave(unpackSave(raw));
  if (session.world.level.id !== id)
    throw new Error("Recovery belongs to another island.");
  await writeRecovery(id, expected, packSave(encodeSave(current)), raw);
  return { session, raw };
}

const archivePrefix = (id: string) => slotKey(id) + ".archive.";
export async function archivedIslands(id: string): Promise<string[]> {
  const prefix = archivePrefix(id);
  const request = db.transaction("slots").objectStore("slots").getAllKeys(IDBKeyRange.bound(prefix, prefix + "\uffff"));
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result.filter((key): key is string => typeof key === "string").reverse());
    request.onerror = () => reject(request.error);
  });
}

// Rotate the playing slot and its jump checkpoint together. An abort leaves
// the original island and the complete archive intact, including on quota errors.
export async function rotateIsland(current: Session, expected: string | null, destination: Session | string) {
  return rotateSlot(current.world.level.id, expected, packSave(encodeSave(current)), destination);
}

// An unreadable slot must be archived verbatim. Encoding the temporary world
// displayed after a failed load would archive the wrong island.
export function recoverUnreadableIsland(expected: string, next: Session) {
  return rotateSlot(next.world.level.id, expected, expected, next);
}

async function rotateSlot(id: string, expected: string | null, previous: string, destination: Session | string) {
  const key = slotKey(id), recovery = jumpBackupKey(id);
  const archive = archivePrefix(id) + new Date().toISOString() + "." + crypto.randomUUID();
  let next: Session, raw: string;
  let checkpoint: string | undefined;
  if (typeof destination === "string") {
    if (!destination.startsWith(archivePrefix(id))) throw new Error("Wrong island archive.");
    const packed = await readStoredValue(destination);
    if (!packed) throw new Error("Archive unavailable.");
    const entry = JSON.parse(packed);
    raw = entry.raw;
    checkpoint = entry.checkpoint;
    next = decodeSave(unpackSave(raw));
  } else {
    next = destination;
    raw = packSave(encodeSave(next));
  }
  if (next.world.level.id !== id) throw new Error("Archive belongs to a different level.");
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("slots", "readwrite"), store = tx.objectStore("slots");
    const active = store.get(key), jump = store.get(recovery);
    jump.onsuccess = () => {
      if ((active.result ?? localStorage.getItem(key)) !== expected) { tx.abort(); return; }
      store.add(JSON.stringify({raw: previous, checkpoint: jump.result}), archive);
      store.put(raw, key);
      if (checkpoint) store.put(checkpoint, recovery);
      else store.delete(recovery);
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(new Error("Could not archive and switch. Check browser storage or another open tab."));
  });
  cache.set(key, raw);
  if (checkpoint) cache.set(recovery, checkpoint);
  else cache.delete(recovery);
  return {next, raw};
}
