import { Worker } from "node:worker_threads";
import assert from "node:assert/strict";
import { World } from "../src/sim.ts";
import { FIRST_GROVE } from "../src/levels.ts";
import { encodeSave, decodeSave } from "../src/save.ts";
const approximate = process.argv.includes("--approximate");
const world = new World(undefined, FIRST_GROVE);
const initial = encodeSave({ world, rate: 1, paused: true, selected: 0 });
const entry = new URL("../src/generation-worker.ts", import.meta.url).href;
const worker = new Worker(
  `const {parentPort}=require('node:worker_threads');
globalThis.self={postMessage:m=>parentPort.postMessage(m)};
import(${JSON.stringify(entry)}).then(()=>parentPort.on('message',data=>self.onmessage({data})));`,
  { eval: true },
);
const messages = [];
let resolveMessage;
worker.on("message", (m) => {
  messages.push(m);
  resolveMessage?.();
});
worker.on("error", (e) => {
  throw e;
});
async function next(type) {
  const deadline = Date.now() + 15000;
  while (true) {
    const i = messages.findIndex((m) => m.type === type || m.type === "error");
    if (i >= 0) {
      const m = messages.splice(i, 1)[0];
      assert.notEqual(m.type, "error", m.message);
      return m;
    }
    if (Date.now() > deadline) throw new Error("Worker response timed out");
    await Promise.race([
      new Promise((r) => {
        resolveMessage = r;
      }),
      new Promise((r) => setTimeout(r, 100)),
    ]);
  }
}
try {
  worker.postMessage({
    type: "start",
    save: initial,
    count: 1000,
    approximate,
    paused: false,
  });
  await next("progress");
  worker.postMessage({ type: "pause", paused: true });
  const checkpoint = await next("checkpoint");
  const restored = decodeSave(checkpoint.save).world;
  assert.ok(restored.time > 0);
  const expected = decodeSave(initial).world;
  const dt = approximate ? 1 : 0.1;
  for (let i = 0; i < Math.round(restored.time / dt); i++)
    expected.step(dt, approximate);
  assert.equal(
    JSON.stringify(restored),
    JSON.stringify(expected),
    "Worker matches foreground simulation",
  );
  worker.postMessage({ type: "stop" });
  const done = await next("done");
  assert.equal(done.status, "Stopped by you");
  assert.equal(
    done.time,
    checkpoint.time,
    "Pause prevents extra simulation before stopping",
  );
  assert.equal(decodeSave(done.save).paused, true);
  console.log(
    "Actual worker start, deterministic stepping, pause checkpoint, stop and save restoration passed",
  );
} finally {
  await worker.terminate();
}
