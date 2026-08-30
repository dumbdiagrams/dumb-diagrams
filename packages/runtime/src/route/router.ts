import type {
  DiagramDocument,
  EdgeKind,
  EdgeStyle,
  GroupGeom,
  LayoutResult,
  NodeGeom,
  Point,
  Rect,
  RouteOverride,
  RoutedEdge,
  EdgeBadgeSide,
  EdgeLabelSide,
  Side,
} from "../core/index.js";
import {
  getDefaultView,
  nearestPortAnchor,
  normalizePortOffset,
  portPoint,
} from "../core/index.js";
import { GRAMMAR, GROUP_STYLES, snap } from "../grammar-aws/index.js";

const CELL = GRAMMAR.grid;
const BEND_COST = 320;
const HEADER_COST = 100_000;
// Routing quality rules, in descending priority: never hit content; avoid
// crossings and unrelated junctions; do not share or crowd a corridor; then
// prefer authored faces, fewer bends, and the shortest remaining path.
// Authored face-only ports are preferences. An authored fractional offset is
// an exact attachment and therefore locks that endpoint to its requested face.
const CROSSING_COST = 300_000;
const JUNCTION_COST = 20_000;
const OVERLAP_COST = 4_000;
const NEAR_PARALLEL_COST = 160;
const MIN_CONNECTOR_GAP = CELL;
const PORT_SIDE_FALLBACK_COST = 900;
const PORT_OFFSET_FALLBACK_COST = 120;
const PORT_BACKTRACK_COST = 4_000;
const LABEL_SIDE_FALLBACK_COST = 6_000;
const VISIBLE_PORTS_PER_FACE = 3;
const TURN_COST = 140;
// A near-aligned pair of opposing ports should read as one straight
// connector. Anything shorter than a full routing cell is visual noise: at
// normal zoom it looks like a broken arrow rather than a deliberate lane
// change.
const MICRO_JOG_THRESHOLD = CELL;
const VERTICAL_BADGE_TARGET_T = 0.75;
const MINIMUM_BADGE_RUN = CELL * 2;
const BADGE_CONNECTOR_CLEARANCE = GRAMMAR.badgeRadius + 6;
const BADGE_TO_BADGE_CLEARANCE = GRAMMAR.badgeRadius * 2 + 6;
const BADGE_CONTENT_CLEARANCE = 4;
const BADGE_CONTENT_COLLISION_COST = 10_000_000;
const LABEL_CONTENT_CLEARANCE = 4;
const LABEL_TO_LABEL_CLEARANCE = 6;
const LABEL_TO_CONNECTOR_CLEARANCE = 4;
const LABEL_COLLISION_COST = 10_000_000;
// Four-bend candidates combine one vertical and one horizontal corridor. A
// dense diagram can expose dozens of each, and trying their full Cartesian
// product for every port pair makes routing grow explosively. Single-corridor
// candidates below still consider every gutter; keep a small, representative
// set only for the combined fallback shapes.
const MAX_COMBINED_GUTTERS_PER_AXIS = 4;
const MAX_ASTAR_PORT_CHOICES = 3;

interface PortChoice {
  src: Point;
  tgt: Point;
  srcSide: Side;
  tgtSide: Side;
  preferenceCost: number;
}

interface RouteContext {
  sourceId: string;
  targetId: string;
  sourcePoint: Point;
  targetPoint: Point;
  sourceSide: Side;
  targetSide: Side;
  style: EdgeStyle;
}

interface ExistingRoute {
  points: Point[];
  sourceId: string;
  targetId: string;
  style: EdgeStyle;
}

interface Obstacle extends Rect {
  id?: string;
  kind: "node" | "header";
}

interface GroupBoundary {
  a: Point;
  b: Point;
  clearance: number;
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
  const boundaries = buildGroupBoundaries(layout);
  const vGutters = verticalGutters(layout, obstacles);
  const hGutters = horizontalGutters(layout, obstacles);
  const grid = buildGrid(layout, obstacles);
  const routed: RoutedEdge[] = [];
  const existing: ExistingRoute[] = [];
  const view = getDefaultView(doc);
  const documentOrder = new Map(doc.edges.map((edge, index) => [edge.id, index]));
  const span = (source?: NodeGeom, target?: NodeGeom) => source && target
    ? Math.abs(iconCenter(source).x - iconCenter(target).x) +
      Math.abs(iconCenter(source).y - iconCenter(target).y)
    : 0;
  const spanByEdge = new Map(doc.edges.map((edge) => [
    edge.id,
    span(nodeMap.get(edge.source), nodeMap.get(edge.target)),
  ]));
  const targetSpans = new Map<string, number[]>();
  const sourceSpans = new Map<string, number[]>();
  for (const edge of doc.edges) {
    const spans = targetSpans.get(edge.target) ?? [];
    spans.push(spanByEdge.get(edge.id) ?? 0);
    targetSpans.set(edge.target, spans);
    const branches = sourceSpans.get(edge.source) ?? [];
    branches.push(spanByEdge.get(edge.id) ?? 0);
    sourceSpans.set(edge.source, branches);
  }
  const routePriority = (edge: DiagramDocument["edges"][number]) => {
    const edgeSpan = spanByEdge.get(edge.id) ?? 0;
    const converging = targetSpans.get(edge.target) ?? [];
    const branching = sourceSpans.get(edge.source) ?? [];
    if (branching.length > 1) {
      const longest = Math.max(...branching);
      // Let a short direct branch claim its simple lane before longer members
      // of the same fan-out wrap around it.
      return longest + (longest - edgeSpan) / 1_000;
    }
    if (converging.length <= VISIBLE_PORTS_PER_FACE) return edgeSpan;
    const longest = Math.max(...converging);
    // Once a target has more incoming edges than one face has visible ports,
    // keep the family near the priority of its longest member but let short,
    // least-detoured approaches claim the primary target lanes first.
    return longest + (longest - edgeSpan) / 1_000;
  };
  const routingOrder = [...doc.edges].sort((a, b) => {
    const pinnedDelta = Number(Boolean(view.routes[b.id]?.pin)) -
      Number(Boolean(view.routes[a.id]?.pin));
    if (pinnedDelta) return pinnedDelta;
    const exactDelta =
      Number(b.sourcePortOffset !== undefined) + Number(b.targetPortOffset !== undefined) -
      Number(a.sourcePortOffset !== undefined) - Number(a.targetPortOffset !== undefined);
    if (exactDelta) return exactDelta;
    // Primary solid flows claim attachment lanes before dashed dependency and
    // monitoring edges. This keeps a later secondary relationship from
    // forcing the main data path into a crossing merely because it is longer.
    const styleDelta = Number(a.style === "dashed") - Number(b.style === "dashed");
    if (styleDelta) return styleDelta;
    const priorityDelta = routePriority(b) - routePriority(a);
    return priorityDelta || documentOrder.get(a.id)! - documentOrder.get(b.id)!;
  });

  // Route the least flexible and longest connections first so later paths can
  // move around them. Preserve document order in the returned render list.
  for (const edge of routingOrder) {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) continue;

    const isFailure = edge.kind === "fail" || edge.style === "dashed";
    const ports = alignNearOpposingPorts(
      candidatePorts(
        source,
        target,
        isFailure,
        edge.sourcePort,
        edge.targetPort,
        edge.sourcePortOffset,
        edge.targetPortOffset,
      ),
      source,
      target,
      edge.sourcePortOffset !== undefined,
      edge.targetPortOffset !== undefined,
    );

    let best: Point[] | null = null;
    let bestScore = Infinity;
    let bestPort = ports[0]!;
    const routeVGutters = [...vGutters, ...corridorGutters(existing, "vertical")];
    const routeHGutters = [...hGutters, ...corridorGutters(existing, "horizontal")];

    for (const port of ports) {
      // No orthogonal path between these ports can be shorter than their
      // Manhattan distance. Once another port has already reached or beaten
      // that lower bound, generating and scoring this port's large template
      // family cannot improve the result.
      const lowerBound =
        Math.abs(port.src.x - port.tgt.x) +
        Math.abs(port.src.y - port.tgt.y) +
        port.preferenceCost;
      if (lowerBound >= bestScore) continue;
      const context = createRouteContext(source, target, port, edge.style);
      for (const candidate of templates(port, routeVGutters, routeHGutters, source, target)) {
        const path = simplify(candidate);
        const s = scorePath(
          path,
          obstacles,
          context,
          existing,
          bestScore - port.preferenceCost,
        ) + port.preferenceCost;
        if (s < bestScore) {
          bestScore = s;
          best = path;
          bestPort = port;
        }
        // A collision-free path with no avoidable distance or turns is the
        // mathematical optimum for this port. Avoid scoring the remaining
        // gutter combinations, which dominate interactive edit latency.
        if (bestScore <= lowerBound) break;
      }
    }

    if (!best || bestScore >= CROSSING_COST) {
      // Every port variant searches the same grid against the same established
      // routes. Cache per-grid-segment conflict costs across those searches;
      // calculating them repeatedly was the dominant cost in dense diagrams.
      const conflictCostCache = new Map<number, number>();
      const astarPorts = representativePortChoices([
        bestPort,
        ...ports.filter((port) => port !== bestPort),
      ], MAX_ASTAR_PORT_CHOICES);
      for (const port of astarPorts) {
        const context = createRouteContext(source, target, port, edge.style);
        const astarPath = routeAStar(
          grid,
          port,
          source,
          target,
          existing,
          conflictCostCache,
        );
        if (!astarPath) continue;
        const smoothed = shortcut(simplify(astarPath), obstacles, context, existing);
        const s = scorePath(
          smoothed,
          obstacles,
          context,
          existing,
          bestScore - port.preferenceCost,
        ) + port.preferenceCost;
        if (s < bestScore) {
          bestScore = s;
          best = smoothed;
          bestPort = port;
        }
        // Port choices are ordered by authoring preference. Once A* finds a
        // collision- and crossing-free route, later variants can only refine
        // its aesthetics at substantial interactive cost.
        if (bestScore < CROSSING_COST) break;
      }
    }

    if (!best) {
      // Established connectors can occasionally form a closed grid wall. In
      // that case, crossing a connector is preferable to falling back to a
      // direct elbow through service icons or labels. Rip up this edge's
      // corridor constraints, but keep every content obstacle hard.
      for (const port of representativePortChoices(ports, 6)) {
        const context = createRouteContext(source, target, port, edge.style);
        const astarPath = routeAStar(grid, port, source, target, []);
        if (!astarPath) continue;
        const smoothed = shortcut(simplify(astarPath), obstacles, context);
        const score = scorePath(smoothed, obstacles, context, []) +
          port.preferenceCost;
        if (score < bestScore) {
          best = smoothed;
          bestScore = score;
          bestPort = port;
        }
      }
    }

