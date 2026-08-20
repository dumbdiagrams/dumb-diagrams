import { describe, expect, it } from "vitest";

import { createAsyncDocsFixture } from "@dumb-diagrams/core";
import { layoutDocument } from "@dumb-diagrams/layout";
import {
  getEdgeBadgePlacement,
  normalizeOrthogonalRoute,
  projectPointToPolyline,
  routeEdgePreview,
  routeEdges,
} from "./router.js";

describe("routeEdgePreview", () => {
  it("returns a routed polyline for an existing edge", () => {
    const doc = createAsyncDocsFixture();
    const layout = layoutDocument(doc);
    const preview = routeEdgePreview(doc, layout, "e1");
    const routed = routeEdges(doc, layout).find((edge) => edge.id === "e1");
    expect(preview?.length).toBeGreaterThan(1);
    expect(preview?.[0]).toEqual(routed?.points[0]);
    expect(preview?.at(-1)).toEqual(routed?.points.at(-1));
  });

  it("keeps numbered badges offset from the path and supports both sides", () => {
    const points = [
      { x: 0, y: 100 },
      { x: 160, y: 100 },
    ];
    const top = getEdgeBadgePlacement(points, 0.25, "top");
    const bottom = getEdgeBadgePlacement(points, 0.25, "bottom");
    expect(top?.point).toEqual({ x: 40, y: 82 });
    expect(bottom?.point).toEqual({ x: 40, y: 118 });
    expect(projectPointToPolyline({ x: 72, y: 111 }, points)?.t).toBeCloseTo(0.45);
  });

  it("renders a badge for zero as well as positive step numbers", () => {
    const doc = createAsyncDocsFixture();
    doc.edges[0]!.step = 0;
    const edge = routeEdges(doc, layoutDocument(doc)).find(
      (candidate) => candidate.id === doc.edges[0]!.id,
    );
    expect(edge?.badge).toBeDefined();
    expect(edge?.step).toBe(0);
  });

  it("keeps generated connectors outside resource cards before turning", () => {
    const doc = createAsyncDocsFixture();
    const layout = layoutDocument(doc);
    const routes = routeEdges(doc, layout);

    for (const route of routes) {
      const source = layout.nodes.find((node) => node.id === route.source);
      const target = layout.nodes.find((node) => node.id === route.target);
      expect(source, `${route.id} source geometry`).toBeDefined();
      expect(target, `${route.id} target geometry`).toBeDefined();
      if (!source || !target) continue;

      const sourceCard = inflate(source.obstacle, 8);
      const targetCard = inflate(target.obstacle, 8);
      if (route.points.length > 2) {
        expect(
          continuesAwayFromIcon(source.icon, route.points[0]!, route.points[1]!),
          `${route.id} leaves through a deliberate source face`,
        ).toBe(true);
        expect(
          continuesAwayFromIcon(target.icon, route.points.at(-1)!, route.points.at(-2)!),
          `${route.id} approaches through a deliberate target face`,
        ).toBe(true);
        expect(
          contains(sourceCard, route.points[1]!),
          `${route.id} turns before clearing its source card`,
        ).toBe(false);
        expect(
          contains(targetCard, route.points.at(-2)!),
          `${route.id} approaches its target from inside the card`,
        ).toBe(false);
      }

      for (let index = 0; index < route.points.length - 1; index++) {
        const a = route.points[index]!;
        const b = route.points[index + 1]!;
        for (const node of layout.nodes) {
          const card = inflate(node.obstacle, 8);
          const isSourceAttachment = node.id === source.id && index === 0;
          const isTargetAttachment = node.id === target.id && index === route.points.length - 2;
          if (isSourceAttachment || isTargetAttachment) continue;
          expect(
            segmentIntersects(a, b, card),
            `${route.id} segment ${index} intersects ${node.id}`,
          ).toBe(false);
        }
      }
    }

    const e3 = routes.find((route) => route.id === "e3");
    const e5 = routes.find((route) => route.id === "e5");
    expect(e3 && e5 ? sharedLength(e3.points, e5.points) : 1).toBe(0);
  });

  it("keeps manual breakpoints orthogonal and preserves the authored breaks", () => {
    const manual = normalizeOrthogonalRoute([
      { x: 100, y: 100 },
      { x: 260, y: 148 },
      { x: 260, y: 320 },
      { x: 420, y: 320 },
    ]);

    expect(manual).toEqual([
      { x: 100, y: 100 },
      { x: 260, y: 100 },
      { x: 260, y: 148 },
      { x: 260, y: 320 },
      { x: 420, y: 320 },
    ]);
    expect(manual.slice(0, -1).every((point, index) => {
      const next = manual[index + 1]!;
      return point.x === next.x || point.y === next.y;
    })).toBe(true);
  });

  it("normalizes pinned routes before rendering them", () => {
    const doc = createAsyncDocsFixture();
    const manual = [
      { x: 404, y: 400 },
      { x: 720, y: 520 },
      { x: 885, y: 128 },
    ];
    doc.views[0]!.routes.e3 = { pin: true, points: manual };

    const route = routeEdges(doc, layoutDocument(doc)).find((edge) => edge.id === "e3");
    expect(route?.points).toEqual(normalizeOrthogonalRoute(manual));
    expect(route?.points.slice(0, -1).every((point, index) => {
      const next = route.points[index + 1]!;
      return point.x === next.x || point.y === next.y;
    })).toBe(true);
  });
});

function inflate(rect: { x: number; y: number; w: number; h: number }, pad: number) {
  return {
    x: rect.x - pad,
    y: rect.y - pad,
    w: rect.w + pad * 2,
    h: rect.h + pad * 2,
  };
}

function contains(rect: { x: number; y: number; w: number; h: number }, point: { x: number; y: number }) {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
}

function continuesAwayFromIcon(
  icon: { x: number; y: number; w: number; h: number },
  port: { x: number; y: number },
  outside: { x: number; y: number },
) {
  if (port.x === icon.x) return outside.x < port.x && outside.y === port.y;
  if (port.x === icon.x + icon.w) return outside.x > port.x && outside.y === port.y;
  if (port.y === icon.y) return outside.y < port.y && outside.x === port.x;
  if (port.y === icon.y + icon.h) return outside.y > port.y && outside.x === port.x;
  return false;
}

function segmentIntersects(
  a: { x: number; y: number },
  b: { x: number; y: number },
  rect: { x: number; y: number; w: number; h: number },
) {
  if (a.x === b.x) {
    return a.x >= rect.x && a.x <= rect.x + rect.w
      && Math.max(a.y, b.y) >= rect.y
      && Math.min(a.y, b.y) <= rect.y + rect.h;
  }
  if (a.y === b.y) {
    return a.y >= rect.y && a.y <= rect.y + rect.h
      && Math.max(a.x, b.x) >= rect.x
      && Math.min(a.x, b.x) <= rect.x + rect.w;
  }
  return true;
}

function sharedLength(
  first: Array<{ x: number; y: number }>,
  second: Array<{ x: number; y: number }>,
) {
  let total = 0;
  for (let i = 0; i < first.length - 1; i++) {
    const a = first[i]!;
    const b = first[i + 1]!;
    for (let j = 0; j < second.length - 1; j++) {
      const c = second[j]!;
      const d = second[j + 1]!;
      if (a.x === b.x && c.x === d.x && a.x === c.x) {
        total += Math.max(0, Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y))
          - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)));
      } else if (a.y === b.y && c.y === d.y && a.y === c.y) {
        total += Math.max(0, Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x))
          - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)));
      }
    }
  }
  return total;
}
