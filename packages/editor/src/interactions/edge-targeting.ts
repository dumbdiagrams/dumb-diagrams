import type { Point, RoutedEdge } from "@dumb-diagrams/core";

import { projectPointToPolyline } from "@dumb-diagrams/route";

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
