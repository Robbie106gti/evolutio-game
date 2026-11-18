import { supportsApproximation } from "./approximate.ts";
import { establishedOmnivores } from "./animal-introduction.ts";
import { GenerationAdvance } from "./generation-advance.ts";
import { decodeSave, encodeSave, type Session } from "./save.ts";
import { updateLevelProgress } from "./levels.ts";
let session: Session | undefined;
let advance: GenerationAdvance | undefined;
let paused = false;
let speedStartedAt = 0,
  speedStartedTime = 0,
  simulationSpeed = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let lastProgress = 0,
  lastCheckpoint = 0;
function snapshot() {
  if (!session || !advance) return "";
  if (session.level)
    updateLevelProgress(session.world.level, session.level, {
      time: session.world.time,
      births: session.world.births,
      bugs: session.world.animals.filter((a) => a.species === "bug").length,
      omnivoreMice: establishedOmnivores(session.world),
      plants: session.world.plants.length,
      generation: advance.peak,
    });
  session.paused = true;
  return encodeSave(session);
}
function report(done = false, checkpoint = false) {
  if (!advance || !session) return;
  self.postMessage({
    type: done ? "done" : checkpoint ? "checkpoint" : "progress",
    peak: advance.peak,
    status: advance.status,
    time: session.world.time,
    animals: session.world.animals.length,
    plants: session.world.plants.length,
    births: session.world.births,
    speed: simulationSpeed,
    ...(done || checkpoint ? { save: snapshot() } : {}),
  });
}
function batch() {
  try {
    if (!session || !advance || advance.done || paused) return;
    // Prioritize throughput. Yield between short batches so incoming pause/stop
    // messages can run; individual world steps remain deterministic and intact.
    advance.run(session.world, 40);
    const now = performance.now();
    if (now - speedStartedAt >= 1000) {
      simulationSpeed =
        (session.world.time - speedStartedTime) /
        ((now - speedStartedAt) / 1000);
      speedStartedAt = now;
      speedStartedTime = session.world.time;
    }
    if (advance.done) {
      report(true);
      return;
    }
    if (now - lastCheckpoint >= 30000) {
      report(false, true);
      lastCheckpoint = now;
    } else if (now - lastProgress >= 250) {
      report();
      lastProgress = now;
    }
    timer = setTimeout(batch, 0);
  } catch (error) {
    self.postMessage({
      type: "error",
      message:
        error instanceof Error ? error.message : "Worker simulation failed",
    });
  }
}
self.onmessage = (event: MessageEvent) => {
  try {
    const message = event.data;
    if (message.type === "start") {
      session = decodeSave(message.save);
      if (message.approximate && !supportsApproximation(session.world))
        throw new Error(
          "Approximate mode currently supports mice and bugs only.",
        );
      advance = new GenerationAdvance(
        session.world,
        message.count,
        message.approximate === true,
      );
      paused = message.paused;
      lastCheckpoint = speedStartedAt = performance.now();
      speedStartedTime = session.world.time;
      simulationSpeed = 0;
      report();
      batch();
    } else if (message.type === "stop" && advance) {
      clearTimeout(timer);
      advance.cancel();
      report(true);
    } else if (message.type === "pause") {
      paused = message.paused;
      clearTimeout(timer);
      if (!paused) {
        speedStartedAt = performance.now();
        speedStartedTime = session?.world.time ?? 0;
        batch();
      } else if (session) report(false, true);
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      message:
        error instanceof Error
          ? error.message
          : "Could not load worker simulation",
    });
  }
};
