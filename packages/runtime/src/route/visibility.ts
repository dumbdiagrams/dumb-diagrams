import type { Point, Rect } from "../core/index.js";
import { ROUTE_PATH_COSTS } from "./mechanics.js";

const MAX_VISIBILITY_VERTICES = 40_000;

/** Exact-coordinate escape routing for narrow corridors a snapped grid misses. */
export function routeVisibility(
  start: Point,
  goal: Point,
  obstacles: Rect[],
  segmentCost: (a: Point, b: Point) => number = () => 0,
  consume: () => boolean = () => true,
  bounds?: Rect,
): Point[] | null {
  const coordinates = (axis: "x" | "y", dimension: "w" | "h") =>
    [
      ...new Set([
        start[axis],
        goal[axis],
        ...obstacles.flatMap((box) => [
          box[axis] - 2,
          box[axis] - 12,
          box[axis] + box[dimension] + 2,
          box[axis] + box[dimension] + 12,
        ]),
      ]),
    ]
      .filter((value) => !bounds || (value >= bounds[axis] && value <= bounds[axis] + bounds[dimension]))
      .sort((a, b) => a - b);
  const xs = coordinates("x", "w");
  const ys = coordinates("y", "h");
  const width = xs.length;
  const vertices = width * ys.length;
  if (!xs.includes(start.x) || !xs.includes(goal.x) || !ys.includes(start.y) || !ys.includes(goal.y)) return null;
  if (vertices > MAX_VISIBILITY_VERTICES || ![...xs, ...ys].every(Number.isFinite)) return null;
  const startIndex = ys.indexOf(start.y) * width + xs.indexOf(start.x);
  const goalIndex = ys.indexOf(goal.y) * width + xs.indexOf(goal.x);
  const point = (index: number): Point => ({ x: xs[index % width]!, y: ys[Math.floor(index / width)]! });
  const xAt = (vertex: number) => xs[vertex % width]!;
  const yAt = (vertex: number) => ys[Math.floor(vertex / width)]!;
  const clear = (a: Point, b: Point) =>
    !obstacles.some((box) => {
      if (a.x === b.x)
        return (
          a.x >= box.x && a.x <= box.x + box.w && Math.max(a.y, b.y) >= box.y && Math.min(a.y, b.y) <= box.y + box.h
        );
      return a.y >= box.y && a.y <= box.y + box.h && Math.max(a.x, b.x) >= box.x && Math.min(a.x, b.x) <= box.x + box.w;
    });
  if (!clear(start, start) || !clear(goal, goal)) return null;
  const costs = new Float64Array(vertices * 3);
  costs.fill(Infinity);
  const parent = new Int32Array(vertices * 3);
  parent.fill(-1);
  const closed = new Uint8Array(vertices * 3);
  const queue = new VisibilityQueue();
  const initial = startIndex * 3;
  costs[initial] = 0;
  queue.push(initial, Math.abs(start.x - goal.x) + Math.abs(start.y - goal.y));
  // Each grid edge has a stable slot. NaN marks an edge that has not been
  // checked yet; this avoids allocating numeric Map keys during graph search.
  const horizontalEdges = Math.max(0, width - 1) * ys.length;
  const segmentCache = new Float64Array(horizontalEdges + Math.max(0, ys.length - 1) * width);
  segmentCache.fill(NaN);
  while (queue.length) {
    if (!consume()) return null;
    const state = queue.pop()!;
    if (closed[state]) continue;
    closed[state] = 1;
    const vertex = Math.floor(state / 3);
    if (vertex === goalIndex) {
      const path: Point[] = [];
      for (let next = state; next >= 0; next = parent[next]!) path.push(point(Math.floor(next / 3)));
      return simplifyVisibilityPath(path.reverse());
    }
    const column = vertex % width;
    const row = Math.floor(vertex / width);
    // Keep the original left, right, up, down visitation order for tie stability.
    for (let neighbor = 0; neighbor < 4; neighbor++) {
      if (
        (neighbor === 0 && column === 0) ||
        (neighbor === 1 && column + 1 === width) ||
        (neighbor === 2 && row === 0) ||
        (neighbor === 3 && row + 1 === ys.length)
      )
        continue;
      const horizontal = neighbor < 2;
      const other =
        neighbor === 0 ? vertex - 1 : neighbor === 1 ? vertex + 1 : neighbor === 2 ? vertex - width : vertex + width;
      const direction = horizontal ? 1 : 2;
      const nextState = other * 3 + direction;
      if (closed[nextState]) continue;
      const edgeIndex = horizontal
        ? row * (width - 1) + Math.min(column, other % width)
        : horizontalEdges + Math.min(row, Math.floor(other / width)) * width + column;
      let travel = segmentCache[edgeIndex]!;
      if (Number.isNaN(travel)) {
        const ax = xAt(vertex),
          ay = yAt(vertex),
          bx = xAt(other),
          by = yAt(other);
        const isClear = !obstacles.some((box) =>
          horizontal
            ? ay >= box.y && ay <= box.y + box.h && Math.max(ax, bx) >= box.x && Math.min(ax, bx) <= box.x + box.w
            : ax >= box.x && ax <= box.x + box.w && Math.max(ay, by) >= box.y && Math.min(ay, by) <= box.y + box.h,
        );
        travel = isClear
          ? Math.abs(ax - bx) + Math.abs(ay - by) + segmentCost({ x: ax, y: ay }, { x: bx, y: by })
          : Infinity;
        segmentCache[edgeIndex] = travel;
      }
      const turn = state % 3 !== 0 && state % 3 !== direction ? ROUTE_PATH_COSTS.astarTurn : 0;
      const cost = costs[state]! + travel + turn;
      if (cost >= costs[nextState]!) continue;
      costs[nextState] = cost;
      parent[nextState] = state;
      queue.push(nextState, cost + Math.abs(xAt(other) - goal.x) + Math.abs(yAt(other) - goal.y));
    }
  }
  return null;
}

function simplifyVisibilityPath(path: Point[]): Point[] {
  const result: Point[] = [];
  for (const point of path) {
    const a = result.at(-2);
    const b = result.at(-1);
    if (a && b && ((a.x === b.x && b.x === point.x) || (a.y === b.y && b.y === point.y))) result.pop();
    result.push(point);
  }
  return result;
}

class VisibilityQueue {
  private readonly entries: Array<{ state: number; cost: number }> = [];
  get length(): number {
    return this.entries.length;
  }
  push(state: number, cost: number): void {
    const entry = { state, cost };
    let index = this.entries.push(entry) - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.entries[parent]!.cost <= cost) break;
      this.entries[index] = this.entries[parent]!;
      index = parent;
    }
    this.entries[index] = entry;
  }
  pop(): number | undefined {
    const first = this.entries[0];
    const last = this.entries.pop();
    if (!first || !last) return undefined;
    if (this.entries.length) {
      let index = 0;
      while (index * 2 + 1 < this.entries.length) {
        let child = index * 2 + 1;
        if (child + 1 < this.entries.length && this.entries[child + 1]!.cost < this.entries[child]!.cost) child++;
        if (this.entries[child]!.cost >= last.cost) break;
        this.entries[index] = this.entries[child]!;
        index = child;
      }
      this.entries[index] = last;
    }
    return first.state;
  }
}
