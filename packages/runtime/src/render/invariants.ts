import type { LayoutResult } from "../core/index.js";

export interface InvariantFailure {
  code: string;
  message: string;
  elementIds: string[];
}

export const INVARIANT_DIAGNOSTICS_TRUNCATED_CODE = "invariant-diagnostics-truncated";

export function checkInvariants(layout: LayoutResult, options?: { maxFailures?: number }): InvariantFailure[] {
  const maxFailures = normalizeMaxFailures(options?.maxFailures);
  const failures: InvariantFailure[] = [];
  let omittedFailures = 0;
  const recordFailure = (failure: InvariantFailure): void => {
    if (maxFailures === undefined || failures.length < maxFailures) {
      failures.push(failure);
    } else {
      omittedFailures += 1;
    }
  };

  for (let i = 0; i < layout.nodes.length; i++) {
    for (let j = i + 1; j < layout.nodes.length; j++) {
      const a = layout.nodes[i]!;
      const b = layout.nodes[j]!;
      if (!rectsOverlap(a.icon, b.icon, 0)) continue;
      recordFailure({
        code: "resource-icon-overlap",
        message: `Resources ${a.id} and ${b.id} icons overlap`,
        elementIds: [a.id, b.id],
      });
    }
  }

  for (const edge of layout.edges) {
    if (
      edge.points.length < 2 ||
      !edge.points.some((point) => point.x !== edge.points[0]!.x || point.y !== edge.points[0]!.y)
    ) {
      recordFailure({
        code: "edge-route-missing",
        message: `Edge ${edge.id} has no visible route`,
        elementIds: [edge.id, edge.source, edge.target],
      });
      continue;
    }
    const source = layout.nodes.find((node) => node.id === edge.source);
    const target = layout.nodes.find((node) => node.id === edge.target);
    if (source && edge.points[0] && !pointOnRectBorder(edge.points[0], source.icon)) {
      recordFailure({
        code: "edge-port-detached",
        message: `Edge ${edge.id} does not start on icon ${source.id}`,
        elementIds: [edge.id, source.id],
      });
    }
    if (target && edge.points.length > 0 && !pointOnRectBorder(edge.points[edge.points.length - 1]!, target.icon)) {
      recordFailure({
        code: "edge-port-detached",
        message: `Edge ${edge.id} does not end on icon ${target.id}`,
        elementIds: [edge.id, target.id],
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
              recordFailure({
                code: "edge-icon-collision",
                message: `Edge ${edge.id} passes through icon of ${node.id}`,
                elementIds: [edge.id, node.id],
              });
            }
            if (segmentHitsLabel(a, b, node)) {
              recordFailure({
                code: "edge-label-collision",
                message: `Edge ${edge.id} intersects label of ${node.id}`,
                elementIds: [edge.id, node.id],
              });
            }
          }
          continue;
        }

        if (segmentHitsIcon(a, b, node)) {
          recordFailure({
            code: "edge-icon-collision",
            message: `Edge ${edge.id} passes through icon of ${node.id}`,
            elementIds: [edge.id, node.id],
          });
        } else if (segmentHitsObstacle(a, b, node.obstacle)) {
          recordFailure({
            code: "edge-obstacle-collision",
            message: `Edge ${edge.id} intersects obstacle of ${node.id}`,
            elementIds: [edge.id, node.id],
          });
        }
      }
    }
  }

  for (const edge of layout.edges) {
    if (edge.labelRect) {
      if (edge.badge && circleHitsRect(edge.badge, 10, edge.labelRect)) {
        recordFailure({
          code: "edge-badge-label-collision",
          message: `Edge ${edge.id} has an overlapping number and label`,
          elementIds: [edge.id],
        });
      }
      for (const node of layout.nodes) {
        if (!rectsOverlap(edge.labelRect, node.icon, 2) && !rectsOverlap(edge.labelRect, node.label, 2)) continue;
        recordFailure({
          code: "edge-label-node-collision",
          message: `Label of edge ${edge.id} overlaps resource ${node.id}`,
          elementIds: [edge.id, node.id],
        });
      }
      for (const group of layout.groups) {
        const labelRect = group.labelRect ?? group.header;
        if (!rectsOverlap(edge.labelRect, labelRect, 2)) continue;
        recordFailure({
          code: "edge-label-group-collision",
          message: `Label of edge ${edge.id} overlaps boundary label ${group.id}`,
          elementIds: [edge.id, group.id],
        });
      }
    }
    if (edge.badge) {
      for (const node of layout.nodes) {
        if (!circleHitsRect(edge.badge, 10, node.icon) && !circleHitsRect(edge.badge, 10, node.label)) continue;
        recordFailure({
          code: "edge-badge-node-collision",
          message: `Number of edge ${edge.id} overlaps resource ${node.id}`,
          elementIds: [edge.id, node.id],
        });
      }
      for (const group of layout.groups) {
        const labelRect = group.labelRect ?? group.header;
        if (!circleHitsRect(edge.badge, 10, labelRect)) continue;
        recordFailure({
          code: "edge-badge-group-collision",
          message: `Number of edge ${edge.id} overlaps boundary label ${group.id}`,
          elementIds: [edge.id, group.id],
        });
      }
      for (const other of layout.edges) {
        if (other.id === edge.id || !circleHitsPath(edge.badge, 12, other.points)) continue;
        recordFailure({
          code: "edge-badge-connector-collision",
          message: `Number of edge ${edge.id} overlaps connector ${other.id}`,
          elementIds: [edge.id, other.id],
        });
      }
    }
  }

  for (let i = 0; i < layout.edges.length; i++) {
    for (let j = i + 1; j < layout.edges.length; j++) {
      const a = layout.edges[i]!;
      const b = layout.edges[j]!;
      if (a.labelRect && b.labelRect && rectsOverlap(a.labelRect, b.labelRect, 4)) {
        recordFailure({
          code: "edge-label-overlap",
          message: `Labels of edges ${a.id} and ${b.id} overlap`,
          elementIds: [a.id, b.id],
        });
      }
      if (a.badge && b.badge && Math.hypot(a.badge.x - b.badge.x, a.badge.y - b.badge.y) < 24) {
        recordFailure({
          code: "edge-badge-overlap",
          message: `Numbers of edges ${a.id} and ${b.id} overlap`,
          elementIds: [a.id, b.id],
        });
      }
      if (a.badge && b.labelRect && circleHitsRect(a.badge, 10, b.labelRect)) {
        recordFailure({
          code: "edge-badge-label-collision",
          message: `Number of edge ${a.id} overlaps label of edge ${b.id}`,
          elementIds: [a.id, b.id],
        });
      }
      if (b.badge && a.labelRect && circleHitsRect(b.badge, 10, a.labelRect)) {
        recordFailure({
          code: "edge-badge-label-collision",
          message: `Number of edge ${b.id} overlaps label of edge ${a.id}`,
          elementIds: [b.id, a.id],
        });
      }
      if (pathsReverseOverlap(a.points, b.points)) {
        recordFailure({
          code: "edge-reverse-overlap",
          message: `Edges ${a.id} and ${b.id} share a corridor in opposite directions`,
          elementIds: [a.id, b.id],
        });
      }
      if (pathsShareExclusiveCorridor(a, b)) {
        recordFailure({
          code: "edge-corridor-overlap",
          message: `Edges ${a.id} and ${b.id} share a corridor outside a fan-out stem`,
          elementIds: [a.id, b.id],
        });
      }
      if (pathsCross(a.points, b.points)) {
        recordFailure({
          code: "edge-crossing",
          message: `Edges ${a.id} and ${b.id} cross`,
          elementIds: [a.id, b.id],
        });
      }
    }
  }

  const azGroups = layout.groups.filter((g) => g.kind === "az");
  if (azGroups.length >= 2) {
    const widths = azGroups.map((g) => g.bounds.w);
    const heights = azGroups.map((g) => g.bounds.h);
    if (new Set(widths).size > 1 || new Set(heights).size > 1) {
      recordFailure({
        code: "az-asymmetry",
        message: "Availability zones do not have equal dimensions",
        elementIds: azGroups.map((group) => group.id),
      });
    }
  }

  if (omittedFailures > 0) {
    failures.push({
      code: INVARIANT_DIAGNOSTICS_TRUNCATED_CODE,
      message: `Invariant diagnostics truncated: ${omittedFailures} additional failure${omittedFailures === 1 ? "" : "s"} omitted`,
      elementIds: [],
    });
  }

  return failures;
}

