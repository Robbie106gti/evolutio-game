import { strToU8, strFromU8, zlibSync, unzlibSync } from "fflate";
const PREFIX = "evolutio.z1:";
export function packSave(json: string): string {
  const bytes = zlibSync(strToU8(json), { level: 1 });
  let binary = "";
  for (let i = 0; i < bytes.length; i += 16384)
    binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return PREFIX + btoa(binary);
}
export function unpackSave(raw: string): string {
  if (!raw.startsWith(PREFIX)) return raw; // Existing uncompressed slots remain readable.
  const binary = atob(raw.slice(PREFIX.length));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return strFromU8(unzlibSync(bytes));
}
