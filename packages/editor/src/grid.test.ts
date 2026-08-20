import { describe, expect, it } from "vitest";

import { createAsyncDocsFixture, getDefaultView } from "@dumb-diagrams/core";
import { layoutDocument } from "@dumb-diagrams/layout";

import { GRID_SIZE, outsideCanvasInsertionPoint, snapLayoutToGrid } from "./grid.js";

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
      expect(afterGroup.bounds.x - afterRoot.bounds.x).toBeCloseTo(
        beforeGroup.bounds.x - beforeRoot.bounds.x,
      );
      expect(afterGroup.bounds.y - afterRoot.bounds.y).toBeCloseTo(
        beforeGroup.bounds.y - beforeRoot.bounds.y,
      );
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
        expect(afterRect.x - afterRoot.bounds.x).toBeCloseTo(
          beforeRect.x - beforeRoot.bounds.x,
        );
        expect(afterRect.y - afterRoot.bounds.y).toBeCloseTo(
          beforeRect.y - beforeRoot.bounds.y,
        );
        expect(afterRect.w).toBe(beforeRect.w);
        expect(afterRect.h).toBe(beforeRect.h);
      }
    }
  });

  it("leaves the layout untouched when snapping is disabled", () => {
    const doc = createAsyncDocsFixture();
    const layout = layoutDocument(doc);
    expect(snapLayoutToGrid(layout, false, doc)).toBe(layout);
  });

  it("places new root objects in an open lane outside the existing canvas", () => {
    const layout = layoutDocument(createAsyncDocsFixture());
    const right = Math.max(
      ...layout.groups.map((group) => group.bounds.x + group.bounds.w),
      ...layout.nodes.map((node) => node.obstacle.x + node.obstacle.w),
    );
    const point = outsideCanvasInsertionPoint(layout);

    expect(point.x).toBeGreaterThanOrEqual(right + 48);
    expect(point.y).toBeGreaterThanOrEqual(48);
  });
});
