import type { Animal } from "./model.ts";
import {
  findMateNeighborhoods,
  reproductiveAdults,
  type MateNeighborhoods,
  type MatePosition,
} from "./reproduction.ts";

// The fast-forward worker owns the island. Helpers only read a position snapshot.
export class MateSearchPool {
  #workers: Worker[] = [];
  #minimumPopulation = 256;
  #maxHelpers = Math.min(
    3,
    (globalThis.navigator?.hardwareConcurrency ?? 2) - 2,
  );
  #disabled = typeof Worker === "undefined" || this.#maxHelpers < 2;

  get helpers() {
    return this.#workers.length;
  }

  find(animals: Animal[]) {
    if (this.#disabled || animals.length < this.#minimumPopulation) return;
    const adults = reproductiveAdults(animals);
    if (adults.length < this.#minimumPopulation) return;
    return this.#search(
      adults.map(({ id, x, z, species, sex }) => ({ id, x, z, species, sex })),
    );
  }

  async #search(animals: MatePosition[]) {
    try {
      if (!this.#workers.length) {
        const start = performance.now();
        const local = findMateNeighborhoods(animals);
        const localTime = performance.now() - start;
        if (localTime >= 2) {
          for (let i = 0; i < this.#maxHelpers; i++) {
            this.#workers.push(
              new Worker(new URL("./mate-search-worker.ts", import.meta.url), {
                type: "module",
              }),
            );
          }
          // Exclude startup from the comparison, but include steady-state messaging.
          await this.#parallel(animals);
          const parallelStart = performance.now();
          await this.#parallel(animals);
          if (performance.now() - parallelStart < localTime * 0.8) return local;
          this.close();
        }
        this.#minimumPopulation = animals.length * 2;
        return local;
      }
      return await this.#parallel(animals);
    } catch {
      this.close();
      this.#disabled = true;
      return undefined;
    }
  }

  async #parallel(animals: MatePosition[]) {
    const batchSize = Math.ceil(animals.length / this.#workers.length);
    const parts = await Promise.all(
      this.#workers.map(
        (worker, index) =>
          new Promise<MateNeighborhoods>((resolve, reject) => {
            const timer = setTimeout(
              () => reject(new Error("Mate search timed out")),
              500,
            );
            worker.onmessage = (event: MessageEvent<MateNeighborhoods>) => {
              clearTimeout(timer);
              resolve(event.data);
            };
            worker.onerror = () => {
              clearTimeout(timer);
              reject(new Error("Mate search worker failed"));
            };
            worker.postMessage({
              animals,
              start: index * batchSize,
              end: Math.min(animals.length, (index + 1) * batchSize),
            });
          }),
      ),
    );
    const result: MateNeighborhoods = new Map();
    for (const part of parts)
      for (const [id, neighbors] of part) result.set(id, neighbors);
    return result;
  }

  close() {
    for (const worker of this.#workers) worker.terminate();
    this.#workers = [];
  }
}
