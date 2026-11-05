import type { Point } from "../core/types.js";

const MAX_INPUT_POINTS = 64;
const HARD_MAX_CANDIDATES = 512;
const DEFAULT_MAX_CANDIDATES = 128;

export interface RouteSimplificationOptions {
  maxCandidates?: number;
  minimumSegmentLength?: number;
}

/**
 * Produce bounded, geometry-only alternatives to an orthogonal route.
 * Candidates keep both attachment endpoints and their original facing
 * directions; callers remain responsible for scoring them against the scene.
 */
export function routeSimplificationCandidates(
  points: readonly Point[],
  options: RouteSimplificationOptions = {},
): Point[][] {
  if (points.length < 2 || points.length > MAX_INPUT_POINTS) return [];
  const source = simplify(points);
  if (source.length < 2 || !isOrthogonal(source)) return [];

  const requestedLimit = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(0, Math.min(HARD_MAX_CANDIDATES, Math.floor(requestedLimit)))
    : DEFAULT_MAX_CANDIDATES;
  if (limit === 0) return [];

  const minimum = Number.isFinite(options.minimumSegmentLength) ? Math.max(0, options.minimumSegmentLength!) : 1;
  const startDirection = direction(source[0]!, source[1]!);
  const endDirection = direction(source[source.length - 2]!, source[source.length - 1]!);
  const candidates = new Map<string, { points: Point[]; bends: number; length: number; order: number }>();
  let order = 0;

  const add = (raw: readonly Point[]) => {
    const candidate = simplify(raw);
    if (
      candidate.length < 2 ||
      candidate.length > MAX_INPUT_POINTS ||
      !isOrthogonal(candidate) ||
      !sameDirection(startDirection, direction(candidate[0]!, candidate[1]!)) ||
      !sameDirection(endDirection, direction(candidate[candidate.length - 2]!, candidate[candidate.length - 1]!)) ||
      candidate.slice(1).some((point, index) => manhattan(candidate[index]!, point) < minimum)
    ) {
      order += 1;
      return;
    }
    const key = candidate.map((point) => `${point.x},${point.y}`).join(";");
    if (!candidates.has(key)) {
      candidates.set(key, { points: candidate, bends: candidate.length - 2, length: pathLength(candidate), order });
    }
    order += 1;
  };

  add(source);
  const xLanes = laneCoordinates(
    source.map((point) => point.x),
    minimum,
  );
  const yLanes = laneCoordinates(
    source.map((point) => point.y),
    minimum,
  );

  // Every replacement spans at least one removed vertex. The point count is
  // capped above, so this pair scan and each lane scan have a fixed upper bound.
  for (let from = 0; from < source.length - 2; from += 1) {
    for (let to = from + 2; to < source.length; to += 1) {
      const a = source[from]!;
      const b = source[to]!;
      const prefix = source.slice(0, from);
      const suffix = source.slice(to + 1);
      if (a.x === b.x || a.y === b.y) add([...prefix, a, b, ...suffix]);
      else {
        add([...prefix, a, { x: b.x, y: a.y }, b, ...suffix]);
        add([...prefix, a, { x: a.x, y: b.y }, b, ...suffix]);
      }

      // Two-elbow H-V-H and V-H-V splices preserve terminal direction when a
      // simple L would change it, and offer the lead a few nearby lane choices.
      for (const x of xLanes) {
        if (x !== a.x && x !== b.x) add([...prefix, a, { x, y: a.y }, { x, y: b.y }, b, ...suffix]);
      }
      for (const y of yLanes) {
        if (y !== a.y && y !== b.y) add([...prefix, a, { x: a.x, y }, { x: b.x, y }, b, ...suffix]);
      }
    }
  }

  return [...candidates.values()]
    .sort((left, right) => left.bends - right.bends || left.length - right.length || left.order - right.order)
    .slice(0, limit)
    .map(({ points: candidate }) => candidate.map((point) => ({ ...point })));
}

function laneCoordinates(values: readonly number[], minimum: number): number[] {
  const unique = [...new Set(values)].sort((a, b) => a - b);
  const result: number[] = [];
  const add = (value: number) => {
    if (Number.isFinite(value) && !result.includes(value) && result.length < 8) result.push(value);
  };
  for (const value of unique) add(value);
  const step = Math.max(minimum, 8);
  for (let index = 0; index < unique.length && result.length < 8; index += 1) {
    const left = unique[index]!;
    const right = unique[index + 1];
    if (right !== undefined) add((left + right) / 2);
  }
  if (unique.length) {
    add(unique[0]! - step);
    add(unique[unique.length - 1]! + step);
  }
  return result;
}

function simplify(points: readonly Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return [];
    const copy = { x: point.x, y: point.y };
    const previous = result[result.length - 1];
    if (previous && samePoint(previous, copy)) continue;
    result.push(copy);
    while (result.length >= 3) {
      const a = result[result.length - 3]!;
      const b = result[result.length - 2]!;
      const c = result[result.length - 1]!;
      if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) result.splice(result.length - 2, 1);
      else break;
    }
  }
  return result;
}

function isOrthogonal(points: readonly Point[]): boolean {
  return points.slice(1).every((point, index) => {
    const previous = points[index]!;
    return previous.x === point.x || previous.y === point.y;
  });
}

function direction(a: Point, b: Point): readonly [number, number] {
  return [Math.sign(b.x - a.x), Math.sign(b.y - a.y)];
}

function sameDirection(a: readonly [number, number], b: readonly [number, number]): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

function manhattan(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function pathLength(points: readonly Point[]): number {
  return points.slice(1).reduce((sum, point, index) => sum + manhattan(points[index]!, point), 0);
}