function normalizeMaxFailures(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value < 0) return undefined;
  return Math.floor(value);
}

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  margin: number,
): boolean {
  return !(
    a.x + a.w + margin <= b.x ||
    b.x + b.w + margin <= a.x ||
    a.y + a.h + margin <= b.y ||
    b.y + b.h + margin <= a.y
  );
}

function pathHitsRect(
  points: Array<{ x: number; y: number }>,
  rect: { x: number; y: number; w: number; h: number },
  margin: number,
): boolean {
  const obstacle = inflate(rect, margin);
  for (let index = 0; index < points.length - 1; index++) {
    if (segmentHitsObstacle(points[index]!, points[index + 1]!, obstacle)) return true;
  }
  return false;
}

function circleHitsPath(
  center: { x: number; y: number },
  radius: number,
  points: Array<{ x: number; y: number }>,
): boolean {
  const rect = {
    x: center.x - radius,
    y: center.y - radius,
    w: radius * 2,
    h: radius * 2,
  };
  return pathHitsRect(points, rect, 0);
}

function pathsCross(a: Array<{ x: number; y: number }>, b: Array<{ x: number; y: number }>): boolean {
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < b.length - 1; j++) {
      if (segmentsCross(a[i]!, a[i + 1]!, b[j]!, b[j + 1]!)) return true;
    }
  }
  return false;
}

