import type { World } from "./sim.ts";
type AdvanceWorld = Pick<World, "animals" | "eggs" | "time">;
export function peakGeneration(world: Pick<World, "animals">) {
  return world.animals.reduce((peak, a) => Math.max(peak, a.generation), 1);
}
export class GenerationAdvance {
  readonly start: number;
  readonly target: number;
  peak: number;
  lastProgressAt: number;
  status = "Running";
  done = false;
  readonly approximate: boolean;
  constructor(
    world: Pick<World, "animals" | "time"> &
      Partial<Pick<World, "highestGeneration">>,
    count: number,
    approximate = false,
  ) {
    this.approximate = approximate;
    if (![10, 100, 1000].includes(count))
      throw new Error("Unsupported generation jump");
    this.start = this.peak = Math.max(
      world.highestGeneration ?? 1,
      peakGeneration(world),
    );
    this.target = this.start + count;
    this.lastProgressAt = world.time;
  }
  run(
    world: AdvanceWorld & { step(dt: number, approximate?: boolean): void },
    budgetMs = 12,
    clock = () => performance.now(),
  ) {
    if (this.done) return 0;
    const start = clock();
    let steps = 0;
    while (steps < 100 && clock() - start < budgetMs) {
      if (!this.#canStep(world)) break;
      world.step(this.approximate ? 1 : 0.1, this.approximate);
      steps++;
      this.#recordStep(world);
      if (this.done) break;
    }
    return steps;
  }
  async runParallel(
    world: World,
    findMates: NonNullable<Parameters<World["step"]>[2]>,
    paused: () => boolean,
    budgetMs = 40,
  ) {
    const start = performance.now();
    for (
      let steps = 0;
      steps < 100 &&
      performance.now() - start < budgetMs &&
      !paused() &&
      this.#canStep(world);
      steps++
    ) {
      const pending = world.step(
        this.approximate ? 1 : 0.1,
        this.approximate,
        findMates,
      );
      if (pending) await pending;
      this.#recordStep(world);
    }
  }
  #canStep(world: AdvanceWorld) {
    if (this.done) return false;
    if (world.animals.length || world.eggs.length) return true;
    this.status = "Stopped: no animals or eggs remain";
    this.done = true;
    return false;
  }
  #recordStep(world: AdvanceWorld) {
    const peak = peakGeneration(world);
    if (peak > this.peak) {
      this.peak = peak;
      this.lastProgressAt = world.time;
    }
    if (this.done) return;
    if (this.peak >= this.target) {
      this.status = "Generation target reached";
      this.done = true;
    } else if (world.time - this.lastProgressAt >= 1800) {
      this.status = "Stopped: no new highest generation for 10 island days";
      this.done = true;
    }
  }
  cancel() {
    this.done = true;
    this.status = "Stopped by you";
  }
}
