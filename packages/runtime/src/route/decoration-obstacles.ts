import type { GroupGeom, Rect } from "../core/types.js";

const DEFAULT_CLEARANCE = 2;

/**
 * Returns narrow rectangles around group boundary strokes for decoration
 * placement. These rectangles describe only the frame edges, so labels may
 * still be placed freely within a group's interior.
 */
export function boundaryStrokeRects(
  groups: readonly Pick<GroupGeom, "bounds">[],
  clearance = DEFAULT_CLEARANCE,
): Rect[] {
  const padding = Number.isFinite(clearance) ? Math.max(0, clearance) : DEFAULT_CLEARANCE;
  const thickness = padding * 2;
  const rects: Rect[] = [];

  for (const { bounds } of groups) {
    const { x, y, w, h } = bounds;
    if (![x, y, w, h].every(Number.isFinite)) continue;

    const width = Math.max(0, w);
    const height = Math.max(0, h);

    if (width > 0) {
      rects.push(
        { x: x - padding, y: y - padding, w: width + thickness, h: thickness },
        { x: x - padding, y: y + height - padding, w: width + thickness, h: thickness },
      );
    }
    if (height > 0) {
      rects.push(
        { x: x - padding, y: y - padding, w: thickness, h: height + thickness },
        { x: x + width - padding, y: y - padding, w: thickness, h: height + thickness },
      );
    }
  }

  return rects;
}
