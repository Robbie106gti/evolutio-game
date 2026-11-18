import type { Genes, BrainActivity } from "./model.ts";
export function evaluateBrain(g: Genes, inputs: number[]): BrainActivity {
  const hidden = new Array<number>(g.neurons);
  for (let j = 0; j < g.neurons; j++) {
    let sum = 0;
    const offset = j * 8;
    for (let k = 0; k < inputs.length; k++)
      sum += inputs[k] * g.weights[offset + k];
    hidden[j] = Math.tanh(sum);
  }
  const outputs = [0, 0];
  for (let k = 0; k < 2; k++) {
    let sum = 0;
    for (let j = 0; j < hidden.length; j++)
      sum += hidden[j] * g.weights[j * 8 + k + 6];
    outputs[k] = Math.tanh(sum);
  }
  return { inputs: [...inputs], hidden, outputs };
}