    if (!best) {
      // The perimeter search is the last automatic escape hatch. It still
      // scores every candidate against hard content obstacles; never replace
      // an exhausted search with an unchecked direct elbow through a card.
      for (const port of representativePortChoices(ports, 8)) {
        const context = createRouteContext(source, target, port, edge.style);
        const candidate = perimeterFallback(
          layout,
          source,
          target,
          port,
          obstacles,
          context,
          existing,
        );
        if (!candidate) continue;
        const score = scorePath(candidate, obstacles, context, existing) +
          port.preferenceCost;
        if (score < bestScore) {
          best = candidate;
          bestScore = score;
          bestPort = port;
        }
      }
      if (!best) {
        // Connector conflicts are soft: if established routes surround the
        // available lanes, retry the same hard-obstacle-safe perimeter search
        // without them and allow this edge to cross a connector.
        for (const port of representativePortChoices(ports, 8)) {
          const context = createRouteContext(source, target, port, edge.style);
          const candidate = perimeterFallback(
            layout,
            source,
            target,
            port,
            obstacles,
            context,
            [],
          );
          if (!candidate) continue;
          const score = scorePath(candidate, obstacles, context, []) +
            port.preferenceCost;
          if (score < bestScore) {
            best = candidate;
            bestScore = score;
            bestPort = port;
          }
        }
      }
    }

    if (!best) {
      throw new Error(`Unable to route automatic edge ${edge.id} without crossing content`);
    }
    let points = best;
    points = shortcut(
      points,
      obstacles,
      createRouteContext(source, target, bestPort, edge.style),
      existing,
    );
    points = simplify(points);
    const routeOverride = view.routes[edge.id];
    if (routeOverride?.pin) {
      if (routeOverride.points?.length) {
        points = collapseOrthogonalRouteArtifacts(
          snapRouteEndpoints(routeOverride.points, source, target),
        );
      } else if (routeOverride.waypoints?.length) {
        points = collapseOrthogonalRouteArtifacts([
          points[0]!,
          ...routeOverride.waypoints.map((point) => ({ ...point })),
          points.at(-1)!,
        ]);
      }
    }
    if (routeOverride?.pin) {
      points = eraseOrthogonalRouteLoops(points, true);
    } else {
      points = normalizeOrthogonalRoute(points);
    }
    existing.push({
      points,
      sourceId: edge.source,
      targetId: edge.target,
      style: edge.style,
    });

    routed.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      points,
      step: edge.step,
      label: edge.label,
      style: edge.style,
      kind: edge.kind,
      color: edge.color,
    });
  }

  const byId = new Map(routed.map((edge) => [edge.id, edge]));
  const documentRoutes = doc.edges
    .map((edge) => byId.get(edge.id))
    .filter((edge): edge is RoutedEdge => Boolean(edge));
  repairAutomaticRouteCrossings(
    doc,
    layout,
    documentRoutes,
    obstacles,
    grid,
    vGutters,
    hGutters,
    view.routes,
  );
  nudgeAutomaticRoutesOffBoundaries(
    layout,
    documentRoutes,
    obstacles,
    boundaries,
    view.routes,
  );
  placeEdgeDecorations(
    documentRoutes,
    view.routes,
    buildDecorationObstacles(layout),
  );
  return documentRoutes;
}

function repairAutomaticRouteCrossings(
  doc: DiagramDocument,
  layout: LayoutResult,
  edges: RoutedEdge[],
  obstacles: Obstacle[],
  grid: Grid,
  vGutters: number[],
  hGutters: number[],
  routeOverrides: Record<string, RouteOverride>,
): void {
  // Dense diagrams already use the global A* pass above. Exhaustively ripping
  // up every crossing in that case is quadratic in both routes and template
  // lanes; keep this deterministic refinement for the small/medium diagrams
  // where it stays comfortably inside the interactive compilation budget.
  if (edges.length > 16) return;
  const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
  const edgeDefinitions = new Map(doc.edges.map((edge) => [edge.id, edge]));
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const edge of edges) {
      if (routeOverrides[edge.id]?.pin || edge.points.length < 4) continue;
      const source = nodes.get(edge.source);
      const target = nodes.get(edge.target);
      const definition = edgeDefinitions.get(edge.id);
      if (!source || !target || !definition) continue;
      const otherRoutes = edges
        .filter((candidate) => candidate.id !== edge.id)
        .map((candidate) => ({
          points: candidate.points,
          sourceId: candidate.source,
          targetId: candidate.target,
          style: candidate.style,
        }));
      if (routeConflictCount(edge.points, otherRoutes) < 10) continue;
      const sourceAnchor = nearestPortAnchor(source.icon, edge.points[0]!);
      const targetAnchor = nearestPortAnchor(target.icon, edge.points.at(-1)!);
      const context: RouteContext = {
        sourceId: edge.source,
        targetId: edge.target,
        sourcePoint: edge.points[0]!,
        targetPoint: edge.points.at(-1)!,
        sourceSide: sourceAnchor.side,
        targetSide: targetAnchor.side,
        style: edge.style,
      };
      let best = edge.points;
      let bestConflicts = routeConflictCount(best, otherRoutes);
      let bestScore = scorePath(best, obstacles, context, []);
      const considerRepair = (
        candidate: Point[],
        candidateContext: RouteContext,
        preferenceCost = 0,
      ) => {
        const normalized = normalizeOrthogonalRoute(simplify(candidate));
        const score = scorePath(normalized, obstacles, candidateContext, []) +
          preferenceCost;
        if (!Number.isFinite(score)) return;
        const conflicts = routeConflictCount(normalized, otherRoutes);
        if (
          conflicts < bestConflicts ||
          (conflicts === bestConflicts && score < bestScore)
        ) {
          best = normalized;
          bestConflicts = conflicts;
          bestScore = score;
        }
      };

      // The first routing pass is intentionally incremental, so an early edge
      // cannot anticipate every later corridor. Once the complete route set is
      // known, retry every distinct attachment-face pair against that final
      // geometry before attempting local segment shifts.
      const retryPorts = alignNearOpposingPorts(
        candidatePorts(
          source,
          target,
          definition.kind === "fail" || definition.style === "dashed",
          definition.sourcePort,
          definition.targetPort,
          definition.sourcePortOffset,
          definition.targetPortOffset,
        ),
        source,
        target,
        definition.sourcePortOffset !== undefined,
        definition.targetPortOffset !== undefined,
      );
      const retryVGutters = [
        ...vGutters,
        ...corridorGutters(otherRoutes, "vertical"),
      ];
      const retryHGutters = [
        ...hGutters,
        ...corridorGutters(otherRoutes, "horizontal"),
      ];
      for (const port of representativePortChoices(retryPorts, 16)) {
        const retryContext = createRouteContext(source, target, port, edge.style);
        for (const candidate of templates(
          port,
          retryVGutters,
          retryHGutters,
          source,
          target,
        )) {
          considerRepair(candidate, retryContext, port.preferenceCost);
          if (bestConflicts === 0) break;
        }
        if (bestConflicts === 0) break;
        const routed = routeAStar(grid, port, source, target, otherRoutes) ??
          routeAStar(grid, port, source, target, []);
        if (routed) {
          const candidate = shortcut(
            simplify(routed),
            obstacles,
            retryContext,
            otherRoutes,
          );
          considerRepair(candidate, retryContext, port.preferenceCost);
        }
        if (bestConflicts === 0) break;
      }

      for (
        let index = 1;
        bestConflicts > 0 && index < edge.points.length - 2;
        index++
      ) {
        const a = edge.points[index]!;
        const b = edge.points[index + 1]!;
        const horizontal = a.y === b.y;
        const vertical = a.x === b.x;
        if (!horizontal && !vertical) continue;
        const repairGutters = horizontal
          ? [...hGutters, ...corridorGutters(otherRoutes, "horizontal")]
          : [...vGutters, ...corridorGutters(otherRoutes, "vertical")];
        const values = repairGutters
          .map((value) => ({ value, distance: Math.abs(value - (horizontal ? a.y : a.x)) }))
          .sort((first, second) => first.distance - second.distance || first.value - second.value)
          .slice(0, 24);
        for (const { value } of values) {
          const candidate = edge.points.map((point) => ({ ...point }));
          if (horizontal) {
            candidate[index]!.y = value;
            candidate[index + 1]!.y = value;
          } else {
            candidate[index]!.x = value;
            candidate[index + 1]!.x = value;
          }
          const simplified = simplify(candidate);
          const score = scorePath(simplified, obstacles, context, []);
          if (!Number.isFinite(score)) continue;
          const conflicts = routeConflictCount(simplified, otherRoutes);
          if (
            conflicts < bestConflicts ||
            (conflicts === bestConflicts && score < bestScore)
          ) {
            best = simplified;
            bestConflicts = conflicts;
            bestScore = score;
          }
        }
      }
      if (best === edge.points) continue;
      edge.points = best;
      changed = true;
    }
    if (!changed) break;
  }
}

function routeConflictCount(points: Point[], existing: ExistingRoute[]): number {
  let conflicts = 0;
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index]!;
    const b = points[index + 1]!;
    for (const route of existing) {
      if (overlapLength(a, b, route.points) > 0) conflicts += 100;
      for (let otherIndex = 0; otherIndex < route.points.length - 1; otherIndex++) {
        const kind = segmentIntersectionKind(
          a,
          b,
          route.points[otherIndex]!,
          route.points[otherIndex + 1]!,
        );
        if (kind === "cross") conflicts += 10;
        else if (kind === "touch") conflicts += 1;
      }
    }
  }
  return conflicts;
}

function representativePortChoices(
  ports: PortChoice[],
  limit: number,
): PortChoice[] {
  const selected: PortChoice[] = [];
  const faces = new Set<string>();
  for (const port of ports) {
    const key = `${port.srcSide}:${port.tgtSide}`;
    if (faces.has(key)) continue;
    faces.add(key);
    selected.push(port);
    if (selected.length >= limit) return selected;
  }
  for (const port of ports) {
    if (selected.includes(port)) continue;
    selected.push(port);
    if (selected.length >= limit) break;
  }
  return selected;
}

