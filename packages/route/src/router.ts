import type {
  DiagramDocument,
  GroupGeom,
  LayoutResult,
  NodeGeom,
  Point,
  Rect,
  RoutedEdge,
  Side,
} from "@dumb-diagrams/core";
import { getDefaultView } from "@dumb-diagrams/core";
import { GRAMMAR, GROUP_STYLES, snap } from "@dumb-diagrams/grammar-aws";

const CELL = GRAMMAR.grid;
const BEND_COST = 320;
const COLLISION_COST = 100_000;
const HEADER_COST = 100_000;
const OVERLAP_COST = 32;
const PORT_FALLBACK_COST = 1_200;
const PORT_LANE_OFFSET = 10;
const TURN_COST = 140;

interface PortChoice {
  src: Point;
  tgt: Point;
  srcSide: Side;
  tgtSide: Side;
}

interface Obstacle extends Rect {
  id?: string;
  kind: "node" | "label" | "header";
}

interface Grid {
  originX: number;
  originY: number;
  cols: number;
  rows: number;
  blocked: Uint8Array;
}

export function routeEdges(
  doc: DiagramDocument,
  layout: LayoutResult,
): RoutedEdge[] {
  const nodeMap = new Map(layout.nodes.map((n) => [n.id, n]));
  const obstacles = buildObstacles(layout);
  const vGutters = verticalGutters(layout, obstacles);
  const hGutters = horizontalGutters(layout, obstacles);
  const grid = buildGrid(layout, obstacles);
  const routed: RoutedEdge[] = [];
  const existing: Point[][] = [];
  const view = getDefaultView(doc);

  for (const edge of doc.edges) {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) continue;

    const isFailure = edge.kind === "fail" || edge.style === "dashed";
    const ports = candidatePorts(
      source,
      target,
      isFailure,
      edge.sourcePort,
      edge.targetPort,
    );

    let best: Point[] | null = null;
    let bestScore = Infinity;

    for (const [portIndex, port] of ports.entries()) {
      for (const candidate of templates(port, vGutters, hGutters)) {
        const path = simplify(candidate);
        const s =
          scorePath(path, obstacles, source.id, target.id, existing) +
          portIndex * PORT_FALLBACK_COST;
        if (s < bestScore) {
          bestScore = s;
          best = path;
        }
      }
    }

    if (!best || bestScore >= COLLISION_COST) {
      for (const [portIndex, port] of ports.entries()) {
        const astarPath = routeAStar(grid, port, source, target);
        if (!astarPath) continue;
        const smoothed = shortcut(simplify(astarPath), obstacles, source.id, target.id);
        const s =
          scorePath(smoothed, obstacles, source.id, target.id, existing) +
          portIndex * PORT_FALLBACK_COST;
        if (s < bestScore) {
          bestScore = s;
          best = smoothed;
        }
      }
    }

    let points = best ?? [ports[0]!.src, ports[0]!.tgt];
    points = shortcut(points, obstacles, source.id, target.id);
    points = simplify(points);
    const routeOverride = view.routes[edge.id];
    if (routeOverride?.pin) {
      if (routeOverride.points?.length) {
        points = routeOverride.points.map((point) => ({ ...point }));
      } else if (routeOverride.waypoints?.length) {
        points = [
          points[0]!,
          ...routeOverride.waypoints.map((point) => ({ ...point })),
          points.at(-1)!,
        ];
      }
    }
    existing.push(points);

    routed.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      points,
      step: edge.step,
      label: edge.label,
      style: edge.style,
      kind: edge.kind,
      badge: edge.step ? placeBadge(points) : undefined,
    });
  }

  return routed;
}

function buildObstacles(layout: LayoutResult): Obstacle[] {
  const out: Obstacle[] = [];
  for (const n of layout.nodes) {
    out.push({ ...inflate(n.icon, 6), id: n.id, kind: "node" });
    out.push({ ...inflate(n.label, 8), id: n.id, kind: "label" });
  }
  for (const g of layout.groups) {
    out.push({ ...headerLabelRect(g), id: g.id, kind: "header" });
  }
  return out;
}

function headerLabelRect(group: GroupGeom): Rect {
  const style = GROUP_STYLES[group.kind] ?? GROUP_STYLES.logical;
  const textW = group.label.length * style.fontSize * 0.62;
  const w = Math.min(group.bounds.w, Math.max(80, style.iconSize + 12 + textW + 12));
  return {
    x: group.bounds.x,
    y: group.bounds.y,
    w,
    h: style.headerHeight + 10,
  };
}

