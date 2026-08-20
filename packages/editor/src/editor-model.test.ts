import { describe, expect, it } from "vitest";

import { createAsyncDocsFixture, getDefaultView } from "@dumb-diagrams/core";
import { layoutDocument } from "@dumb-diagrams/layout";

import {
  alignSelection,
  deleteSelection,
  importSvgAsset,
  nudgeSelection,
  renameResource,
  resourceIconSize,
  sendToBack,
  sendToFront,
  setGroupPlace,
  setResourceIconSize,
  setTitle,
  swapEdgeDirection,
} from "./editor-model.js";

describe("editor commands", () => {
  it("renames resources without changing ids", () => {
    const doc = createAsyncDocsFixture();
    const next = renameResource(doc, "client", "Browser");
    expect(next.resources.find((resource) => resource.id === "client")?.label.role).toBe(
      "Browser",
    );
  });

  it("sets diagram title independently from id", () => {
    const doc = createAsyncDocsFixture();
    const next = setTitle(doc, "Async Docs");
    expect(next.title).toBe("Async Docs");
    expect(next.id).toBe("async-docs");
  });

  it("nudges pinned places", () => {
    const doc = createAsyncDocsFixture();
    const view = getDefaultView(doc);
    view.places.client = { x: 40, y: 40, pin: true };
    const next = nudgeSelection(doc, [{ kind: "resource", id: "client" }], 8, 8);
    expect(getDefaultView(next).places.client).toMatchObject({ x: 48, y: 48, pin: true });
  });

  it("deletes multiple selected items", () => {
    const doc = createAsyncDocsFixture();
    const next = deleteSelection(doc, [
      { kind: "edge", id: "e1" },
      { kind: "edge", id: "e2" },
    ]);
    expect(next.edges.some((edge) => edge.id === "e1")).toBe(false);
    expect(next.edges.some((edge) => edge.id === "e2")).toBe(false);
  });

  it("imports sanitized svg assets with deduplication", () => {
    const doc = createAsyncDocsFixture();
    const svg = '<svg viewBox="0 0 32 32"><rect width="32" height="32"/></svg>';
    const first = importSvgAsset(doc, svg);
    const second = importSvgAsset(first.doc, svg);
    expect(first.assetId).toBe(second.assetId);
    expect(first.doc.assets).toHaveLength(1);
  });

  it("aligns selection to a shared edge", () => {
    const doc = createAsyncDocsFixture();
    const view = getDefaultView(doc);
    view.places.client = { x: 10, y: 10, pin: true };
    view.places.api_alb = { x: 80, y: 40, pin: true };
    const layout = {
      nodes: [
        {
          id: "client",
          type: "resource" as const,
          icon: { x: 10, y: 10, w: 64, h: 64 },
          label: { x: 10, y: 74, w: 64, h: 24 },
          obstacle: { x: 10, y: 10, w: 64, h: 88 },
          role: "primary" as const,
          resourceType: "generic.user",
          serviceLabel: "Client",
        },
        {
          id: "api_alb",
          type: "resource" as const,
          icon: { x: 80, y: 40, w: 64, h: 64 },
          label: { x: 80, y: 104, w: 64, h: 24 },
          obstacle: { x: 80, y: 40, w: 64, h: 88 },
          role: "primary" as const,
          resourceType: "aws.alb",
          serviceLabel: "ALB",
        },
      ],
      groups: [],
      edges: [],
      width: 400,
      height: 300,
      symmetries: [],
    };
    const next = alignSelection(
      doc,
      [
        { kind: "resource", id: "client" },
        { kind: "resource", id: "api_alb" },
      ],
      layout,
      "top",
    );
    expect(getDefaultView(next).places.client?.y).toBe(10);
    expect(getDefaultView(next).places.api_alb?.y).toBe(10);
  });

  it("does not shift unpinned child places when first pinning a group", () => {
    const doc = createAsyncDocsFixture();
    const view = getDefaultView(doc);
    view.places.workerA = { x: 120, y: 88, pin: true };
    const layout = layoutDocument(doc);
    const group = layout.groups.find((candidate) => candidate.id === "appA");
    expect(group).toBeTruthy();
    const next = setGroupPlace(doc, "appA", group!.bounds.x, group!.bounds.y, 0, 0);
    expect(getDefaultView(next).places.workerA).toMatchObject({ x: 120, y: 88 });
  });

  it("reorders z-index for send to front and back", () => {
    const doc = createAsyncDocsFixture();
    const front = sendToFront(doc, "client");
    const back = sendToBack(front, "api_alb");
    const view = getDefaultView(back);
    expect(view.places.client?.zIndex).toBeGreaterThan(view.places.api_alb?.zIndex ?? 0);
  });

  it("swaps edge source and target with ports", () => {
    const doc = createAsyncDocsFixture();
    const edge = doc.edges.find((candidate) => candidate.id === "e1");
    expect(edge).toBeTruthy();
    edge!.sourcePort = "e";
    edge!.targetPort = "w";
    const next = swapEdgeDirection(doc, "e1");
    const swapped = next.edges.find((candidate) => candidate.id === "e1");
    expect(swapped?.source).toBe(edge!.target);
    expect(swapped?.target).toBe(edge!.source);
    expect(swapped?.sourcePort).toBe("w");
    expect(swapped?.targetPort).toBe("e");
    expect(getDefaultView(next).routes.e1).toBeUndefined();
  });

  it("toggles resource icon size via role and clears manual dimensions", () => {
    const doc = createAsyncDocsFixture();
    const view = getDefaultView(doc);
    view.places.client = { x: 10, y: 10, w: 96, h: 96, pin: true };
    const small = setResourceIconSize(doc, "client", "small");
    const resource = small.resources.find((candidate) => candidate.id === "client");
    expect(resource?.role).toBe("secondary");
    expect(getDefaultView(small).places.client?.w).toBeUndefined();
    const normal = setResourceIconSize(small, "client", "normal");
    expect(normal.resources.find((candidate) => candidate.id === "client")?.role).toBe(
      "primary",
    );
    expect(resourceIconSize(normal.resources.find((c) => c.id === "client")!)).toBe("normal");
  });
});
