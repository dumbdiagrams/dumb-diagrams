import type { LayoutResult } from "@dumb-diagrams/core";

export interface InvariantFailure {
  code: string;
  message: string;
}

export function checkInvariants(layout: LayoutResult): InvariantFailure[] {
  const failures: InvariantFailure[] = [];

  for (const edge of layout.edges) {
    const source = layout.nodes.find((node) => node.id === edge.source);
    const target = layout.nodes.find((node) => node.id === edge.target);
    if (
      source &&
      edge.points[0] &&
      !pointOnRectBorder(edge.points[0], source.icon)
    ) {
      failures.push({
        code: "edge-port-detached",
        message: `Edge ${edge.id} does not start on icon ${source.id}`,
      });
    }
    if (
      target &&
      edge.points.length > 0 &&
      !pointOnRectBorder(edge.points[edge.points.length - 1]!, target.icon)
    ) {
      failures.push({
        code: "edge-port-detached",
        message: `Edge ${edge.id} does not end on icon ${target.id}`,
      });
    }

    for (let i = 0; i < edge.points.length - 1; i++) {
      const a = edge.points[i]!;
      const b = edge.points[i + 1]!;
      const isFirst = i === 0;
      const isLast = i === edge.points.length - 2;

      for (const node of layout.nodes) {
        const isSource = edge.source === node.id;
        const isTarget = edge.target === node.id;

        if (isSource || isTarget) {
          if (!isFirst && !isLast) {
            if (segmentHitsIcon(a, b, node)) {
              failures.push({
                code: "edge-icon-collision",
                message: `Edge ${edge.id} passes through icon of ${node.id}`,
              });
            }
            if (segmentHitsLabel(a, b, node)) {
              failures.push({
                code: "edge-label-collision",
                message: `Edge ${edge.id} intersects label of ${node.id}`,
              });
            }
          }
          continue;
        }

        if (segmentHitsIcon(a, b, node)) {
          failures.push({
            code: "edge-icon-collision",
            message: `Edge ${edge.id} passes through icon of ${node.id}`,
          });
        } else if (segmentHitsObstacle(a, b, node.obstacle)) {
          failures.push({
            code: "edge-obstacle-collision",
            message: `Edge ${edge.id} intersects obstacle of ${node.id}`,
          });
        }
      }
    }
  }

  for (let i = 0; i < layout.edges.length; i++) {
    for (let j = i + 1; j < layout.edges.length; j++) {
      const a = layout.edges[i]!;
      const b = layout.edges[j]!;
      if (pathsReverseOverlap(a.points, b.points)) {
        failures.push({
          code: "edge-reverse-overlap",
          message: `Edges ${a.id} and ${b.id} share a corridor in opposite directions`,
        });
      }
    }
  }

  const azGroups = layout.groups.filter((g) => g.kind === "az");
  if (azGroups.length >= 2) {
    const widths = azGroups.map((g) => g.bounds.w);
    const heights = azGroups.map((g) => g.bounds.h);
    if (new Set(widths).size > 1 || new Set(heights).size > 1) {
      failures.push({
        code: "az-asymmetry",
        message: "Availability zones do not have equal dimensions",
      });
    }
  }

  return failures;
}

function pointOnRectBorder(
  point: { x: number; y: number },
  rect: { x: number; y: number; w: number; h: number },
): boolean {
  const epsilon = 0.01;
  const withinX =
    point.x >= rect.x - epsilon && point.x <= rect.x + rect.w + epsilon;
  const withinY =
    point.y >= rect.y - epsilon && point.y <= rect.y + rect.h + epsilon;
  const onX =
    Math.abs(point.x - rect.x) <= epsilon ||
    Math.abs(point.x - (rect.x + rect.w)) <= epsilon;
  const onY =
    Math.abs(point.y - rect.y) <= epsilon ||
    Math.abs(point.y - (rect.y + rect.h)) <= epsilon;
  return (onX && withinY) || (onY && withinX);
}

function pathsReverseOverlap(
  a: Array<{ x: number; y: number }>,
  b: Array<{ x: number; y: number }>,
): boolean {
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < b.length - 1; j++) {
      if (segmentsReverseOverlap(a[i]!, a[i + 1]!, b[j]!, b[j + 1]!)) {
        return true;
      }
    }
  }
  return false;
}

function segmentsReverseOverlap(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number },
): boolean {
  if (a.x === b.x && c.x === d.x && a.x === c.x) {
    const opposite = Math.sign(b.y - a.y) === -Math.sign(d.y - c.y);
    const overlap =
      Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) -
      Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y));
    return opposite && overlap > 12;
  }
  if (a.y === b.y && c.y === d.y && a.y === c.y) {
    const opposite = Math.sign(b.x - a.x) === -Math.sign(d.x - c.x);
    const overlap =
      Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) -
      Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x));
    return opposite && overlap > 12;
  }
  return false;
}

function segmentHitsLabel(
  a: { x: number; y: number },
  b: { x: number; y: number },
  node: LayoutResult["nodes"][number],
): boolean {
  return segmentHitsObstacle(a, b, inflate(node.label, 4));
}

function segmentHitsIcon(
  a: { x: number; y: number },
  b: { x: number; y: number },
  node: LayoutResult["nodes"][number],
): boolean {
  return segmentHitsObstacle(a, b, inflate(node.icon, 2));
}

function segmentHitsObstacle(
  a: { x: number; y: number },
  b: { x: number; y: number },
  r: { x: number; y: number; w: number; h: number },
): boolean {
  if (a.x === b.x) {
    const x = a.x;
    if (x < r.x || x > r.x + r.w) return false;
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    return maxY >= r.y && minY <= r.y + r.h;
  }
  if (a.y === b.y) {
    const y = a.y;
    if (y < r.y || y > r.y + r.h) return false;
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    return maxX >= r.x && minX <= r.x + r.w;
  }
  return false;
}

function inflate(
  r: { x: number; y: number; w: number; h: number },
  pad: number,
) {
  return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
}