function verticalGutters(layout: LayoutResult, obstacles: Obstacle[]): number[] {
  const xs: number[] = [];
  for (const g of layout.groups) {
    xs.push(snap(g.bounds.x - 12));
    xs.push(snap(g.bounds.x + g.bounds.w + 12));
  }
  for (const o of obstacles) {
    xs.push(snap(o.x - 12));
    xs.push(snap(o.x + o.w + 12));
  }
  const unique = [...new Set(xs.map((x) => snap(x)))].sort((a, b) => a - b);
  const gutters: number[] = [];
  for (let i = 0; i < unique.length - 1; i++) {
    const gap = unique[i + 1]! - unique[i]!;
    if (gap >= 12) gutters.push(snap((unique[i]! + unique[i + 1]!) / 2));
  }
  for (const g of layout.groups) {
    for (const other of layout.groups) {
      if (g.id === other.id) continue;
      const gap = other.bounds.x - (g.bounds.x + g.bounds.w);
      const yOverlap =
        g.bounds.y < other.bounds.y + other.bounds.h &&
        other.bounds.y < g.bounds.y + g.bounds.h;
      if (yOverlap && gap >= 12 && gap <= 80) {
        gutters.push(snap(g.bounds.x + g.bounds.w + gap / 2));
      }
    }
  }
  return [...new Set(gutters.map((x) => snap(x)))];
}

function horizontalGutters(layout: LayoutResult, obstacles: Obstacle[]): number[] {
  const ys: number[] = [];
  for (const g of layout.groups) {
    const style = GROUP_STYLES[g.kind] ?? GROUP_STYLES.logical;
    ys.push(snap(g.bounds.y - 12));
    ys.push(snap(g.bounds.y + style.headerHeight + 14));
    ys.push(snap(g.bounds.y + g.bounds.h + 12));
  }
  for (const o of obstacles) {
    ys.push(snap(o.y - 12));
    ys.push(snap(o.y + o.h + 12));
  }
  const unique = [...new Set(ys.map((y) => snap(y)))].sort((a, b) => a - b);
  const gutters: number[] = [];
  for (let i = 0; i < unique.length - 1; i++) {
    const gap = unique[i + 1]! - unique[i]!;
    if (gap >= 12) gutters.push(snap((unique[i]! + unique[i + 1]!) / 2));
  }
  const azTop = layout.groups
    .filter((g) => g.kind === "az")
    .map((g) => g.bounds.y);
  if (azTop.length) gutters.push(snap(Math.min(...azTop) - 12));
  return [...new Set(gutters.map((y) => snap(y)))];
}

function candidatePorts(
  source: NodeGeom,
  target: NodeGeom,
  isFailure: boolean,
  sourcePort?: Side,
  targetPort?: Side,
): PortChoice[] {
  const make = (a: Side, b: Side): PortChoice => ({
    src: port(source, a, "source"),
    tgt: port(target, b, "target"),
    srcSide: a,
    tgtSide: b,
  });
  if (sourcePort || targetPort) {
    const fallbackSource = isFailure ? "e" : iconCenter(target).x >= iconCenter(source).x ? "e" : "w";
    const fallbackTarget = isFailure ? "n" : fallbackSource === "e" ? "w" : "e";
    return [make(sourcePort ?? fallbackSource, targetPort ?? fallbackTarget)];
  }
  if (isFailure) return [make("e", "n"), make("e", "e"), make("s", "n")];

  const sc = iconCenter(source);
  const tc = iconCenter(target);
  const dx = tc.x - sc.x;
  const dy = tc.y - sc.y;
  const sameColumn =
    source.obstacle.x < target.obstacle.x + target.obstacle.w &&
    target.obstacle.x < source.obstacle.x + source.obstacle.w;

  if (sameColumn && Math.abs(dy) > source.icon.h) {
    return [make("e", "e"), make("w", "w"), make("e", "w")];
  }
  if (dx >= 0) return [make("e", "w"), make("e", "n"), make("s", "w"), make("e", "e")];
  return [make("w", "e"), make("e", "e"), make("n", "w")];
}

function iconCenter(node: NodeGeom): Point {
  return { x: node.icon.x + node.icon.w / 2, y: node.icon.y + node.icon.h / 2 };
}

