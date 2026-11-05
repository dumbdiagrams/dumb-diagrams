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
import { getDefaultView, getParentGroup, nearestPortAnchor, normalizePortOffset, portPoint } from "../core/index.js";
import { GRAMMAR, GROUP_STYLES, snap } from "../grammar-aws/index.js";
import { EMERGENCY_ROUTING_LIMITS, RoutingBudget, type RoutingOptions } from "./routing-budget.js";
import { routePathBaseCost, ROUTE_PATH_COSTS } from "./mechanics.js";
import { routeVisibility } from "./visibility.js";
import { boundaryStrokeRects } from "./decoration-obstacles.js";
import { routeSimplificationCandidates } from "./path-refinement.js";
export {
  ROUTING_BUDGET_WARNING_CODE,
  ROUTING_BUDGET_WARNING_MESSAGE,
} from "./routing-budget.js";
export type {
  RoutingBudgetOptions,
  RoutingDiagnostics,
  RoutingOptions,
} from "./routing-budget.js";

const CELL = GRAMMAR.grid;
// Cap cells before allocation. Each cell uses 14 bytes across the blocked
// grid and a single A* search's Float64/Int32/byte scratch arrays.
const MAX_GRID_CELLS = 1_000_000;
const GROUP_CONTAINMENT_INSET = 8;
const HEADER_COST = 100_000;
// Routing quality rules, in descending priority: never hit content; avoid
// crossings and unrelated junctions; do not share or crowd a corridor; then
// prefer authored faces, fewer bends, and the shortest remaining path.
// Authored face-only ports are preferences. An authored fractional offset is
// an exact attachment and therefore locks that endpoint to its requested face.
const CROSSING_COST = ROUTE_PATH_COSTS.crossing;
const JUNCTION_COST = ROUTE_PATH_COSTS.junction;
/** A route this bent is harder to follow than one that crosses a few lines. */
const DETOUR_BENDS = 7;
const DETOUR_CROSSING_COST = ROUTE_PATH_COSTS.bend * 4;
const OVERLAP_COST = ROUTE_PATH_COSTS.astarOverlapPerUnit;
const NEAR_PARALLEL_COST = ROUTE_PATH_COSTS.nearParallelPerUnit;
const MIN_CONNECTOR_GAP = CELL;
const MIN_TERMINAL_STEM = 16;
const PORT_SIDE_FALLBACK_COST = ROUTE_PATH_COSTS.portSideFallback;
const PORT_OFFSET_FALLBACK_COST = ROUTE_PATH_COSTS.portOffsetFallback;
const PORT_BACKTRACK_COST = ROUTE_PATH_COSTS.portBacktrack;
const LABEL_SIDE_FALLBACK_COST = ROUTE_PATH_COSTS.labelSideFallback;
const LABEL_PORT_COLLISION_COST = 100_000;
const VISIBLE_PORTS_PER_FACE = 3;
const TURN_COST = ROUTE_PATH_COSTS.astarTurn;
// A near-aligned pair of opposing ports should read as one straight
// connector. Anything shorter than a full routing cell is visual noise: at
// normal zoom it looks like a broken arrow rather than a deliberate lane
// change.
const MICRO_JOG_THRESHOLD = CELL;
const VERTICAL_BADGE_TARGET_T = 0.75;
const MINIMUM_BADGE_RUN = CELL * 2;
const EDGE_BADGE_CLEARANCE = 6;
const BADGE_CONNECTOR_CLEARANCE = GRAMMAR.badgeRadius + EDGE_BADGE_CLEARANCE;
const BADGE_TO_BADGE_CLEARANCE = GRAMMAR.badgeRadius * 2 + 6;
const BADGE_CONTENT_CLEARANCE = 4;
const BADGE_COLLISION_COST = 1_000_000;
const BADGE_CONTENT_COLLISION_COST = 10_000_000;
const LABEL_CONTENT_CLEARANCE = 4;
const LABEL_TO_LABEL_CLEARANCE = 6;
const LABEL_TO_CONNECTOR_CLEARANCE = 4;
const LABEL_COLLISION_COST = 10_000_000;
const LABEL_NEAR_CONTENT_COST = 100_000;
// Above any along-route shift, so copy pulled toward a run's middle stops short
// of a frame line instead of touching it.
const LABEL_NEAR_FRAME_COST = 2_000;
// The widest drag gap: copy beside a vertical run sits this far from it.
const MAX_ATTACHED_LABEL_GAP = 12;
// Four-bend candidates combine one vertical and one horizontal corridor. A
// dense diagram can expose dozens of each, and trying their full Cartesian
// product for every port pair makes routing grow explosively. Single-corridor
// candidates below still consider every gutter; keep a small, representative
// set only for the combined fallback shapes.
const MAX_COMBINED_GUTTERS_PER_AXIS = 4;
const MAX_ASTAR_PORT_CHOICES = 3;
const MAX_DENSE_REPAIR_EDGES_PER_PASS = 8;
const MAX_DENSE_REPAIR_CANDIDATES = 768;
const MAX_DENSE_REPAIR_PORTS = 12;
const MAX_DENSE_REPAIR_TEMPLATES_PER_PORT = 16;
const MAX_DENSE_REPAIR_VISIBILITY_EXPANSIONS = 120_000;

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
  /** When both endpoints share a parent group, routes stay inside its bounds. */
  containment?: Rect;
}

interface ExistingRoute {
  points: Point[];
  sourceId: string;
  targetId: string;
  style: EdgeStyle;
  labelRect?: Rect;
}

