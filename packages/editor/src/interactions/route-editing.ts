import type { Point, Rect } from "@dumb-diagrams/runtime/core";

import { nearestPortAnchor } from "@dumb-diagrams/runtime/core";
import { normalizeOrthogonalRoute } from "@dumb-diagrams/runtime/route";

/**
 * Move an orthogonal turn without leaving either adjoining segment behind.
 *
 * A corner belongs to one horizontal and one vertical leg. Moving only the
 * corner creates a diagonal which normalization can turn into a 180-degree
 * hairpin. Instead, shift the complete horizontal run on Y and the complete
 * vertical run on X, matching the behavior of the segment handles.
 */
export function moveOrthogonalBend(
  points: Point[],
  index: number,
  target: Point,
): Point[] {
  const origin = points.map((point) => ({ ...point }));
  if (index <= 0 || index >= origin.length - 1) return origin;

  const updated = origin.map((point) => ({ ...point }));
  const horizontal = runContaining(origin, index, "horizontal");
  const vertical = runContaining(origin, index, "vertical");

  if (horizontal) {
    for (let cursor = horizontal.start; cursor <= horizontal.end; cursor++) {
      updated[cursor]!.y = target.y;
    }
  } else {
    updated[index]!.y = target.y;
  }

  if (vertical) {
    for (let cursor = vertical.start; cursor <= vertical.end; cursor++) {
      updated[cursor]!.x = target.x;
    }
  } else {
    updated[index]!.x = target.x;
  }

  return collapseOrthogonalRoute(updated);
}

/**
 * Reattach a manually edited route without discarding the orientation of its
 * first and last legs. If an edit moved an endpoint with its segment, retain
 * that endpoint as an orthogonal stub before snapping back to the icon.
 */
export function anchorOrthogonalRouteEndpoints(
  points: Point[],
  sourceIcon: Rect,
  targetIcon: Rect,
): Point[] {
  if (points.length < 2) return points.map((point) => ({ ...point }));

  const sourceAnchor = nearestPortAnchor(sourceIcon, points[0]!).point;
  const targetAnchor = nearestPortAnchor(targetIcon, points.at(-1)!).point;
  const sourceNeighbor = points[1]!;
  const targetNeighbor = points.at(-2)!;
  const out: Point[] = [{ ...sourceAnchor }];

  const departure = endpointBridge(
    sourceAnchor,
    sourceNeighbor,
    points[0]!,
    sourceNeighbor,
    "departure",
  );
  if (departure) out.push(departure);
  out.push(...points.slice(1, -1).map((point) => ({ ...point })));

  const approach = endpointBridge(
    targetNeighbor,
    targetAnchor,
    targetNeighbor,
    points.at(-1)!,
    "approach",
  );
  if (approach) out.push(approach);
  out.push({ ...targetAnchor });

  return collapseOrthogonalRoute(out);
}

function collapseOrthogonalRoute(points: Point[]): Point[] {
  const normalized = normalizeOrthogonalRoute(points);
  if (normalized.length <= 2) return normalized;

  const out: Point[] = [];
  for (const point of normalized) {
    const previous = out.at(-1);
    if (previous?.x === point.x && previous.y === point.y) continue;
    while (out.length >= 2) {
      const before = out.at(-2)!;
      const current = out.at(-1)!;
      const collinear =
        (before.x === current.x && current.x === point.x) ||
        (before.y === current.y && current.y === point.y);
      if (!collinear) break;
      out.pop();
    }
    out.push({ ...point });
  }
  return out;
}

function endpointBridge(
  start: Point,
  end: Point,
  originalStart: Point,
  originalEnd: Point,
  kind: "departure" | "approach",
): Point | null {
  if (start.x === end.x || start.y === end.y) return null;
  if (originalStart.y === originalEnd.y) {
    return kind === "departure"
      ? { x: start.x, y: end.y }
      : { x: end.x, y: start.y };
  }
  if (originalStart.x === originalEnd.x) {
    return kind === "departure"
      ? { x: end.x, y: start.y }
      : { x: start.x, y: end.y };
  }
  return null;
}

function runContaining(
  points: Point[],
  index: number,
  orientation: "horizontal" | "vertical",
): { start: number; end: number } | null {
  const aligned = (a: Point, b: Point) =>
    orientation === "horizontal" ? a.y === b.y : a.x === b.x;
  const touchesPrevious = aligned(points[index - 1]!, points[index]!);
  const touchesNext = aligned(points[index]!, points[index + 1]!);
  if (!touchesPrevious && !touchesNext) return null;

  let start = index;
  let end = index;
  while (start > 0 && aligned(points[start - 1]!, points[start]!)) start--;
  while (end < points.length - 1 && aligned(points[end]!, points[end + 1]!)) end++;
  return { start, end };
}