function port(
  node: NodeGeom,
  side: Side,
  endpoint: "source" | "target",
): Point {
  const i = node.icon;
  const lane = endpoint === "source" ? PORT_LANE_OFFSET : -PORT_LANE_OFFSET;
  switch (side) {
    case "e":
      return { x: i.x + i.w, y: snap(i.y + i.h / 2 + lane) };
    case "w":
      return { x: i.x, y: snap(i.y + i.h / 2 + lane) };
    case "s":
      return { x: snap(i.x + i.w / 2 + lane), y: i.y + i.h };
    case "n":
      return { x: snap(i.x + i.w / 2 + lane), y: i.y };
  }
}

function templates(
  ports: PortChoice,
  vGutters: number[],
  hGutters: number[],
): Point[][] {
  const { src, tgt, srcSide, tgtSide } = ports;
  const a = extend(src, srcSide, 24);
  const b = extend(tgt, tgtSide, 24);
  const out: Point[][] = [];

  const push = (mid: Point[]) => {
    out.push([src, ...mid, tgt]);
  };

  push([a, { x: b.x, y: a.y }, b]);
  push([a, { x: a.x, y: b.y }, b]);

  let xs = uniqueNums([
    snap((a.x + b.x) / 2),
    ...vGutters,
  ]);
  if (srcSide === "e" && tgtSide === "e") {
    const minX = Math.max(a.x, b.x);
    xs = uniqueNums([minX, minX + 16, minX + 32, ...vGutters.filter((x) => x >= minX)]);
  } else if (srcSide === "w" && tgtSide === "w") {
    const maxX = Math.min(a.x, b.x);
    xs = uniqueNums([maxX, maxX - 16, ...vGutters.filter((x) => x <= maxX)]);
  } else if (srcSide === "e" && tgtSide === "w") {
    xs = uniqueNums([
      snap((a.x + b.x) / 2),
      ...vGutters.filter((x) => x >= a.x - 8 && x <= b.x + 8),
    ]);
  }

  for (const midX of xs) {
    push([a, { x: midX, y: a.y }, { x: midX, y: b.y }, b]);
  }

  let ys = uniqueNums([
    snap((a.y + b.y) / 2),
    ...hGutters,
  ]);
  if (srcSide === "s" && tgtSide === "n") {
    ys = uniqueNums([
      snap((a.y + b.y) / 2),
      ...hGutters.filter((y) => y >= Math.min(a.y, b.y) && y <= Math.max(a.y, b.y)),
    ]);
  }
  for (const midY of ys) {
    push([a, { x: a.x, y: midY }, { x: b.x, y: midY }, b]);
  }

  const gx = xs;
  const gy = ys;
  for (const x of gx) {
    for (const y of gy) {
      push([a, { x, y: a.y }, { x, y }, { x: b.x, y }, b]);
    }
  }

  return out;
}

function extend(p: Point, side: Side, dist: number): Point {
  switch (side) {
    case "e":
      return { x: p.x + dist, y: p.y };
    case "w":
      return { x: p.x - dist, y: p.y };
    case "s":
      return { x: p.x, y: p.y + dist };
    case "n":
      return { x: p.x, y: p.y - dist };
  }
}

function uniqueNums(values: number[]): number[] {
  return [...new Set(values.map((v) => snap(v)))];
}

function scorePath(
  points: Point[],
  obstacles: Obstacle[],
  sourceId: string,
  targetId: string,
  existing: Point[][],
): number {
  if (points.length < 2) return Infinity;
  let score = (points.length - 2) * BEND_COST + pathLength(points);
  const manhattan =
    Math.abs(points[0]!.x - points[points.length - 1]!.x) +
    Math.abs(points[0]!.y - points[points.length - 1]!.y);
  score += Math.max(0, pathLength(points) - manhattan) * 3;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (a.x !== b.x && a.y !== b.y) return Infinity;
    const isFirst = i === 0;
    const isLast = i === points.length - 2;
    for (const obs of obstacles) {
      // Only the short attachment segment may enter its own icon. Labels remain
      // protected even when they belong to the source or target resource.
      if (obs.kind === "node" && obs.id === sourceId && isFirst) continue;
      if (obs.kind === "node" && obs.id === targetId && isLast) continue;
      if (!segmentHits(a, b, obs)) continue;
      score += obs.kind === "header" ? HEADER_COST : COLLISION_COST;
    }
    for (const other of existing) {
      score += overlapLength(a, b, other) * OVERLAP_COST;
    }
  }
  return score;
}