interface Obstacle extends Rect {
  id?: string;
  kind: "node" | "header";
  content?: Rect;
  /** Labels avoid this when they can, but never by covering hard content instead. */
  soft?: boolean;
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

export function routeEdges(doc: DiagramDocument, layout: LayoutResult, options: RoutingOptions = {}): RoutedEdge[] {
  const largeGraph = doc.edges.length > 48 || doc.resources.length > 32;
  const nodeMap = new Map(layout.nodes.map((n) => [n.id, n]));
  const obstacles = buildObstacles(layout);
  const decorationObstacles = buildDecorationObstacles(layout);
  const budget = new RoutingBudget(
    options,
    doc.resources.length + doc.groups.length * 2 + doc.edges.length * 2 + obstacles.length,
    doc.edges.length * (largeGraph ? 50 : EMERGENCY_ROUTING_LIMITS.scorePathCallsPerEdge),
  );
  const boundaries = buildGroupBoundaries(layout);
  const vGutters = verticalGutters(layout, obstacles);
  const hGutters = horizontalGutters(layout, obstacles);
  // A grid is only useful when there is an edge to route. In particular, do
  // not let an empty document with a pathological canvas allocate anything or
  // report a routing degradation.
  const grid = doc.edges.length ? buildGrid(layout, obstacles) : null;
  if (doc.edges.length > 0 && !grid) budget.markDegraded();
  const routed: RoutedEdge[] = [];
  const unresolvedFallbackEdges = new Set<string>();
  const existing: ExistingRoute[] = [];
  const labelReservations = new Map<string, Rect>();
  const view = getDefaultView(doc);
  const documentOrder = new Map(doc.edges.map((edge, index) => [edge.id, index]));
  const span = (source?: NodeGeom, target?: NodeGeom) =>
    source && target
      ? Math.abs(iconCenter(source).x - iconCenter(target).x) + Math.abs(iconCenter(source).y - iconCenter(target).y)
      : 0;
  const spanByEdge = new Map(
    doc.edges.map((edge) => [edge.id, span(nodeMap.get(edge.source), nodeMap.get(edge.target))]),
  );
  const targetSpans = new Map<string, number[]>();
  const sourceSpans = new Map<string, number[]>();
  const sourceDegree = new Map<string, number>();
  const targetDegree = new Map<string, number>();
  const resourceParents = new Map(doc.resources.map((resource) => [resource.id, resource.parent]));
  const groups = new Map(doc.groups.map((group) => [group.id, group]));
  for (const edge of doc.edges) {
    const spans = targetSpans.get(edge.target) ?? [];
    spans.push(spanByEdge.get(edge.id) ?? 0);
    targetSpans.set(edge.target, spans);
    const branches = sourceSpans.get(edge.source) ?? [];
    branches.push(spanByEdge.get(edge.id) ?? 0);
    sourceSpans.set(edge.source, branches);
    sourceDegree.set(edge.source, (sourceDegree.get(edge.source) ?? 0) + 1);
    targetDegree.set(edge.target, (targetDegree.get(edge.target) ?? 0) + 1);
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
    const pinnedDelta = Number(Boolean(view.routes[b.id]?.pin)) - Number(Boolean(view.routes[a.id]?.pin));
    if (pinnedDelta) return pinnedDelta;
    const exactDelta =
      Number(b.sourcePortOffset !== undefined) +
      Number(b.targetPortOffset !== undefined) -
      Number(a.sourcePortOffset !== undefined) -
      Number(a.targetPortOffset !== undefined);
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
    const ports = candidatePorts(
      source,
      target,
      isFailure,
      edge.sourcePort,
      edge.targetPort,
      edge.sourcePortOffset,
      edge.targetPortOffset,
    );

    let best: Point[] | null = null;
    let bestScore = Infinity;
    let bestPort = ports[0]!;
    const containment = containmentForEdge(doc, layout, edge.source, edge.target);
    const baseVGutters = [...vGutters, ...corridorGutters(existing, "vertical")];
    const baseHGutters = [...hGutters, ...corridorGutters(existing, "horizontal")];
    const routeVGutters = containment ? guttersInside(baseVGutters, containment, "x") : baseVGutters;
    const routeHGutters = containment ? guttersInside(baseHGutters, containment, "y") : baseHGutters;
    const denseDiagram = doc.edges.length > 16;
    const availablePorts = ports.filter(
      (port) =>
        !existing.some(
          (route) =>
            samePoint(port.src, route.points[0]!) ||
            samePoint(port.src, route.points.at(-1)!) ||
            samePoint(port.tgt, route.points[0]!) ||
            samePoint(port.tgt, route.points.at(-1)!),
        ),
    );
    const preferredPorts = denseDiagram && availablePorts.length ? availablePorts : ports;
    const routePorts = denseDiagram ? representativePortChoices(preferredPorts, 24) : ports;

    for (const port of routePorts) {
      if (budget.exhausted) break;
      // No orthogonal path between these ports can be shorter than their
      // Manhattan distance. Once another port has already reached or beaten
      // that lower bound, generating and scoring this port's large template
      // family cannot improve the result.
      const lowerBound = Math.abs(port.src.x - port.tgt.x) + Math.abs(port.src.y - port.tgt.y) + port.preferenceCost;
      if (lowerBound >= bestScore) continue;
      const context = createRouteContext(source, target, port, edge.style, containment);
      const sourceCardExit = extendFromCard(source, port.src, port.srcSide);
      const targetCardExit = extendFromCard(target, port.tgt, port.tgtSide);
      const candidateVGutters = denseDiagram
        ? representativeGutters(routeVGutters, sourceCardExit.x, targetCardExit.x, 8)
        : routeVGutters;
      const candidateHGutters = denseDiagram
        ? representativeGutters(routeHGutters, sourceCardExit.y, targetCardExit.y, 8)
        : routeHGutters;
      for (const candidate of templates(port, candidateVGutters, candidateHGutters, source, target)) {
        if (budget.exhausted) break;
        const path = simplify(candidate);
        const s =
          scorePath(path, obstacles, context, existing, bestScore - port.preferenceCost, [], budget) +
          port.preferenceCost;
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

    if (!budget.exhausted && (!best || bestScore >= CROSSING_COST)) {
      // Every port variant searches the same grid against the same established
      // routes. Cache per-grid-segment conflict costs across those searches;
      // calculating them repeatedly was the dominant cost in dense diagrams.
      const conflictCostCache = new Map<number, number>();
      const astarPorts = representativePortChoices(
        [bestPort, ...preferredPorts.filter((port) => port !== bestPort)],
        denseDiagram ? 6 : MAX_ASTAR_PORT_CHOICES,
      );
      for (const port of astarPorts) {
        const context = createRouteContext(source, target, port, edge.style, containment);
        const astarPath =
          denseDiagram && doc.resources.length <= 32 && doc.edges.length <= 48
            ? exactConnection(port, source, target, obstacles, existing, budget, containment)
            : routeAStar(grid, port, source, target, existing, conflictCostCache, budget);
        if (!astarPath) continue;
        const smoothed = shortcut(simplify(astarPath), obstacles, context, existing, [], budget);
        const s =
          scorePath(smoothed, obstacles, context, existing, bestScore - port.preferenceCost, [], budget) +
          port.preferenceCost;
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

    if (!budget.exhausted && !best) {
      // If established connectors close the grid, find a content-safe path
      // without using them as A* walls. Score the result against all routes so
      // crossings and corridor sharing remain visible to selection.
      for (const port of representativePortChoices(preferredPorts, 6)) {
        const context = createRouteContext(source, target, port, edge.style, containment);
        const astarPath =
          denseDiagram && doc.resources.length <= 32 && doc.edges.length <= 48
            ? exactConnection(port, source, target, obstacles, [], budget, containment)
            : routeAStar(grid, port, source, target, [], undefined, budget);
        if (!astarPath) continue;
        const smoothed = shortcut(simplify(astarPath), obstacles, context, [], [], budget);
        const score = scorePath(smoothed, obstacles, context, existing, Infinity, [], budget) + port.preferenceCost;
        if (score < bestScore) {
          best = smoothed;
          bestScore = score;
          bestPort = port;
        }
      }
    }

    if (!budget.exhausted && !best) {
      // The perimeter search is the last automatic escape hatch. It still
      // scores every candidate against hard content obstacles; never replace
      // an exhausted search with an unchecked direct elbow through a card.
      for (const port of representativePortChoices(preferredPorts, 8)) {
        const context = createRouteContext(source, target, port, edge.style, containment);
        const candidate = perimeterFallback(layout, source, target, port, obstacles, context, existing, budget);
        if (!candidate) continue;
        const score = scorePath(candidate, obstacles, context, existing, Infinity, [], budget) + port.preferenceCost;
        if (score < bestScore) {
          best = candidate;
          bestScore = score;
          bestPort = port;
        }
      }
    }

    if (!best) {
      // Last-resort search is deliberately independent of route-work budgets
      // and shared-group containment. It can cross an established connector
      // or leave a group, but it still treats every visible resource as a hard
      // obstacle. A direct elbow here used to cut across entire rows of icons
      // whenever the constrained search ran out of legal ports or budget.
      const safeFallback = obstacleSafeFallback(
        layout,
        source,
        target,
        preferredPorts,
        edge.style,
        obstacles,
        budget,
        () => budget.markDegraded(),
        containment,
        existing,
        largeGraph ? 2 : 8,
      );
      if (safeFallback) {
        best = safeFallback.points;
        bestPort = safeFallback.port;
      } else {
        // Preserve a visible, attached route when the bounded hard-obstacle
        // search cannot find a corridor. Diagnostics can flag a collision;
        // silently dropping an authored relationship is worse.
        unresolvedFallbackEdges.add(edge.id);
        const port = representativePortChoices(ports, 1)[0] ?? ports[0]!;
        best = cardsOverlap(source, target)
          ? simplify(colocatedEdgeFallback(source, target, port))
          : emergencyEdgeRoute(source, target, port);
        bestPort = port;
      }
    }
    let points = best;
    points = shortcut(
      points,
      obstacles,
      createRouteContext(source, target, bestPort, edge.style, containment),
      existing,
      [],
      budget,
    );
    points = simplify(points);
    const routeOverride = view.routes[edge.id];
    if (routeOverride?.pin) {
      if (routeOverride.points?.length) {
        points = collapseOrthogonalRouteArtifacts(snapRouteEndpoints(routeOverride.points, source, target));
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
    const hasAuthoredLabelPosition = routeOverride?.labelT !== undefined || routeOverride?.labelSide !== undefined;
    const sourceParent = groups.get(resourceParents.get(edge.source) ?? "");
    const targetParent = groups.get(resourceParents.get(edge.target) ?? "");
    // The layout reserves an actual turn lane between sibling logical children.
    // Other ancestry relationships may have no alternate corridor, so treating
    // an automatic label as a hard route obstacle there can force a perimeter
    // search without creating a usable target-side pocket.
    const crossesSiblingBoundaries =
      sourceParent?.id !== targetParent?.id &&
      sourceParent?.kind === "logical" &&
      targetParent?.kind === "logical" &&
      sourceParent.parent === targetParent.parent;
    const reservesLabelPocket =
      Boolean(edge.label) &&
      ((sourceDegree.get(edge.source) ?? 0) >= 2 || (targetDegree.get(edge.target) ?? 0) >= 2) &&
      (hasAuthoredLabelPosition || crossesSiblingBoundaries);
    let labelReservation: ResolvedEdgeLabelPlacement | undefined;
    if (reservesLabelPocket) {
      const total = pathLength(points);
      const textWidth = Math.max(16, edge.label!.length * 11 * 0.55);
      // Automatic contended labels reserve the target end of their route.
      // This leaves the source-side gutter available for sibling elbows while
      // guaranteeing a complete decoration run after those routes turn away.
      const reservedT = hasAuthoredLabelPosition ? routeOverride?.labelT : clamp01((total - textWidth / 2) / total);
      labelReservation = hasAuthoredLabelPosition
        ? getEdgeLabelPlacement(
            points,
            edge.label!,
            decorationObstacles,
            undefined,
            reservedT,
            routeOverride?.labelSide ?? "top",
            routed,
          )
        : getEdgeLabelPlacement(
            points,
            edge.label!,
            decorationObstacles,
            undefined,
            undefined,
            undefined,
            routed,
            [],
            [],
            reservedT,
          );
    }
    if (labelReservation && (hasAuthoredLabelPosition || labelReservation.contentClear)) {
      labelReservations.set(edge.id, labelReservation.rect);
    } else {
      labelReservation = undefined;
    }
    existing.push({
      points,
      sourceId: edge.source,
      targetId: edge.target,
      style: edge.style,
      labelRect: labelReservation?.rect,
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
  const documentRoutes = doc.edges.map((edge) => byId.get(edge.id)).filter((edge): edge is RoutedEdge => Boolean(edge));
  repairAutomaticRouteCrossings(
    doc,
    layout,
    documentRoutes,
    obstacles,
    grid,
    vGutters,
    hGutters,
    view.routes,
    labelReservations,
    budget,
  );
  nudgeAutomaticRoutesOffBoundaries(
    layout,
    documentRoutes,
    obstacles,
    boundaries,
    view.routes,
    labelReservations,
    budget,
  );
  for (const edge of documentRoutes) {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) continue;
    edge.points = anchorRouteEndpoints(edge.points, source.icon, target.icon);
  }
  if (doc.edges.length > 16 && doc.edges.length <= 48 && layout.nodes.length <= 32) {
    clearTerminalCaptions(doc, documentRoutes, nodeMap, obstacles, budget);
    separateCloseLanes(doc, documentRoutes, nodeMap, obstacles, budget);
  }
  if (!largeGraph && !budget.exhausted)
    simplifyFinalRoutes(
      doc,
      layout,
      documentRoutes,
      nodeMap,
      obstacles,
      boundaries,
      vGutters,
      hGutters,
      view.routes,
      labelReservations,
    );
  // A visible emergency route may have been repaired once all connectors were
  // known. Report degradation only if that unsafe fallback survives every pass.
  for (const edge of documentRoutes) {
    if (!unresolvedFallbackEdges.has(edge.id)) continue;
    const source = nodeMap.get(edge.source)!;
    const target = nodeMap.get(edge.target)!;
    const context: RouteContext = {
      sourceId: edge.source,
      targetId: edge.target,
      sourcePoint: edge.points[0]!,
      targetPoint: edge.points.at(-1)!,
      sourceSide: perimeterSide(source.icon, edge.points[0]!),
      targetSide: perimeterSide(target.icon, edge.points.at(-1)!),
      style: edge.style,
    };
    if (!Number.isFinite(scorePath(edge.points, obstacles, context, [], Infinity, [], budget, true)))
      budget.markDegraded();
  }
  placeEdgeDecorations(documentRoutes, view.routes, [
    ...buildDecorationObstacles(layout),
    ...(doc.edges.length > 16 ? crossingDecorationObstacles(documentRoutes) : []),
  ]);
  options.onDiagnostics?.(budget.diagnostics());
  return documentRoutes;
}

/**
 * Each repair pass splices local lanes into otherwise settled routes, which
 * can leave detours and few-pixel jogs that no single pass owns. Once every
 * connector is final, drop any bend or jog whose removal adds no conflict.
 */
function simplifyFinalRoutes(
  doc: DiagramDocument,
  layout: LayoutResult,
  edges: RoutedEdge[],
  nodes: Map<string, NodeGeom>,
  obstacles: Obstacle[],
  boundaries: GroupBoundary[],
  vGutters: number[],
  hGutters: number[],
  routeOverrides: Record<string, RouteOverride>,
  labelReservations: Map<string, Rect>,
): void {
  const definitions = new Map(doc.edges.map((item) => [item.id, item]));
  const containments = new Map(
    edges.map((edge) => [edge.id, containmentForEdge(doc, layout, edge.source, edge.target)]),
  );
  const segmentLengths = (points: Point[]) =>
    points.slice(1).map((point, index) => Math.abs(point.x - points[index]!.x) + Math.abs(point.y - points[index]!.y));
  const jogs = (points: Point[]) => segmentLengths(points).filter((length) => length < MIN_TERMINAL_STEM).length;
  const crossingCount = (points: Point[], other: Point[]) =>
    points
      .slice(1)
      .reduce(
        (count, b, i) =>
          count +
          other.slice(1).filter((d, j) => segmentIntersectionKind(points[i]!, b, other[j]!, d) === "cross").length,
        0,
      );
  // Crossings are reported per route pair, so equal cost may still cross a new route.
  const crosses = (points: Point[], other: Point[]) => crossingCount(points, other) > 0;
  // Scored apart from the path: a route already stuck on a frame must still be
  // able to improve, which an infinite boundary score would rule out.
  const frameOverlap = (points: Point[]) =>
    points
      .slice(1)
      .reduce(
        (total, b, i) =>
          total + boundaries.reduce((sum, boundary) => sum + boundaryParallelOverlapLength(points[i]!, b, boundary), 0),
        0,
      );
  const routeOf = (edge: RoutedEdge, points = edge.points): ExistingRoute => ({
    points,
    sourceId: edge.source,
    targetId: edge.target,
    style: edge.style,
    labelRect: labelReservations.get(edge.id),
  });
  const othersOf = (edge: RoutedEdge, moved?: RoutedEdge, movedPoints?: Point[]) =>
    edges.filter((other) => other !== edge).map((other) => routeOf(other, other === moved ? movedPoints : undefined));
  const contextFor = (edge: RoutedEdge, points: Point[]): RouteContext => ({
    sourceId: edge.source,
    targetId: edge.target,
    sourcePoint: points[0]!,
    targetPoint: points.at(-1)!,
    sourceSide: perimeterSide(nodes.get(edge.source)!.icon, points[0]!),
    targetSide: perimeterSide(nodes.get(edge.target)!.icon, points.at(-1)!),
    style: edge.style,
    containment: containments.get(edge.id),
  });
  const conflicts = new WeakMap<Point[], WeakMap<ExistingRoute[], number>>();
  const conflict = (edge: RoutedEdge, points: Point[], others: ExistingRoute[]) => {
    const byOthers = conflicts.get(points) ?? new WeakMap<ExistingRoute[], number>();
    conflicts.set(points, byOthers);
    const cached = byOthers.get(others);
    if (cached !== undefined) return cached;
    const value =
      scorePath(points, obstacles, contextFor(edge, points), others, Infinity) - routePathBaseCost(points).score;
    byOthers.set(others, value);
    return value;
  };
  /** No more bends, jogs, frame paint, conflict or crossed routes; with `gain`, strictly simpler. */
  const acceptable = (
    edge: RoutedEdge,
    current: Point[],
    candidate: Point[],
    after: ExistingRoute[],
    before: ExistingRoute[],
    gain: boolean,
  ) => {
    const bendsSaved = current.length - candidate.length;
    const jogsSaved = jogs(current) - jogs(candidate);
    if (bendsSaved < 0 || jogsSaved < 0 || (gain && bendsSaved + jogsSaved === 0)) return false;
    const stems = segmentLengths(candidate);
    const currentStems = segmentLengths(current);
    if (
      stems[0]! < Math.min(currentStems[0]!, MIN_TERMINAL_STEM) ||
      stems.at(-1)! < Math.min(currentStems.at(-1)!, MIN_TERMINAL_STEM)
    )
      return false;
    if (frameOverlap(candidate) > frameOverlap(current)) return false;
    const candidateConflict = conflict(edge, candidate, after);
    return (
      Number.isFinite(candidateConflict) &&
      candidateConflict <= conflict(edge, current, before) &&
      after.every((other, index) => !crosses(candidate, other.points) || crosses(current, before[index]!.points))
    );
  };
  /** A jog beside an attachment is often only the port sitting off the lane; slide it along its face. */
  const endpointSlides = (edge: RoutedEdge, points: Point[], others: ExistingRoute[]) => {
    const definition = definitions.get(edge.id);
    const slides: Point[][] = [];
    if (points.length < 4) return slides;
    const slide = (icon: Rect, end: Point, jogStart: Point, jogEnd: Point) => {
      if (Math.abs(jogStart.x - jogEnd.x) + Math.abs(jogStart.y - jogEnd.y) >= MIN_TERMINAL_STEM) return undefined;
      const moved = { x: end.x + jogStart.x - jogEnd.x, y: end.y + jogStart.y - jogEnd.y };
      const side = perimeterSide(icon, end);
      const vertical = side === "e" || side === "w";
      const [along, origin, size] = vertical ? [moved.y, icon.y, icon.h] : [moved.x, icon.x, icon.w];
      const onFace =
        (vertical ? moved.x === end.x : moved.y === end.y) &&
        along >= origin + size / 12 &&
        along <= origin + (size * 11) / 12;
      const clearOfArrows = others.every((other) =>
        [other.points[0]!, other.points.at(-1)!].every(
          (point) => Math.abs(point.x - moved.x) + Math.abs(point.y - moved.y) >= CELL,
        ),
      );
      return onFace && clearOfArrows ? moved : undefined;
    };
    if (definition?.sourcePortOffset === undefined) {
      const moved = slide(nodes.get(edge.source)!.icon, points[0]!, points[2]!, points[1]!);
      if (moved) slides.push([moved, ...points.slice(2)]);
    }
    if (definition?.targetPortOffset === undefined) {
      const moved = slide(nodes.get(edge.target)!.icon, points.at(-1)!, points.at(-3)!, points.at(-2)!);
      if (moved) slides.push([...points.slice(0, -2), moved]);
    }
    return slides;
  };

  // A second sweep lets earlier edges use space freed by later reroutes.
  for (const edge of [...edges, ...edges]) {
    if (routeOverrides[edge.id]?.pin) continue;
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (!source || !target || edge.points.length < 4) continue;
    const containment = containments.get(edge.id);

    if (edge.points.length - 2 >= DETOUR_BENDS) {
      // Avoiding a crossing at any price is what produces a loop around half
      // the canvas. Reprice crossings for this edge only and keep a reroute
      // only when it at least halves the bends.
      const others = othersOf(edge);
      const tolerantScore = (points: Point[], context: RouteContext) =>
        scorePath(points, obstacles, context, others, Infinity) -
        others.reduce((count, other) => count + crossingCount(points, other.points), 0) *
          (CROSSING_COST - DETOUR_CROSSING_COST);
      const definition = definitions.get(edge.id)!;
      const bendLimit = (edge.points.length - 2) / 2;
      const frameLimit = frameOverlap(edge.points);
      let best: Point[] | undefined;
      let bestScore = tolerantScore(edge.points, contextFor(edge, edge.points));
      const searchBudget = new RoutingBudget({}, 0);
      const ports = uniquePortChoices(
        candidatePorts(
          source,
          target,
          edge.kind === "fail" || edge.style === "dashed",
          definition.sourcePort,
          definition.targetPort,
          definition.sourcePortOffset,
          definition.targetPortOffset,
        ),
      );
      const consider = (candidate: Point[], port: PortChoice, context: RouteContext) => {
        const path = simplify(candidate);
        if (path.length - 2 > bendLimit || frameOverlap(path) > frameLimit) return;
        const score = tolerantScore(path, context) + port.preferenceCost;
        if (score < bestScore) {
          best = path;
          bestScore = score;
        }
      };
      const xs = [...vGutters, ...corridorGutters(others, "vertical")];
      const ys = [...hGutters, ...corridorGutters(others, "horizontal")];
      const contexts = ports.map((port) => createRouteContext(source, target, port, edge.style, containment));
      for (const [index, port] of ports.entries()) {
        for (const candidate of templates(
          port,
          containment ? guttersInside(xs, containment, "x") : xs,
          containment ? guttersInside(ys, containment, "y") : ys,
          source,
          target,
        ))
          consider(candidate, port, contexts[index]!);
      }
      // Templates first: their scores let the costly search skip ports whose
      // path could not win even at straight-line length.
      for (const [index, port] of ports.entries()) {
        if (port.preferenceCost + Math.abs(port.src.x - port.tgt.x) + Math.abs(port.src.y - port.tgt.y) >= bestScore)
          continue;
        const exact = exactConnection(
          port,
          source,
          target,
          obstacles,
          others,
          searchBudget,
          containment,
          DETOUR_CROSSING_COST,
        );
        if (exact) consider(exact, port, contexts[index]!);
      }
      if (best) edge.points = anchorRouteEndpoints(best, source.icon, target.icon);
    }

    // ponytail: each pass scores at most 64 candidates against every other route, O(edges² × candidates);
    // fine below the large-graph cutoff, index segments if dense diagrams need it.
    for (let pass = 0; pass < 4; pass++) {
      const current = edge.points;
      const others = othersOf(edge);
      const candidates = [
        ...endpointSlides(edge, current, others),
        ...routeSimplificationCandidates(current, { maxCandidates: 64 }),
      ];
      const simpler = candidates.find((candidate) => acceptable(edge, current, candidate, others, others, true));
      if (simpler) {
        edge.points = simpler;
        continue;
      }
      // The simplest lane is often held by one neighbour that could sit a lane
      // over at no cost of its own. Move both, or neither.
      let moved = false;
      const alone: ExistingRoute[] = [];
      const singles = new Map(edges.map((other) => [other, [routeOf(other)]]));
      for (const candidate of candidates.slice(0, 8)) {
        if (jogs(candidate) > jogs(current) || !Number.isFinite(conflict(edge, candidate, alone))) continue;
        const blockers = edges.filter(
          (other) =>
            other !== edge &&
            conflict(edge, candidate, singles.get(other)!) > conflict(edge, current, singles.get(other)!),
        );
        const blocker = blockers.length === 1 ? blockers[0]! : undefined;
        if (!blocker || routeOverrides[blocker.id]?.pin) continue;
        const blockerBefore = othersOf(blocker);
        const blockerAfter = othersOf(blocker, edge, candidate);
        const shift = routeSimplificationCandidates(blocker.points, { maxCandidates: 64 }).find(
          (lane) =>
            acceptable(edge, current, candidate, othersOf(edge, blocker, lane), others, true) &&
            acceptable(blocker, blocker.points, lane, blockerAfter, blockerBefore, false),
        );
        if (!shift) continue;
        blocker.points = shift;
        edge.points = candidate;
        moved = true;
        break;
      }
      if (!moved) break;
    }
  }
}

/** Repair only the attachment pocket, preserving the rest of the routed graph. */
function clearTerminalCaptions(
  doc: DiagramDocument,
  edges: RoutedEdge[],
  nodes: Map<string, NodeGeom>,
  obstacles: Obstacle[],
  budget: RoutingBudget,
): void {
  if (budget.exhausted) return;
  const view = getDefaultView(doc);
  for (const edge of edges) {
    const definition = doc.edges.find((item) => item.id === edge.id)!;
    if (view.routes[edge.id]?.pin) continue;
    for (const reverse of [false, true]) {
      const points = reverse ? [...edge.points].reverse() : edge.points;
      const source = nodes.get(reverse ? edge.target : edge.source)!;
      const target = nodes.get(reverse ? edge.source : edge.target)!;
      if (points.length < 2 || source.label.w <= 0) continue;
      const captionHit = segmentHits(points[0]!, points[1]!, source.label);
      const terminalOverlap = edges.some(
        (other) =>
          other.id !== edge.id &&
          points
            .slice(1, 3)
            .some(
              (point, index) =>
                !(
                  index === 0 &&
                  (reverse ? other.target : other.source) === source.id &&
                  samePoint(points[0]!, reverse ? other.points.at(-1)! : other.points[0]!)
                ) && overlapLength(points[index]!, point, other.points) > 12,
            ),
      );
      if (!captionHit && !terminalOverlap) continue;
      if ((reverse ? definition.targetPortOffset : definition.sourcePortOffset) !== undefined) continue;
      const other = edges
        .filter((item) => item.id !== edge.id)
        .map((item) => ({
          points: reverse ? [...item.points].reverse() : item.points,
          sourceId: reverse ? item.target : item.source,
          targetId: reverse ? item.source : item.target,
          style: item.style,
        }));
      const used = (anchor: Point) =>
        other.some((item) =>
          [item.points[0], item.points.at(-1)].some(
            (point) => point && Math.hypot(anchor.x - point.x, anchor.y - point.y) < 8,
          ),
        );
      let best: Point[] | undefined;
      let bestScore = Infinity;
      const consider = (candidate: Point[], sourceSide: Side, targetSide: Side) => {
        if (!budget.consume("repairCandidates")) return;
        candidate = simplify(candidate);
        if (
          candidate
            .slice(1)
            .some(
              (point, i) =>
                segmentHits(candidate[i]!, point, source.label) || segmentHits(candidate[i]!, point, target.label),
            )
        )
          return;
        const context: RouteContext = {
          sourceId: source.id,
          targetId: target.id,
          sourcePoint: candidate[0]!,
          targetPoint: candidate.at(-1)!,
          sourceSide,
          targetSide,
          style: edge.style,
        };
        const overlapCount = candidate
          .slice(1)
          .reduce(
            (count, point, i) =>
              count + other.filter((route) => overlapLength(candidate[i]!, point, route.points) > 0).length,
            0,
          );
        let crowdedCrossings = 0;
        for (let i = 0; i < candidate.length - 1; i++) {
          const a = candidate[i]!,
            b = candidate[i + 1]!;
          for (const route of other)
            for (let j = 0; j < route.points.length - 1; j++) {
              const c = route.points[j]!,
                d = route.points[j + 1]!;
              if (segmentIntersectionKind(a, b, c, d) !== "cross") continue;
              const point = a.x === b.x ? { x: a.x, y: c.y } : { x: c.x, y: a.y };
              if ([a, b, c, d].some((end) => Math.abs(point.x - end.x) + Math.abs(point.y - end.y) < 8))
                crowdedCrossings++;
            }
        }
        const score =
          scorePath(candidate, obstacles, context, other, Infinity, [], budget) +
          (overlapCount + crowdedCrossings) * 10_000_000;
        if (score < bestScore) {
          best = candidate;
          bestScore = score;
        }
      };
      const firstOutside = points.findIndex(
        (point, index) => index > 0 && !pointInRect(point, inflate(source.obstacle, 8)),
      );
      for (
        let joinIndex = Math.max(1, firstOutside);
        joinIndex < Math.min(points.length - 1, firstOutside + 3);
        joinIndex++
      ) {
        const join = points[joinIndex]!;
        for (const side of ["e", "w", "n", "s"] as const) {
          for (const offset of [0.5, 0.25, 0.75, 1 / 12, 11 / 12]) {
            const anchor = portPoint(source.icon, side, offset);
            if (portStemHitsLabel(source, side, anchor) || used(anchor)) continue;
            const baseExit = exitBeyondCard(
              source,
              anchor,
              side,
              obstacles.find((item) => item.id === source.id),
            );
            for (const lane of [0, 12, 24, 36]) {
              const normal = sideNormal(side);
              const exit = { x: baseExit.x + normal.x * lane, y: baseExit.y + normal.y * lane };
              const corners =
                exit.x === join.x || exit.y === join.y
                  ? [exit]
                  : [
                      { x: exit.x, y: join.y },
                      { x: join.x, y: exit.y },
                    ];
              for (const corner of corners)
                consider(
                  [anchor, exit, corner, ...points.slice(joinIndex)],
                  side,
                  perimeterSide(target.icon, points.at(-1)!),
                );
            }
          }
        }
      }
      // A straight route may have no body outside both endpoint cards. Offer
      // a bounded outer lane with new clear attachment faces at both ends.
      if (!best || points.length === 2) {
        const ports = candidatePorts(
          source,
          target,
          edge.kind === "fail",
          undefined,
          undefined,
          reverse ? definition.targetPortOffset : definition.sourcePortOffset,
          reverse ? definition.sourcePortOffset : definition.targetPortOffset,
        )
          .flatMap((choice) => [
            choice,
            ...[1 / 12, 11 / 12].map((offset) => ({
              ...choice,
              src: portPoint(source.icon, choice.srcSide, offset),
              preferenceCost: choice.preferenceCost + 240,
            })),
          ])
          .filter(
            (choice) =>
              !portStemHitsLabel(source, choice.srcSide, choice.src) &&
              !portStemHitsLabel(target, choice.tgtSide, choice.tgt) &&
              !used(choice.src) &&
              !used(choice.tgt),
          );
        const xs = [
          Math.min(...obstacles.map((item) => item.x)) - 24,
          Math.max(...obstacles.map((item) => item.x + item.w)) + 24,
        ];
        const ys = [
          Math.min(...obstacles.map((item) => item.y)) - 24,
          Math.max(...obstacles.map((item) => item.y + item.h)) + 24,
        ];
        for (const choice of representativePortChoices(ports, 24)) {
          for (const candidate of templates(choice, xs, ys, source, target))
            consider(candidate, choice.srcSide, choice.tgtSide);
        }
      }
      if (best) edge.points = reverse ? best.reverse() : best;
    }
  }
}

/** Separate nearly coincident rails without moving ports or whole branches. */
function separateCloseLanes(
  doc: DiagramDocument,
  edges: RoutedEdge[],
  nodes: Map<string, NodeGeom>,
  obstacles: Obstacle[],
  budget: RoutingBudget,
): void {
  const view = getDefaultView(doc);
  let proposals = 0;
  for (const edge of edges) {
    if (view.routes[edge.id]?.pin || budget.exhausted) continue;
    const others = edges
      .filter((item) => item.id !== edge.id)
      .map((item) => ({ points: item.points, sourceId: item.source, targetId: item.target, style: item.style }));
    const congestion = (points: Point[]) =>
      points.slice(1).reduce(
        (sum, b, i) =>
          sum +
          others.reduce(
            (total, other) =>
              total +
              other.points.slice(1).reduce((n, d, j) => {
                const a = points[i]!,
                  c = other.points[j]!;
                const distance =
                  a.x === b.x && c.x === d.x
                    ? Math.abs(a.x - c.x)
                    : a.y === b.y && c.y === d.y
                      ? Math.abs(a.y - c.y)
                      : Infinity;
                return n + (distance > 0 && distance < 8 ? nearParallelLength(a, b, c, d, 8) : 0);
              }, 0),
            0,
          ),
        0,
      );
    let current = congestion(edge.points);
    if (!current) continue;
    const source = nodes.get(edge.source)!,
      target = nodes.get(edge.target)!;
    const context: RouteContext = {
      sourceId: source.id,
      targetId: target.id,
      sourcePoint: edge.points[0]!,
      targetPoint: edge.points.at(-1)!,
      sourceSide: perimeterSide(source.icon, edge.points[0]!),
      targetSide: perimeterSide(target.icon, edge.points.at(-1)!),
      style: edge.style,
    };
    for (let i = 1; i < edge.points.length - 2 && current > 0; i++) {
      const a = edge.points[i]!,
        b = edge.points[i + 1]!;
      const vertical = a.x === b.x;
      let best: Point[] | undefined;
      let bestCongestion = current;
      let bestScore = Infinity;
      for (const shift of [-12, 12, -24, 24, -36, 36]) {
        if (++proposals > 128 || !budget.consume("repairCandidates")) return;
        const candidate = edge.points.map((point) => ({ ...point }));
        if (vertical) {
          candidate[i]!.x += shift;
          candidate[i + 1]!.x += shift;
        } else {
          candidate[i]!.y += shift;
          candidate[i + 1]!.y += shift;
        }
        const normalized = normalizeOrthogonalRoute(candidate);
        const next = congestion(normalized);
        if (next >= bestCongestion) continue;
        if (
          normalized
            .slice(1)
            .some(
              (point, j) =>
                segmentHits(normalized[j]!, point, source.label) || segmentHits(normalized[j]!, point, target.label),
            )
        )
          continue;
        // Never exchange a close parallel lane for a shared corridor.
        if (
          normalized
            .slice(1)
            .some((point, j) => others.some((other) => overlapLength(normalized[j]!, point, other.points) > 12))
        )
          continue;
        const score = scorePath(normalized, obstacles, context, others, Infinity, [], budget);
        if (!Number.isFinite(score)) continue;
        if (next < bestCongestion || score < bestScore) {
          best = normalized;
          bestCongestion = next;
          bestScore = score;
        }
      }
      if (best) {
        edge.points = best;
        current = bestCongestion;
      }
    }
  }
}

function pointInRect(point: Point, rect: Rect): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
}

function repairAutomaticRouteCrossings(
  doc: DiagramDocument,
  layout: LayoutResult,
  edges: RoutedEdge[],
  obstacles: Obstacle[],
  grid: Grid | null,
  vGutters: number[],
  hGutters: number[],
  routeOverrides: Record<string, RouteOverride>,
  labelReservations: Map<string, Rect>,
  budget: RoutingBudget,
): void {
  const dense = edges.length > 16;
  if (dense && (edges.length > 48 || layout.nodes.length > 32)) return;
  if (budget.exhausted) return;
  const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
  const edgeDefinitions = new Map(doc.edges.map((edge) => [edge.id, edge]));
  let denseCandidateCount = 0;
  let denseVisibilityExpansions = 0;
  for (let pass = 0; pass < (dense ? 2 : 3); pass++) {
    if (budget.exhausted) return;
    let changed = false;
    const conflicted = edges
      .filter((edge) => !routeOverrides[edge.id]?.pin && edge.points.length >= (dense ? 2 : 4))
      .map((edge, index) => ({
        edge,
        index,
        conflicts: routeConflictCount(
          edge.points,
          edges
            .filter((candidate) => candidate.id !== edge.id)
            .map((candidate) => ({
              points: candidate.points,
              sourceId: candidate.source,
              targetId: candidate.target,
              style: candidate.style,
              labelRect: labelReservations.get(candidate.id),
            })),
          budget,
          edge.source,
          edge.target,
        ),
      }))
      .filter(({ conflicts }) => conflicts >= 10)
      .sort((a, b) => b.conflicts - a.conflicts || a.index - b.index)
      .slice(0, edges.length > 16 ? MAX_DENSE_REPAIR_EDGES_PER_PASS : edges.length)
      .map(({ edge }) => edge);
    for (const edge of conflicted) {
      if (budget.exhausted) return;
      if (routeOverrides[edge.id]?.pin || edge.points.length < 2) continue;
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
          labelRect: labelReservations.get(candidate.id),
        }));
      const reservationRoutes = otherRoutes
        .filter((candidate) => candidate.labelRect)
        .map((candidate) => ({ ...candidate, points: [] }));
      // Dense repair only runs below the graph-size cap and has fixed
      // candidate/visibility limits, so it can finish after the main routing
      // budget is exhausted without corrupting its expansion diagnostics.
      const repairBudget = budget;
      if (routeConflictCount(edge.points, otherRoutes, repairBudget, edge.source, edge.target) < 10) continue;
      const sourceAnchor = nearestPortAnchor(source.icon, edge.points[0]!);
      const targetAnchor = nearestPortAnchor(target.icon, edge.points.at(-1)!);
      const containment = containmentForEdge(doc, layout, edge.source, edge.target);
      const context: RouteContext = {
        sourceId: edge.source,
        targetId: edge.target,
        sourcePoint: edge.points[0]!,
        targetPoint: edge.points.at(-1)!,
        sourceSide: sourceAnchor.side,
        targetSide: targetAnchor.side,
        style: edge.style,
        containment,
      };
      let best = edge.points;
      let bestConflicts = routeConflictCount(best, otherRoutes, repairBudget, edge.source, edge.target);
      let bestScore = scorePath(best, obstacles, context, reservationRoutes, Infinity, [], repairBudget);
      const considerRepair = (candidate: Point[], candidateContext: RouteContext, preferenceCost = 0) => {
        if (dense) {
          if (denseCandidateCount >= MAX_DENSE_REPAIR_CANDIDATES) return;
          if (!budget.consume("repairCandidates")) return;
          denseCandidateCount++;
        } else if (!budget.consume("repairCandidates")) return;
        const normalized = normalizeOrthogonalRoute(simplify(candidate));
        const score =
          scorePath(normalized, obstacles, candidateContext, reservationRoutes, Infinity, [], repairBudget) +
          preferenceCost;
        if (!Number.isFinite(score)) return;
        const conflicts = routeConflictCount(normalized, otherRoutes, repairBudget, edge.source, edge.target);
        if (conflicts < bestConflicts || (conflicts === bestConflicts && score < bestScore)) {
          best = normalized;
          bestConflicts = conflicts;
          bestScore = score;
        }
      };

      // The first routing pass is intentionally incremental, so an early edge
      // cannot anticipate every later corridor. Once the complete route set is
      // known, retry every distinct attachment-face pair against that final
      // geometry before attempting local segment shifts.
      const allRetryPorts = candidatePorts(
        source,
        target,
        definition.kind === "fail" || definition.style === "dashed",
        definition.sourcePort,
        definition.targetPort,
        definition.sourcePortOffset,
        definition.targetPortOffset,
      );
      const retryPorts = allRetryPorts.filter(
        (port) =>
          !otherRoutes.some(
            (route) =>
              samePoint(port.src, route.points[0]!) ||
              samePoint(port.src, route.points.at(-1)!) ||
              samePoint(port.tgt, route.points[0]!) ||
              samePoint(port.tgt, route.points.at(-1)!),
          ),
      );

      const retryVGutters = containment
        ? guttersInside([...vGutters, ...corridorGutters(otherRoutes, "vertical")], containment, "x")
        : [...vGutters, ...corridorGutters(otherRoutes, "vertical")];
      const retryHGutters = containment
        ? guttersInside([...hGutters, ...corridorGutters(otherRoutes, "horizontal")], containment, "y")
        : [...hGutters, ...corridorGutters(otherRoutes, "horizontal")];
      for (const port of representativePortChoices(retryPorts, dense ? MAX_DENSE_REPAIR_PORTS : 16)) {
        const retryContext = createRouteContext(source, target, port, edge.style, containment);
        const retryTemplates = templates(port, retryVGutters, retryHGutters, source, target);
        for (const candidate of dense ? retryTemplates.slice(0, MAX_DENSE_REPAIR_TEMPLATES_PER_PORT) : retryTemplates) {
          considerRepair(candidate, retryContext, port.preferenceCost);
          if (bestConflicts === 0) break;
        }
        if (bestConflicts === 0) break;
        if (dense && denseVisibilityExpansions < MAX_DENSE_REPAIR_VISIBILITY_EXPANSIONS) {
          const sourceExit = exitBeyondCard(
            source,
            port.src,
            port.srcSide,
            obstacles.find((obstacle) => obstacle.id === source.id),
          );
          const targetExit = exitBeyondCard(
            target,
            port.tgt,
            port.tgtSide,
            obstacles.find((obstacle) => obstacle.id === target.id),
          );
          const contentObstacles = obstacles.filter(
            (obstacle) => obstacle.id !== source.id && obstacle.id !== target.id,
          );
          const stemsClear =
            contentObstacles.every((obstacle) => !segmentHits(port.src, sourceExit, obstacle)) &&
            contentObstacles.every((obstacle) => !segmentHits(targetExit, port.tgt, obstacle));
          if (stemsClear) {
            const routeIndex = indexRouteSegments(otherRoutes);
            const visible = routeVisibility(
              sourceExit,
              targetExit,
              obstacles,
              (a, b) => segmentRouteConflictCost(a, b, routeIndex),
              () => {
                if (
                  denseVisibilityExpansions >= MAX_DENSE_REPAIR_VISIBILITY_EXPANSIONS ||
                  !budget.consume("astarExpansions")
                )
                  return false;
                denseVisibilityExpansions++;
                return true;
              },
            );
            if (visible)
              considerRepair(
                [port.src, sourceExit, ...visible.slice(1, -1), targetExit, port.tgt],
                retryContext,
                port.preferenceCost,
              );
          }
        }
        if (bestConflicts === 0) break;
        const routed =
          dense || budget.exhausted ? null : routeAStar(grid, port, source, target, otherRoutes, undefined, budget);
        if (routed) {
          const candidate = shortcut(simplify(routed), obstacles, retryContext, otherRoutes, [], budget);
          considerRepair(candidate, retryContext, port.preferenceCost);
        }
        if (bestConflicts === 0) break;
      }

      for (let index = 1; bestConflicts > 0 && index < edge.points.length - 2; index++) {
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
          const score = scorePath(simplified, obstacles, context, reservationRoutes, Infinity, [], repairBudget);
          if (!Number.isFinite(score)) continue;
          const conflicts = routeConflictCount(simplified, otherRoutes, repairBudget, edge.source, edge.target);
          if (conflicts < bestConflicts || (conflicts === bestConflicts && score < bestScore)) {
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

function routeConflictCount(
  points: Point[],
  existing: ExistingRoute[],
  budget?: RoutingBudget,
  sourceId?: string,
  targetId?: string,
): number {
  if (budget && !budget.consume("routeConflictChecks")) return Infinity;
  let conflicts = 0;
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index]!;
    const b = points[index + 1]!;
    for (const route of existing) {
      if (overlapLength(a, b, route.points) > 0) conflicts += 100;
      for (let otherIndex = 0; otherIndex < route.points.length - 1; otherIndex++) {
        const kind = segmentIntersectionKind(a, b, route.points[otherIndex]!, route.points[otherIndex + 1]!);
        if (kind === "cross") conflicts += 10;
        else if (
          kind === "touch" &&
          sourceId !== route.sourceId &&
          sourceId !== route.targetId &&
          targetId !== route.sourceId &&
          targetId !== route.targetId
        ) {
          conflicts += 1;
        }
      }
    }
  }
  return conflicts;
}

function representativePortChoices(ports: PortChoice[], limit: number): PortChoice[] {
  const selected: PortChoice[] = [];
  const byFace = new Map<string, PortChoice[]>();
  for (const port of ports) {
    const key = `${port.srcSide}:${port.tgtSide}`;
    const choices = byFace.get(key) ?? [];
    choices.push(port);
    byFace.set(key, choices);
  }
  // Offset variants may have been reordered by label/face preferences. Pick
  // actual distinct anchors rather than assuming a particular matrix index.
  for (const choices of byFace.values()) {
    const sourceAnchors: Point[] = [];
    const targetAnchors: Point[] = [];
    for (let offset = 0; offset < 3 && selected.length < limit; offset++) {
      const remaining = choices.filter((choice) => !selected.includes(choice));
      const novelty = (choice: PortChoice) =>
        Number(!sourceAnchors.some((point) => samePoint(point, choice.src))) +
        Number(!targetAnchors.some((point) => samePoint(point, choice.tgt)));
      remaining.sort((a, b) => novelty(b) - novelty(a) || a.preferenceCost - b.preferenceCost);
      const port = remaining[0];
      if (!port) break;
      selected.push(port);
      sourceAnchors.push(port.src);
      targetAnchors.push(port.tgt);
    }
    if (selected.length >= limit) return selected;
  }
  for (const port of ports) if (!selected.includes(port) && selected.length < limit) selected.push(port);
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
  budget?: RoutingBudget,
  emergency = false,
): Point[] | null {
  const start = extendFromCard(source, portChoice.src, portChoice.srcSide);
  const goal = extendFromCard(target, portChoice.tgt, portChoice.tgtSide);
  const margin = CELL * 2;
  let lanes: { top: number; right: number; bottom: number; left: number };
  if (context.containment) {
    const inset = GROUP_CONTAINMENT_INSET;
    const box = context.containment;
    lanes = {
      top: box.y + inset,
      right: box.x + box.w - inset,
      bottom: box.y + box.h - inset,
      left: box.x + inset,
    };
  } else {
    // Route outside every hard obstacle, not merely inside the nominal layout
    // bounds. Group headers can begin at y=0 and cards can extend beyond the
    // layout's initial width/height, so fixed 16px lanes may still cut through
    // visible content.
    lanes = {
      top: Math.min(...obstacles.map((obstacle) => obstacle.y), 0) - margin,
      right: Math.max(...obstacles.map((obstacle) => obstacle.x + obstacle.w), layout.width) + margin,
      bottom: Math.max(...obstacles.map((obstacle) => obstacle.y + obstacle.h), layout.height) + margin,
      left: Math.min(...obstacles.map((obstacle) => obstacle.x), 0) - margin,
    };
  }
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
      const score = scorePath(candidate, obstacles, context, routes, Infinity, [], budget, emergency);
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return best;
  };
  return choose(existing);
}

/**
 * Bounded final escape hatch that relaxes group containment and connector
 * conflicts while keeping content obstacles hard. This is intentionally
 * usable after the normal routing budget has been consumed.
 */
function obstacleSafeFallback(
  layout: LayoutResult,
  source: NodeGeom,
  target: NodeGeom,
  ports: PortChoice[],
  style: EdgeStyle,
  obstacles: Obstacle[],
  budget: RoutingBudget,
  onFallbackLimit: () => void,
  containment?: Rect,
  existing: ExistingRoute[] = [],
  portLimit = 8,
): { points: Point[]; port: PortChoice } | null {
  let best: Point[] | null = null;
  let bestPort: PortChoice | undefined;
  let bestScore = Infinity;
  const fallbackPorts = representativePortChoices(ports, portLimit);

  if (cardsOverlap(source, target)) {
    // Overlapping endpoint cards have no legal corridor between their ports.
    // A visible outside loop is the established representation for this
    // degenerate layout; ignore only those two endpoint cards while validating
    // the loop against every unrelated obstacle.
    const endpointObstacles = obstacles.filter((obstacle) => obstacle.id !== source.id && obstacle.id !== target.id);
    for (const port of fallbackPorts) {
      const context = createRouteContext(source, target, port, style);
      const candidate = simplify(colocatedEdgeFallback(source, target, port));
      const score =
        scorePath(candidate, endpointObstacles, context, existing, Infinity, [], budget, true) + port.preferenceCost;
      if (score < bestScore) {
        best = candidate;
        bestPort = port;
        bestScore = score;
      }
    }
    if (best && bestPort) return { points: best, port: bestPort };
  }

  // Preserve group containment whenever a content-safe route can fit there.
  // Only relax it after all bounded in-group candidates fail.
  for (const allowedContainment of [containment, undefined]) {
    for (const port of fallbackPorts) {
      const context = createRouteContext(source, target, port, style, allowedContainment);
      // Perimeter candidates do not depend on the grid and can escape a closed
      // shared group boundary. They remain available after the regular budget
      // is exhausted and are counted in the separate emergency-work totals.
      const perimeter = perimeterFallback(layout, source, target, port, obstacles, context, existing, budget, true);
      if (perimeter) {
        const score =
          scorePath(perimeter, obstacles, context, existing, Infinity, [], budget, true) + port.preferenceCost;
        if (score < bestScore) {
          best = perimeter;
          bestPort = port;
          bestScore = score;
        }
      }
    }
    if (best && bestPort) return { points: best, port: bestPort };
  }

  // The fixed grid can miss a narrow but real corridor and can place its
  // first cell inside an adjacent card. Search exact obstacle-edge lanes using
  // short, checked endpoint stems. This route work has its own hard vertex cap
  // and remains available after the normal routing budget is exhausted.
  const endpointObstacle = (id: string) => obstacles.find((obstacle) => obstacle.id === id);
  const otherObstacles = obstacles.filter((obstacle) => obstacle.id !== source.id && obstacle.id !== target.id);
  const routeSegments = indexRouteSegments(existing);
  for (const port of fallbackPorts) {
    const sourceExit = exitBeyondCard(source, port.src, port.srcSide, endpointObstacle(source.id));
    const targetExit = exitBeyondCard(target, port.tgt, port.tgtSide, endpointObstacle(target.id));
    if (
      otherObstacles.some((obstacle) => segmentHits(port.src, sourceExit, obstacle)) ||
      otherObstacles.some((obstacle) => segmentHits(targetExit, port.tgt, obstacle))
    )
      continue;
    if (!budget.consumeEmergencyVisibilityQuery()) {
      onFallbackLimit();
      break;
    }
    const middle = routeVisibility(
      sourceExit,
      targetExit,
      obstacles,
      (a, b) => segmentRouteConflictCost(a, b, routeSegments),
      () => {
        if (!budget.consumeEmergencyVisibilityExpansion()) {
          onFallbackLimit();
          return false;
        }
        return true;
      },
    );
    if (!middle) continue;
    const candidate = simplify([port.src, sourceExit, ...middle.slice(1, -1), targetExit, port.tgt]);
    const context = createRouteContext(source, target, port, style);
    const score = scorePath(candidate, obstacles, context, existing, Infinity, [], budget, true) + port.preferenceCost;
    if (score < bestScore) {
      best = candidate;
      bestPort = port;
      bestScore = score;
    }
  }
  return best && bestPort ? { points: best, port: bestPort } : null;
}

function exactConnection(
  port: PortChoice,
  source: NodeGeom,
  target: NodeGeom,
  obstacles: Obstacle[],
  existing: ExistingRoute[],
  budget: RoutingBudget,
  containment?: Rect,
  crossingCost: number = CROSSING_COST,
): Point[] | null {
  const start = exitBeyondCard(
    source,
    port.src,
    port.srcSide,
    obstacles.find((item) => item.id === source.id),
  );
  const goal = exitBeyondCard(
    target,
    port.tgt,
    port.tgtSide,
    obstacles.find((item) => item.id === target.id),
  );
  if (
    obstacles.some(
      (item) =>
        (item.id !== source.id && segmentHits(port.src, start, item)) ||
        (item.id !== target.id && segmentHits(goal, port.tgt, item)),
    )
  )
    return null;
  const index = indexRouteSegments(existing);
  let queryExpansions = 0;
  const middle = routeVisibility(
    start,
    goal,
    obstacles,
    (a, b) => segmentRouteConflictCost(a, b, index, crossingCost),
    () => ++queryExpansions <= 6_000 && budget.consume("astarExpansions"),
    containment,
  );
  return middle ? simplify([port.src, start, ...middle.slice(1, -1), goal, port.tgt]) : null;
}

function exitBeyondCard(node: NodeGeom, point: Point, side: Side, obstacle?: Rect): Point {
  const card = obstacle ?? inflate(node.obstacle, 8);
  switch (side) {
    case "e":
      return { x: Math.max(point.x + 2, card.x + card.w + 2), y: point.y };
    case "w":
      return { x: Math.min(point.x - 2, card.x - 2), y: point.y };
    case "s":
      return { x: point.x, y: Math.max(point.y + 2, card.y + card.h + 2) };
    case "n":
      return { x: point.x, y: Math.min(point.y - 2, card.y - 2) };
  }
}

function cardsOverlap(source: NodeGeom, target: NodeGeom, margin = 4): boolean {
  const left = Math.max(source.obstacle.x, target.obstacle.x);
  const top = Math.max(source.obstacle.y, target.obstacle.y);
  const right = Math.min(source.obstacle.x + source.obstacle.w, target.obstacle.x + target.obstacle.w);
  const bottom = Math.min(source.obstacle.y + source.obstacle.h, target.obstacle.y + target.obstacle.h);
  return right - left > margin && bottom - top > margin;
}

/** Visible last resort when every bounded obstacle-safe corridor search fails. */
function emergencyEdgeRoute(source: NodeGeom, target: NodeGeom, portChoice: PortChoice): Point[] {
  const start = extendFromCard(source, portChoice.src, portChoice.srcSide);
  const goal = extendFromCard(target, portChoice.tgt, portChoice.tgtSide);
  if (start.x === goal.x || start.y === goal.y) {
    return [portChoice.src, start, goal, portChoice.tgt];
  }
  const corner =
    portChoice.srcSide === "e" || portChoice.srcSide === "w" ? { x: goal.x, y: start.y } : { x: start.x, y: goal.y };
  return [portChoice.src, start, corner, goal, portChoice.tgt];
}

/** Loop above coincident cards so stacked endpoints still get a visible route. */
function colocatedEdgeFallback(source: NodeGeom, target: NodeGeom, portChoice: PortChoice): Point[] {
  const start = extendFromCard(source, portChoice.src, portChoice.srcSide);
  const goal = extendFromCard(target, portChoice.tgt, portChoice.tgtSide);
  const loopY = Math.min(source.obstacle.y, target.obstacle.y) - 48;
  return [portChoice.src, start, { x: start.x, y: loopY }, { x: goal.x, y: loopY }, goal, portChoice.tgt];
}

function nudgeAutomaticRoutesOffBoundaries(
  layout: LayoutResult,
  edges: RoutedEdge[],
  obstacles: Obstacle[],
  boundaries: GroupBoundary[],
  routeOverrides: Record<string, RouteOverride>,
  labelReservations: Map<string, Rect>,
  budget: RoutingBudget,
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
          labelRect: labelReservations.get(candidate.id),
        })),
      budget,
    );
  }
}

/**
 * Place badges only after every connector is known. Doing this during the
 * routing pass made badge 2 blind to badge 1's arrow (and vice versa), which
 * allowed a badge to cover a nearby connector even when the opposite side of
 * its own path was completely clear.
 */
/** Keep text and step numbers out of the clearance needed by crossing jumps. */
function crossingDecorationObstacles(edges: RoutedEdge[]): Obstacle[] {
  const obstacles: Obstacle[] = [];
  // Dense pathological graphs retain the normal decoration budget. Ordinary
  // diagrams have a small, fixed pair scan before their decorations are placed.
  if (edges.length > 48) return obstacles;
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const first = edges[i]!.points;
      const second = edges[j]!.points;
      for (let a = 0; a < first.length - 1; a++) {
        for (let b = 0; b < second.length - 1; b++) {
          if (segmentIntersectionKind(first[a]!, first[a + 1]!, second[b]!, second[b + 1]!) !== "cross") continue;
          const vertical = first[a]!.x === first[a + 1]!.x ? first[a]! : second[b]!;
          const horizontal = first[a]!.y === first[a + 1]!.y ? first[a]! : second[b]!;
          obstacles.push({ x: vertical.x - 8, y: horizontal.y - 8, w: 16, h: 16, kind: "node" });
        }
      }
    }
  }
  return obstacles;
}

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
    .sort((a, b) => (a.edge.step ?? 0) - (b.edge.step ?? 0) || a.index - b.index);

  for (const { edge } of badgeOrder) {
    const routeOverride = routeOverrides[edge.id];
    const isAuthored = routeOverride?.badgeT !== undefined || routeOverride?.badgeSide !== undefined;
    const badge = isAuthored
      ? getEdgeBadgePlacement(edge.points, routeOverride?.badgeT, routeOverride?.badgeSide)
      : getSafeEdgeBadgePlacement(
          edge,
          edges.filter((candidate) => candidate.id !== edge.id),
          occupiedBadges,
          [],
          obstacles,
        );
    if (!badge) continue;
    badges.set(edge.id, badge);
    occupiedBadges.push(badge.point);
    edge.badge = badge.point;
    edge.badgeT = badge.t;
    edge.badgeSide = badge.side;
  }

  const labels = new Map<string, EdgeLabelPlacement>();
  const occupiedLabels: Rect[] = [];
  const labelOrder = edges
    .filter((edge) => edge.label)
    .map((edge, index) => ({ edge, index }))
    .sort((a, b) => {
      const aOverride = routeOverrides[a.edge.id];
      const bOverride = routeOverrides[b.edge.id];
      const aAuthored = Number(aOverride?.labelT !== undefined || aOverride?.labelSide !== undefined);
      const bAuthored = Number(bOverride?.labelT !== undefined || bOverride?.labelSide !== undefined);
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
    if (labelPlacement) {
      labels.set(edge.id, labelPlacement);
      occupiedLabels.push(labelPlacement.rect);
    }
  }

  // The initial pass gives every decoration a deterministic valid position.
  // Refine automatic decorations against the complete shared occupancy set so
  // badges are no longer blind to labels placed later in the pass. Each item
  // remains independent: only its own candidate is reconsidered, while
  // authored positions stay fixed and merely reserve space.
  const automaticBadges = badgeOrder.filter(({ edge }) => {
    const override = routeOverrides[edge.id];
    return override?.badgeT === undefined && override?.badgeSide === undefined;
  });
  const automaticBadgeIds = new Set(automaticBadges.map(({ edge }) => edge.id));
  const automaticLabels = labelOrder.filter(({ edge }) => {
    const override = routeOverrides[edge.id];
    return override?.labelT === undefined && override?.labelSide === undefined;
  });

  for (let pass = 0; pass < 4; pass++) {
    let changed = false;

    for (const { edge } of automaticBadges) {
      const next = getSafeEdgeBadgePlacement(
        edge,
        edges.filter((candidate) => candidate.id !== edge.id),
        [...badges.entries()].filter(([id]) => id !== edge.id).map(([, placement]) => placement.point),
        [...labels.values()].map((placement) => placement.rect),
        obstacles,
      );
      const previous = badges.get(edge.id);
      if (!next || sameBadgePlacement(previous, next)) continue;
      badges.set(edge.id, next);
      edge.badge = next.point;
      edge.badgeT = next.t;
      edge.badgeSide = next.side;
      changed = true;
    }

    for (const { edge } of automaticLabels) {
      const otherEdges = edges.filter((candidate) => candidate.id !== edge.id);
      const otherBadges = [...badges.entries()].filter(([id]) => id !== edge.id).map(([, placement]) => placement);
      const otherLabels = [...labels.entries()].filter(([id]) => id !== edge.id).map(([, placement]) => placement.rect);
      const place = (badge: EdgeBadgePlacement | undefined) =>
        getEdgeLabelPlacement(
          edge.points,
          edge.label!,
          obstacles,
          badge,
          undefined,
          undefined,
          otherEdges,
          badge ? [...otherBadges, badge] : otherBadges,
          otherLabels,
        );
      let next = place(badges.get(edge.id));
      if (next && !next.clean && automaticBadgeIds.has(edge.id)) {
        // A short run may hold both decorations only with the badge off-centre.
        // Neither finds that spot alone, so offer the label each clear badge spot.
        for (const { candidate, score } of rankedBadgePlacements(
          edge,
          otherEdges,
          otherBadges.map((placement) => placement.point),
          otherLabels,
          obstacles,
        )) {
          if (score >= BADGE_COLLISION_COST) break;
          const label = place(candidate);
          if (!label?.clean) continue;
          badges.set(edge.id, candidate);
          edge.badge = candidate.point;
          edge.badgeT = candidate.t;
          edge.badgeSide = candidate.side;
          next = label;
          changed = true;
          break;
        }
      }
      const previous = labels.get(edge.id);
      if (!next || sameLabelPlacement(previous, next)) continue;
      labels.set(edge.id, next);
      edge.labelPoint = next.point;
      edge.labelRect = next.rect;
      edge.labelT = next.t;
      edge.labelSide = next.side;
      changed = true;
    }

    if (!changed) break;
  }
}

