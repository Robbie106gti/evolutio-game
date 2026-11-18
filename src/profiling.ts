// Opt-in local diagnostics: open ?profile=1. Nothing is sent over the network.
export let profiling =
  typeof location !== "undefined" &&
  new URLSearchParams(location.search).has("profile");
const timings = new Map<
  string,
  { total: number; count: number; max: number }
>();
let started = performance.now();
export function enableProfiling() {
  profiling = true;
  timings.clear();
  started = performance.now();
}
export function measured(name: string, start: number) {
  if (!profiling) return;
  const elapsed = performance.now() - start;
  const t = timings.get(name) ?? { total: 0, count: 0, max: 0 };
  t.total += elapsed;
  t.count++;
  t.max = Math.max(t.max, elapsed);
  timings.set(name, t);
}
export function timingReport() {
  const seconds = (performance.now() - started) / 1000;
  return Object.fromEntries(
    [...timings].map(([name, t]) => [
      name,
      {
        calls: t.count,
        meanMs: +(t.total / t.count).toFixed(2),
        maxMs: +t.max.toFixed(2),
        msPerSecond: +(t.total / seconds).toFixed(1),
      },
    ]),
  );
}
