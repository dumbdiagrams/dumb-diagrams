import type {
  DiagramDocument,
  LayoutResult,
  PlaceOverride,
  Point,
  RouteOverride,
} from "@dumb-diagrams/runtime/core";
import { getDefaultView } from "@dumb-diagrams/runtime/core";

import { cloneDocument } from "./document-structure";

/**
 * Copy the currently rendered entity geometry into a document view.
 *
 * Interactive document mutations use this snapshot to make the rendered
 * canvas the baseline for the next source edit. Connector routes are left
 * untouched so changing a resource or group does not accidentally turn an
 * automatically routed connector into an authored route.
 */
export function preserveLayout(doc: DiagramDocument, layout: LayoutResult): DiagramDocument {
  return snapshotLayout(doc, layout, false);
}

/**
 * Copy rendered geometry only for entities that are not already pinned.
 * Existing authored coordinates and flags therefore remain authoritative.
 */
export function preserveUnplacedLayout(doc: DiagramDocument, layout: LayoutResult): DiagramDocument {
  return snapshotLayout(doc, layout, true);
}

/**
 * Snapshot rendered places and connector paths as the manual editing baseline.
 *
 * Existing pinned routes are authored data, so they remain byte-for-byte
 * equivalent (apart from the document clone). Unpinned routes are upgraded to
 * pinned manual routes using their current rendered polyline while retaining
 * any authored route and decoration preferences.
 */
export function preserveManualLayout(doc: DiagramDocument, layout: LayoutResult): DiagramDocument {
  return snapshotLayoutWithRoutes(doc, layout, false);
}

/**
 * Preserve only geometry that has not already been authored. Existing route
 * entries may still carry decoration preferences, but an absent route is left
 * absent so newly created connectors do not acquire a baseline path.
 */
export function preserveUnplacedManualLayout(
  doc: DiagramDocument,
  layout: LayoutResult,
  baselineDoc: DiagramDocument = doc,
): DiagramDocument {
  return snapshotLayoutWithRoutes(doc, layout, true, baselineDoc);
}

/**
 * Reconcile manual routes after a document mutation. When both endpoints of
 * an unchanged edge move by the same delta, shift its complete route so the
 * internal elbows follow them. A route whose geometry was explicitly edited
 * by the mutation is left alone, allowing that edit to win.
 */
export function reconcileManualRouteMoves(
  beforeDoc: DiagramDocument,
  afterDoc: DiagramDocument,
): DiagramDocument {
  const beforeView = getDefaultView(beforeDoc);
  const afterView = getDefaultView(afterDoc);
  const beforeEdges = new Map(beforeDoc.edges.map((edge) => [edge.id, edge]));
  const beforePlaces = beforeView.places;
  const next = cloneDocument(afterDoc);
  const routes = getDefaultView(next).routes;

  for (const edge of afterDoc.edges) {
    const beforeEdge = beforeEdges.get(edge.id);
    const beforeRoute = beforeView.routes[edge.id];
    const afterRoute = afterView.routes[edge.id];
    if (!beforeEdge || !beforeRoute?.pin || !afterRoute?.pin) continue;
    if (!sameEdgeRelationship(beforeEdge, edge)) continue;
    if (!sameRouteGeometry(beforeRoute, afterRoute)) continue;

    const sourceDelta = placeDelta(beforePlaces[edge.source], afterView.places[edge.source]);
    const targetDelta = placeDelta(beforePlaces[edge.target], afterView.places[edge.target]);
    if (!sourceDelta || !targetDelta ||
      sourceDelta.dx === 0 && sourceDelta.dy === 0 ||
      !sameDeltaWithinRounding(sourceDelta, targetDelta)) {
      continue;
    }
    const shifted: RouteOverride = { ...afterRoute };
    if (afterRoute.points) shifted.points = shiftPoints(afterRoute.points, sourceDelta.dx, sourceDelta.dy);
    if (afterRoute.waypoints) shifted.waypoints = shiftPoints(afterRoute.waypoints, sourceDelta.dx, sourceDelta.dy);
    routes[edge.id] = shifted;
  }
  return next;
}

function sameDeltaWithinRounding(
  a: { dx: number; dy: number },
  b: { dx: number; dy: number },
): boolean {
  // Places written by an interactive move are rounded independently. A
  // common fractional move can therefore differ by just under one pixel,
  // while a full-pixel difference is treated as genuinely different motion.
  return Math.abs(a.dx - b.dx) < 1 && Math.abs(a.dy - b.dy) < 1;
}