function perimeterFallback(
  layout: LayoutResult,
  source: NodeGeom,
  target: NodeGeom,
  portChoice: PortChoice,
  obstacles: Obstacle[],
  context: RouteContext,
  existing: ExistingRoute[],
): Point[] | null {
  const start = extendFromCard(source, portChoice.src, portChoice.srcSide);
  const goal = extendFromCard(target, portChoice.tgt, portChoice.tgtSide);
  // Route outside every hard obstacle, not merely inside the nominal layout
  // bounds. Group headers can begin at y=0 and cards can extend beyond the
  // layout's initial width/height, so fixed 16px lanes may still cut through
  // visible content.
  const margin = CELL * 2;
  const minX = Math.min(...obstacles.map((obstacle) => obstacle.x), 0) - margin;
  const maxX = Math.max(
    ...obstacles.map((obstacle) => obstacle.x + obstacle.w),
    layout.width,
  ) + margin;
  const minY = Math.min(...obstacles.map((obstacle) => obstacle.y), 0) - margin;
  const maxY = Math.max(
    ...obstacles.map((obstacle) => obstacle.y + obstacle.h),
    layout.height,
  ) + margin;
  const lanes = { top: minY, right: maxX, bottom: maxY, left: minX };
  const candidates = [
    [portChoice.src, start, { x: start.x, y: lanes.top }, { x: goal.x, y: lanes.top }, goal, portChoice.tgt],
    [portChoice.src, start, { x: start.x, y: lanes.bottom }, { x: goal.x, y: lanes.bottom }, goal, portChoice.tgt],
    [portChoice.src, start, { x: lanes.left, y: start.y }, { x: lanes.left, y: goal.y }, goal, portChoice.tgt],
    [portChoice.src, start, { x: lanes.right, y: start.y }, { x: lanes.right, y: goal.y }, goal, portChoice.tgt],
  ];
  // A source's direct run to one outer lane may itself be blocked by another
  // card. Try both turn orders through every outer corner before declaring
  // the perimeter unavailable.
  for (const laneX of [lanes.left, lanes.right]) {
    for (const laneY of [lanes.top, lanes.bottom]) {
      candidates.push(
        [
          portChoice.src,
          start,
          { x: laneX, y: start.y },
          { x: laneX, y: laneY },
          { x: goal.x, y: laneY },
          goal,
          portChoice.tgt,
        ],
        [
          portChoice.src,
          start,
          { x: start.x, y: laneY },
          { x: laneX, y: laneY },
          { x: laneX, y: goal.y },
          goal,
          portChoice.tgt,
        ],
      );
    }
  }
  const simplifiedCandidates = candidates.map((points) => simplify(points));

  const choose = (routes: ExistingRoute[]) => {
    let best: Point[] | null = null;
    let bestScore = Infinity;
    for (const candidate of simplifiedCandidates) {
      const score = scorePath(candidate, obstacles, context, routes);
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return best;
  };
  return choose(existing);
}

function nudgeAutomaticRoutesOffBoundaries(
  layout: LayoutResult,
  edges: RoutedEdge[],
  obstacles: Obstacle[],
  boundaries: GroupBoundary[],
  routeOverrides: Record<string, RouteOverride>,
): void {
  const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
  for (const edge of edges) {
    if (routeOverrides[edge.id]?.pin) continue;
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (!source || !target || edge.points.length < 2) continue;
    const sourceAnchor = nearestPortAnchor(source.icon, edge.points[0]!);
    const targetAnchor = nearestPortAnchor(target.icon, edge.points.at(-1)!);
    edge.points = nudgePathOffBoundaries(
      edge.points,
      boundaries,
      obstacles,
      {
        sourceId: edge.source,
        targetId: edge.target,
        sourcePoint: edge.points[0]!,
        targetPoint: edge.points.at(-1)!,
        sourceSide: sourceAnchor.side,
        targetSide: targetAnchor.side,
        style: edge.style,
      },
      edges
        .filter((candidate) => candidate.id !== edge.id)
        .map((candidate) => ({
          points: candidate.points,
          sourceId: candidate.source,
          targetId: candidate.target,
          style: candidate.style,
        })),
    );
  }
}

/**
 * Place badges only after every connector is known. Doing this during the
 * routing pass made badge 2 blind to badge 1's arrow (and vice versa), which
 * allowed a badge to cover a nearby connector even when the opposite side of
 * its own path was completely clear.
 */
function placeEdgeDecorations(
  edges: RoutedEdge[],
  routeOverrides: Record<string, RouteOverride>,
  obstacles: Obstacle[],
): void {
  const badges = new Map<string, EdgeBadgePlacement>();
  const occupiedBadges: Point[] = [];
  const badgeOrder = edges
    .filter((edge) => edge.step !== undefined)
    .map((edge, index) => ({ edge, index }))
    .sort((a, b) =>
      (a.edge.step ?? 0) - (b.edge.step ?? 0) || a.index - b.index
    );

  for (const { edge } of badgeOrder) {
    const routeOverride = routeOverrides[edge.id];
    const isAuthored =
      routeOverride?.badgeT !== undefined || routeOverride?.badgeSide !== undefined;
    const badge = isAuthored
      ? getEdgeBadgePlacement(
          edge.points,
          routeOverride?.badgeT,
          routeOverride?.badgeSide,
        )
      : getSafeEdgeBadgePlacement(
          edge,
          edges.filter((candidate) => candidate.id !== edge.id),
          occupiedBadges,
          obstacles,
        );
    if (!badge) continue;
    badges.set(edge.id, badge);
    occupiedBadges.push(badge.point);
    edge.badge = badge.point;
    edge.badgeT = badge.t;
    edge.badgeSide = badge.side;
  }

  const occupiedLabels: Rect[] = [];
  const labelOrder = edges
    .filter((edge) => edge.label)
    .map((edge, index) => ({ edge, index }))
    .sort((a, b) => {
      const aOverride = routeOverrides[a.edge.id];
      const bOverride = routeOverrides[b.edge.id];
      const aAuthored = Number(
        aOverride?.labelT !== undefined || aOverride?.labelSide !== undefined,
      );
      const bAuthored = Number(
        bOverride?.labelT !== undefined || bOverride?.labelSide !== undefined,
      );
      return bAuthored - aAuthored || a.index - b.index;
    });

  for (const { edge } of labelOrder) {
    const routeOverride = routeOverrides[edge.id];
    const labelPlacement = getEdgeLabelPlacement(
      edge.points,
      edge.label!,
      obstacles,
      badges.get(edge.id),
      routeOverride?.labelT,
      routeOverride?.labelSide,
      edges.filter((candidate) => candidate.id !== edge.id),
      [...badges.values()],
      occupiedLabels,
    );
    edge.labelPoint = labelPlacement?.point;
    edge.labelRect = labelPlacement?.rect;
    edge.labelT = labelPlacement?.t;
    edge.labelSide = labelPlacement?.side;
    if (labelPlacement) occupiedLabels.push(labelPlacement.rect);
  }
}

function getSafeEdgeBadgePlacement(
  edge: RoutedEdge,
  otherEdges: RoutedEdge[],
  occupiedBadges: Point[],
  obstacles: Obstacle[],
): EdgeBadgePlacement | undefined {
  const preferred = getEdgeBadgePlacement(edge.points);
  if (!preferred) return undefined;
  const total = pathLength(edge.points);
  if (!total) return preferred;

  const tStep = Math.min(0.18, Math.max(0.04, CELL * 2 / total));
  const tOffsets = [0, tStep, -tStep, tStep * 2, -tStep * 2];
  const sides: EdgeBadgeSide[] = [preferred.side, oppositeBadgeSide(preferred.side)];
  const segmentMidpoints = pathSegments(edge.points)
    .filter((segment) => segment.len >= MINIMUM_BADGE_RUN)
    .sort((a, b) => b.len - a.len)
    .map((segment) => (segment.start + segment.len / 2) / total);
  const segmentQuarterPoints = pathSegments(edge.points)
    .filter((segment) => segment.len >= MINIMUM_BADGE_RUN)
    .flatMap((segment) => [0.25, 0.75].map(
      (offset) => (segment.start + segment.len * offset) / total,
    ));
  const candidateTs = [...new Set([
    ...tOffsets.map((offset) => clamp01(preferred.t + offset)),
    ...segmentMidpoints,
    ...segmentQuarterPoints,
  ])];
  let best = preferred;
  let bestScore = Infinity;

  for (const t of candidateTs) {
    for (const side of sides) {
      for (const clearance of [6, 18, 30, 46]) {
        const candidate = getEdgeBadgePlacement(
          edge.points,
          t,
          side,
          clearance,
        );
        if (!candidate) continue;
        const score = badgeCollisionScore(
          candidate,
          preferred,
          otherEdges,
          occupiedBadges,
          obstacles,
        ) + (clearance - 6) * 4;
        if (score < bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
    }
  }
  return best;
}

function badgeCollisionScore(
  candidate: EdgeBadgePlacement,
  preferred: EdgeBadgePlacement,
  otherEdges: RoutedEdge[],
  occupiedBadges: Point[],
  obstacles: Obstacle[],
): number {
  let score = Math.abs(candidate.t - preferred.t) * 1_000;
  // Prefer moving along the owning route over flipping sides. A nearby
  // collision-free candidate on the preferred side should win; the very large
  // collision penalties below still force a side flip when that side is
  // blocked everywhere.
  if (candidate.side !== preferred.side) {
    // A side flip at the preferred anchor is still the best escape hatch for
    // a blocked run. Once moving along the route is involved, however, keep
    // the preferred side stable whenever a clear pocket exists there.
    score += Math.abs(candidate.t - preferred.t) < 1e-9 ? 20 : 2_000;
  }

  for (const other of otherEdges) {
    const distance = distanceToPolyline(candidate.point, other.points);
    if (distance < BADGE_CONNECTOR_CLEARANCE) {
      score += 1_000_000 +
        (BADGE_CONNECTOR_CLEARANCE - distance) * 10_000;
    }
  }
  for (const badge of occupiedBadges) {
    const distance = Math.hypot(candidate.point.x - badge.x, candidate.point.y - badge.y);
    if (distance < BADGE_TO_BADGE_CLEARANCE) {
      score += 1_000_000 +
        (BADGE_TO_BADGE_CLEARANCE - distance) * 10_000;
    }
  }
  for (const obstacle of obstacles) {
    if (!circleIntersectsRect(
      candidate.point,
      GRAMMAR.badgeRadius,
      obstacle,
      BADGE_CONTENT_CLEARANCE,
    )) continue;
    score += BADGE_CONTENT_COLLISION_COST +
      (GRAMMAR.badgeRadius + BADGE_CONTENT_CLEARANCE) * 10_000;
  }
  return score;
}

function distanceToPolyline(point: Point, points: Point[]): number {
  return projectPointToPolyline(point, points)?.distance ?? Infinity;
}

function oppositeBadgeSide(side: EdgeBadgeSide): EdgeBadgeSide {
  return side === "top" ? "bottom" : "top";
}

function buildObstacles(layout: LayoutResult): Obstacle[] {
  const out: Obstacle[] = [];
  for (const n of layout.nodes) {
    // Route around the complete resource card, not the icon and label as two
    // independent rectangles. Treating them separately leaves narrow,
    // accidental corridors beside an icon where a connector can turn and run
    // alongside the resource, making both the visual result and hit testing
    // ambiguous.
    out.push({ ...inflate(n.obstacle, 8), id: n.id, kind: "node" });
  }
  for (const g of layout.groups) {
    out.push({ ...headerLabelRect(g), id: g.id, kind: "header" });
  }
  return out;
}

function buildDecorationObstacles(layout: LayoutResult): Obstacle[] {
  const out: Obstacle[] = [];
  for (const node of layout.nodes) {
    out.push({ ...inflate(node.icon, 4), id: node.id, kind: "node" });
    if (node.label.w > 0 && node.label.h > 0) {
      out.push({ ...inflate(node.label, 4), id: node.id, kind: "node" });
    }
  }
  for (const group of layout.groups) {
    out.push({ ...inflate(headerLabelRect(group), 2), id: group.id, kind: "header" });
  }
  return out;
}

function buildGroupBoundaries(layout: LayoutResult): GroupBoundary[] {
  return layout.groups.flatMap((group) => {
    const { x, y, w, h } = group.bounds;
    const style = GROUP_STYLES[group.kind] ?? GROUP_STYLES.logical;
    // Leave enough room for both strokes plus a small visibility gap. Unlike
    // an obstacle rectangle, these segments only reject parallel travel, so
    // a connector may still cross a boundary to enter or leave its group.
    const clearance = (style.strokeWidth + GRAMMAR.edgeStroke) / 2 + 2;
    return [
      { a: { x, y }, b: { x: x + w, y }, clearance },
      { a: { x, y: y + h }, b: { x: x + w, y: y + h }, clearance },
      { a: { x, y }, b: { x, y: y + h }, clearance },
      { a: { x: x + w, y }, b: { x: x + w, y: y + h }, clearance },
    ];
  });
}

function headerLabelRect(group: GroupGeom): Rect {
  if (group.labelRect) return { ...group.labelRect };
  const style = GROUP_STYLES[group.kind] ?? GROUP_STYLES.logical;
  const textW = group.label.length * style.fontSize * 0.62;
  const w = Math.min(group.bounds.w, Math.max(80, style.iconSize + 12 + textW + 12));
  return {
    x: (group.labelPosition ?? "top-left").endsWith("right")
      ? group.bounds.x + group.bounds.w - w
      : group.bounds.x,
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
  sourcePortOffset?: number,
  targetPortOffset?: number,
): PortChoice[] {
  const make = (
    a: Side,
    b: Side,
    ao = 0.5,
    bo = 0.5,
    preferenceCost = 0,
  ): PortChoice => ({
    src: port(source, a, ao),
    tgt: port(target, b, bo),
    srcSide: a,
    tgtSide: b,
    preferenceCost: preferenceCost + portBacktrackCost(source, target, a, b),
  });
  const pairs = geometricSidePairs(source, target, isFailure);
  if (
    sourcePort ||
    targetPort ||
    sourcePortOffset !== undefined ||
    targetPortOffset !== undefined
  ) {
    const fallbackSource = isFailure ? "e" : iconCenter(target).x >= iconCenter(source).x ? "e" : "w";
    const fallbackTarget = isFailure ? "n" : fallbackSource === "e" ? "w" : "e";
    const resolvedSource = sourcePort ?? fallbackSource;
    const resolvedTarget = targetPort ?? fallbackTarget;
    const sourceLocked = sourcePortOffset !== undefined;
    const targetLocked = targetPortOffset !== undefined;
    const preferred: Array<{ pair: [Side, Side]; cost: number }> = [{
      pair: [resolvedSource, resolvedTarget],
      cost: 0,
    }];

    // A face without a fractional offset is an authoring hint, not a command
    // to make a long loop or cross another connector. Exact offsets stay
    // exact because they normally came from a deliberate port drag.
    for (const [geometricSource, geometricTarget] of pairs) {
      const candidateSource = sourceLocked ? resolvedSource : geometricSource;
      const candidateTarget = targetLocked ? resolvedTarget : geometricTarget;
      preferred.push({
        pair: [candidateSource, candidateTarget],
        cost:
          (candidateSource === resolvedSource ? 0 : PORT_SIDE_FALLBACK_COST) +
          (candidateTarget === resolvedTarget ? 0 : PORT_SIDE_FALLBACK_COST),
      });
    }

    const choices = uniquePortChoices(preferred.flatMap(({ pair: [a, b], cost }) =>
      portOffsetVariants(
        a,
        b,
        make,
        cost,
        sourcePortOffset,
        targetPortOffset,
      )
    ));
    return avoidLabelPorts(
      choices,
      source,
      target,
      sourcePortOffset !== undefined,
      targetPortOffset !== undefined,
    );
  }

  const choices = uniquePortChoices(pairs.flatMap(([a, b], index) =>
    portOffsetVariants(a, b, make, index * PORT_SIDE_FALLBACK_COST)
  ));
  return avoidLabelPorts(choices, source, target, false, false);
}

function portBacktrackCost(
  source: NodeGeom,
  target: NodeGeom,
  sourceSide: Side,
  targetSide: Side,
): number {
  const sourceCenter = iconCenter(source);
  const targetCenter = iconCenter(target);
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  const sourceNormal = sideNormal(sourceSide);
  const targetNormal = sideNormal(targetSide);
  const sourceAway = sourceNormal.x * dx + sourceNormal.y * dy < 0;
  const targetAway = targetNormal.x * -dx + targetNormal.y * -dy < 0;
  return (sourceAway ? PORT_BACKTRACK_COST : 0) +
    (targetAway ? PORT_BACKTRACK_COST : 0);
}

function sideNormal(side: Side): Point {
  switch (side) {
    case "n": return { x: 0, y: -1 };
    case "e": return { x: 1, y: 0 };
    case "s": return { x: 0, y: 1 };
    case "w": return { x: -1, y: 0 };
  }
}

function avoidLabelPorts(
  choices: PortChoice[],
  source: NodeGeom,
  target: NodeGeom,
  sourceLocked: boolean,
  targetLocked: boolean,
): PortChoice[] {
  const sourceLabelSide = labelSide(source);
  const targetLabelSide = labelSide(target);
  return choices
    .map((choice) => ({
      ...choice,
      preferenceCost: choice.preferenceCost +
        (!sourceLocked && choice.srcSide === sourceLabelSide ? LABEL_SIDE_FALLBACK_COST : 0) +
        (!targetLocked && choice.tgtSide === targetLabelSide ? LABEL_SIDE_FALLBACK_COST : 0),
    }))
    .sort((a, b) => a.preferenceCost - b.preferenceCost);
}

function labelSide(node: NodeGeom): Side {
  const position = node.labelPosition ?? "bottom";
  if (position === "top") return "n";
  return "s";
}

function geometricSidePairs(
  source: NodeGeom,
  target: NodeGeom,
  isFailure: boolean,
): Array<[Side, Side]> {
  const sc = iconCenter(source);
  const tc = iconCenter(target);
  const dx = tc.x - sc.x;
  const dy = tc.y - sc.y;

  if (isFailure) {
    // Dashed/peer edges still follow the geometric relationship between the
    // resources. Keep the west/east pair first for left-to-right monitoring
    // and dependency links, but offer alternate target faces so converging
    // routes can approach on distinct lanes instead of being stacked on one
    // target-side corridor.
    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx >= 0
        ? [["e", "w"], ["e", "n"], ["e", "e"], ["s", "w"], ["n", "w"]]
        : [["w", "e"], ["w", "n"], ["w", "w"], ["s", "e"], ["n", "e"]];
    }
    return dy >= 0
      ? [["s", "n"], ["e", "w"], ["w", "e"], ["s", "e"], ["s", "w"]]
      : [["n", "s"], ["e", "w"], ["w", "e"], ["n", "e"], ["n", "w"]];
  }

  const sameColumn =
    source.obstacle.x < target.obstacle.x + target.obstacle.w &&
    target.obstacle.x < source.obstacle.x + source.obstacle.w;

  if (sameColumn && Math.abs(dy) > source.icon.h) {
    return [["e", "e"], ["w", "w"], ["e", "w"]];
  }
  if (Math.abs(dy) > Math.abs(dx)) {
    return dy >= 0
      ? [["s", "n"], ["e", "w"], ["s", "w"], ["s", "e"], ["e", "n"]]
      : [["n", "s"], ["e", "w"], ["n", "w"], ["n", "e"], ["e", "s"]];
  }
  if (dx >= 0) {
    return dy < 0
      ? [["e", "w"], ["e", "n"], ["s", "w"], ["e", "e"], ["n", "w"]]
      : [["e", "w"], ["e", "n"], ["s", "w"], ["e", "e"]];
  }
  return dy < 0
    ? [["w", "e"], ["e", "e"], ["n", "w"], ["n", "e"]]
    : [["w", "e"], ["e", "e"], ["n", "w"], ["s", "e"]];
}

function portOffsetVariants(
  sourceSide: Side,
  targetSide: Side,
  make: (
    sourceSide: Side,
    targetSide: Side,
    sourceOffset?: number,
    targetOffset?: number,
    preferenceCost?: number,
  ) => PortChoice,
  baseCost = 0,
  sourceOffset?: number,
  targetOffset?: number,
): PortChoice[] {
  const sourceOffsets = sourceOffset === undefined
    ? [0.5, 0.25, 0.75]
    : [normalizePortOffset(sourceOffset)];
  const targetOffsets = targetOffset === undefined
    ? [0.5, 0.25, 0.75]
    : [normalizePortOffset(targetOffset)];
  const variants: PortChoice[] = [];
  for (const candidateSourceOffset of sourceOffsets) {
    for (const candidateTargetOffset of targetOffsets) {
      const offsetCost =
        (sourceOffset === undefined && candidateSourceOffset !== 0.5
          ? PORT_OFFSET_FALLBACK_COST
          : 0) +
        (targetOffset === undefined && candidateTargetOffset !== 0.5
          ? PORT_OFFSET_FALLBACK_COST
          : 0);
      variants.push(make(
        sourceSide,
        targetSide,
        candidateSourceOffset,
        candidateTargetOffset,
        baseCost + offsetCost,
      ));
    }
  }
  return variants;
}

function uniquePortChoices(choices: PortChoice[]): PortChoice[] {
  const unique = new Map<string, PortChoice>();
  for (const choice of choices) {
    const key = [
      choice.src.x,
      choice.src.y,
      choice.tgt.x,
      choice.tgt.y,
      choice.srcSide,
      choice.tgtSide,
    ].join(":");
    const current = unique.get(key);
    if (!current || choice.preferenceCost < current.preferenceCost) {
      unique.set(key, choice);
    }
  }
  return [...unique.values()].sort((a, b) => a.preferenceCost - b.preferenceCost);
}

function alignNearOpposingPorts(
  choices: PortChoice[],
  source: NodeGeom,
  target: NodeGeom,
  sourceOffsetLocked: boolean,
  targetOffsetLocked: boolean,
): PortChoice[] {
  const aligned = choices.map((choice) => {
    const opposingHorizontalFaces =
      (choice.srcSide === "e" && choice.tgtSide === "w") ||
      (choice.srcSide === "w" && choice.tgtSide === "e");
    if (opposingHorizontalFaces) {
      const delta = Math.abs(choice.src.y - choice.tgt.y);
      if (delta === 0 || delta > MICRO_JOG_THRESHOLD) return choice;

      const commonTop = Math.max(source.icon.y, target.icon.y);
      const commonBottom = Math.min(
        source.icon.y + source.icon.h,
        target.icon.y + target.icon.h,
      );
      const alignedY = sourceOffsetLocked
        ? choice.src.y
        : targetOffsetLocked
          ? choice.tgt.y
          : choice.src.y;
      if (alignedY < commonTop || alignedY > commonBottom) return choice;

      return {
        ...choice,
        src: sourceOffsetLocked ? choice.src : { ...choice.src, y: alignedY },
        tgt: targetOffsetLocked ? choice.tgt : { ...choice.tgt, y: alignedY },
      };
    }

    const opposingVerticalFaces =
      (choice.srcSide === "s" && choice.tgtSide === "n") ||
      (choice.srcSide === "n" && choice.tgtSide === "s");
    if (!opposingVerticalFaces) return choice;

    const delta = Math.abs(choice.src.x - choice.tgt.x);
    if (delta === 0) return choice;

    const commonLeft = Math.max(source.icon.x, target.icon.x);
    const commonRight = Math.min(
      source.icon.x + source.icon.w,
      target.icon.x + target.icon.w,
    );
    const alignedX = sourceOffsetLocked
      ? choice.src.x
      : targetOffsetLocked
        ? choice.tgt.x
        : choice.src.x;
    if (alignedX < commonLeft || alignedX > commonRight) return choice;

    return {
      ...choice,
      src: sourceOffsetLocked ? choice.src : { ...choice.src, x: alignedX },
      tgt: targetOffsetLocked ? choice.tgt : { ...choice.tgt, x: alignedX },
    };
  });
  return uniquePortChoices(aligned);
}

function iconCenter(node: NodeGeom): Point {
  return { x: node.icon.x + node.icon.w / 2, y: node.icon.y + node.icon.h / 2 };
}

function createRouteContext(
  source: NodeGeom,
  target: NodeGeom,
  ports: PortChoice,
  style: EdgeStyle = "solid",
): RouteContext {
  return {
    sourceId: source.id,
    targetId: target.id,
    sourcePoint: ports.src,
    targetPoint: ports.tgt,
    sourceSide: ports.srcSide,
    targetSide: ports.tgtSide,
    style,
  };
}

function port(
  node: NodeGeom,
  side: Side,
  offset = 0.5,
): Point {
  return portPoint(node.icon, side, normalizePortOffset(offset));
}

function snapRouteEndpoints(
  points: Point[],
  source: NodeGeom,
  target: NodeGeom,
): Point[] {
  if (points.length < 2) return points.map((point) => ({ ...point }));
  const next = points.map((point) => ({ ...point }));
  next[0] = nearestPortAnchor(source.icon, next[0]!).point;
  next[next.length - 1] = nearestPortAnchor(target.icon, next.at(-1)!).point;
  return next;
}

function templates(
  ports: PortChoice,
  vGutters: number[],
  hGutters: number[],
  source: NodeGeom,
  target: NodeGeom,
): Point[][] {
  const { src, tgt, srcSide, tgtSide } = ports;
  // Turn only after the connector has cleared the complete resource card.
  // A fixed offset from the icon is not enough for cards with long labels.
  const a = extendFromCard(source, src, srcSide);
  const b = extendFromCard(target, tgt, tgtSide);
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

  const gx = representativeGutters(
    xs,
    a.x,
    b.x,
    MAX_COMBINED_GUTTERS_PER_AXIS,
  );
  const gy = representativeGutters(
    ys,
    a.y,
    b.y,
    MAX_COMBINED_GUTTERS_PER_AXIS,
  );
  for (const x of gx) {
    for (const y of gy) {
      push([a, { x, y: a.y }, { x, y }, { x: b.x, y }, b]);
    }
  }

  return out;
}

function extendFromCard(node: NodeGeom, p: Point, side: Side): Point {
  const card = inflate(node.obstacle, 16);
  switch (side) {
    case "e":
      return { x: snap(Math.max(p.x + 24, card.x + card.w)), y: p.y };
    case "w":
      return { x: snap(Math.min(p.x - 24, card.x)), y: p.y };
    case "s":
      return { x: p.x, y: snap(Math.max(p.y + 24, card.y + card.h)) };
    case "n":
      return { x: p.x, y: snap(Math.min(p.y - 24, card.y)) };
  }
}

function uniqueNums(values: number[]): number[] {
  return [...new Set(values.map((v) => snap(v)))];
}

function representativeGutters(
  values: number[],
  start: number,
  end: number,
  limit: number,
): number[] {
  if (values.length <= limit) return values;

  const chosen = new Set<number>();
  const midpoint = (start + end) / 2;
  const addNearest = (anchor: number) => {
    let nearestIndex = -1;
    let secondIndex = -1;
    let nearestDistance = Infinity;
    let secondDistance = Infinity;
    for (let index = 0; index < values.length; index++) {
      const distance = Math.abs(values[index]! - anchor);
      if (distance < nearestDistance) {
        secondIndex = nearestIndex;
        secondDistance = nearestDistance;
        nearestIndex = index;
        nearestDistance = distance;
      } else if (distance < secondDistance) {
        secondIndex = index;
        secondDistance = distance;
      }
    }
    if (nearestIndex >= 0) chosen.add(values[nearestIndex]!);
    if (secondIndex >= 0) chosen.add(values[secondIndex]!);
  };

  // Corridors close to either attachment or the midpoint produce the shortest
  // useful detours. Keep the two exterior lanes as escape routes around a
  // completely blocked interval.
  addNearest(start);
  addNearest(end);
  addNearest(midpoint);
  chosen.add(values[0]!);
  chosen.add(values.at(-1)!);

  if (chosen.size < limit) {
    const low = Math.min(start, end);
    const high = Math.max(start, end);
    const remaining = values
      .map((value, index) => ({
        value,
        index,
        outsideDistance: value < low ? low - value : value > high ? value - high : 0,
        midpointDistance: Math.abs(value - midpoint),
      }))
      .sort((a, b) =>
        a.outsideDistance - b.outsideDistance ||
        a.midpointDistance - b.midpointDistance ||
        a.index - b.index
      );
    for (const candidate of remaining) {
      chosen.add(candidate.value);
      if (chosen.size >= limit) break;
    }
  }

  // Preserve the original gutter order so equal-scoring routes remain stable.
  return values.filter((value) => chosen.has(value)).slice(0, limit);
}

function corridorGutters(
  existing: ExistingRoute[],
  axis: "vertical" | "horizontal",
): number[] {
  const lanes: number[] = [];
  for (const route of existing) {
    const path = route.points;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i]!;
      const b = path[i + 1]!;
      if (axis === "vertical" && a.x === b.x) {
        lanes.push(a.x - CELL * 2, a.x + CELL * 2);
      }
      if (axis === "horizontal" && a.y === b.y) {
        lanes.push(a.y - CELL * 2, a.y + CELL * 2);
      }
    }
  }
  return uniqueNums(lanes);
}

function scorePath(
  points: Point[],
  obstacles: Obstacle[],
  context: RouteContext,
  existing: ExistingRoute[],
  scoreCeiling = Infinity,
  boundaries: GroupBoundary[] = [],
): number {
  if (points.length < 2) return Infinity;
  if (
    samePoint(points[0]!, context.sourcePoint) &&
    !followsAttachmentDirection(points[0]!, points[1]!, context.sourceSide)
  ) return Infinity;
  if (
    samePoint(points.at(-1)!, context.targetPoint) &&
    !followsAttachmentDirection(points.at(-1)!, points.at(-2)!, context.targetSide)
  ) return Infinity;
  let score = (points.length - 2) * BEND_COST + pathLength(points);
  const manhattan =
    Math.abs(points[0]!.x - points[points.length - 1]!.x) +
    Math.abs(points[0]!.y - points[points.length - 1]!.y);
  score += Math.max(0, pathLength(points) - manhattan) * 3;
  if (score >= scoreCeiling) return score;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (a.x !== b.x && a.y !== b.y) return Infinity;
    const isFirst = i === 0;
    const isLast = i === points.length - 2;
    for (const obs of obstacles) {
      // Only the short attachment segment may enter its own complete card.
      if (
        obs.kind === "node" &&
        obs.id === context.sourceId &&
        isFirst &&
        samePoint(a, context.sourcePoint)
      ) continue;
      if (
        obs.kind === "node" &&
        obs.id === context.targetId &&
        isLast &&
        samePoint(b, context.targetPoint)
      ) continue;
      if (!segmentHits(a, b, obs)) continue;
      // Visible content is a hard obstacle. A crowded connector may cross
      // another connector as a last resort, but it must never disappear
      // through an icon, service label, or boundary heading.
      return Infinity;
    }
    for (const boundary of boundaries) {
      const overlap = boundaryParallelOverlapLength(a, b, boundary);
      if (!overlap) continue;
      score += groupBoundaryConflictCost(overlap);
      if (score >= scoreCeiling) return score;
    }
    for (const other of existing) {
      const overlap = overlapLength(a, b, other.points);
      if (overlap) {
        // Every connector represents a distinct relationship. Even edges that
        // fan out from the same resource must claim separate attachment lanes
        // so neither direction nor arrow ownership becomes ambiguous.
        return Infinity;
      }
      for (let j = 0; j < other.points.length - 1; j++) {
        const c = other.points[j]!;
        const d = other.points[j + 1]!;
        const intersection = segmentIntersectionKind(a, b, c, d);
        if (intersection === "cross") score += CROSSING_COST;
        if (intersection === "touch") score += JUNCTION_COST;
        score += nearParallelLength(a, b, c, d, MIN_CONNECTOR_GAP) * NEAR_PARALLEL_COST;
        if (score >= scoreCeiling) return score;
      }
    }
  }
  for (const other of existing) {
    const endpointCollision =
      samePoint(points[0]!, other.points.at(-1)!) ||
      samePoint(points.at(-1)!, other.points[0]!) ||
      samePoint(points.at(-1)!, other.points.at(-1)!) ||
      samePoint(points[0]!, other.points[0]!);
    if (endpointCollision) {
      return Infinity;
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

function segmentIntersectionKind(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
): "cross" | "touch" | null {
  const firstVertical = a.x === b.x;
  const secondVertical = c.x === d.x;
  if (firstVertical === secondVertical) return null;

  const verticalA = firstVertical ? a : c;
  const verticalB = firstVertical ? b : d;
  const horizontalA = firstVertical ? c : a;
  const horizontalB = firstVertical ? d : b;
  const x = verticalA.x;
  const y = horizontalA.y;
  const onVertical = y >= Math.min(verticalA.y, verticalB.y) &&
    y <= Math.max(verticalA.y, verticalB.y);
  const onHorizontal = x >= Math.min(horizontalA.x, horizontalB.x) &&
    x <= Math.max(horizontalA.x, horizontalB.x);
  if (!onVertical || !onHorizontal) return null;

  const insideVertical = y > Math.min(verticalA.y, verticalB.y) &&
    y < Math.max(verticalA.y, verticalB.y);
  const insideHorizontal = x > Math.min(horizontalA.x, horizontalB.x) &&
    x < Math.max(horizontalA.x, horizontalB.x);
  return insideVertical && insideHorizontal ? "cross" : "touch";
}

function nearParallelLength(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
  clearance: number,
): number {
  if (a.x === b.x && c.x === d.x) {
    const gap = Math.abs(a.x - c.x);
    if (gap === 0 || gap >= clearance) return 0;
    return intervalOverlap(a.y, b.y, c.y, d.y);
  }
  if (a.y === b.y && c.y === d.y) {
    const gap = Math.abs(a.y - c.y);
    if (gap === 0 || gap >= clearance) return 0;
    return intervalOverlap(a.x, b.x, c.x, d.x);
  }
  return 0;
}

function boundaryParallelOverlapLength(
  a: Point,
  b: Point,
  boundary: GroupBoundary,
): number {
  const { a: c, b: d, clearance } = boundary;
  if (a.x === b.x && c.x === d.x) {
    if (Math.abs(a.x - c.x) >= clearance) return 0;
    return intervalOverlap(a.y, b.y, c.y, d.y);
  }
  if (a.y === b.y && c.y === d.y) {
    if (Math.abs(a.y - c.y) >= clearance) return 0;
    return intervalOverlap(a.x, b.x, c.x, d.x);
  }
  return 0;
}

function groupBoundaryConflictCost(overlap: number): number {
  // Sharing even a short run makes the connector disappear into solid or
  // dashed boundary paint. Treat it as unavailable rather than a soft visual
  // preference; perpendicular boundary crossings remain unaffected.
  return overlap > 0 ? Infinity : 0;
}

function nudgePathOffBoundaries(
  points: Point[],
  boundaries: GroupBoundary[],
  obstacles: Obstacle[],
  context: RouteContext,
  existing: ExistingRoute[],
): Point[] {
  let path = simplify(points);
  for (let pass = 0; pass < boundaries.length; pass++) {
    let changed = false;
    for (let index = 1; index < path.length - 2; index++) {
      const a = path[index]!;
      const b = path[index + 1]!;
      const conflicts = boundaries.filter(
        (boundary) => boundaryParallelOverlapLength(a, b, boundary) > 0,
      );
      if (!conflicts.length) continue;

      const candidates: Point[][] = [];
      for (const boundary of conflicts) {
        const horizontal = a.y === b.y && boundary.a.y === boundary.b.y;
        const coordinate = horizontal ? boundary.a.y : boundary.a.x;
        const clearance = boundary.clearance + 1;
        for (const direction of [-1, 1]) {
          const candidate = path.map((point) => ({ ...point }));
          const shifted = coordinate + direction * clearance;
          if (horizontal) {
            candidate[index]!.y = shifted;
            candidate[index + 1]!.y = shifted;
          } else {
            candidate[index]!.x = shifted;
            candidate[index + 1]!.x = shifted;
          }
          candidates.push(simplify(candidate));
        }
      }

      let best: Point[] | null = null;
      let bestScore = Infinity;
      const baselineScore = scorePath(path, obstacles, context, existing);
      // Existing diagrams may already contain a reviewed crossing or shared
      // corridor. Do not turn a local visibility correction into a global
      // reroute or silently exchange one reviewed conflict for another.
      if (!Number.isFinite(baselineScore) || pathHasRouteIntersection(path, existing)) continue;
      for (const candidate of candidates) {
        const conflictScore = scorePath(candidate, obstacles, context, existing);
        // A cosmetic clearance correction must not buy visibility by adding a
        // resource collision, connector overlap, or crossing. Small changes
        // in path length are expected when the adjacent legs are adjusted.
        if (conflictScore > baselineScore + CELL * 2) continue;
        const score = scorePath(
          candidate,
          obstacles,
          context,
          existing,
          bestScore,
          boundaries,
        );
        if (score < bestScore) {
          best = candidate;
          bestScore = score;
        }
      }
      if (!best) continue;
      path = best;
      changed = true;
      break;
    }
    if (!changed) break;
  }
  return path;
}

function pathHasRouteIntersection(
  points: Point[],
  existing: ExistingRoute[],
): boolean {
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index]!;
    const b = points[index + 1]!;
    for (const route of existing) {
      if (overlapLength(a, b, route.points) > 0) return true;
      for (let otherIndex = 0; otherIndex < route.points.length - 1; otherIndex++) {
        if (
          segmentIntersectionKind(
            a,
            b,
            route.points[otherIndex]!,
            route.points[otherIndex + 1]!,
          ) !== null
        ) return true;
      }
    }
  }
  return false;
}

function intervalOverlap(a: number, b: number, c: number, d: number): number {
  return Math.max(
    0,
    Math.min(Math.max(a, b), Math.max(c, d)) -
      Math.max(Math.min(a, b), Math.min(c, d)),
  );
}

function shortcut(
  points: Point[],
  obstacles: Obstacle[],
  context: RouteContext,
  existing: ExistingRoute[] = [],
  boundaries: GroupBoundary[] = [],
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
          if (!pathClear(next, obstacles, context, existing, boundaries)) continue;
          const candidate = simplify([...path.slice(0, i), ...next, ...path.slice(j + 1)]);
          if (
            scorePath(candidate, obstacles, context, existing, Infinity, boundaries) >
            scorePath(path, obstacles, context, existing, Infinity, boundaries)
          ) continue;
          path = candidate;
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
  context: RouteContext,
  existing: ExistingRoute[] = [],
  boundaries: GroupBoundary[] = [],
): boolean {
  return scorePath(points, obstacles, context, existing, Infinity, boundaries) < HEADER_COST;
}

function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

function followsAttachmentDirection(
  from: Point,
  to: Point,
  side: Side,
): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (side === "e") return dx > 0 && dy === 0;
  if (side === "w") return dx < 0 && dy === 0;
  if (side === "s") return dy > 0 && dx === 0;
  return dy < 0 && dx === 0;
}

