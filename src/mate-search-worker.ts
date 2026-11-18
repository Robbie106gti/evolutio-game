import { findMateNeighborhoods, type MatePosition } from "./reproduction.ts";

self.onmessage = ({
  data,
}: MessageEvent<{ animals: MatePosition[]; start: number; end: number }>) => {
  self.postMessage(findMateNeighborhoods(data.animals, data.start, data.end));
};