function overlapLength(a: Point, b: Point, path: Point[]): number {
  let n = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const c = path[i]!;
    const d = path[i + 1]!;
    if (a.x === b.x && c.x === d.x && a.x === c.x) {
      const lo = Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y));
      const hi = Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y));
      if (hi > lo) n += hi - lo;
    } else if (a.y === b.y && c.y === d.y && a.y === c.y) {
      const lo = Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x));
      const hi = Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x));
      if (hi > lo) n += hi - lo;
    }
  }
  return n;
}

function shortcut(
  points: Point[],
  obstacles: Obstacle[],
  sourceId: string,
  targetId: string,
): Point[] {
  let path = simplify(points);
  for (let iter = 0; iter < 12; iter++) {
    let changed = false;
    outer: for (let i = 0; i < path.length - 2; i++) {
      for (let j = path.length - 1; j >= i + 2; j--) {
        const a = path[i]!;
        const b = path[j]!;
        const options: Point[][] = [];
        if (a.x === b.x || a.y === b.y) options.push([a, b]);
        options.push([a, { x: b.x, y: a.y }, b]);
        options.push([a, { x: a.x, y: b.y }, b]);
        const current = path.slice(i, j + 1);
        const currentLen = pathLength(current);
        const currentBends = Math.max(0, current.length - 2);
        for (const opt of options) {
          const next = simplify(opt);
          if (next.length > current.length) continue;
          if (
            pathLength(next) > currentLen &&
            Math.max(0, next.length - 2) >= currentBends
          ) {
            continue;
          }
          if (!pathClear(next, obstacles, sourceId, targetId)) continue;
          path = simplify([...path.slice(0, i), ...next, ...path.slice(j + 1)]);
          changed = true;
          break outer;
        }
      }
    }
    if (!changed) break;
  }
  return path;
}

function pathClear(
  points: Point[],
  obstacles: Obstacle[],
  sourceId: string,
  targetId: string,
): boolean {
  return scorePath(points, obstacles, sourceId, targetId, []) < HEADER_COST;
}

function routeAStar(
  grid: Grid,
  ports: PortChoice,
  source: NodeGeom,
  target: NodeGeom,
): Point[] | null {
  const start = stepOut(source, ports.src, ports.srcSide);
  const goal = stepOut(target, ports.tgt, ports.tgtSide);
  const mid = astar(grid, start, goal);
  if (!mid) return [ports.src, start, goal, ports.tgt];
  return [ports.src, ...mid, ports.tgt];
}

function stepOut(node: NodeGeom, p: Point, side: Side): Point {
  const gap = CELL * 2;
  const o = node.obstacle;
  switch (side) {
    case "e":
      return { x: snap(Math.max(p.x + gap, o.x + o.w + gap)), y: p.y };
    case "w":
      return { x: snap(Math.min(p.x - gap, o.x - gap)), y: p.y };
    case "s":
      return { x: p.x, y: snap(Math.max(p.y + gap, o.y + o.h + gap)) };
    case "n":
      return { x: p.x, y: snap(Math.min(p.y - gap, o.y - gap)) };
  }
}

function buildGrid(layout: LayoutResult, obstacles: Obstacle[]): Grid {
  const margin = 64;
  const originX = -margin;
  const originY = -margin;
  const cols = Math.ceil((layout.width + margin * 2) / CELL) + 2;
  const rows = Math.ceil((layout.height + margin * 2) / CELL) + 2;
  const blocked = new Uint8Array(cols * rows);
  const grid: Grid = { originX, originY, cols, rows, blocked };
  for (const obs of obstacles) markRect(grid, obs);
  return grid;
}

function markRect(grid: Grid, rect: Rect): void {
  const c0 = clamp(Math.floor((rect.x - grid.originX) / CELL), 0, grid.cols - 1);
  const r0 = clamp(Math.floor((rect.y - grid.originY) / CELL), 0, grid.rows - 1);
  const c1 = clamp(Math.ceil((rect.x + rect.w - grid.originX) / CELL), 0, grid.cols - 1);
  const r1 = clamp(Math.ceil((rect.y + rect.h - grid.originY) / CELL), 0, grid.rows - 1);
  for (let r = r0; r < r1; r++) {
    for (let c = c0; c < c1; c++) grid.blocked[r * grid.cols + c] = 1;
  }
}