function routeAStar(
  grid: Grid,
  ports: PortChoice,
  source: NodeGeom,
  target: NodeGeom,
  existing: ExistingRoute[],
  conflictCostCache?: Map<number, number>,
): Point[] | null {
  const start = stepOut(source, ports.src, ports.srcSide);
  const goal = stepOut(target, ports.tgt, ports.tgtSide);
  const mid = astar(grid, start, goal, existing, conflictCostCache);
  if (!mid) return null;
  return [ports.src, ...mid, ports.tgt];
}

function stepOut(node: NodeGeom, p: Point, side: Side): Point {
  // Leave one complete free grid cell beyond the inflated resource obstacle.
  // Two cells can still round into the blocked perimeter when a label/card
  // edge sits between grid coordinates, trapping A* at its start or goal.
  const gap = CELL * 3;
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

function astar(
  grid: Grid,
  start: Point,
  goal: Point,
  existing: ExistingRoute[],
  conflictCostCache?: Map<number, number>,
): Point[] | null {
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
      const currentPoint = cellToWorld(grid, c, r);
      const nextPoint = cellToWorld(grid, nc, nr);
      const segmentKey = Math.min(current, ni) * size + Math.max(current, ni);
      let conflictCost = conflictCostCache?.get(segmentKey);
      if (conflictCost === undefined) {
        conflictCost = segmentRouteConflictCost(currentPoint, nextPoint, existing);
        conflictCostCache?.set(segmentKey, conflictCost);
      }
      const tentative = gScore[current] + CELL + (turned ? TURN_COST : 0) +
        conflictCost;
      if (tentative >= gScore[ni]) continue;
      came[ni] = current;
      gScore[ni] = tentative;
      heap.push(ni, tentative + heuristic(nc, nr, gc.c, gc.r));
    }
  }
  return null;
}

