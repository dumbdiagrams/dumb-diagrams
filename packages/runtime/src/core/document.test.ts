import { describe, expect, it } from "vitest";

import {
  allNodeIds,
  createEmptyDocument,
  getChildren,
  getDefaultView,
  getEdge,
  getGroup,
  getParentGroup,
  getResource,
} from "./document.js";

describe("document helpers", () => {
  it("finds document members and walks group containment", () => {
    const doc = createEmptyDocument("helpers");
    doc.resources = [
      {
        id: "resource",
        type: "cloud-agnostic.actor",
        label: { role: "User" },
        role: "primary",
        props: {},
      },
    ];
    doc.groups = [
      {
        id: "parent",
        kind: "vpc",
        label: "Parent",
        children: ["child", "resource", "missing"],
        borderChildren: [{ id: "border", side: "e" }],
      },
      { id: "child", kind: "subnet", label: "Child", parent: "parent", children: [] },
    ];
    doc.edges = [{ id: "edge", source: "resource", target: "child", style: "solid" }];

    expect(getResource(doc, "resource")?.label.role).toBe("User");
    expect(getResource(doc, "missing")).toBeUndefined();
    expect(getGroup(doc, "parent")?.kind).toBe("vpc");
    expect(getGroup(doc, "missing")).toBeUndefined();
    expect(getEdge(doc, "edge")?.target).toBe("child");
    expect(getEdge(doc, "missing")).toBeUndefined();
    expect(allNodeIds(doc)).toEqual(["parent", "child", "resource"]);
    expect(getParentGroup(doc, "resource")?.id).toBe("parent");
    expect(getParentGroup(doc, "border")?.id).toBe("parent");
    expect(getParentGroup(doc, "orphan")).toBeUndefined();
    expect(getChildren(doc, "parent").map((item) => item.id)).toEqual(["child", "resource"]);
    expect(getChildren(doc, "missing")).toEqual([]);
  });

  it("prefers the default view and falls back to the first view", () => {
    const doc = createEmptyDocument("views");
    doc.views = [
      { id: "first", places: {}, routes: {} },
      { id: "default", places: { node: { x: 10 } }, routes: {} },
    ];
    expect(getDefaultView(doc).id).toBe("default");

    doc.views = [{ id: "fallback", places: {}, routes: {} }];
    expect(getDefaultView(doc).id).toBe("fallback");
  });
});
