import { describe, expect, it } from "vitest";

import { createAsyncDocsFixture } from "@dumb-diagrams/core";
import { layoutDocument } from "@dumb-diagrams/layout";

import { GRID_SIZE, snapLayoutToGrid } from "./grid.js";

describe("editor grid", () => {
  it("aligns layout bounds to the visible grid without mutating the source layout", () => {
    const layout = layoutDocument(createAsyncDocsFixture());
    const snapped = snapLayoutToGrid(layout, true);

    expect(snapped).not.toBe(layout);
    for (const group of snapped.groups) {
      expect(group.bounds.x % GRID_SIZE).toBe(0);
      expect(group.bounds.y % GRID_SIZE).toBe(0);
      expect((group.bounds.x + group.bounds.w) % GRID_SIZE).toBe(0);
      expect((group.bounds.y + group.bounds.h) % GRID_SIZE).toBe(0);
    }
    for (const node of snapped.nodes) {
      expect(node.obstacle.x % GRID_SIZE).toBe(0);
      expect(node.obstacle.y % GRID_SIZE).toBe(0);
      expect((node.obstacle.x + node.obstacle.w) % GRID_SIZE).toBe(0);
      expect((node.obstacle.y + node.obstacle.h) % GRID_SIZE).toBe(0);
    }
  });

  it("leaves the layout untouched when snapping is disabled", () => {
    const layout = layoutDocument(createAsyncDocsFixture());
    expect(snapLayoutToGrid(layout, false)).toBe(layout);
  });
});