function segmentRouteConflictCost(
  a: Point,
  b: Point,
  existing: ExistingRoute[],
): number {
  let cost = 0;
  for (const route of existing) {
    for (let i = 0; i < route.points.length - 1; i++) {
      const c = route.points[i]!;
      const d = route.points[i + 1]!;
      const overlap = overlapLength(a, b, [c, d]);
      cost += overlap * OVERLAP_COST;
      const intersection = segmentIntersectionKind(a, b, c, d);
      if (intersection === "cross") cost += CROSSING_COST;
      if (intersection === "touch") cost += JUNCTION_COST;
      cost += nearParallelLength(a, b, c, d, MIN_CONNECTOR_GAP) * NEAR_PARALLEL_COST;
    }
  }
  return cost;
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

/**
 * Remove any loop, retraced corridor, or spur from an orthogonal connector.
 * A non-adjacent segment intersection means the route reaches the same point
 * twice; keeping the enclosed section can only create a visual dead end.
 */
export function eraseOrthogonalRouteLoops(
  points: Point[],
  preserveCollinearBreaks = false,
): Point[] {
  let out = normalizeOrthogonalRoute(points);
  if (!preserveCollinearBreaks) out = simplify(out);
  let changed = true;
  while (changed && out.length > 2) {
    changed = false;
    const currentLength = pathLength(out);
    outer: for (let first = 0; first < out.length - 1; first++) {
      for (let second = first + 2; second < out.length - 1; second++) {
        const intersections = orthogonalSegmentIntersections(
          out[first]!,
          out[first + 1]!,
          out[second]!,
          out[second + 1]!,
        );
        for (const intersection of intersections) {
          const candidate = simplify([
            ...out.slice(0, first + 1),
            intersection,
            ...out.slice(second + 1),
          ]);
          if (candidate.length < 2 || pathLength(candidate) >= currentLength) continue;
          out = candidate;
          changed = true;
          break outer;
        }
      }
    }
  }
  return out.map((point) => ({ ...point }));
}

function orthogonalSegmentIntersections(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
): Point[] {
  const firstVertical = a.x === b.x;
  const secondVertical = c.x === d.x;
  if (firstVertical && secondVertical) {
    if (a.x !== c.x) return [];
    const low = Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y));
    const high = Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y));
    if (low > high) return [];
    return low === high
      ? [{ x: a.x, y: low }]
      : [{ x: a.x, y: low }, { x: a.x, y: high }];
  }
  if (!firstVertical && !secondVertical) {
    if (a.y !== c.y) return [];
    const low = Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x));
    const high = Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x));
    if (low > high) return [];
    return low === high
      ? [{ x: low, y: a.y }]
      : [{ x: low, y: a.y }, { x: high, y: a.y }];
  }

  const verticalA = firstVertical ? a : c;
  const verticalB = firstVertical ? b : d;
  const horizontalA = firstVertical ? c : a;
  const horizontalB = firstVertical ? d : b;
  const point = { x: verticalA.x, y: horizontalA.y };
  return point.y >= Math.min(verticalA.y, verticalB.y) &&
    point.y <= Math.max(verticalA.y, verticalB.y) &&
    point.x >= Math.min(horizontalA.x, horizontalB.x) &&
    point.x <= Math.max(horizontalA.x, horizontalB.x)
    ? [point]
    : [];
}