function sameBadgePlacement(a: EdgeBadgePlacement | undefined, b: EdgeBadgePlacement): boolean {
  return Boolean(a && a.t === b.t && a.side === b.side && a.point.x === b.point.x && a.point.y === b.point.y);
}

function sameLabelPlacement(a: EdgeLabelPlacement | undefined, b: EdgeLabelPlacement): boolean {
  return Boolean(a && a.t === b.t && a.side === b.side && a.point.x === b.point.x && a.point.y === b.point.y);
}

function getSafeEdgeBadgePlacement(
  edge: RoutedEdge,
  otherEdges: RoutedEdge[],
  occupiedBadges: Point[],
  occupiedLabels: Rect[],
  obstacles: Obstacle[],
): EdgeBadgePlacement | undefined {
  return rankedBadgePlacements(edge, otherEdges, occupiedBadges, occupiedLabels, obstacles)[0]?.candidate;
}

/** Badge candidates from best to worst; ties keep their probing order. */
function rankedBadgePlacements(
  edge: RoutedEdge,
  otherEdges: RoutedEdge[],
  occupiedBadges: Point[],
  occupiedLabels: Rect[],
  obstacles: Obstacle[],
): Array<{ candidate: EdgeBadgePlacement; score: number }> {
  const preferred = getEdgeBadgePlacement(edge.points);
  if (!preferred) return [];
  const total = pathLength(edge.points);
  if (!total) return [{ candidate: preferred, score: 0 }];

  const tStep = Math.min(0.18, Math.max(0.04, (CELL * 2) / total));
  const tOffsets = [0, tStep, -tStep, tStep * 2, -tStep * 2];
  const sides: EdgeBadgeSide[] = [preferred.side, oppositeBadgeSide(preferred.side)];
  const segmentMidpoints = pathSegments(edge.points)
    .filter((segment) => segment.len >= MINIMUM_BADGE_RUN)
    .sort((a, b) => b.len - a.len)
    .map((segment) => (segment.start + segment.len / 2) / total);
  // The eighths leave room beside the badge for its label on a short run.
  const segmentOffsetPoints = pathSegments(edge.points)
    .filter((segment) => segment.len >= MINIMUM_BADGE_RUN)
    .flatMap((segment) => [0.25, 0.75, 0.125, 0.875].map((offset) => (segment.start + segment.len * offset) / total));
  const candidateTs = [
    ...new Set([
      ...tOffsets.map((offset) => clamp01(preferred.t + offset)),
      ...segmentMidpoints,
      ...segmentOffsetPoints,
    ]),
  ];
  const ranked: Array<{ candidate: EdgeBadgePlacement; score: number }> = [];

  for (const t of candidateTs) {
    for (const side of sides) {
      const candidate = getEdgeBadgePlacement(edge.points, t, side);
      if (!candidate) continue;
      const score = badgeCollisionScore(candidate, preferred, otherEdges, occupiedBadges, occupiedLabels, obstacles);
      ranked.push({ candidate, score });
    }
  }
  return ranked.sort((a, b) => a.score - b.score);
}

