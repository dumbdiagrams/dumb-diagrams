import type { NodeGeom, Point, Rect } from "@dumb-diagrams/runtime/core";

const ICON_HIT_PADDING = 4;
const LABEL_HIT_PADDING_X = 4;
const LABEL_HIT_PADDING_Y = 2;

/**
 * Resource layout obstacles deliberately include routing and spacing room.
 * Pointer targeting should follow only what the user can actually see.
 */
export function resourceHitRects(node: Pick<NodeGeom, "icon" | "label">): [Rect, Rect] {
  return [
    expandRect(node.icon, ICON_HIT_PADDING, ICON_HIT_PADDING),
    expandRect(node.label, LABEL_HIT_PADDING_X, LABEL_HIT_PADDING_Y),
  ];
}

export function resourceVisualBounds(node: Pick<NodeGeom, "icon" | "label">): Rect {
  const minX = Math.min(node.icon.x, node.label.x);
  const minY = Math.min(node.icon.y, node.label.y);
  const maxX = Math.max(node.icon.x + node.icon.w, node.label.x + node.label.w);
  const maxY = Math.max(node.icon.y + node.icon.h, node.label.y + node.label.h);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function pointInRect(point: Point, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.w &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.h
  );
}

export function distanceToResource(
  point: Point,
  node: Pick<NodeGeom, "icon" | "label">,
): number {
  return Math.min(...resourceHitRects(node).map((rect) => distanceToRect(point, rect)));
}

function expandRect(rect: Rect, x: number, y: number): Rect {
  return {
    x: rect.x - x,
    y: rect.y - y,
    w: rect.w + x * 2,
    h: rect.h + y * 2,
  };
}

function distanceToRect(point: Point, rect: Rect): number {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.w));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.h));
  return Math.hypot(dx, dy);
}
