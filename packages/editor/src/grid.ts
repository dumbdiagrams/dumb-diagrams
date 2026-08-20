import type { LayoutResult } from "@dumb-diagrams/core";

export const GRID_SIZE = 24;

export function snapCoordinate(value: number, enabled: boolean): number {
  return enabled ? Math.round(value / GRID_SIZE) * GRID_SIZE : value;
}

export function snapPoint(
  point: { x: number; y: number },
  enabled: boolean,
): { x: number; y: number } {
  return {
    x: snapCoordinate(point.x, enabled),
    y: snapCoordinate(point.y, enabled),
  };
}

/**
 * Align the rendered layout to the same grid that the interaction layer uses.
 *
 * The AWS layout engine intentionally uses a smaller internal 8px rhythm. The
 * editor grid is 24px, so its visual snap pass needs to happen after layout
 * calculation and before routing/rendering. This keeps source documents
 * semantic while making the visible geometry land on the visible grid lines.
 */
export function snapLayoutToGrid(
  layout: LayoutResult,
  enabled: boolean,
): LayoutResult {
  if (!enabled) return layout;

  return {
    ...layout,
    groups: layout.groups.map((group) => {
      const x = snapCoordinate(group.bounds.x, true);
      const y = snapCoordinate(group.bounds.y, true);
      const w = Math.max(GRID_SIZE, Math.ceil(group.bounds.w / GRID_SIZE) * GRID_SIZE);
      const h = Math.max(GRID_SIZE, Math.ceil(group.bounds.h / GRID_SIZE) * GRID_SIZE);
      const dx = x - group.bounds.x;
      const dy = y - group.bounds.y;
      const dw = w - group.bounds.w;
      const dh = h - group.bounds.h;

      return {
        ...group,
        bounds: { ...group.bounds, x, y, w, h },
        header: {
          ...group.header,
          x: group.header.x + dx,
          y: group.header.y + dy,
          w: group.header.w + dw,
        },
        content: {
          ...group.content,
          x: group.content.x + dx,
          y: group.content.y + dy,
          w: group.content.w + dw,
          h: group.content.h + dh,
        },
      };
    }),
    nodes: layout.nodes.map((node) => {
      const x = snapCoordinate(node.obstacle.x, true);
      const y = snapCoordinate(node.obstacle.y, true);
      const w = Math.max(GRID_SIZE, Math.ceil(node.obstacle.w / GRID_SIZE) * GRID_SIZE);
      const h = Math.max(GRID_SIZE, Math.ceil(node.obstacle.h / GRID_SIZE) * GRID_SIZE);
      const dx = x - node.obstacle.x;
      const dy = y - node.obstacle.y;

      return {
        ...node,
        icon: { ...node.icon, x: node.icon.x + dx, y: node.icon.y + dy },
        label: { ...node.label, x: node.label.x + dx, y: node.label.y + dy },
        obstacle: { ...node.obstacle, x, y, w, h },
      };
    }),
  };
}