/**
 * Keep user-authored connector breakpoints orthogonal. Manual turn-point
 * drags are intentionally permissive, but a diagonal segment would make the
 * diagram inconsistent with the AWS-style connector language and impossible
 * to edit with the segment handles. Preserve collinear authored points so a
 * user can add a breakpoint without having it disappear during normalization.
 */
export function normalizeOrthogonalRoute(points: Point[]): Point[] {
  const clean = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (clean.length <= 1) return clean.map((point) => ({ ...point }));

  const out: Point[] = [{ ...clean[0]! }];
  for (const target of clean.slice(1)) {
    const previous = out.at(-1)!;
    if (samePoint(previous, target)) continue;
    if (previous.x === target.x || previous.y === target.y) {
      out.push({ ...target });
      continue;
    }

    const prior = out.length > 1 ? out.at(-2)! : undefined;
    const previousDirection = prior
      ? prior.x === previous.x
        ? "vertical"
        : prior.y === previous.y
          ? "horizontal"
          : undefined
      : undefined;
    const horizontalFirst = previousDirection
      ? previousDirection === "horizontal"
      : Math.abs(target.x - previous.x) >= Math.abs(target.y - previous.y);
    const elbow = horizontalFirst
      ? { x: target.x, y: previous.y }
      : { x: previous.x, y: target.y };
    if (!samePoint(previous, elbow) && !samePoint(elbow, target)) out.push(elbow);
    out.push({ ...target });
  }
  return out;
}

