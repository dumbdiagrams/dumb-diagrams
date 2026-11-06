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
  // A quarter-face shift should cost slightly more than one bend. Clear,
  // centred attachments remain the default; conflicts can still justify lanes.
  portOffsetFallback: 360,
  portBacktrack: 4_000,
  labelSideFallback: 6_000,
} as const;

/** Return the distance from a point to the nearest nonzero polyline segment. */
export function distanceToPolyline(point: Point, points: Point[]): number {
  let bestDistance = Infinity;
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index]!;
    const b = points[index + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) continue;

    const u = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (length * length)));
    const projectedX = a.x + dx * u;
    const projectedY = a.y + dy * u;
    const distance = Math.hypot(point.x - projectedX, point.y - projectedY);
    if (distance < bestDistance) bestDistance = distance;
  }
  return bestDistance;
}

/** Create a distance evaluator over a snapshot of a polyline's coordinates. */
export function createPolylineDistance(points: Point[]): (point: Point) => number {
  // Store only the scalar segment data needed by each query. In particular,
  // this keeps route geometry stable if the caller later mutates its points.
  const segments: Array<{ ax: number; ay: number; dx: number; dy: number; denominator: number }> = [];
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index]!;
    const b = points[index + 1]!;
    const ax = a.x;
    const ay = a.y;
    const dx = b.x - ax;
    const dy = b.y - ay;
    const length = Math.hypot(dx, dy);
    if (length === 0) continue;
    segments.push({ ax, ay, dx, dy, denominator: length * length });
  }

  return (point: Point): number => {
    let bestDistance = Infinity;
    for (const segment of segments) {
      const u = Math.max(
        0,
        Math.min(1, ((point.x - segment.ax) * segment.dx + (point.y - segment.ay) * segment.dy) / segment.denominator),
      );
      const projectedX = segment.ax + segment.dx * u;
      const projectedY = segment.ay + segment.dy * u;
      const distance = Math.hypot(point.x - projectedX, point.y - projectedY);
      if (distance < bestDistance) bestDistance = distance;
    }
    return bestDistance;
  };
}

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
