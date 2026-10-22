import type { NodeGeom, Point, RoutedEdge, Side } from "@dumb-diagrams/runtime/core";

import { nearestPortAnchor, normalizePortOffset, portPoint } from "@dumb-diagrams/runtime/core";
import { projectPointToPolyline } from "@dumb-diagrams/runtime/route";

const EDGE_HIT_RADIUS = 16;

/**
 * Choose the physically nearest connector at a pointer location. The SVG
 * overlay uses widened transparent strokes, so DOM paint order is not a
 * reliable indication of which nearby connector the user meant.
 */
export function nearestEdgeIdAt(
  point: Point,
  edges: Array<Pick<RoutedEdge, "id" | "points">>,
  preferredId?: string,
): string | undefined {
  let best: { id: string; distance: number } | undefined;
  for (const edge of edges) {
    const projection = projectPointToPolyline(point, edge.points);
    if (!projection || projection.distance > EDGE_HIT_RADIUS) continue;
    if (
      !best ||
      projection.distance < best.distance ||
      (Math.abs(projection.distance - best.distance) < 0.001 && edge.id === preferredId)
    ) {
      best = { id: edge.id, distance: projection.distance };
    }
  }
  return best?.id;
}

export interface NodePortTarget {
  nodeId: string;
  side: Side;
  offset: number;
}

type EdgePortEndpoint = {
  source: string;
  target: string;
  sourcePort?: Side;
  targetPort?: Side;
  sourcePortOffset?: number;
  targetPortOffset?: number;
};

/** Which endpoint of a selected connector owns a port click on its node. */
export function endpointForSelectedEdgePort(
  edge: EdgePortEndpoint,
  nodeId: string,
  side: Side,
  offset: number,
): "source" | "target" | null {
  if (edge.source !== nodeId && edge.target !== nodeId) return null;
  const normalized = normalizePortOffset(offset);
  const onSource = edge.source === nodeId;
  const onTarget = edge.target === nodeId;
  const matchesSource =
    onSource && edge.sourcePort === side && normalizePortOffset(edge.sourcePortOffset) === normalized;
  const matchesTarget =
    onTarget && edge.targetPort === side && normalizePortOffset(edge.targetPortOffset) === normalized;
  if (matchesSource && !matchesTarget) return "source";
  if (matchesTarget && !matchesSource) return "target";
  if (onSource && !onTarget) return "source";
  if (onTarget && !onSource) return "target";
  return "source";
}

export type PortPointerAction =
  | { type: "rewire"; endpoint: "source" | "target" }
  | { type: "drag-pending" }
  | { type: "complete-pending" }
  | { type: "start-connector" };

/** Decide whether a port pointerdown should rewire, finish, or start a connector. */
export function resolvePortPointerAction(input: {
  tool: "select" | "connector" | "resources" | "groups" | "code" | "layers" | "note" | "text";
  selectedEdge?: EdgePortEndpoint;
  pendingPort: NodePortTarget | null;
  nodeId: string;
  side: Side;
  offset: number;
}): PortPointerAction {
  if (input.tool === "select" && input.selectedEdge) {
    const endpoint = endpointForSelectedEdgePort(input.selectedEdge, input.nodeId, input.side, input.offset);
    if (endpoint) return { type: "rewire", endpoint };
  }
  if (input.pendingPort) {
    const samePort =
      input.pendingPort.nodeId === input.nodeId &&
      input.pendingPort.side === input.side &&
      input.pendingPort.offset === input.offset;
    return samePort ? { type: "drag-pending" } : { type: "complete-pending" };
  }
  return { type: "start-connector" };
}

/**
 * Infer connector intent from the icon itself, not only from a tiny port hit
 * circle. This lets a user drop on the top/left/right/bottom region of an
 * icon and still get the nearest legal port on that face.
 */
export function nearestNodePortAt(
  point: Point,
  nodes: Array<Pick<NodeGeom, "id" | "icon">>,
  hitPadding = 24,
  preferred?: NodePortTarget | null,
  switchMargin = 3,
): NodePortTarget | null {
  let best: { target: NodePortTarget; rectDistance: number; anchorDistance: number } | undefined;

  for (const node of nodes) {
    const rectDistance = distanceToRect(point, node.icon);
    if (rectDistance > hitPadding) continue;

    const anchor = nearestPortAnchor(node.icon, point);
    const anchorDistance = Math.hypot(point.x - anchor.point.x, point.y - anchor.point.y);
    if (
      !best ||
      rectDistance < best.rectDistance ||
      (rectDistance === best.rectDistance && anchorDistance < best.anchorDistance)
    ) {
      best = {
        target: { nodeId: node.id, side: anchor.side, offset: anchor.offset },
        rectDistance,
        anchorDistance,
      };
    }
  }

  if (!best || !preferred || preferred.nodeId !== best.target.nodeId) {
    return best?.target ?? null;
  }
  if (preferred.side === best.target.side && preferred.offset === best.target.offset) {
    return preferred;
  }

  const node = nodes.find((candidate) => candidate.id === preferred.nodeId);
  if (!node) return best.target;
  const preferredAnchor = nearestAnchorForTarget(node.icon, preferred);
  const preferredDistance = Math.hypot(point.x - preferredAnchor.x, point.y - preferredAnchor.y);
  return preferredDistance <= best.anchorDistance + switchMargin ? preferred : best.target;
}

function nearestAnchorForTarget(rect: NodeGeom["icon"], target: NodePortTarget): Point {
  return portPoint(rect, target.side, target.offset);
}

function distanceToRect(point: Point, rect: { x: number; y: number; w: number; h: number }): number {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.w));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.h));
  return Math.hypot(dx, dy);
}