function astar(grid: Grid, start: Point, goal: Point): Point[] | null {
  const sc = worldToCell(grid, start.x, start.y);
  const gc = worldToCell(grid, goal.x, goal.y);
  if (!inBounds(grid, sc.c, sc.r) || !inBounds(grid, gc.c, gc.r)) return null;

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  const size = grid.cols * grid.rows;
  const gScore = new Float64Array(size);
  gScore.fill(Infinity);
  const came = new Int32Array(size);
  came.fill(-1);
  const startIdx = sc.r * grid.cols + sc.c;
  const goalIdx = gc.r * grid.cols + gc.c;
  gScore[startIdx] = 0;
  const heap = new MinHeap();
  heap.push(startIdx, heuristic(sc.c, sc.r, gc.c, gc.r));
  const closed = new Uint8Array(size);

  while (heap.size > 0) {
    const current = heap.pop();
    if (current === undefined || closed[current]) continue;
    if (current === goalIdx) return reconstruct(grid, came, current, start, goal);
    closed[current] = 1;
    const c = current % grid.cols;
    const r = Math.floor(current / grid.cols);
    const parent = came[current];
    const pc = parent >= 0 ? parent % grid.cols : c;
    const pr = parent >= 0 ? Math.floor(parent / grid.cols) : r;
    for (const [dc, dr] of dirs) {
      const nc = c + dc;
      const nr = r + dr;
      if (!inBounds(grid, nc, nr)) continue;
      const ni = nr * grid.cols + nc;
      if (closed[ni]) continue;
      if (grid.blocked[ni] && ni !== goalIdx && ni !== startIdx) continue;
      const turned = parent >= 0 && (nc - c !== c - pc || nr - r !== r - pr);
      const tentative = gScore[current] + CELL + (turned ? TURN_COST : 0);
      if (tentative >= gScore[ni]) continue;
      came[ni] = current;
      gScore[ni] = tentative;
      heap.push(ni, tentative + heuristic(nc, nr, gc.c, gc.r));
    }
  }
  return null;
}

function heuristic(c: number, r: number, gc: number, gr: number): number {
  return (Math.abs(c - gc) + Math.abs(r - gr)) * CELL;
}

function reconstruct(
  grid: Grid,
  came: Int32Array,
  current: number,
  start: Point,
  goal: Point,
): Point[] {
  const cells: Point[] = [];
  let i = current;
  while (i >= 0) {
    const c = i % grid.cols;
    const r = Math.floor(i / grid.cols);
    cells.push(cellToWorld(grid, c, r));
    i = came[i]!;
  }
  cells.reverse();
  if (cells.length) {
    cells[0] = start;
    cells[cells.length - 1] = goal;
  }
  return cells;
}

function worldToCell(grid: Grid, x: number, y: number): { c: number; r: number } {
  return {
    c: Math.round((x - grid.originX) / CELL),
    r: Math.round((y - grid.originY) / CELL),
  };
}

function cellToWorld(grid: Grid, c: number, r: number): Point {
  return { x: grid.originX + c * CELL, y: grid.originY + r * CELL };
}

function inBounds(grid: Grid, c: number, r: number): boolean {
  return c >= 0 && r >= 0 && c < grid.cols && r < grid.rows;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function inflate(rect: Rect, pad: number): Rect {
  return { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 };
}

function segmentHits(a: Point, b: Point, r: Rect): boolean {
  if (a.x === b.x) {
    if (a.x < r.x || a.x > r.x + r.w) return false;
    return Math.max(a.y, b.y) >= r.y && Math.min(a.y, b.y) <= r.y + r.h;
  }
  if (a.y === b.y) {
    if (a.y < r.y || a.y > r.y + r.h) return false;
    return Math.max(a.x, b.x) >= r.x && Math.min(a.x, b.x) <= r.x + r.w;
  }
  return false;
}

function pathLength(points: Point[]): number {
  let n = 0;
  for (let i = 0; i < points.length - 1; i++) {
    n += Math.abs(points[i]!.x - points[i + 1]!.x) + Math.abs(points[i]!.y - points[i + 1]!.y);
  }
  return n;
}

function simplify(points: Point[]): Point[] {
  if (points.length <= 2) return points;
  const out: Point[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = out[out.length - 1]!;
    const curr = points[i]!;
    const next = points[i + 1]!;
    const same = curr.x === prev.x && curr.y === prev.y;
    const collinear =
      (prev.x === curr.x && curr.x === next.x) ||
      (prev.y === curr.y && curr.y === next.y);
    if (!same && !collinear) out.push(curr);
  }
  const last = points[points.length - 1]!;
  const tail = out[out.length - 1]!;
  if (tail.x !== last.x || tail.y !== last.y) out.push(last);
  return out;
}

function placeBadge(points: Point[]): Point | undefined {
  let best: { a: Point; b: Point; len: number } | null = null;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (a.y === b.y) {
      const len = Math.abs(b.x - a.x);
      if (!best || len > best.len) best = { a, b, len };
    }
  }
  if (!best || best.len < 40) return undefined;
  return { x: (best.a.x + best.b.x) / 2, y: best.a.y };
}

