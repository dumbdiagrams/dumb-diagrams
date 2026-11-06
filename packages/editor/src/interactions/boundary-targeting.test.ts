import { getDefaultView } from "@dumb-diagrams/runtime/core";
import { createAsyncDocsFixture } from "@dumb-diagrams/runtime/test-fixtures";
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

    expect(
      closestInteractiveTarget(point, layout, doc, getDefaultView(doc), {
        nodes: [],
        edges: [edge],
        groups: [group],
        annotations: [],
      }),
    ).toEqual({ kind: "group", id: group.id });
  });

  it("prioritizes a child's visual interior over a nearby group boundary", () => {
    const doc = createAsyncDocsFixture();
    const view = getDefaultView(doc);
    const node = {
      id: "child-node",
      type: "resource" as const,
      icon: { x: 100, y: 100, w: 40, h: 40 },
      label: { x: 100, y: 144, w: 64, h: 16 },
      obstacle: { x: 100, y: 100, w: 64, h: 60 },
      role: "primary" as const,
      resourceType: "generic",
      serviceLabel: "Child",
    };
    const group = {
      id: "nearby-group",
      kind: "logical" as const,
      bounds: { x: 90, y: 90, w: 100, h: 100 },
      header: { x: 90, y: 90, w: 100, h: 24 },
      content: { x: 90, y: 114, w: 100, h: 76 },
      label: "Group",
    };
    const layout = {
      nodes: [node],
      groups: [group],
      edges: [],
      width: 240,
      height: 240,
      symmetries: [],
    };

    expect(
      closestInteractiveTarget({ x: 101, y: 101 }, layout, doc, view, {
        nodes: [node],
        edges: [],
        groups: [group],
        annotations: [],
      }),
    ).toEqual({ kind: "resource", id: node.id });
  });
});
