import { readFileSync, writeFileSync } from "node:fs";
import { Session as Inspector } from "node:inspector/promises";
const candidate = process.argv.includes("--candidate");
const source = candidate ? "../reports/current-jump-candidate/src/" : "../src/";
const { decodeSave, encodeSave } = await import(source + "save.ts");
const { GenerationAdvance } = await import(source + "generation-advance.ts");
const { enableProfiling, timingReport } = await import(source + "profiling.ts");
const approximate = process.argv.includes("--approximate");
const prefix = approximate
  ? "reports/current-jump-approximate"
  : candidate
    ? "reports/current-jump-candidate"
    : "reports/current-jump";
const session = decodeSave(
  readFileSync("reports/current-jump-start.json", "utf8"),
);
const w = session.world,
  advance = new GenerationAdvance(w, 10, approximate),
  startTime = w.time;
const profiler = new Inspector();
profiler.connect();
await profiler.post("Profiler.enable");
await profiler.post("Profiler.setSamplingInterval", { interval: 2000 });
await profiler.post("Profiler.start");
enableProfiling();
const started = performance.now();
let steps = 0,
  last = started;
while (!advance.done) {
  steps += advance.run(w, 40);
  if (performance.now() - last > 10000) {
    console.log(
      JSON.stringify({
        generation: advance.peak,
        target: advance.target,
        animals: w.animals.length,
        plants: w.plants.length,
        seconds: (performance.now() - started) / 1000,
      }),
    );
    writeFileSync(
      prefix + "-progress.json",
      JSON.stringify({
        generation: advance.peak,
        target: advance.target,
        steps,
        seconds: (performance.now() - started) / 1000,
      }),
    );
    last = performance.now();
  }
  await new Promise((r) => setImmediate(r));
}
const elapsed = (performance.now() - started) / 1000;
const { profile } = await profiler.post("Profiler.stop");
profiler.disconnect();
writeFileSync(prefix + ".cpuprofile", JSON.stringify(profile));
writeFileSync(prefix + "-end.json", encodeSave(session));
const result = {
  start: advance.start,
  target: advance.target,
  peak: advance.peak,
  status: advance.status,
  steps,
  elapsed,
  simSeconds: w.time - startTime,
  speed: (w.time - startTime) / elapsed,
  animals: w.animals.length,
  plants: w.plants.length,
  phases: timingReport(),
};
writeFileSync(prefix + "-profile.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
