import type { Point } from "../core/index.js";

export const ROUTE_PATH_COSTS = {
  bend: 320,
  excessLengthMultiplier: 3,
  crossing: 300_000,
  junction: 20_000,
  astarTurn: 140,
  astarOverlapPerUnit: 4_000,
  nearParallelPerUnit: 160,
  portSideFallback: 900,
  portOffsetFallback: 120,
  portBacktrack: 4_000,
  labelSideFallback: 6_000,
} as const;

/** Conflict-free base term used by the main orthogonal path scorer. */
export function routePathBaseCost(points: Point[]): {
  bends: number;
  length: number;
  excessLength: number;
  score: number;
} {
  if (points.length < 2) return { bends: 0, length: 0, excessLength: 0, score: Infinity };
  const length = points.slice(1).reduce((total, point, index) => {
    const previous = points[index]!;
    return total + Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y);
  }, 0);
  const first = points[0]!;
  const last = points.at(-1)!;
  const manhattan = Math.abs(first.x - last.x) + Math.abs(first.y - last.y);
  const bends = Math.max(0, points.length - 2);
  const excessLength = Math.max(0, length - manhattan);
  return {
    bends,
    length,
    excessLength,
    score: bends * ROUTE_PATH_COSTS.bend + length + excessLength * ROUTE_PATH_COSTS.excessLengthMultiplier,
  };
}