function badgeCollisionScore(
  candidate: EdgeBadgePlacement,
  preferred: EdgeBadgePlacement,
  otherEdges: RoutedEdge[],
  occupiedBadges: Point[],
  occupiedLabels: Rect[],
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
      score += BADGE_COLLISION_COST + (BADGE_CONNECTOR_CLEARANCE - distance) * 10_000;
    }
  }
  for (const badge of occupiedBadges) {
    const distance = Math.hypot(candidate.point.x - badge.x, candidate.point.y - badge.y);
    if (distance < BADGE_TO_BADGE_CLEARANCE) {
      score += BADGE_COLLISION_COST + (BADGE_TO_BADGE_CLEARANCE - distance) * 10_000;
    }
  }
  for (const label of occupiedLabels) {
    if (!circleIntersectsRect(candidate.point, GRAMMAR.badgeRadius, label, LABEL_CONTENT_CLEARANCE)) continue;
    score += BADGE_CONTENT_COLLISION_COST;
  }
  for (const obstacle of obstacles) {
    // A filled badge reads fine over a frame line; only label text needs the clearance.
    if (obstacle.soft) continue;
    if (!circleIntersectsRect(candidate.point, GRAMMAR.badgeRadius, obstacle, BADGE_CONTENT_CLEARANCE)) continue;
    score += BADGE_CONTENT_COLLISION_COST + (GRAMMAR.badgeRadius + BADGE_CONTENT_CLEARANCE) * 10_000;
  }
  return score;
}

