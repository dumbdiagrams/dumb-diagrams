import { createAsyncDocsFixture, getDefaultView } from "@dumb-diagrams/runtime/core";
import { layoutDocument } from "@dumb-diagrams/runtime/layout";
import { attachRoutes, routeEdges } from "@dumb-diagrams/runtime/route";
import { describe, expect, it } from "vitest";

import { createInteractionIndex, isEntityVisible } from "./interaction-index.js";

describe("interaction index", () => {
  it("returns a local subset around a resource instead of scanning the full diagram", () => {
    const doc = createAsyncDocsFixture();
    const placed = layoutDocument(doc);
    const layout = attachRoutes(placed, routeEdges(doc, placed));
    const node = layout.nodes[0]!;
    const index = createInteractionIndex(layout, doc, getDefaultView(doc));
    const candidates = index.at({
      x: node.icon.x + node.icon.w / 2,
      y: node.icon.y + node.icon.h / 2,
    });

    expect(candidates.nodes.map((candidate) => candidate.id)).toContain(node.id);
    expect(candidates.nodes.length).toBeLessThan(layout.nodes.length);
  });

  it("precomputes inherited visibility for nested resources", () => {
    const doc = createAsyncDocsFixture();
    const resource = doc.resources.find((candidate) => candidate.parent);
    expect(resource?.parent).toBeDefined();
    if (!resource?.parent) return;
    getDefaultView(doc).places[resource.parent] = { visible: false };

    const view = getDefaultView(doc);
    expect(isEntityVisible(doc, view, resource.parent)).toBe(false);
    expect(isEntityVisible(doc, view, resource.id)).toBe(false);
    view.places[doc.edges[0]!.id] = { visible: false };
    expect(isEntityVisible(doc, view, doc.edges[0]!.id)).toBe(false);
  });
});