/**
 * Remove sub-pixel straight-through fragments created when a snapped manual
 * leg meets a fractional icon port. Meaningful authored breakpoints are kept;
 * only a redundant middle point touching a tiny segment is collapsed.
 */
export function collapseOrthogonalRouteArtifacts(
  points: Point[],
  minimumSegmentLength = 2,
): Point[] {
  const out = normalizeOrthogonalRoute(points).map((point) => ({ ...point }));
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 1; index < out.length - 1; index++) {
      const previous = out[index - 1]!;
      const current = out[index]!;
      const next = out[index + 1]!;
      const collinear =
        (previous.x === current.x && current.x === next.x) ||
        (previous.y === current.y && current.y === next.y);
      const touchesTinySegment =
        pathLength([previous, current]) <= minimumSegmentLength ||
        pathLength([current, next]) <= minimumSegmentLength;
      if (!collinear || !touchesTinySegment) continue;
      out.splice(index, 1);
      changed = true;
      break;
    }
  }
  return eraseOrthogonalRouteLoops(out, true);
}

export interface EdgeBadgePlacement {
  point: Point;
  anchor: Point;
  t: number;
  side: EdgeBadgeSide;
  segmentIndex: number;
  tangent: Point;
}

export interface EdgeLabelPlacement {
  point: Point;
  rect: Rect;
  anchor: Point;
  t: number;
  side: EdgeLabelSide;
  segmentIndex: number;
  tangent: Point;
}

export interface PolylineProjection {
  point: Point;
  t: number;
  segmentIndex: number;
  distance: number;
  tangent: Point;
}

/**
 * Return the nearest point on an orthogonal connector and its normalized path
 * position. The editor uses this for precise badge dragging and hit feedback.
 */
export function projectPointToPolyline(
  point: Point,
  points: Point[],
): PolylineProjection | undefined {
  const segments = pathSegments(points);
  if (!segments.length) return undefined;
  const total = segments.reduce((sum, segment) => sum + segment.len, 0);
  if (!total) return undefined;

  let best: PolylineProjection | undefined;
  let travelled = 0;
  for (const segment of segments) {
    const dx = segment.b.x - segment.a.x;
    const dy = segment.b.y - segment.a.y;
    const u = Math.max(
      0,
      Math.min(1, ((point.x - segment.a.x) * dx + (point.y - segment.a.y) * dy) / (segment.len * segment.len)),
    );
    const projected = {
      x: segment.a.x + dx * u,
      y: segment.a.y + dy * u,
    };
    const distance = Math.hypot(point.x - projected.x, point.y - projected.y);
    if (!best || distance < best.distance) {
      best = {
        point: projected,
        t: (travelled + segment.len * u) / total,
        segmentIndex: segment.index,
        distance,
        tangent: { x: dx / segment.len, y: dy / segment.len },
      };
    }
    travelled += segment.len;
  }
  return best;
}

/**
 * Place a numbered edge badge at a stable, fixed offset from an orthogonal
 * path. Horizontal runs remain centered. For vertical runs, the default
 * position is biased toward the target so badges do not crowd the preceding
 * service label. Tiny connector fragments are ignored when choosing the run.
 */
export function getEdgeBadgePlacement(
  points: Point[],
  requestedT?: number,
  requestedSide: EdgeBadgeSide = "top",
  clearance = 6,
): EdgeBadgePlacement | undefined {
  const segments = pathSegments(points);
  if (!segments.length) return undefined;
  const total = segments.reduce((sum, segment) => sum + segment.len, 0);
  if (!total) return undefined;

  const horizontal = segments
    .filter((segment) => segment.a.y === segment.b.y)
    .sort((a, b) => b.len - a.len)[0];
  const vertical = segments
    .filter((segment) => segment.a.x === segment.b.x)
    .sort((a, b) => b.len - a.len)[0];
  const preferred = horizontal && horizontal.len >= MINIMUM_BADGE_RUN
    ? horizontal
    : vertical ?? horizontal ?? [...segments].sort((a, b) => b.len - a.len)[0];
  const verticalRun = preferred?.a.x === preferred?.b.x;
  const fallbackT = preferred
    ? (preferred.start + preferred.len * (verticalRun ? VERTICAL_BADGE_TARGET_T : 0.5)) / total
    : 0.5;
  const t = clamp01(requestedT ?? fallbackT);
  const projection = pointAtPath(segments, total, t);
  if (!projection) return undefined;

  const topNormal = Math.abs(projection.tangent.x) >= Math.abs(projection.tangent.y)
    ? { x: 0, y: -1 }
    : { x: -1, y: 0 };
  const normal = requestedSide === "top"
    ? topNormal
    : { x: -topNormal.x, y: -topNormal.y };
  const offset = GRAMMAR.badgeRadius + clearance;
  return {
    point: {
      x: projection.point.x + normal.x * offset,
      y: projection.point.y + normal.y * offset,
    },
    anchor: projection.point,
    t,
    side: requestedSide,
    segmentIndex: projection.segmentIndex,
    tangent: projection.tangent,
  };
}

/**
 * Place a connector label at an explicit route-relative position. The editor
 * uses this while dragging so the label follows the pointer immediately,
 * before the full document is recompiled.
 */
export function getEdgeLabelPlacementOnPath(
  points: Point[],
  label: string,
  requestedT: number,
  requestedSide: EdgeLabelSide,
): EdgeLabelPlacement | undefined {
  return getEdgeLabelPlacement(points, label, [], undefined, requestedT, requestedSide);
}

