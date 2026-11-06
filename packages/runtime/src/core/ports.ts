import type { Point, PortAnchor, Rect, Side } from "./types.js";

/** The only connection positions an authored connector may use. */
export const PORT_OFFSETS = [0.25, 0.5, 0.75] as const;
export const DEFAULT_PORT_OFFSET = 0.5;

export function normalizePortOffset(offset?: number): number {
  const value = Number.isFinite(offset) ? Math.max(0, Math.min(1, offset!)) : DEFAULT_PORT_OFFSET;
  return PORT_OFFSETS.reduce(
    (closest, candidate) => (Math.abs(candidate - value) < Math.abs(closest - value) ? candidate : closest),
    DEFAULT_PORT_OFFSET,
  );
}

export function portPoint(rect: Rect, side: Side, offset = DEFAULT_PORT_OFFSET): Point {
  const t = Math.max(0, Math.min(1, offset));
  switch (side) {
    case "n":
      return { x: rect.x + rect.w * t, y: rect.y };
    case "e":
      return { x: rect.x + rect.w, y: rect.y + rect.h * t };
    case "s":
      return { x: rect.x + rect.w * t, y: rect.y + rect.h };
    case "w":
      return { x: rect.x, y: rect.y + rect.h * t };
  }
}

export function portAnchors(rect: Rect): Array<PortAnchor & { offset: number; point: Point }> {
  const sides: Side[] = ["n", "e", "s", "w"];
  return sides.flatMap((side) =>
    PORT_OFFSETS.map((offset) => ({
      side,
      offset,
      point: portPoint(rect, side, offset),
    })),
  );
}

export function nearestPortAnchor(rect: Rect, point: Point): PortAnchor & { offset: number; point: Point } {
  return portAnchors(rect).reduce((nearest, candidate) => {
    const candidateDistance = distanceSquared(candidate.point, point);
    const nearestDistance = distanceSquared(nearest.point, point);
    return candidateDistance < nearestDistance ? candidate : nearest;
  });
}

function distanceSquared(a: Point, b: Point): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}
