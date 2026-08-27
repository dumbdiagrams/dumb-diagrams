import { createAsyncDocsFixture, getDefaultView } from "@dumb-diagrams/runtime/core";
import { layoutDocument } from "@dumb-diagrams/runtime/layout";
import { attachRoutes, routeEdges } from "@dumb-diagrams/runtime/route";
import { describe, expect, it } from "vitest";

import { closestInteractiveTarget } from "./InteractionOverlay.js";

describe("boundary targeting", () => {
  it("keeps a boundary selectable where a connector runs along its stroke", () => {
    const doc = createAsyncDocsFixture();
    const placed = layoutDocument(doc);
    const layout = attachRoutes(placed, routeEdges(doc, placed));
    const group = layout.groups[0]!;
    const sourceEdge = layout.edges[0]!;
    const edge = {
      ...sourceEdge,
      points: [
        { x: group.bounds.x, y: group.bounds.y },
        { x: group.bounds.x + group.bounds.w, y: group.bounds.y },
      ],
    };
    const point = {
      x: group.bounds.x + group.bounds.w / 2,
      y: group.bounds.y,
    };

    expect(closestInteractiveTarget(point, layout, doc, getDefaultView(doc), {
      nodes: [],
      edges: [edge],
      groups: [group],
      annotations: [],
    })).toEqual({ kind: "group", id: group.id });
  });
});