function snapshotLayout(
  doc: DiagramDocument,
  layout: LayoutResult,
  skipPinned: boolean,
): DiagramDocument {
  const next = cloneDocument(doc);
  const view = getDefaultView(next);
  const groupIds = new Set(doc.groups.map((group) => group.id));
  const resourceIds = new Set(doc.resources.map((resource) => resource.id));

  for (const group of layout.groups) {
    if (!groupIds.has(group.id)) continue;
    const existing = view.places[group.id];
    if (skipPinned && existing?.pin) continue;
    view.places[group.id] = {
      ...(existing ?? {}),
      x: group.bounds.x,
      y: group.bounds.y,
      w: group.bounds.w,
      h: group.bounds.h,
      pin: true,
      manual: true,
    };
  }

  for (const node of layout.nodes) {
    if (!resourceIds.has(node.id)) continue;
    const existing = view.places[node.id];
    if (skipPinned && existing?.pin) continue;
    const place: PlaceOverride = {
      ...(existing ?? {}),
      x: node.obstacle.x,
      y: node.obstacle.y,
      pin: true,
      manual: true,
    };
    view.places[node.id] = place;
  }

  return next;
}

function snapshotLayoutWithRoutes(
  doc: DiagramDocument,
  layout: LayoutResult,
  skipPinned: boolean,
  baselineDoc: DiagramDocument = doc,
): DiagramDocument {
  const next = snapshotLayout(doc, layout, skipPinned);
  const sourceRoutes = getDefaultView(doc).routes;
  const baselineView = getDefaultView(baselineDoc);
  const baselineEdges = new Map(baselineDoc.edges.map((edge) => [edge.id, edge]));
  const view = getDefaultView(next);
  const edgeIds = new Set(doc.edges.map((edge) => edge.id));

  for (const edge of layout.edges) {
    if (!edgeIds.has(edge.id)) continue;
    const baselineEdge = baselineEdges.get(edge.id);
    const currentEdge = doc.edges.find((candidate) => candidate.id === edge.id);
    if (!currentEdge) continue;
    if (skipPinned && (!baselineEdge || !sameEdgeRelationship(baselineEdge, currentEdge))) {
      continue;
    }
    const existing = sourceRoutes[edge.id];
    // Authored pinned routes remain authoritative. In particular, don't
    // rewrite their points or decoration settings from a later render.
    if (existing?.pin) continue;
    // The unplaced pass runs after a mutation. An absent entry is a new edge
    // (or an edge whose source route was intentionally cleared), so leave it
    // untouched and let the runtime route it automatically. A decoration-only
    // entry can also represent a cleared previously pinned route.
    if (skipPinned && baselineView.routes[edge.id]?.pin && !existing?.pin) continue;
    if (skipPinned && (!existing && baselineView.routes[edge.id])) continue;

    const route: RouteOverride = {
      ...(existing ?? {}),
      points: edge.points.map(copyPoint),
      pin: true,
      mode: "manual",
    };
    if (existing?.badgeT === undefined && edge.badgeT !== undefined) {
      route.badgeT = edge.badgeT;
    }
    if (existing?.badgeSide === undefined && edge.badgeSide !== undefined) {
      route.badgeSide = edge.badgeSide;
    }
    if (existing?.labelT === undefined && edge.labelT !== undefined) {
      route.labelT = edge.labelT;
    }
    if (existing?.labelSide === undefined && edge.labelSide !== undefined) {
      route.labelSide = edge.labelSide;
    }
    view.routes[edge.id] = route;
  }

  return next;
}

function sameEdgeRelationship(
  a: DiagramDocument["edges"][number],
  b: DiagramDocument["edges"][number],
): boolean {
  return a.source === b.source && a.target === b.target &&
    a.sourcePort === b.sourcePort && a.targetPort === b.targetPort &&
    a.sourcePortOffset === b.sourcePortOffset && a.targetPortOffset === b.targetPortOffset;
}

function sameRouteGeometry(a: RouteOverride, b: RouteOverride): boolean {
  return samePoints(a.points, b.points) && samePoints(a.waypoints, b.waypoints);
}

function samePoints(a: Point[] | undefined, b: Point[] | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.length === b.length && a.every((point, index) => {
    const other = b[index]!;
    return point.x === other.x && point.y === other.y;
  });
}

function placeDelta(
  before: PlaceOverride | undefined,
  after: PlaceOverride | undefined,
): { dx: number; dy: number } | undefined {
  if (before?.x === undefined || before.y === undefined || after?.x === undefined || after.y === undefined) {
    return undefined;
  }
  return { dx: after.x - before.x, dy: after.y - before.y };
}

function copyPoint(point: Point): Point {
  return { x: point.x, y: point.y };
}

function shiftPoints(
  points: Point[] | undefined,
  dx: number,
  dy: number,
): Point[] | undefined {
  return points?.map((point) => ({ x: point.x + dx, y: point.y + dy }));
}