function distanceToPolyline(point: Point, points: Point[]): number {
  return projectPointToPolyline(point, points)?.distance ?? Infinity;
}

// ponytail: measures each segment by its bounding box, exact for orthogonal
// routes and generous for a diagonal straight connector.
function distanceFromRectToPolyline(rect: Rect, points: Point[]): number {
  let best = Infinity;
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index]!;
    const b = points[index + 1]!;
    const dx = Math.max(0, rect.x - Math.max(a.x, b.x), Math.min(a.x, b.x) - (rect.x + rect.w));
    const dy = Math.max(0, rect.y - Math.max(a.y, b.y), Math.min(a.y, b.y) - (rect.y + rect.h));
    best = Math.min(best, Math.hypot(dx, dy));
  }
  return best;
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
    out.push({ ...inflate(n.obstacle, 8), id: n.id, kind: "node", content: undefined });
  }
  for (const g of layout.groups) {
    out.push({ ...headerLabelRect(g), id: g.id, kind: "header" });
  }
  return out;
}

function buildDecorationObstacles(layout: LayoutResult): Obstacle[] {
  const out: Obstacle[] = [];
  for (const node of layout.nodes) {
    out.push({ ...inflate(node.icon, 4), content: { ...node.icon }, id: node.id, kind: "node" });
    if (node.label.w > 0 && node.label.h > 0) {
      out.push({ ...inflate(node.label, 4), content: { ...node.label }, id: node.id, kind: "node" });
    }
  }
  for (const group of layout.groups) {
    const content = headerLabelRect(group);
    out.push({ ...inflate(content, 2), content, id: group.id, kind: "header" });
  }
  for (const stroke of boundaryStrokeRects(layout.groups)) out.push({ ...stroke, kind: "header", soft: true });
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
    x: (group.labelPosition ?? "top-left").endsWith("right") ? group.bounds.x + group.bounds.w - w : group.bounds.x,
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
      const yOverlap = g.bounds.y < other.bounds.y + other.bounds.h && other.bounds.y < g.bounds.y + g.bounds.h;
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
  const azTop = layout.groups.filter((g) => g.kind === "az").map((g) => g.bounds.y);
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
  const make = (a: Side, b: Side, ao = 0.5, bo = 0.5, preferenceCost = 0): PortChoice => ({
    src: port(source, a, ao),
    tgt: port(target, b, bo),
    srcSide: a,
    tgtSide: b,
    preferenceCost: preferenceCost + portBacktrackCost(source, target, a, b),
  });
  const pairs = geometricSidePairs(source, target, isFailure);
  if (sourcePort || targetPort || sourcePortOffset !== undefined || targetPortOffset !== undefined) {
    const fallbackSource = isFailure ? "e" : iconCenter(target).x >= iconCenter(source).x ? "e" : "w";
    const fallbackTarget = isFailure ? "n" : fallbackSource === "e" ? "w" : "e";
    const resolvedSource = sourcePort ?? fallbackSource;
    const resolvedTarget = targetPort ?? fallbackTarget;
    const sourceLocked = sourcePortOffset !== undefined;
    const targetLocked = targetPortOffset !== undefined;
    const preferred: Array<{ pair: [Side, Side]; cost: number }> = [
      {
        pair: [resolvedSource, resolvedTarget],
        cost: 0,
      },
    ];

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

    const choices = alignNearOpposingPorts(
      preferred.flatMap(({ pair: [a, b], cost }) =>
        portOffsetVariants(a, b, make, cost, sourcePortOffset, targetPortOffset),
      ),
      source,
      target,
      sourceLocked,
      targetLocked,
    );
    return avoidLabelPorts(choices, source, target, sourceLocked, targetLocked);
  }

  const choices = alignNearOpposingPorts(
    pairs.flatMap(([a, b], index) => portOffsetVariants(a, b, make, index * PORT_SIDE_FALLBACK_COST)),
    source,
    target,
    false,
    false,
  );
  return avoidLabelPorts(choices, source, target, false, false);
}

function portBacktrackCost(source: NodeGeom, target: NodeGeom, sourceSide: Side, targetSide: Side): number {
  const sourceCenter = iconCenter(source);
  const targetCenter = iconCenter(target);
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  const sourceNormal = sideNormal(sourceSide);
  const targetNormal = sideNormal(targetSide);
  const sourceAway = sourceNormal.x * dx + sourceNormal.y * dy < 0;
  const targetAway = targetNormal.x * -dx + targetNormal.y * -dy < 0;
  return (sourceAway ? PORT_BACKTRACK_COST : 0) + (targetAway ? PORT_BACKTRACK_COST : 0);
}

function sideNormal(side: Side): Point {
  switch (side) {
    case "n":
      return { x: 0, y: -1 };
    case "e":
      return { x: 1, y: 0 };
    case "s":
      return { x: 0, y: 1 };
    case "w":
      return { x: -1, y: 0 };
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
  const straight = (choice: PortChoice) =>
    (choice.src.x === choice.tgt.x &&
      ((choice.srcSide === "n" && choice.tgtSide === "s") || (choice.srcSide === "s" && choice.tgtSide === "n"))) ||
    (choice.src.y === choice.tgt.y &&
      ((choice.srcSide === "e" && choice.tgtSide === "w") || (choice.srcSide === "w" && choice.tgtSide === "e")));
  return choices
    .map((choice) =>
      straight(choice)
        ? choice
        : {
            ...choice,
            preferenceCost:
              choice.preferenceCost +
              (!sourceLocked && choice.srcSide === sourceLabelSide ? LABEL_SIDE_FALLBACK_COST : 0) +
              (!targetLocked && choice.tgtSide === targetLabelSide ? LABEL_SIDE_FALLBACK_COST : 0) +
              (!sourceLocked && portStemHitsLabel(source, choice.srcSide, choice.src) ? LABEL_PORT_COLLISION_COST : 0) +
              (!targetLocked && portStemHitsLabel(target, choice.tgtSide, choice.tgt) ? LABEL_PORT_COLLISION_COST : 0),
          },
    )
    .sort((a, b) => a.preferenceCost - b.preferenceCost);
}

function portStemHitsLabel(node: NodeGeom, side: Side, anchor: Point): boolean {
  if (node.label.w <= 0 || node.label.h <= 0) return false;
  if (side !== labelSide(node)) return false;
  const distance = Math.max(node.icon.w, node.icon.h, node.label.w, node.label.h) + 16;
  const outward = {
    n: { x: anchor.x, y: anchor.y - distance },
    e: { x: anchor.x + distance, y: anchor.y },
    s: { x: anchor.x, y: anchor.y + distance },
    w: { x: anchor.x - distance, y: anchor.y },
  }[side];
  return segmentHits(anchor, outward, node.label);
}

function labelSide(node: NodeGeom): Side {
  const position = node.labelPosition ?? "bottom";
  if (position === "top") return "n";
  return "s";
}

function geometricSidePairs(source: NodeGeom, target: NodeGeom, isFailure: boolean): Array<[Side, Side]> {
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
        ? [
            ["e", "w"],
            ["e", "n"],
            ["e", "e"],
            ["s", "w"],
            ["n", "w"],
          ]
        : [
            ["w", "e"],
            ["w", "n"],
            ["w", "w"],
            ["s", "e"],
            ["n", "e"],
          ];
    }
    // Enter a stacked target through the face that looks back at the source.
    const toward: Side = dx >= 0 ? "e" : "w";
    return dy >= 0
      ? [
          ["s", "n"],
          [toward, "n"],
          ["e", "w"],
          ["w", "e"],
          ["s", "e"],
          ["s", "w"],
        ]
      : [
          ["n", "s"],
          [toward, "s"],
          ["e", "w"],
          ["w", "e"],
          ["n", "e"],
          ["n", "w"],
        ];
  }

  const sameColumn =
    source.obstacle.x < target.obstacle.x + target.obstacle.w &&
    target.obstacle.x < source.obstacle.x + source.obstacle.w;

  if (sameColumn && Math.abs(dy) > source.icon.h) {
    // The facing pair wins outright when it aligns into one straight line;
    // otherwise its label penalty keeps it behind any clear side-wrapping shape.
    return [dy >= 0 ? ["s", "n"] : ["n", "s"], ["e", "e"], ["w", "w"], ["e", "w"]];
  }
  if (Math.abs(dy) > Math.abs(dx)) {
    return dy >= 0
      ? [
          ["s", "n"],
          ["e", "w"],
          ["s", "w"],
          ["s", "e"],
          ["e", "n"],
        ]
      : [
          ["n", "s"],
          ["e", "w"],
          ["n", "w"],
          ["n", "e"],
          ["e", "s"],
        ];
  }
  if (dx >= 0) {
    return dy < 0
      ? [
          ["e", "w"],
          ["e", "n"],
          ["s", "w"],
          ["e", "e"],
          ["n", "w"],
        ]
      : [
          ["e", "w"],
          ["e", "n"],
          ["s", "w"],
          ["e", "e"],
        ];
  }
  return dy < 0
    ? [
        ["w", "e"],
        ["e", "e"],
        ["n", "w"],
        ["n", "e"],
      ]
    : [
        ["w", "e"],
        ["e", "e"],
        ["n", "w"],
        ["s", "e"],
      ];
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
  const sourceOffsets = sourceOffset === undefined ? [0.5, 0.25, 0.75] : [normalizePortOffset(sourceOffset)];
  const targetOffsets = targetOffset === undefined ? [0.5, 0.25, 0.75] : [normalizePortOffset(targetOffset)];
  const variants: PortChoice[] = [];
  for (const candidateSourceOffset of sourceOffsets) {
    for (const candidateTargetOffset of targetOffsets) {
      const offsetCost =
        (sourceOffset === undefined && candidateSourceOffset !== 0.5 ? PORT_OFFSET_FALLBACK_COST : 0) +
        (targetOffset === undefined && candidateTargetOffset !== 0.5 ? PORT_OFFSET_FALLBACK_COST : 0);
      variants.push(make(sourceSide, targetSide, candidateSourceOffset, candidateTargetOffset, baseCost + offsetCost));
    }
  }
  return variants;
}

