export interface TrailPoint { x: number; z: number }
export interface AntTrail { source: number; expires: number; points: TrailPoint[] }

// Record a successful return trip from the food back to the hill. Workers
// walk the samples in reverse, picking up the trail near their current spot.
export function markTrail(points: TrailPoint[], pos: TrailPoint) {
  const last = points.at(-1);
  if (!last || Math.hypot(last.x - pos.x, last.z - pos.z) >= 0.8) {
    if (points.length >= 64) points.splice(1, 1);
    points.push({ x: pos.x, z: pos.z });
  }
}

export function nextTrailPoint(trail: AntTrail, pos: TrailPoint) {
  let index = 0, nearest = Infinity;
  for (let i = 0; i < trail.points.length; i++) {
    const p = trail.points[i], distance = Math.hypot(pos.x - p.x, pos.z - p.z);
    if (distance < nearest) { nearest = distance; index = i; }
  }
  return trail.points[Math.max(0, index - 1)];
}
