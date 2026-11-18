import type { World } from "./sim.ts";
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
    world: Pick<World, "animals" | "eggs" | "time" | "step">,
    budgetMs = 12,
    clock = () => performance.now(),
  ) {
    if (this.done) return 0;
    const start = clock();
    let steps = 0;
    while (steps < 100 && clock() - start < budgetMs) {
      if (!world.animals.length && !world.eggs.length) {
        this.status = "Stopped: no animals or eggs remain";
        this.done = true;
        break;
      }
      world.step(this.approximate ? 1 : 0.1, this.approximate);
      steps++;
      const peak = peakGeneration(world);
      if (peak > this.peak) {
        this.peak = peak;
        this.lastProgressAt = world.time;
      }
      if (this.peak >= this.target) {
        this.status = "Generation target reached";
        this.done = true;
        break;
      }
      if (world.time - this.lastProgressAt >= 1800) {
        this.status = "Stopped: no new highest generation for 10 island days";
        this.done = true;
        break;
      }
    }
    return steps;
  }
  cancel() {
    this.done = true;
    this.status = "Stopped by you";
  }
}