function segmentsCross(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number },
): boolean {
  const firstVertical = a.x === b.x;
  const secondVertical = c.x === d.x;
  if (firstVertical === secondVertical) return false;
  const verticalA = firstVertical ? a : c;
  const verticalB = firstVertical ? b : d;
  const horizontalA = firstVertical ? c : a;
  const horizontalB = firstVertical ? d : b;
  return (
    horizontalA.y > Math.min(verticalA.y, verticalB.y) &&
    horizontalA.y < Math.max(verticalA.y, verticalB.y) &&
    verticalA.x > Math.min(horizontalA.x, horizontalB.x) &&
    verticalA.x < Math.max(horizontalA.x, horizontalB.x)
  );
}

function circleHitsRect(
  center: { x: number; y: number },
  radius: number,
  rect: { x: number; y: number; w: number; h: number },
): boolean {
  const x = Math.max(rect.x, Math.min(center.x, rect.x + rect.w));
  const y = Math.max(rect.y, Math.min(center.y, rect.y + rect.h));
  return Math.hypot(center.x - x, center.y - y) < radius + 2;
}

function pointOnRectBorder(
  point: { x: number; y: number },
  rect: { x: number; y: number; w: number; h: number },
): boolean {
  const epsilon = 0.01;
  const withinX = point.x >= rect.x - epsilon && point.x <= rect.x + rect.w + epsilon;
  const withinY = point.y >= rect.y - epsilon && point.y <= rect.y + rect.h + epsilon;
  const onX = Math.abs(point.x - rect.x) <= epsilon || Math.abs(point.x - (rect.x + rect.w)) <= epsilon;
  const onY = Math.abs(point.y - rect.y) <= epsilon || Math.abs(point.y - (rect.y + rect.h)) <= epsilon;
  return (onX && withinY) || (onY && withinX);
}

function pathsReverseOverlap(a: Array<{ x: number; y: number }>, b: Array<{ x: number; y: number }>): boolean {
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < b.length - 1; j++) {
      if (segmentsReverseOverlap(a[i]!, a[i + 1]!, b[j]!, b[j + 1]!)) {
        return true;
      }
    }
  }
  return false;
}

function pathsShareExclusiveCorridor(a: LayoutResult["edges"][number], b: LayoutResult["edges"][number]): boolean {
  for (let i = 0; i < a.points.length - 1; i++) {
    for (let j = 0; j < b.points.length - 1; j++) {
      const shared = segmentsOverlapLength(a.points[i]!, a.points[i + 1]!, b.points[j]!, b.points[j + 1]!);
      if (shared <= 12) continue;

      const fanoutStem =
        i === 0 && j === 0 && a.source === b.source && a.target !== b.target && samePoint(a.points[0]!, b.points[0]!);
      if (!fanoutStem) return true;
    }
  }
  return false;
}

function segmentsOverlapLength(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number },
): number {
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

function samePoint(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return a.x === b.x && a.y === b.y;
}

function segmentsReverseOverlap(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number },
): boolean {
  if (a.x === b.x && c.x === d.x && a.x === c.x) {
    const opposite = Math.sign(b.y - a.y) === -Math.sign(d.y - c.y);
    const overlap = Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y));
    return opposite && overlap > 12;
  }
  if (a.y === b.y && c.y === d.y && a.y === c.y) {
    const opposite = Math.sign(b.x - a.x) === -Math.sign(d.x - c.x);
    const overlap = Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x));
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

function inflate(r: { x: number; y: number; w: number; h: number }, pad: number) {
  return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
}
