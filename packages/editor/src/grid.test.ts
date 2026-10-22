import { describe, expect, it } from "vitest";

import { createEmptyDocument, getDefaultView } from "@dumb-diagrams/runtime/core";
import { createAsyncDocsFixture } from "@dumb-diagrams/runtime/test-fixtures";
import { getCatalogEntry } from "@dumb-diagrams/runtime/catalog";
import { layoutDocument } from "@dumb-diagrams/runtime/layout";

import { addResourceResult } from "./model/catalog-placement.js";
import { GRID_SIZE, leftStagingInsertionPoint, snapDragDelta, snapLayoutToGrid, STAGING_GUTTER_PX } from "./grid.js";

describe("editor grid", () => {
  it("snaps top-level anchors without changing nested geometry or centering", () => {
    const doc = createAsyncDocsFixture();
    getDefaultView(doc).places.use1 = { x: 55, y: 57, pin: true };
    const layout = layoutDocument(doc);
    const snapped = snapLayoutToGrid(layout, true, doc);

    expect(snapped).not.toBe(layout);
    const beforeRoot = layout.groups.find((group) => group.id === "use1")!;
    const afterRoot = snapped.groups.find((group) => group.id === "use1")!;
    expect(afterRoot.bounds.x % GRID_SIZE).toBe(0);
    expect(afterRoot.bounds.y % GRID_SIZE).toBe(0);
    expect(afterRoot.bounds.w).toBe(beforeRoot.bounds.w);
    expect(afterRoot.bounds.h).toBe(beforeRoot.bounds.h);

    for (const beforeGroup of layout.groups.filter((group) => group.id !== "client")) {
      const afterGroup = snapped.groups.find((group) => group.id === beforeGroup.id)!;
      expect(afterGroup.bounds.x - afterRoot.bounds.x).toBeCloseTo(beforeGroup.bounds.x - beforeRoot.bounds.x);
      expect(afterGroup.bounds.y - afterRoot.bounds.y).toBeCloseTo(beforeGroup.bounds.y - beforeRoot.bounds.y);
      expect(afterGroup.bounds.w).toBe(beforeGroup.bounds.w);
      expect(afterGroup.bounds.h).toBe(beforeGroup.bounds.h);
    }

    for (const beforeNode of layout.nodes.filter((node) => node.id !== "client")) {
      const afterNode = snapped.nodes.find((node) => node.id === beforeNode.id)!;
      for (const [beforeRect, afterRect] of [
        [beforeNode.obstacle, afterNode.obstacle],
        [beforeNode.icon, afterNode.icon],
        [beforeNode.label, afterNode.label],
      ] as const) {
        expect(afterRect.x - afterRoot.bounds.x).toBeCloseTo(beforeRect.x - beforeRoot.bounds.x);
        expect(afterRect.y - afterRoot.bounds.y).toBeCloseTo(beforeRect.y - beforeRoot.bounds.y);
        expect(afterRect.w).toBe(beforeRect.w);
        expect(afterRect.h).toBe(beforeRect.h);
      }
    }
  });

  it("preserves saved manual coordinates instead of snapping the whole group again", () => {
    const doc = createAsyncDocsFixture();
    getDefaultView(doc).places.use1 = { x: 55, y: 57, pin: true, manual: true };
    getDefaultView(doc).places.client = { x: 91, y: 83, pin: true, manual: true };
    const layout = layoutDocument(doc);
    expect(snapLayoutToGrid(layout, true, doc)).toEqual(layout);
  });

  it("leaves the layout untouched when snapping is disabled", () => {
    const doc = createAsyncDocsFixture();
    const layout = layoutDocument(doc);
    expect(snapLayoutToGrid(layout, false, doc)).toBe(layout);
  });

  it("snaps root resources by their visible icon instead of label-sized obstacles", () => {
    const doc = createAsyncDocsFixture();
    getDefaultView(doc).places.client = { x: 55, y: 57, pin: true };
    const layout = layoutDocument(doc);
    const before = layout.nodes.find((node) => node.id === "client")!;
    const after = snapLayoutToGrid(layout, true, doc).nodes.find((node) => node.id === "client")!;

    expect(after.icon.x % GRID_SIZE).toBe(0);
    expect(after.icon.y % GRID_SIZE).toBe(0);
    expect(after.icon.x - after.obstacle.x).toBeCloseTo(before.icon.x - before.obstacle.x);
    expect(after.label.x - after.icon.x).toBeCloseTo(before.label.x - before.icon.x);
  });

  it("magnetically aligns matching centres ahead of the grid", () => {
    const snapped = snapDragDelta({ x: 20, y: 20, w: 48, h: 48 }, [{ x: 100, y: 120, w: 48, h: 48 }], 77, 101, true, 1);

    expect(snapped.dx).toBe(80);
    expect(snapped.dy).toBe(100);
    expect(snapped.guides).toEqual([
      expect.objectContaining({ axis: "x", position: 124, anchor: "center" }),
      expect.objectContaining({ axis: "y", position: 144, anchor: "center" }),
    ]);
  });

  it("keeps grid snapping when no peer alignment is nearby", () => {
    const snapped = snapDragDelta({ x: 10, y: 10, w: 48, h: 48 }, [{ x: 300, y: 300, w: 48, h: 48 }], 51, 37, true, 1);

    expect(snapped).toEqual({ dx: 62, dy: 38, guides: [] });
  });

  it("places new root objects in a fixed staging slot before the diagram", () => {
    const doc = createAsyncDocsFixture();
    const layout = layoutDocument(doc);
    const left = Math.min(
      ...layout.groups.map((group) => group.bounds.x),
      ...layout.nodes.map((node) => node.obstacle.x),
      ...layout.edges.flatMap((edge) => edge.points.map((point) => point.x)),
    );
    const top = Math.min(
      ...layout.groups.map((group) => group.bounds.y),
      ...layout.nodes.map((node) => node.obstacle.y),
      ...layout.edges.flatMap((edge) => edge.points.map((point) => point.y)),
    );
    const point = leftStagingInsertionPoint(doc, layout, 240);

    expect(point).toEqual({ x: left - STAGING_GUTTER_PX - 240, y: top });
    expect(point.x + 240).toBeLessThan(left);
  });

  it("reuses the same staging slot for consecutive root catalog additions", () => {
    const doc = createAsyncDocsFixture();
    const layout = layoutDocument(doc);
    const first = leftStagingInsertionPoint(doc, layout, 240);
    const entry = getCatalogEntry("aws.simple-storage-service")!;
    const addedResult = addResourceResult(doc, entry, undefined, first);
    expect(addedResult.isOk()).toBe(true);
    if (addedResult.isErr()) return;
    const added = addedResult.value;
    const afterFirst = layoutDocument(added.doc);
    const second = leftStagingInsertionPoint(added.doc, afterFirst, 240);

    expect(second).toEqual(first);
  });

  it("falls back to the empty-canvas origin on a blank diagram", () => {
    const doc = createEmptyDocument("blank");
    const layout = layoutDocument(doc);

    expect(leftStagingInsertionPoint(doc, layout, 240)).toEqual({ x: 48, y: 48 });
  });
});
