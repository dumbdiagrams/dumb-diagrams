import { createEmptyDocument, getDefaultView } from "@dumb-diagrams/runtime/core";
import type { DiagramDocument, LayoutResult } from "@dumb-diagrams/runtime/core";
import { describe, expect, it } from "vitest";

import {
  distanceToResource,
  marqueeSelection,
  mergeSelection,
  pointInRect,
  resourceHitRects,
  resourceVisualBounds,
  selectionModeForModifiers,
} from "./selection-targeting.js";

const node = {
  icon: { x: 80, y: 20, w: 64, h: 64 },
  label: { x: 30, y: 88, w: 164, h: 42 },
};

describe("resource selection targeting", () => {
  it("uses separate icon and label regions instead of the full layout obstacle", () => {
    const [icon, label] = resourceHitRects(node);

    expect(icon).toEqual({ x: 76, y: 16, w: 72, h: 72 });
    expect(label).toEqual({ x: 26, y: 86, w: 172, h: 46 });
    expect(distanceToResource({ x: 50, y: 50 }, node)).toBeGreaterThan(0);
    expect(distanceToResource({ x: 100, y: 50 }, node)).toBe(0);
  });

  it("keeps the selection outline tight to visible icon and text", () => {
    expect(resourceVisualBounds(node)).toEqual({ x: 30, y: 20, w: 164, h: 110 });
  });

  it("recognizes a connector label rectangle exactly", () => {
    const label = { x: 24, y: 150, w: 68, h: 18 };
    expect(pointInRect({ x: 40, y: 158 }, label)).toBe(true);
    expect(pointInRect({ x: 40, y: 170 }, label)).toBe(false);
  });
});

function selectionScene(): { doc: DiagramDocument; layout: LayoutResult } {
  const doc = createEmptyDocument("selection-scene");
  doc.resources = [
    {
      id: "child",
      type: "generic",
      parent: "inner",
      label: { service: "Child" },
      role: "primary",
      props: {},
    },
    {
      id: "outside",
      type: "generic",
      label: { service: "Outside" },
      role: "primary",
      props: {},
    },
  ];
  doc.groups = [
    {
      id: "outer",
      kind: "logical",
      label: "Outer",
      children: ["inner"],
    },
    {
      id: "inner",
      kind: "logical",
      parent: "outer",
      label: "Inner",
      children: ["child"],
    },
  ];
  doc.annotations = [{ id: "note", text: "Note" }];
  const node = (id: string, x: number, y: number) => ({
    id,
    type: "resource" as const,
    icon: { x, y, w: 20, h: 20 },
    label: { x, y: y + 24, w: 42, h: 12 },
    obstacle: { x, y, w: 42, h: 36 },
    role: "primary" as const,
    resourceType: "generic",
    serviceLabel: id,
  });
  return {
    doc,
    layout: {
      nodes: [node("child", 40, 50), node("outside", 250, 50)],
      groups: [
        {
          id: "outer",
          kind: "logical",
          bounds: { x: 0, y: 0, w: 200, h: 180 },
          header: { x: 0, y: 0, w: 200, h: 24 },
          content: { x: 0, y: 24, w: 200, h: 156 },
          label: "Outer",
        },
        {
          id: "inner",
          kind: "logical",
          bounds: { x: 20, y: 20, w: 100, h: 100 },
          header: { x: 20, y: 20, w: 100, h: 24 },
          content: { x: 20, y: 44, w: 100, h: 76 },
          label: "Inner",
        },
      ],
      edges: [],
      width: 320,
      height: 220,
      symmetries: [],
    },
  };
}

describe("selection gestures", () => {
  it("maps standard modifiers to replace, add, and toggle modes", () => {
    expect(selectionModeForModifiers({ shiftKey: false, metaKey: false, ctrlKey: false })).toBe("replace");
    expect(selectionModeForModifiers({ shiftKey: true, metaKey: false, ctrlKey: false })).toBe("add");
    expect(selectionModeForModifiers({ shiftKey: true, metaKey: true, ctrlKey: false })).toBe("toggle");
    expect(selectionModeForModifiers({ shiftKey: false, metaKey: false, ctrlKey: true })).toBe("toggle");
  });

  it("merges selections without duplicates and toggles each hit once", () => {
    const current = [{ kind: "resource" as const, id: "a" }];
    expect(mergeSelection(current, [current[0]!, { kind: "group", id: "g" }], "add")).toEqual([
      current[0],
      { kind: "group", id: "g" },
    ]);
    expect(mergeSelection(current, [current[0]!, current[0]!], "toggle")).toEqual([]);
    expect(mergeSelection(current, [{ kind: "resource", id: "b" }], "replace")).toEqual([
      { kind: "resource", id: "b" },
    ]);
  });

  it("selects intersecting children but promotes a fully enclosed hierarchy to its outer group", () => {
    const { doc, layout } = selectionScene();
    const view = getDefaultView(doc);
    view.annotations = { note: { x: 135, y: 50, w: 40, h: 30 } };

    expect(marqueeSelection(doc, layout, view, { x: 35, y: 45, w: 55, h: 55 })).toEqual([
      { kind: "resource", id: "child" },
    ]);
    expect(marqueeSelection(doc, layout, view, { x: 0, y: 0, w: 200, h: 180 })).toEqual([
      { kind: "annotation", id: "note" },
      { kind: "group", id: "outer" },
    ]);
    expect(marqueeSelection(doc, layout, view, { x: 130, y: 40, w: 50, h: 50 })).toEqual([
      { kind: "annotation", id: "note" },
    ]);
  });

  it("normalizes reverse-dragged marquee rectangles and respects inherited visibility", () => {
    const { doc, layout } = selectionScene();
    const view = getDefaultView(doc);
    view.annotations = { note: { x: 300, y: 300, w: 40, h: 30 } };
    expect(marqueeSelection(doc, layout, view, { x: 95, y: 105, w: -70, h: -70 })).toEqual([
      { kind: "resource", id: "child" },
    ]);
    view.places.outer = { visible: false };
    expect(marqueeSelection(doc, layout, view, { x: 0, y: 0, w: 200, h: 180 })).toEqual([]);
  });
});