class MinHeap {
  data: number[] = [];
  pri: number[] = [];
  size = 0;
  push(idx: number, priority: number): void {
    this.data.push(idx);
    this.pri.push(priority);
    this.size++;
    this.up(this.size - 1);
  }
  pop(): number | undefined {
    if (this.size === 0) return undefined;
    const top = this.data[0];
    this.size--;
    const last = this.data.pop()!;
    const lastP = this.pri.pop()!;
    if (this.size > 0) {
      this.data[0] = last;
      this.pri[0] = lastP;
      this.down(0);
    }
    return top;
  }
  private up(i: number): void {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.pri[p]! <= this.pri[i]!) break;
      this.swap(i, p);
      i = p;
    }
  }
  private down(i: number): void {
    for (;;) {
      let m = i;
      const l = i * 2 + 1;
      const r = l + 1;
      if (l < this.size && this.pri[l]! < this.pri[m]!) m = l;
      if (r < this.size && this.pri[r]! < this.pri[m]!) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
  }
  private swap(i: number, j: number): void {
    [this.data[i], this.data[j]] = [this.data[j]!, this.data[i]!];
    [this.pri[i], this.pri[j]] = [this.pri[j]!, this.pri[i]!];
  }
}

export interface RoutePreviewOptions {
  source?: string;
  target?: string;
  sourcePort?: Side;
  targetPort?: Side;
  waypoints?: Point[];
}

export function routeEdgePreview(
  doc: DiagramDocument,
  layout: LayoutResult,
  edgeId: string,
  options: RoutePreviewOptions = {},
): Point[] | null {
  const edge = doc.edges.find((candidate) => candidate.id === edgeId);
  if (!edge) return null;
  const nodeMap = new Map(layout.nodes.map((n) => [n.id, n]));
  const sourceId = options.source ?? edge.source;
  const targetId = options.target ?? edge.target;
  const source = nodeMap.get(sourceId);
  const target = nodeMap.get(targetId);
  if (!source || !target) return null;

  const obstacles = buildObstacles(layout);
  const vGutters = verticalGutters(layout, obstacles);
  const hGutters = horizontalGutters(layout, obstacles);
  const grid = buildGrid(layout, obstacles);
  const isFailure = edge.kind === "fail" || edge.style === "dashed";
  const ports = candidatePorts(
    source,
    target,
    isFailure,
    options.sourcePort ?? edge.sourcePort,
    options.targetPort ?? edge.targetPort,
  );

  let best: Point[] | null = null;
  let bestScore = Infinity;
  for (const [portIndex, port] of ports.entries()) {
    for (const candidate of templates(port, vGutters, hGutters)) {
      const path = simplify(candidate);
      const s = scorePath(path, obstacles, source.id, target.id, []) + portIndex * PORT_FALLBACK_COST;
      if (s < bestScore) {
        bestScore = s;
        best = path;
      }
    }
  }
  if (!best || bestScore >= COLLISION_COST) {
    for (const [portIndex, port] of ports.entries()) {
      const astarPath = routeAStar(grid, port, source, target);
      if (!astarPath) continue;
      const smoothed = shortcut(simplify(astarPath), obstacles, source.id, target.id);
      const s = scorePath(smoothed, obstacles, source.id, target.id, []) + portIndex * PORT_FALLBACK_COST;
      if (s < bestScore) {
        bestScore = s;
        best = smoothed;
      }
    }
  }

  let points = best ?? [ports[0]!.src, ports[0]!.tgt];
  points = shortcut(points, obstacles, source.id, target.id);
  points = simplify(points);
  if (options.waypoints?.length) {
    points = [points[0]!, ...options.waypoints, points.at(-1)!];
  }
  return points;
}

export function attachRoutes(
  layout: LayoutResult,
  edges: RoutedEdge[],
): LayoutResult {
  return { ...layout, edges };
}