function uniquePortChoices(choices: PortChoice[]): PortChoice[] {
  const unique = new Map<string, PortChoice>();
  for (const choice of choices) {
    const key = [choice.src.x, choice.src.y, choice.tgt.x, choice.tgt.y, choice.srcSide, choice.tgtSide].join(":");
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
  const aligned = choices.flatMap((choice) => {
    const faces = `${choice.srcSide}${choice.tgtSide}`;
    const axis = faces === "ew" || faces === "we" ? "y" : faces === "sn" || faces === "ns" ? "x" : null;
    if (!axis || choice.src[axis] === choice.tgt[axis]) return [choice];
    // Horizontal flows keep centered attachments beyond a one-cell jog so
    // parallel lanes and edge labels stay where the layout reserved them.
    if (axis === "y" && Math.abs(choice.src.y - choice.tgt.y) > MICRO_JOG_THRESHOLD) return [choice];
    const size = axis === "x" ? "w" : "h";
    const low = Math.max(source.icon[axis], target.icon[axis]);
    const high = Math.min(source.icon[axis] + source.icon[size], target.icon[axis] + target.icon[size]);
    // A shared row or column makes a straight connector possible. Keep the
    // source lane when it already lies in that overlap, then the target lane,
    // and otherwise meet in the middle of the overlap.
    const within = (value: number) => value >= low && value <= high;
    const value = sourceOffsetLocked
      ? choice.src[axis]
      : targetOffsetLocked
        ? choice.tgt[axis]
        : within(choice.src[axis])
          ? choice.src[axis]
          : within(choice.tgt[axis])
            ? choice.tgt[axis]
            : (low + high) / 2;
    if (!within(value)) return [choice];
    const shifted = {
      ...choice,
      src: sourceOffsetLocked ? choice.src : { ...choice.src, [axis]: value },
      tgt: targetOffsetLocked ? choice.tgt : { ...choice.tgt, [axis]: value },
    };
    // Keep the original centred option available. Straightening a tiny jog
    // can move an endpoint well away from the middle of its icon; price that
    // actual displacement instead of inheriting a zero-cost centre preference.
    const offsetCost = (node: NodeGeom, point: Point) =>
      (Math.abs(point[axis] - (node.icon[axis] + node.icon[size] / 2)) / node.icon[size]) *
      4 *
      PORT_OFFSET_FALLBACK_COST;
    shifted.preferenceCost +=
      (sourceOffsetLocked ? 0 : offsetCost(source, shifted.src) - offsetCost(source, choice.src)) +
      (targetOffsetLocked ? 0 : offsetCost(target, shifted.tgt) - offsetCost(target, choice.tgt));
    return [choice, shifted];
  });
  return uniquePortChoices(aligned);
}

function iconCenter(node: NodeGeom): Point {
  return { x: node.icon.x + node.icon.w / 2, y: node.icon.y + node.icon.h / 2 };
}

function groupAncestorIds(doc: DiagramDocument, entityId: string): string[] {
  const ids: string[] = [];
  let current: string | undefined = entityId;
  while (true) {
    const parent = getParentGroup(doc, current);
    if (!parent) break;
    ids.push(parent.id);
    current = parent.id;
  }
  return ids;
}

function sharedAncestorGroupId(doc: DiagramDocument, sourceId: string, targetId: string): string | undefined {
  const targetAncestors = new Set(groupAncestorIds(doc, targetId));
  for (const id of groupAncestorIds(doc, sourceId)) {
    if (targetAncestors.has(id)) return id;
  }
  return undefined;
}

function containmentForEdge(
  doc: DiagramDocument,
  layout: LayoutResult,
  sourceId: string,
  targetId: string,
): Rect | undefined {
  const groupId = sharedAncestorGroupId(doc, sourceId, targetId);
  if (!groupId) return undefined;
  return layout.groups.find((group) => group.id === groupId)?.bounds;
}

function guttersInside(gutters: number[], rect: Rect, axis: "x" | "y"): number[] {
  const lo = axis === "x" ? rect.x + GROUP_CONTAINMENT_INSET : rect.y + GROUP_CONTAINMENT_INSET;
  const hi = axis === "x" ? rect.x + rect.w - GROUP_CONTAINMENT_INSET : rect.y + rect.h - GROUP_CONTAINMENT_INSET;
  const filtered = gutters.filter((value) => value >= lo && value <= hi);
  return [...new Set([...filtered, lo, hi].map((value) => snap(value)))].sort((a, b) => a - b);
}

function segmentInsideRect(a: Point, b: Point, rect: Rect): boolean {
  const inset = GROUP_CONTAINMENT_INSET;
  const box = {
    x: rect.x + inset,
    y: rect.y + inset,
    w: rect.w - inset * 2,
    h: rect.h - inset * 2,
  };
  if (box.w <= 0 || box.h <= 0) return true;
  if (a.x === b.x) {
    if (a.x < box.x || a.x > box.x + box.w) return false;
    return Math.min(a.y, b.y) >= box.y && Math.max(a.y, b.y) <= box.y + box.h;
  }
  if (a.y === b.y) {
    if (a.y < box.y || a.y > box.y + box.h) return false;
    return Math.min(a.x, b.x) >= box.x && Math.max(a.x, b.x) <= box.x + box.w;
  }
  return false;
}

function pathRespectsContainment(points: Point[], rect: Rect | undefined): boolean {
  if (!rect) return true;
  for (let index = 0; index < points.length - 1; index++) {
    if (!segmentInsideRect(points[index]!, points[index + 1]!, rect)) return false;
  }
  return true;
}

function createRouteContext(
  source: NodeGeom,
  target: NodeGeom,
  ports: PortChoice,
  style: EdgeStyle = "solid",
  containment?: Rect,
): RouteContext {
  return {
    sourceId: source.id,
    targetId: target.id,
    sourcePoint: ports.src,
    targetPoint: ports.tgt,
    sourceSide: ports.srcSide,
    targetSide: ports.tgtSide,
    style,
    containment,
  };
}

function port(node: NodeGeom, side: Side, offset = 0.5): Point {
  return portPoint(node.icon, side, normalizePortOffset(offset));
}

function snapRouteEndpoints(points: Point[], source: NodeGeom, target: NodeGeom): Point[] {
  if (points.length < 2) return points.map((point) => ({ ...point }));
  const next = points.map((point) => ({ ...point }));
  next[0] = preserveAttachedEndpoint(source.icon, next[0]!);
  next[next.length - 1] = preserveAttachedEndpoint(target.icon, next.at(-1)!);
  return next;
}

function preserveAttachedEndpoint(icon: Rect, point: Point): Point {
  // Automatic routes can align nearby ports at a fractional offset. Freezing
  // such a path for manual editing must not quantize a valid attachment and
  // introduce a tiny elbow. Detached endpoints still follow a moved icon.
  const epsilon = 0.000001;
  const onVerticalEdge =
    (Math.abs(point.x - icon.x) <= epsilon || Math.abs(point.x - icon.x - icon.w) <= epsilon) &&
    point.y >= icon.y - epsilon &&
    point.y <= icon.y + icon.h + epsilon;
  const onHorizontalEdge =
    (Math.abs(point.y - icon.y) <= epsilon || Math.abs(point.y - icon.y - icon.h) <= epsilon) &&
    point.x >= icon.x - epsilon &&
    point.x <= icon.x + icon.w + epsilon;
  return onVerticalEdge || onHorizontalEdge ? { ...point } : nearestPortAnchor(icon, point).point;
}

/**
 * Keep route endpoints on their authored perimeter positions while enforcing
 * the direction of the terminal legs. Source legs leave their icon and target
 * legs approach their icon from outside the corresponding face. A detached
 * endpoint is reattached to the nearest authored port before its face is
 * inferred.
 */
export function anchorRouteEndpoints(points: Point[], sourceIcon: Rect, targetIcon: Rect): Point[] {
  const normalized = normalizeOrthogonalRoute(points);
  if (normalized.length < 2) return normalized;

  const out = normalized.map((point) => ({ ...point }));
  out[0] = preserveAttachedEndpoint(sourceIcon, out[0]!);
  out[out.length - 1] = preserveAttachedEndpoint(targetIcon, out.at(-1)!);

  const sourceSide = perimeterSide(sourceIcon, out[0]!);
  const targetSide = perimeterSide(targetIcon, out.at(-1)!);
  repairTerminalDirection(out, true, sourceSide);
  repairTerminalDirection(out, false, targetSide);
  collapseInteriorBacktracks(out);
  return normalizeOrthogonalRoute(out);
}

function perimeterSide(icon: Rect, point: Point): Side {
  const epsilon = 0.000001;
  const onWest =
    Math.abs(point.x - icon.x) <= epsilon && point.y >= icon.y - epsilon && point.y <= icon.y + icon.h + epsilon;
  const onEast =
    Math.abs(point.x - icon.x - icon.w) <= epsilon &&
    point.y >= icon.y - epsilon &&
    point.y <= icon.y + icon.h + epsilon;
  const onNorth =
    Math.abs(point.y - icon.y) <= epsilon && point.x >= icon.x - epsilon && point.x <= icon.x + icon.w + epsilon;
  const onSouth =
    Math.abs(point.y - icon.y - icon.h) <= epsilon &&
    point.x >= icon.x - epsilon &&
    point.x <= icon.x + icon.w + epsilon;
  const sides = [
    onWest ? "w" : undefined,
    onEast ? "e" : undefined,
    onNorth ? "n" : undefined,
    onSouth ? "s" : undefined,
  ].filter((side): side is Side => side !== undefined);
  // Corners belong to two faces. The nearest authored port gives a stable
  // deterministic choice and is also the fallback for any unusual detached
  // point that reached this helper directly.
  return sides.length === 1 ? sides[0]! : nearestPortAnchor(icon, point).side;
}

function repairTerminalDirection(points: Point[], source: boolean, side: Side): void {
  if (points.length < 2) return;
  const endpointIndex = source ? 0 : points.length - 1;
  const neighborIndex = source ? 1 : points.length - 2;
  const endpoint = points[endpointIndex]!;
  const neighbor = points[neighborIndex]!;
  const adjacent = source ? points[2] : points.at(-3);
  const terminalReversal =
    adjacent !== undefined &&
    (source ? immediateReversal(endpoint, neighbor, adjacent) : immediateReversal(adjacent, neighbor, endpoint));
  if (followsOutwardDirection(endpoint, neighbor, side) && !terminalReversal) return;

  const stem = outwardStem(endpoint, side);
  const axis = side === "e" || side === "w" ? "horizontal" : "vertical";
  const bridgeNeighbor = terminalReversal ? adjacent! : neighbor;
  const sameAxis = axis === "horizontal" ? bridgeNeighbor.y === endpoint.y : bridgeNeighbor.x === endpoint.x;
  const replacement = source
    ? sourceTerminalBridge(endpoint, bridgeNeighbor, stem, axis, sameAxis)
    : targetTerminalBridge(bridgeNeighbor, endpoint, stem, axis, sameAxis);
  if (sameAxis) {
    const beforeBridge = source ? points[2] : points.at(-4);
    const afterBridge = source ? points[3] : points.at(-3);
    const bridgeReversal = source
      ? beforeBridge !== undefined &&
        afterBridge !== undefined &&
        immediateReversal(replacement.at(-2)!, replacement.at(-1)!, afterBridge)
      : beforeBridge !== undefined && immediateReversal(beforeBridge, replacement[0]!, replacement[1]!);
    if (bridgeReversal) flipTerminalBridgeOffset(replacement, axis, endpoint, source);
  }
  // If the authored elbow turns straight back into the existing route, move
  // that elbow onto the exterior bridge. This preserves the route's body and
  // avoids leaving a visible 180-degree spur before the new terminal stem.
  if (adjacent) {
    if (source && replacement.length >= 2 && immediateReversal(replacement.at(-2)!, replacement.at(-1)!, adjacent)) {
      replacement[replacement.length - 1] = replacement.at(-2)!;
    }
    if (!source && replacement.length >= 2 && immediateReversal(adjacent, replacement[0]!, replacement[1]!)) {
      replacement[0] = replacement[1]!;
    }
  }
  if (source) {
    points.splice(0, terminalReversal ? 3 : 2, ...replacement);
  } else {
    points.splice(points.length - (terminalReversal ? 3 : 2), terminalReversal ? 3 : 2, ...replacement);
  }
}

function flipTerminalBridgeOffset(
  replacement: Point[],
  axis: "horizontal" | "vertical",
  endpoint: Point,
  source: boolean,
): void {
  if (replacement.length < 4) return;
  const firstOffsetIndex = source ? 2 : 1;
  const secondOffsetIndex = source ? 3 : 2;
  if (axis === "horizontal") {
    const current = replacement[firstOffsetIndex]!.y;
    const alternate = endpoint.y * 2 - current;
    replacement[firstOffsetIndex]!.y = alternate;
    replacement[secondOffsetIndex]!.y = alternate;
  } else {
    const current = replacement[firstOffsetIndex]!.x;
    const alternate = endpoint.x * 2 - current;
    replacement[firstOffsetIndex]!.x = alternate;
    replacement[secondOffsetIndex]!.x = alternate;
  }
}

function immediateReversal(a: Point, b: Point, c: Point): boolean {
  if (a.x === b.x && b.x === c.x) {
    return (b.y - a.y) * (c.y - b.y) < 0;
  }
  if (a.y === b.y && b.y === c.y) {
    return (b.x - a.x) * (c.x - b.x) < 0;
  }
  return false;
}

function collapseInteriorBacktracks(points: Point[]): void {
  let changed = true;
  while (changed && points.length > 4) {
    changed = false;
    // Keep both terminal stems intact. Only remove a malformed interior elbow
    // that makes the route immediately retrace its preceding segment.
    for (let index = 2; index <= points.length - 3; index++) {
      if (!immediateReversal(points[index - 1]!, points[index]!, points[index + 1]!)) continue;
      points.splice(index, 1);
      changed = true;
      break;
    }
  }
}

function followsOutwardDirection(endpoint: Point, neighbor: Point, side: Side): boolean {
  switch (side) {
    case "e":
      return neighbor.x > endpoint.x && neighbor.y === endpoint.y;
    case "w":
      return neighbor.x < endpoint.x && neighbor.y === endpoint.y;
    case "n":
      return neighbor.y < endpoint.y && neighbor.x === endpoint.x;
    case "s":
      return neighbor.y > endpoint.y && neighbor.x === endpoint.x;
  }
}

function outwardStem(point: Point, side: Side): Point {
  switch (side) {
    case "e":
      return { x: point.x + MIN_TERMINAL_STEM, y: point.y };
    case "w":
      return { x: point.x - MIN_TERMINAL_STEM, y: point.y };
    case "n":
      return { x: point.x, y: point.y - MIN_TERMINAL_STEM };
    case "s":
      return { x: point.x, y: point.y + MIN_TERMINAL_STEM };
  }
}

function sourceTerminalBridge(
  endpoint: Point,
  neighbor: Point,
  stem: Point,
  axis: "horizontal" | "vertical",
  sameAxis: boolean,
): Point[] {
  if (!sameAxis) {
    return [
      endpoint,
      stem,
      axis === "horizontal" ? { x: stem.x, y: neighbor.y } : { x: neighbor.x, y: stem.y },
      neighbor,
    ];
  }
  const offset = perpendicularOffset(endpoint, neighbor, axis);
  return axis === "horizontal"
    ? [endpoint, stem, { x: stem.x, y: offset }, { x: neighbor.x, y: offset }, neighbor]
    : [endpoint, stem, { x: offset, y: stem.y }, { x: offset, y: neighbor.y }, neighbor];
}

function targetTerminalBridge(
  neighbor: Point,
  endpoint: Point,
  stem: Point,
  axis: "horizontal" | "vertical",
  sameAxis: boolean,
): Point[] {
  if (!sameAxis) {
    return [
      neighbor,
      axis === "horizontal" ? { x: stem.x, y: neighbor.y } : { x: neighbor.x, y: stem.y },
      stem,
      endpoint,
    ];
  }
  const offset = perpendicularOffset(endpoint, neighbor, axis);
  return axis === "horizontal"
    ? [neighbor, { x: neighbor.x, y: offset }, { x: stem.x, y: offset }, stem, endpoint]
    : [neighbor, { x: offset, y: neighbor.y }, { x: offset, y: stem.y }, stem, endpoint];
}

function perpendicularOffset(endpoint: Point, neighbor: Point, axis: "horizontal" | "vertical"): number {
  if (axis === "horizontal") {
    const positive = endpoint.y + MIN_TERMINAL_STEM;
    return neighbor.y === positive ? endpoint.y - MIN_TERMINAL_STEM : positive;
  }
  const positive = endpoint.x + MIN_TERMINAL_STEM;
  return neighbor.x === positive ? endpoint.x - MIN_TERMINAL_STEM : positive;
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

  let xs = uniqueNums([snap((a.x + b.x) / 2), ...vGutters]);
  if (srcSide === "e" && tgtSide === "e") {
    const minX = Math.max(a.x, b.x);
    xs = uniqueNums([minX, minX + 16, minX + 32, ...vGutters.filter((x) => x >= minX)]);
  } else if (srcSide === "w" && tgtSide === "w") {
    const maxX = Math.min(a.x, b.x);
    xs = uniqueNums([maxX, maxX - 16, ...vGutters.filter((x) => x <= maxX)]);
  } else if (srcSide === "e" && tgtSide === "w") {
    xs = uniqueNums([snap((a.x + b.x) / 2), ...vGutters.filter((x) => x >= a.x - 8 && x <= b.x + 8)]);
  }

  for (const midX of xs) {
    push([a, { x: midX, y: a.y }, { x: midX, y: b.y }, b]);
  }

  let ys = uniqueNums([snap((a.y + b.y) / 2), ...hGutters]);
  if (srcSide === "s" && tgtSide === "n") {
    ys = uniqueNums([
      snap((a.y + b.y) / 2),
      ...hGutters.filter((y) => y >= Math.min(a.y, b.y) && y <= Math.max(a.y, b.y)),
    ]);
  }
  for (const midY of ys) {
    push([a, { x: a.x, y: midY }, { x: b.x, y: midY }, b]);
  }

  const gx = representativeGutters(xs, a.x, b.x, MAX_COMBINED_GUTTERS_PER_AXIS);
  const gy = representativeGutters(ys, a.y, b.y, MAX_COMBINED_GUTTERS_PER_AXIS);
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

function representativeGutters(values: number[], start: number, end: number, limit: number): number[] {
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
      .sort(
        (a, b) => a.outsideDistance - b.outsideDistance || a.midpointDistance - b.midpointDistance || a.index - b.index,
      );
    for (const candidate of remaining) {
      chosen.add(candidate.value);
      if (chosen.size >= limit) break;
    }
  }

  // Preserve the original gutter order so equal-scoring routes remain stable.
  return values.filter((value) => chosen.has(value)).slice(0, limit);
}

function corridorGutters(existing: ExistingRoute[], axis: "vertical" | "horizontal"): number[] {
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
  budget?: RoutingBudget,
  emergency = false,
): number {
  if (budget) {
    if (emergency) {
      if (!budget.recordEmergencyScorePathCall()) return Infinity;
    } else if (!budget.consume("scorePathCalls")) return Infinity;
  }
  if (points.length < 2) return Infinity;
  if (
    samePoint(points[0]!, context.sourcePoint) &&
    !followsAttachmentDirection(points[0]!, points[1]!, context.sourceSide)
  )
    return Infinity;
  if (
    samePoint(points.at(-1)!, context.targetPoint) &&
    !followsAttachmentDirection(points.at(-1)!, points.at(-2)!, context.targetSide)
  )
    return Infinity;
  if (!pathRespectsContainment(points, context.containment)) return Infinity;
  let score = routePathBaseCost(points).score;
  if (score >= scoreCeiling) return score;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (a.x !== b.x && a.y !== b.y) return Infinity;
    const isFirst = i === 0;
    const isLast = i === points.length - 2;
    for (const obs of obstacles) {
      // Only the short attachment segment may enter its own complete card.
      if (obs.kind === "node" && obs.id === context.sourceId && isFirst && samePoint(a, context.sourcePoint)) {
        continue;
      }
      if (obs.kind === "node" && obs.id === context.targetId && isLast && samePoint(b, context.targetPoint)) {
        continue;
      }
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
      if (
        (other.sourceId === context.sourceId || other.targetId === context.targetId) &&
        other.labelRect &&
        segmentHits(a, b, inflate(other.labelRect, LABEL_TO_CONNECTOR_CLEARANCE))
      ) {
        return Infinity;
      }
      const overlap = overlapLength(a, b, other.points);
      if (overlap) {
        // Keep corridor sharing as a strong preference rather than making the
        // path unscorable. Infinite rejection previously forced the fallback
        // to drop every established route at once, producing reverse overlaps.
        score += overlap * OVERLAP_COST;
        if (score >= scoreCeiling) return score;
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
    if (!other.points.length) continue;
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

function segmentOverlapLength(a: Point, b: Point, c: Point, d: Point): number {
  if (a.x === b.x && c.x === d.x && a.x === c.x) {
    return Math.max(
      0,
      Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)),
    );
  }
  if (a.y === b.y && c.y === d.y && a.y === c.y) {
    return Math.max(
      0,
      Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)),
    );
  }
  return 0;
}