function getEdgeLabelPlacement(
  points: Point[],
  label: string,
  obstacles: Obstacle[],
  badge?: EdgeBadgePlacement,
  requestedT?: number,
  requestedSide?: EdgeLabelSide,
  otherEdges: RoutedEdge[] = [],
  allBadges: EdgeBadgePlacement[] = badge ? [badge] : [],
  occupiedLabels: Rect[] = [],
): EdgeLabelPlacement | undefined {
  const reference = badge ?? getEdgeBadgePlacement(points);
  if (!reference) return undefined;
  const textW = Math.max(16, label.length * 11 * 0.55);
  const segments = pathSegments(points);
  const total = segments.reduce((sum, segment) => sum + segment.len, 0);
  if (!total) return undefined;
  const horizontal = Math.abs(reference.tangent.x) >= Math.abs(reference.tangent.y);
  const fallbackSide: EdgeLabelSide = badge
    ? oppositeLabelSide(badge.side)
    : horizontal
      ? "top"
      : "bottom";
  const t = clamp01(requestedT ?? reference.t);
  const projection = pointAtPath(segments, total, t);
  if (!projection) return undefined;

  // Once a user chooses a label position, respect that exact route-relative
  // position. Auto-placement still tries nearby clearances, but manual label
  // movement must not silently jump to another side or another segment.
  if (requestedT !== undefined || requestedSide !== undefined) {
    return labelPlacementAt(
      projection,
      textW,
      requestedSide ?? fallbackSide,
      t,
    );
  }

  const preferredSide: EdgeLabelSide = badge
    ? oppositeLabelSide(badge.side)
    : fallbackSide;
  const tStep = Math.min(0.18, Math.max(0.04, CELL * 2 / total));
  const usefulSegments = [...segments]
    .filter((segment) => segment.len >= Math.max(MINIMUM_BADGE_RUN, textW / 2))
    .sort((a, b) => b.len - a.len || a.index - b.index);
  // Probe long runs densely enough to find a nearby clear pocket before
  // increasing the perpendicular clearance and visually detaching the label.
  const candidateTs = [...new Set([
    t,
    clamp01(t + tStep),
    clamp01(t - tStep),
    clamp01(t + tStep * 2),
    clamp01(t - tStep * 2),
    ...usefulSegments.flatMap((segment) => [
      0.5,
      0.25,
      0.75,
      0.125,
      0.375,
      0.625,
      0.875,
    ].map((offset) => (segment.start + segment.len * offset) / total)),
  ])];
  const candidates: EdgeLabelPlacement[] = [];

  for (const candidateT of candidateTs) {
    const candidateProjection = pointAtPath(segments, total, candidateT);
    if (!candidateProjection) continue;
    const candidateHorizontal =
      Math.abs(candidateProjection.tangent.x) >= Math.abs(candidateProjection.tangent.y);
    const firstSide = candidateT === t
      ? preferredSide
      : candidateHorizontal
        ? "top"
        : preferredSide;
    const sides: EdgeLabelSide[] = [firstSide, oppositeLabelSide(firstSide)];
    for (const side of sides) {
      const baseClearance = candidateHorizontal
        ? side === "top" ? 8 : 20
        : textW / 2 + 12;
      // A connector label should remain visually attached to its line. Prefer
      // another point along the route over pushing the copy into a remote,
      // seemingly unrelated lane.
      for (const extra of [0, 16, 32]) {
        candidates.push(labelPlacementAt(
          candidateProjection,
          textW,
          side,
          candidateT,
          baseClearance + extra,
        ));
      }
    }
  }

  let best = candidates[0];
  let bestScore = Infinity;
  for (const candidate of candidates) {
    const score = labelCollisionScore(
      candidate,
      t,
      preferredSide,
      obstacles,
      otherEdges,
      allBadges,
      occupiedLabels,
    );
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function labelCollisionScore(
  candidate: EdgeLabelPlacement,
  preferredT: number,
  preferredSide: EdgeLabelSide,
  obstacles: Obstacle[],
  otherEdges: RoutedEdge[],
  badges: EdgeBadgePlacement[],
  occupiedLabels: Rect[],
): number {
  let score = Math.abs(candidate.t - preferredT) * 1_000;
  if (candidate.side !== preferredSide) score += 20;
  score += Math.hypot(
    candidate.point.x - candidate.anchor.x,
    candidate.point.y - candidate.anchor.y,
  ) * 40;

  for (const obstacle of obstacles) {
    if (rectsIntersect(candidate.rect, obstacle, LABEL_CONTENT_CLEARANCE)) {
      score += LABEL_COLLISION_COST;
    }
  }
  for (const badge of badges) {
    if (circleIntersectsRect(
      badge.point,
      GRAMMAR.badgeRadius,
      candidate.rect,
      LABEL_CONTENT_CLEARANCE,
    )) {
      score += LABEL_COLLISION_COST;
    }
  }
  for (const label of occupiedLabels) {
    if (rectsIntersect(candidate.rect, label, LABEL_TO_LABEL_CLEARANCE)) {
      score += LABEL_COLLISION_COST;
    }
  }
  const inflatedLabel = inflate(candidate.rect, LABEL_TO_CONNECTOR_CLEARANCE);
  for (const edge of otherEdges) {
    for (let index = 0; index < edge.points.length - 1; index++) {
      if (segmentHits(edge.points[index]!, edge.points[index + 1]!, inflatedLabel)) {
        // Crossing copy is a soft placement cost. Keep it below the cost of
        // pushing a label another clearance lane away: a nearby opposite-side
        // placement (or, as a last resort, a crossing) still reads as attached
        // to its owning connector instead of appearing to label another one.
        score += 600;
        break;
      }
    }
  }
  return score;
}

function labelPlacementAt(
  projection: { point: Point; segmentIndex: number; tangent: Point },
  textW: number,
  side: EdgeLabelSide,
  t: number,
  clearance?: number,
): EdgeLabelPlacement {
  const horizontal = Math.abs(projection.tangent.x) >= Math.abs(projection.tangent.y);
  const distance = clearance ?? (horizontal
    ? side === "top" ? 8 : 20
    : textW / 2 + 12);
  const signedDistance = side === "top" ? -distance : distance;
  const point = horizontal
    ? { x: projection.point.x, y: projection.point.y + signedDistance }
    : { x: projection.point.x + signedDistance, y: projection.point.y + 4 };
  return {
    point,
    rect: { x: point.x - textW / 2, y: point.y - 11, w: textW, h: 14 },
    anchor: projection.point,
    t,
    side,
    segmentIndex: projection.segmentIndex,
    tangent: projection.tangent,
  };
}

function oppositeLabelSide(side: EdgeLabelSide): EdgeLabelSide {
  return side === "top" ? "bottom" : "top";
}

function rectsIntersect(a: Rect, b: Rect, margin: number): boolean {
  return !(
    a.x + a.w + margin <= b.x ||
    b.x + b.w + margin <= a.x ||
    a.y + a.h + margin <= b.y ||
    b.y + b.h + margin <= a.y
  );
}

function circleIntersectsRect(center: Point, radius: number, rect: Rect, margin: number): boolean {
  const x = Math.max(rect.x, Math.min(center.x, rect.x + rect.w));
  const y = Math.max(rect.y, Math.min(center.y, rect.y + rect.h));
  return Math.hypot(center.x - x, center.y - y) < radius + margin;
}

function pathSegments(points: Point[]) {
  const segments: Array<{ a: Point; b: Point; len: number; index: number; start: number }> = [];
  let start = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > 0) segments.push({ a, b, len, index: i, start });
    start += len;
  }
  return segments;
}

function pointAtPath(
  segments: Array<{ a: Point; b: Point; len: number; index: number; start: number }>,
  total: number,
  t: number,
): { point: Point; segmentIndex: number; tangent: Point } | undefined {
  const distance = total * t;
  const segment = segments.find((candidate) => distance <= candidate.start + candidate.len)
    ?? segments.at(-1);
  if (!segment) return undefined;
  const u = Math.max(0, Math.min(1, (distance - segment.start) / segment.len));
  const dx = segment.b.x - segment.a.x;
  const dy = segment.b.y - segment.a.y;
  return {
    point: { x: segment.a.x + dx * u, y: segment.a.y + dy * u },
    segmentIndex: segment.index,
    tangent: { x: dx / segment.len, y: dy / segment.len },
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
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
  sourcePortOffset?: number;
  targetPortOffset?: number;
  waypoints?: Point[];
  kind?: EdgeKind;
  style?: EdgeStyle;
}

export function routeEdgePreview(
  doc: DiagramDocument,
  layout: LayoutResult,
  edgeId: string,
  options: RoutePreviewOptions = {},
): Point[] | null {
  const edge = doc.edges.find((candidate) => candidate.id === edgeId);
  if (!edge) return null;

  // Preview through the same ordered, edge-aware routing pass used after the
  // document mutation. A standalone connection route can choose a different
  // corridor because it cannot see paths claimed by earlier edges, making the
  // snapped preview jump somewhere else on pointerup.
  const previewDoc = structuredClone(doc);
  const previewEdge = previewDoc.edges.find((candidate) => candidate.id === edgeId)!;
  if (options.source !== undefined) previewEdge.source = options.source;
  if (options.target !== undefined) previewEdge.target = options.target;
  if (options.sourcePort !== undefined) previewEdge.sourcePort = options.sourcePort;
  if (options.targetPort !== undefined) previewEdge.targetPort = options.targetPort;
  if (options.sourcePortOffset !== undefined) {
    previewEdge.sourcePortOffset = normalizePortOffset(options.sourcePortOffset);
  }
  if (options.targetPortOffset !== undefined) {
    previewEdge.targetPortOffset = normalizePortOffset(options.targetPortOffset);
  }
  if (options.kind !== undefined) previewEdge.kind = options.kind;
  if (options.style !== undefined) previewEdge.style = options.style;

  const previewView = getDefaultView(previewDoc);
  if (options.waypoints?.length) {
    previewView.routes[edgeId] = {
      pin: true,
      mode: "manual",
      waypoints: options.waypoints.map((point) => ({ ...point })),
    };
  } else {
    delete previewView.routes[edgeId];
  }

  return routeEdges(previewDoc, layout).find((candidate) => candidate.id === edgeId)?.points ?? null;
}

export function routeConnectionPreview(
  doc: DiagramDocument,
  layout: LayoutResult,
  sourceId: string,
  targetId: string,
  options: RoutePreviewOptions = {},
): Point[] | null {
  const nodeMap = new Map(layout.nodes.map((n) => [n.id, n]));
  const source = nodeMap.get(sourceId);
  const target = nodeMap.get(targetId);
  if (!source || !target) return null;

  const obstacles = buildObstacles(layout);
  const boundaries = buildGroupBoundaries(layout);
  const vGutters = verticalGutters(layout, obstacles);
  const hGutters = horizontalGutters(layout, obstacles);
  const grid = buildGrid(layout, obstacles);
  const isFailure = options.kind === "fail" || options.style === "dashed";
  const ports = alignNearOpposingPorts(
    candidatePorts(
      source,
      target,
      isFailure,
      options.sourcePort,
      options.targetPort,
      options.sourcePortOffset,
      options.targetPortOffset,
    ),
    source,
    target,
    options.sourcePortOffset !== undefined,
    options.targetPortOffset !== undefined,
  );

  let best: Point[] | null = null;
  let bestScore = Infinity;
  let bestPort = ports[0]!;
  for (const port of ports) {
    const context = createRouteContext(source, target, port, options.style);
    for (const candidate of templates(port, vGutters, hGutters, source, target)) {
      const path = simplify(candidate);
      const s = scorePath(path, obstacles, context, []) + port.preferenceCost;
      if (s < bestScore) {
        bestScore = s;
        best = path;
        bestPort = port;
      }
    }
  }
  if (!best || bestScore >= CROSSING_COST) {
    for (const port of ports) {
      const context = createRouteContext(source, target, port, options.style);
      const astarPath = routeAStar(grid, port, source, target, []);
      if (!astarPath) continue;
      const smoothed = shortcut(simplify(astarPath), obstacles, context);
      const s = scorePath(smoothed, obstacles, context, []) + port.preferenceCost;
      if (s < bestScore) {
        bestScore = s;
        best = smoothed;
        bestPort = port;
      }
    }
  }

  if (!best) {
    for (const port of representativePortChoices(ports, 8)) {
      const context = createRouteContext(source, target, port, options.style);
      const candidate = perimeterFallback(
        layout,
        source,
        target,
        port,
        obstacles,
        context,
        [],
      );
      if (!candidate) continue;
      const score = scorePath(candidate, obstacles, context, []) + port.preferenceCost;
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
        bestPort = port;
      }
    }
  }
  if (!best) return null;
  let points = best;
  const context = createRouteContext(source, target, bestPort, options.style);
  points = shortcut(points, obstacles, context);
  points = simplify(points);
  if (options.waypoints?.length) {
    points = normalizeOrthogonalRoute([points[0]!, ...options.waypoints, points.at(-1)!]);
  } else {
    points = nudgePathOffBoundaries(points, boundaries, obstacles, context, []);
  }
  points = normalizeOrthogonalRoute(points);
  return points;
}

export function attachRoutes(
  layout: LayoutResult,
  edges: RoutedEdge[],
): LayoutResult {
  const current = layout.canvasBounds ?? {
    x: 0,
    y: 0,
    w: layout.width,
    h: layout.height,
  };
  let left = current.x;
  let top = current.y;
  let right = current.x + current.w;
  let bottom = current.y + current.h;
  for (const edge of edges) {
    for (const point of edge.points) {
      left = Math.min(left, point.x);
      top = Math.min(top, point.y);
      right = Math.max(right, point.x);
      bottom = Math.max(bottom, point.y);
    }
  }
  const expanded = left !== current.x || top !== current.y ||
    right !== current.x + current.w || bottom !== current.y + current.h;
  if (!expanded) return { ...layout, edges };

  // Perimeter routing may legitimately leave the nominal 0..width/height
  // layout extent. Keep those points renderable for runtime consumers too;
  // Studio's content expansion adds its own larger padding afterward.
  const padding = GRAMMAR.edgeStroke;
  const canvasBounds: Rect = {
    x: left - padding,
    y: top - padding,
    w: right - left + padding * 2,
    h: bottom - top + padding * 2,
  };
  return { ...layout, edges, canvasBounds };
}
