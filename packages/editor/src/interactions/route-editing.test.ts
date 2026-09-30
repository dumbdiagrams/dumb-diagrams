import { describe, expect, it } from "vitest";

import { createAsyncDocsFixture } from "@dumb-diagrams/runtime/test-fixtures";
import { layoutDocument } from "@dumb-diagrams/runtime/layout";
import { routeEdges } from "@dumb-diagrams/runtime/route";

import {
  anchorOrthogonalRouteEndpoints,
  collapseOrthogonalRoute,
  moveOrthogonalBend,
  snapBendMergeTarget,
} from "./route-editing.js";

describe("moveOrthogonalBend", () => {
  const route = [
    { x: 130, y: 72 },
    { x: 176, y: 72 },
    { x: 176, y: 202 },
    { x: 356, y: 202 },
  ];

  it("moves the adjoining horizontal leg instead of creating a hairpin", () => {
    expect(moveOrthogonalBend(route, 2, { x: 176, y: 300 })).toEqual([
      { x: 130, y: 72 },
      { x: 176, y: 72 },
      { x: 176, y: 300 },
      { x: 356, y: 300 },
    ]);
  });

  it("moves both adjoining legs for a diagonal corner drag", () => {
    expect(moveOrthogonalBend(route, 2, { x: 224, y: 300 })).toEqual([
      { x: 130, y: 72 },
      { x: 224, y: 72 },
      { x: 224, y: 300 },
      { x: 356, y: 300 },
    ]);
  });

  it("shifts collinear authored runs as one leg", () => {
    expect(moveOrthogonalBend([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 80 },
    ], 2, { x: 96, y: 24 })).toEqual([
      { x: 0, y: 24 },
      { x: 96, y: 24 },
      { x: 96, y: 80 },
    ]);
  });

  it("merges a bend that collapses onto an adjoining straight run", () => {
    expect(moveOrthogonalBend([
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 80 },
      { x: 160, y: 80 },
    ], 2, { x: 80, y: 0 })).toEqual([
      { x: 0, y: 0 },
      { x: 160, y: 0 },
    ]);
  });

  it("snaps a nearby drag target onto an adjacent bend to eliminate a z-break", () => {
    expect(snapBendMergeTarget([
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 80 },
      { x: 160, y: 80 },
    ], 2, { x: 84, y: 4 })).toEqual({ x: 80, y: 0 });
  });
});

describe("anchorOrthogonalRouteEndpoints", () => {
  it("keeps an edited final leg before snapping back to the target port", () => {
    expect(anchorOrthogonalRouteEndpoints([
      { x: 40, y: 40 },
      { x: 80, y: 40 },
      { x: 80, y: 240 },
      { x: 300, y: 240 },
    ], {
      x: 0,
      y: 16,
      w: 40,
      h: 48,
    }, {
      x: 300,
      y: 96,
      w: 48,
      h: 48,
    })).toEqual([
      { x: 40, y: 40 },
      { x: 80, y: 40 },
      { x: 80, y: 240 },
      { x: 312, y: 240 },
      { x: 312, y: 144 },
    ]);
  });

  it("preserves an edited first leg with an orthogonal departure stub", () => {
    expect(anchorOrthogonalRouteEndpoints([
      { x: 40, y: 160 },
      { x: 120, y: 160 },
      { x: 120, y: 240 },
      { x: 300, y: 240 },
    ], {
      x: 0,
      y: 16,
      w: 40,
      h: 48,
    }, {
      x: 300,
      y: 216,
      w: 48,
      h: 48,
    })).toEqual([
      { x: 30, y: 64 },
      { x: 30, y: 160 },
      { x: 120, y: 160 },
      { x: 120, y: 240 },
      { x: 300, y: 240 },
    ]);
  });
});

describe("async-docs e1 bend merge", () => {
  it("merges the second interior bend onto its neighbor through the commit path", () => {
    const doc = createAsyncDocsFixture();
    const layout = layoutDocument(doc);
    const routed = routeEdges(doc, layout).find((edge) => edge.id === "e1");
    expect(routed?.points.length).toBeGreaterThan(3);

    const source = layout.nodes.find((node) => node.id === routed!.source)!;
    const target = layout.nodes.find((node) => node.id === routed!.target)!;
    const neighbor = routed!.points[1]!;
    const merged = moveOrthogonalBend(routed!.points, 2, neighbor);
    const committed = collapseOrthogonalRoute(
      anchorOrthogonalRouteEndpoints(merged, source.icon, target.icon),
    );

    expect(committed.length).toBeLessThan(routed!.points.length);
  });
});