function segmentIntersectionKind(a: Point, b: Point, c: Point, d: Point): "cross" | "touch" | null {
  const firstVertical = a.x === b.x;
  const secondVertical = c.x === d.x;
  if (firstVertical === secondVertical) return null;

  const verticalA = firstVertical ? a : c;
  const verticalB = firstVertical ? b : d;
  const horizontalA = firstVertical ? c : a;
  const horizontalB = firstVertical ? d : b;
  const x = verticalA.x;
  const y = horizontalA.y;
  const onVertical = y >= Math.min(verticalA.y, verticalB.y) && y <= Math.max(verticalA.y, verticalB.y);
  const onHorizontal = x >= Math.min(horizontalA.x, horizontalB.x) && x <= Math.max(horizontalA.x, horizontalB.x);
  if (!onVertical || !onHorizontal) return null;

  const insideVertical = y > Math.min(verticalA.y, verticalB.y) && y < Math.max(verticalA.y, verticalB.y);
  const insideHorizontal = x > Math.min(horizontalA.x, horizontalB.x) && x < Math.max(horizontalA.x, horizontalB.x);
  return insideVertical && insideHorizontal ? "cross" : "touch";
}

function nearParallelLength(a: Point, b: Point, c: Point, d: Point, clearance: number): number {
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

function boundaryParallelOverlapLength(a: Point, b: Point, boundary: GroupBoundary): number {
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
  budget?: RoutingBudget,
): Point[] {
  let path = simplify(points);
  for (let pass = 0; pass < boundaries.length; pass++) {
    if (budget?.exhausted) return path;
    let changed = false;
    for (let index = 1; index < path.length - 2; index++) {
      const a = path[index]!;
      const b = path[index + 1]!;
      const conflicts = boundaries.filter((boundary) => boundaryParallelOverlapLength(a, b, boundary) > 0);
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
      const baselineScore = scorePath(path, obstacles, context, existing, Infinity, [], budget);
      // Existing diagrams may already contain a reviewed crossing or shared
      // corridor. Do not turn a local visibility correction into a global
      // reroute or silently exchange one reviewed conflict for another.
      if (!Number.isFinite(baselineScore) || pathHasRouteIntersection(path, existing)) continue;
      for (const candidate of candidates) {
        const conflictScore = scorePath(candidate, obstacles, context, existing, Infinity, [], budget);
        // A cosmetic clearance correction must not buy visibility by adding a
        // resource collision, connector overlap, or crossing. Small changes
        // in path length are expected when the adjacent legs are adjusted.
        if (conflictScore > baselineScore + CELL * 2) continue;
        const score = scorePath(candidate, obstacles, context, existing, bestScore, boundaries, budget);
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

function pathHasRouteIntersection(points: Point[], existing: ExistingRoute[]): boolean {
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[index]!;
    const b = points[index + 1]!;
    for (const route of existing) {
      if (overlapLength(a, b, route.points) > 0) return true;
      for (let otherIndex = 0; otherIndex < route.points.length - 1; otherIndex++) {
        if (segmentIntersectionKind(a, b, route.points[otherIndex]!, route.points[otherIndex + 1]!) !== null)
          return true;
      }
    }
  }
  return false;
}

function intervalOverlap(a: number, b: number, c: number, d: number): number {
  return Math.max(0, Math.min(Math.max(a, b), Math.max(c, d)) - Math.max(Math.min(a, b), Math.min(c, d)));
}

function shortcut(
  points: Point[],
  obstacles: Obstacle[],
  context: RouteContext,
  existing: ExistingRoute[] = [],
  boundaries: GroupBoundary[] = [],
  budget?: RoutingBudget,
): Point[] {
  let path = simplify(points);
  for (let iter = 0; iter < 12; iter++) {
    if (budget?.exhausted) return path;
    let changed = false;
    outer: for (let i = 0; i < path.length - 2; i++) {
      for (let j = path.length - 1; j >= i + 2; j--) {
        if (budget?.exhausted) return path;
        const a = path[i]!;
        const b = path[j]!;
        const options: Point[][] = [];
        if (a.x === b.x || a.y === b.y) options.push([a, b]);
        options.push([a, { x: b.x, y: a.y }, b]);
        options.push([a, { x: a.x, y: b.y }, b]);
        const current = path.slice(i, j + 1);
        const currentLen = pathLength(current);
        const currentBends = Math.max(0, current.length - 2);
        let currentScore: number | undefined;
        for (const opt of options) {
          const next = simplify(opt);
          if (next.length > current.length) continue;
          if (pathLength(next) > currentLen && Math.max(0, next.length - 2) >= currentBends) {
            continue;
          }
          if (!pathClear(next, obstacles, context, existing, boundaries, budget)) continue;
          const candidate = simplify([...path.slice(0, i), ...next, ...path.slice(j + 1)]);
          currentScore ??= scorePath(path, obstacles, context, existing, Infinity, boundaries, budget);
          if (scorePath(candidate, obstacles, context, existing, Infinity, boundaries, budget) > currentScore) continue;
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
  budget?: RoutingBudget,
): boolean {
  return scorePath(points, obstacles, context, existing, Infinity, boundaries, budget) < HEADER_COST;
}

function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

function followsAttachmentDirection(from: Point, to: Point, side: Side): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (side === "e") return dx > 0 && dy === 0;
  if (side === "w") return dx < 0 && dy === 0;
  if (side === "s") return dy > 0 && dx === 0;
  return dy < 0 && dx === 0;
}

function routeAStar(
  grid: Grid | null,
  ports: PortChoice,
  source: NodeGeom,
  target: NodeGeom,
  existing: ExistingRoute[],
  conflictCostCache?: Map<number, number>,
  budget?: RoutingBudget,
): Point[] | null {
  if (!grid || budget?.exhausted) return null;
  const start = stepOut(source, ports.src, ports.srcSide);
  const goal = stepOut(target, ports.tgt, ports.tgtSide);
  const mid = astar(grid, start, goal, existing, conflictCostCache, budget);
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

function buildGrid(layout: LayoutResult, obstacles: Obstacle[]): Grid | null {
  const margin = 64;
  const originX = -margin;
  const originY = -margin;
  if (!Number.isFinite(layout.width) || !Number.isFinite(layout.height)) return null;
  const cols = Math.ceil((layout.width + margin * 2) / CELL) + 2;
  const rows = Math.ceil((layout.height + margin * 2) / CELL) + 2;
  if (
    !Number.isSafeInteger(cols) ||
    !Number.isSafeInteger(rows) ||
    cols <= 0 ||
    rows <= 0 ||
    cols * rows > MAX_GRID_CELLS
  )
    return null;
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
  budget?: RoutingBudget,
): Point[] | null {
  // Avoid allocating any of the per-search typed arrays after another phase
  // has exhausted the work budget.
  if (budget?.exhausted) return null;
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
  const segmentIndex = indexRouteSegments(existing);

  while (heap.size > 0) {
    if (budget && !budget.consume("astarExpansions")) return null;
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
        conflictCost = segmentRouteConflictCost(currentPoint, nextPoint, segmentIndex);
        conflictCostCache?.set(segmentKey, conflictCost);
      }
      const tentative = gScore[current] + CELL + (turned ? TURN_COST : 0) + conflictCost;
      if (tentative >= gScore[ni]) continue;
      came[ni] = current;
      gScore[ni] = tentative;
      heap.push(ni, tentative + heuristic(nc, nr, gc.c, gc.r));
    }
  }
  return null;
}

interface RouteSegmentIndex {
  segments: Array<readonly [Point, Point]>;
  rows: Map<number, number[]>;
  cols: Map<number, number[]>;
  diagonal: number[];
}

/** Horizontal segments bucketed by row, vertical (and zero-length) by column, in route order. */
function indexRouteSegments(existing: ExistingRoute[]): RouteSegmentIndex {
  const index: RouteSegmentIndex = { segments: [], rows: new Map(), cols: new Map(), diagonal: [] };
  const add = (buckets: Map<number, number[]>, key: number, id: number) => {
    const bucket = buckets.get(key);
    if (bucket) bucket.push(id);
    else buckets.set(key, [id]);
  };
  for (const route of existing) {
    for (let i = 0; i < route.points.length - 1; i++) {
      const c = route.points[i]!;
      const d = route.points[i + 1]!;
      const id = index.segments.push([c, d]) - 1;
      if (c.x === d.x) add(index.cols, Math.floor(c.x / CELL), id);
      else if (c.y === d.y) add(index.rows, Math.floor(c.y / CELL), id);
      else index.diagonal.push(id);
    }
  }
  return index;
}

// Every cost term needs the other segment within MIN_CONNECTOR_GAP (one CELL) of a-b, so
// only adjacent buckets can contribute. Candidates are summed in route order so totals match
// a full scan bit-for-bit.
function segmentRouteConflictCost(
  a: Point,
  b: Point,
  index: RouteSegmentIndex,
  crossingCost: number = CROSSING_COST,
): number {
  const ids = [...index.diagonal];
  const collect = (buckets: Map<number, number[]>, from: number, to: number) => {
    for (let key = from; key <= to; key++) {
      const bucket = buckets.get(key);
      if (bucket) ids.push(...bucket);
    }
  };
  if (a.y === b.y) {
    const row = Math.floor(a.y / CELL);
    collect(index.rows, row - 1, row + 1);
    collect(index.cols, Math.floor(Math.min(a.x, b.x) / CELL), Math.floor(Math.max(a.x, b.x) / CELL));
  } else {
    const col = Math.floor(a.x / CELL);
    collect(index.cols, col - 1, col + 1);
    collect(index.rows, Math.floor(Math.min(a.y, b.y) / CELL), Math.floor(Math.max(a.y, b.y) / CELL));
  }
  ids.sort((left, right) => left - right);
  let cost = 0;
  for (const id of ids) {
    const [c, d] = index.segments[id]!;
    const overlap = segmentOverlapLength(a, b, c, d);
    cost += overlap * OVERLAP_COST;
    const intersection = segmentIntersectionKind(a, b, c, d);
    if (intersection === "cross") cost += crossingCost;
    if (intersection === "touch") {
      const verticalCandidate = a.x === b.x;
      const verticalA = verticalCandidate ? a : c;
      const horizontalA = verticalCandidate ? c : a;
      const at = { x: verticalA.x, y: horizontalA.y };
      const candidateEndpoint = samePoint(at, a) || samePoint(at, b);
      const existingInterior =
        at.x === c.x
          ? at.y > Math.min(c.y, d.y) && at.y < Math.max(c.y, d.y)
          : at.y === c.y && at.x > Math.min(c.x, d.x) && at.x < Math.max(c.x, d.x);
      // A* and visibility often split a true crossing at the candidate's
      // grid vertex. Charge half on each side so the two pieces sum to the
      // same cost as the final unsplit crossing.
      cost += candidateEndpoint && existingInterior ? crossingCost / 2 : JUNCTION_COST;
    }
    cost += nearParallelLength(a, b, c, d, MIN_CONNECTOR_GAP) * NEAR_PARALLEL_COST;
  }
  return cost;
}

function heuristic(c: number, r: number, gc: number, gr: number): number {
  return (Math.abs(c - gc) + Math.abs(r - gr)) * CELL;
}

function reconstruct(grid: Grid, came: Int32Array, current: number, start: Point, goal: Point): Point[] {
  const cells: Point[] = [];
  let i = current;
  while (i >= 0) {
    const c = i % grid.cols;
    const r = Math.floor(i / grid.cols);
    cells.push(cellToWorld(grid, c, r));
    i = came[i]!;
  }
  cells.reverse();
  if (!cells.length) return [];

  const firstCell = cells[0]!;
  const lastCell = cells.at(-1)!;
  const path = cells;
  if (!samePoint(start, firstCell)) {
    // `start` can retain the icon port's fractional cross-axis coordinate,
    // while its grid cell is snapped to the routing lattice. Replace neither
    // point: connect them with an orthogonal bridge so A* output remains a
    // valid Manhattan path and can pass the same obstacle scorer as templates.
    const corner = { x: firstCell.x, y: start.y };
    path.unshift(start, corner);
  } else {
    path[0] = start;
  }
  if (!samePoint(goal, lastCell)) {
    const corner = { x: goal.x, y: lastCell.y };
    path.push(corner, goal);
  } else {
    path[path.length - 1] = goal;
  }
  return simplify(path);
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
    const collinear = (prev.x === curr.x && curr.x === next.x) || (prev.y === curr.y && curr.y === next.y);
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
export function eraseOrthogonalRouteLoops(points: Point[], preserveCollinearBreaks = false): Point[] {
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
          const candidate = simplify([...out.slice(0, first + 1), intersection, ...out.slice(second + 1)]);
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

function orthogonalSegmentIntersections(a: Point, b: Point, c: Point, d: Point): Point[] {
  const firstVertical = a.x === b.x;
  const secondVertical = c.x === d.x;
  if (firstVertical && secondVertical) {
    if (a.x !== c.x) return [];
    const low = Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y));
    const high = Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y));
    if (low > high) return [];
    return low === high
      ? [{ x: a.x, y: low }]
      : [
          { x: a.x, y: low },
          { x: a.x, y: high },
        ];
  }
  if (!firstVertical && !secondVertical) {
    if (a.y !== c.y) return [];
    const low = Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x));
    const high = Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x));
    if (low > high) return [];
    return low === high
      ? [{ x: low, y: a.y }]
      : [
          { x: low, y: a.y },
          { x: high, y: a.y },
        ];
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
    const elbow = horizontalFirst ? { x: target.x, y: previous.y } : { x: previous.x, y: target.y };
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
export function collapseOrthogonalRouteArtifacts(points: Point[], minimumSegmentLength = 2): Point[] {
  const out = normalizeOrthogonalRoute(points).map((point) => ({ ...point }));
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 1; index < out.length - 1; index++) {
      const previous = out[index - 1]!;
      const current = out[index]!;
      const next = out[index + 1]!;
      const collinear =
        (previous.x === current.x && current.x === next.x) || (previous.y === current.y && current.y === next.y);
      const touchesTinySegment =
        pathLength([previous, current]) <= minimumSegmentLength || pathLength([current, next]) <= minimumSegmentLength;
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

interface ResolvedEdgeLabelPlacement extends EdgeLabelPlacement {
  clean?: boolean;
  contentClear?: boolean;
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
export function projectPointToPolyline(point: Point, points: Point[]): PolylineProjection | undefined {
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
  clearance = EDGE_BADGE_CLEARANCE,
): EdgeBadgePlacement | undefined {
  const segments = pathSegments(points);
  if (!segments.length) return undefined;
  const total = segments.reduce((sum, segment) => sum + segment.len, 0);
  if (!total) return undefined;

  const horizontal = segments.filter((segment) => segment.a.y === segment.b.y).sort((a, b) => b.len - a.len)[0];
  const vertical = segments.filter((segment) => segment.a.x === segment.b.x).sort((a, b) => b.len - a.len)[0];
  const preferred =
    horizontal && horizontal.len >= MINIMUM_BADGE_RUN
      ? horizontal
      : (vertical ?? horizontal ?? [...segments].sort((a, b) => b.len - a.len)[0]);
  const verticalRun = preferred?.a.x === preferred?.b.x;
  const fallbackT = preferred
    ? (preferred.start + preferred.len * (verticalRun ? VERTICAL_BADGE_TARGET_T : 0.5)) / total
    : 0.5;
  const t = clamp01(requestedT ?? fallbackT);
  const projection = pointAtPath(segments, total, t);
  if (!projection) return undefined;

  const topNormal =
    Math.abs(projection.tangent.x) >= Math.abs(projection.tangent.y) ? { x: 0, y: -1 } : { x: -1, y: 0 };
  const normal = requestedSide === "top" ? topNormal : { x: -topNormal.x, y: -topNormal.y };
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
  automaticPreferredT?: number,
): ResolvedEdgeLabelPlacement | undefined {
  const reference = badge ?? getEdgeBadgePlacement(points);
  if (!reference) return undefined;
  const textW = Math.max(16, label.length * 11 * 0.55);
  const segments = pathSegments(points);
  const total = segments.reduce((sum, segment) => sum + segment.len, 0);
  if (!total) return undefined;
  const horizontal = Math.abs(reference.tangent.x) >= Math.abs(reference.tangent.y);
  const fallbackSide: EdgeLabelSide = badge ? oppositeLabelSide(badge.side) : horizontal ? "top" : "bottom";
  const t = clamp01(requestedT ?? automaticPreferredT ?? reference.t);
  const projection = pointAtPath(segments, total, t);
  if (!projection) return undefined;

  // Once a user chooses a label position, respect that exact route-relative
  // position. Auto-placement still tries nearby clearances, but manual label
  // movement must not silently jump to another side or another segment.
  if (requestedT !== undefined || requestedSide !== undefined) {
    return labelPlacementAt(projection, textW, requestedSide ?? fallbackSide, t);
  }

  const preferredSide: EdgeLabelSide = badge ? oppositeLabelSide(badge.side) : fallbackSide;
  const tStep = Math.min(0.18, Math.max(0.04, (CELL * 2) / total));
  const usefulSegments = [...segments]
    .filter((segment) => segment.len >= Math.max(MINIMUM_BADGE_RUN, textW / 2))
    .sort((a, b) => b.len - a.len || a.index - b.index);
  // Probe long runs densely enough to find a clear pocket while keeping the
  // same perpendicular gap as an explicitly placed or dragged label.
  const targetLabelT = horizontal ? clamp01((total - textW / 2) / total) : t;
  const candidateTs = [
    ...new Set([
      t,
      // Probe a deterministic target-end pocket so a fan-out edge can place its
      // label after neighbouring routes turn away; content and owner checks
      // below still reject any overlapping or foreign-route candidate.
      targetLabelT,
      clamp01(t + tStep),
      clamp01(t - tStep),
      clamp01(t + tStep * 2),
      clamp01(t - tStep * 2),
      ...usefulSegments.flatMap((segment) =>
        [0.5, 0.25, 0.75, 0.125, 0.375, 0.625, 0.875].map((offset) => (segment.start + segment.len * offset) / total),
      ),
    ]),
  ];
  // A crowded run may leave only a narrow clear pocket between neighbours. Only
  // the drag gap is probed there, so the pockets never add a distant lane.
  const pocketTs = usefulSegments
    .flatMap((segment) =>
      Array.from(
        { length: Math.floor(segment.len / CELL) },
        (_, index) => (segment.start + CELL * (index + 0.5)) / total,
      ),
    )
    .filter((candidateT) => !candidateTs.includes(candidateT));
  const candidates: Array<{ candidate: EdgeLabelPlacement; attached: boolean }> = [];

  for (const candidateT of [...candidateTs, ...pocketTs]) {
    const candidateProjection = pointAtPath(segments, total, candidateT);
    if (!candidateProjection) continue;
    const candidateHorizontal = Math.abs(candidateProjection.tangent.x) >= Math.abs(candidateProjection.tangent.y);
    const firstSide = candidateT === t ? preferredSide : candidateHorizontal ? "top" : preferredSide;
    const sides: EdgeLabelSide[] = [firstSide, oppositeLabelSide(firstSide)];
    for (const side of sides) {
      const baseClearance = candidateHorizontal ? (side === "top" ? 8 : 20) : textW / 2 + 12;
      for (const extra of candidateTs.includes(candidateT) ? [0, 16, 32] : [0]) {
        candidates.push({
          candidate: labelPlacementAt(candidateProjection, textW, side, candidateT, baseClearance + extra),
          attached: extra === 0,
        });
      }
    }
  }

  const scored = candidates.map(({ candidate, attached }) => {
    const centre = {
      x: candidate.rect.x + candidate.rect.w / 2,
      y: candidate.rect.y + candidate.rect.h / 2,
    };
    const ownDistance = distanceToPolyline(centre, points);
    const ownPointDistance = distanceToPolyline(candidate.point, points);
    const ownerClear = otherEdges.every(
      (edge) =>
        distanceToPolyline(centre, edge.points) >= ownDistance &&
        distanceToPolyline(candidate.point, edge.points) >= ownPointDistance,
    );
    // Match the renderer's minimum text-to-content clearance. Wider spacing is
    // still a soft score below, but a candidate that satisfies this contract is
    // preferred even when dense sibling routes make ownership ambiguous.
    const contentClear = obstacles.every(
      (obstacle) => obstacle.soft || !rectsIntersect(candidate.rect, obstacle.content ?? obstacle, 2),
    );
    const decorationClear =
      contentClear &&
      allBadges.every(
        (badge) => !circleIntersectsRect(badge.point, GRAMMAR.badgeRadius, candidate.rect, LABEL_CONTENT_CLEARANCE),
      ) &&
      occupiedLabels.every((label) => !rectsIntersect(candidate.rect, label, LABEL_TO_LABEL_CLEARANCE));
    return {
      candidate,
      attached,
      ownerClear,
      contentClear,
      decorationClear,
      score: labelCollisionScore(candidate, t, preferredSide, obstacles, otherEdges, allBadges, occupiedLabels, points),
    };
  });
  // Prefer the drag gap when it avoids content, then a wider lane whose copy
  // still touches the route (as beside an elbow), and a distant lane only last.
  const ownedAttached = scored.filter((entry) => entry.attached && entry.decorationClear && entry.ownerClear);
  const ownedNearby = scored.filter(
    (entry) =>
      entry.decorationClear &&
      entry.ownerClear &&
      distanceFromRectToPolyline(entry.candidate.rect, points) <= MAX_ATTACHED_LABEL_GAP,
  );
  const clearAttached = scored.filter((entry) => entry.attached && entry.decorationClear);
  const clearNearby = scored.filter(
    (entry) =>
      entry.decorationClear && distanceFromRectToPolyline(entry.candidate.rect, points) <= MAX_ATTACHED_LABEL_GAP,
  );
  const contentClear = scored.filter((entry) => entry.decorationClear);
  const attached = scored.filter((entry) => entry.attached && entry.score < LABEL_COLLISION_COST);
  const nearby = scored.filter(
    (entry) =>
      entry.score < LABEL_COLLISION_COST &&
      distanceFromRectToPolyline(entry.candidate.rect, points) <= MAX_ATTACHED_LABEL_GAP,
  );
  const eligible =
    [ownedAttached, ownedNearby, clearAttached, clearNearby, contentClear, attached, nearby].find(
      (pool) => pool.length > 0,
    ) ?? scored;
  let best = eligible[0]?.candidate;
  let bestScore = Infinity;
  for (const { candidate, score } of eligible) {
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  const selected = eligible.find((entry) => entry.candidate === best);
  return (
    best && {
      ...best,
      clean: ownedAttached.length > 0 || ownedNearby.length > 0,
      contentClear: selected?.contentClear,
    }
  );
}

function labelCollisionScore(
  candidate: EdgeLabelPlacement,
  preferredT: number,
  preferredSide: EdgeLabelSide,
  obstacles: Obstacle[],
  otherEdges: RoutedEdge[],
  badges: EdgeBadgePlacement[],
  occupiedLabels: Rect[],
  ownRoute: Point[],
): number {
  let score = Math.abs(candidate.t - preferredT) * 1_000;
  if (candidate.side !== preferredSide) score += 20;
  score += Math.hypot(candidate.point.x - candidate.anchor.x, candidate.point.y - candidate.anchor.y) * 40;

  for (const obstacle of obstacles) {
    if (rectsIntersect(candidate.rect, obstacle.content ?? obstacle, 0)) {
      // Copy struck through by a frame line reads worse than copy beside a card.
      score += obstacle.soft ? LABEL_NEAR_CONTENT_COST * 2 : LABEL_COLLISION_COST;
    } else if (!obstacle.soft && rectsIntersect(candidate.rect, obstacle, LABEL_CONTENT_CLEARANCE)) {
      score += LABEL_NEAR_CONTENT_COST;
    } else if (obstacle.soft && rectsIntersect(candidate.rect, obstacle, LABEL_CONTENT_CLEARANCE * 2)) {
      score += LABEL_NEAR_FRAME_COST;
    }
  }
  for (const badge of badges) {
    if (circleIntersectsRect(badge.point, GRAMMAR.badgeRadius, candidate.rect, LABEL_CONTENT_CLEARANCE)) {
      score += LABEL_COLLISION_COST;
    }
  }
  for (const label of occupiedLabels) {
    if (rectsIntersect(candidate.rect, label, LABEL_TO_LABEL_CLEARANCE)) {
      score += LABEL_COLLISION_COST;
    }
  }
  const inflatedLabel = inflate(candidate.rect, LABEL_TO_CONNECTOR_CLEARANCE);
  // A label nearer another connector than its own labels the wrong arrow.
  // Those candidates are hard-ineligible; an automatic badge in the way moves
  // aside in the refinement pass instead.
  const centre = {
    x: candidate.rect.x + candidate.rect.w / 2,
    y: candidate.rect.y + candidate.rect.h / 2,
  };
  const ownDistance = distanceToPolyline(centre, ownRoute);
  const ownPointDistance = distanceToPolyline(candidate.point, ownRoute);
  for (const edge of otherEdges) {
    const foreignDistance = distanceToPolyline(centre, edge.points);
    const foreignPointDistance = distanceToPolyline(candidate.point, edge.points);
    if (foreignDistance < ownDistance || foreignPointDistance < ownPointDistance) {
      // A candidate that is visibly nearer a different run is not an owner
      // candidate. Keep it out of the clean/attached pool so the resolver
      // cannot select it merely because every nearby pocket has some cost.
      score += LABEL_COLLISION_COST;
    }
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
  const distance = clearance ?? (horizontal ? (side === "top" ? 8 : 20) : textW / 2 + 12);
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
  const segment = segments.find((candidate) => distance <= candidate.start + candidate.len) ?? segments.at(-1);
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
  const ports = candidatePorts(
    source,
    target,
    isFailure,
    options.sourcePort,
    options.targetPort,
    options.sourcePortOffset,
    options.targetPortOffset,
  );

  let best: Point[] | null = null;
  let bestScore = Infinity;
  let bestPort = ports[0]!;
  const containment = containmentForEdge(doc, layout, sourceId, targetId);
  const routeVGutters = containment ? guttersInside(vGutters, containment, "x") : vGutters;
  const routeHGutters = containment ? guttersInside(hGutters, containment, "y") : hGutters;
  for (const port of ports) {
    const context = createRouteContext(source, target, port, options.style, containment);
    for (const candidate of templates(port, routeVGutters, routeHGutters, source, target)) {
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
      const context = createRouteContext(source, target, port, options.style, containment);
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
      const context = createRouteContext(source, target, port, options.style, containment);
      const candidate = perimeterFallback(layout, source, target, port, obstacles, context, []);
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
  const context = createRouteContext(source, target, bestPort, options.style, containment);
  points = shortcut(points, obstacles, context);
  points = simplify(points);
  if (options.waypoints?.length) {
    points = normalizeOrthogonalRoute([points[0]!, ...options.waypoints, points.at(-1)!]);
  } else {
    points = nudgePathOffBoundaries(points, boundaries, obstacles, context, []);
  }
  points = anchorRouteEndpoints(points, source.icon, target.icon);
  return points;
}

export function attachRoutes(layout: LayoutResult, edges: RoutedEdge[]): LayoutResult {
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
  const expanded =
    left !== current.x || top !== current.y || right !== current.x + current.w || bottom !== current.y + current.h;
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
