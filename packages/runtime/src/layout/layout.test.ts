import { describe, expect, it } from "vitest";

import { createEmptyDocument } from "../core/index.js";
import type { DiagramDocument, Resource } from "../core/index.js";
import { layoutDocument } from "./layout.js";

function resource(id: string, parent?: string): Resource {
  return {
    id,
    type: "aws.lambda",
    parent,
    label: { service: id },
    role: "primary",
    props: {},
  };
}

function logicalGroupDocument(): DiagramDocument {
  const doc = createEmptyDocument("logical-group-layout");
  doc.resources = [
    resource("source"),
    resource("first", "services"),
    resource("second", "services"),
    resource("third", "services"),
  ];
  doc.groups = [{
    id: "services",
    kind: "logical",
    label: "Services",
    children: ["first", "second", "third"],
  }];
  return doc;
}

describe("logical group layout", () => {
  it("stacks parallel siblings fed by the same external source", () => {
    const doc = logicalGroupDocument();
    doc.edges = ["first", "second", "third"].map((target, index) => ({
      id: `fanout-${index}`,
      source: "source",
      target,
      style: "dashed",
      kind: "flow",
    }));

    const nodes = new Map(layoutDocument(doc).nodes.map((node) => [node.id, node]));
    const first = nodes.get("first")!.obstacle;
    const second = nodes.get("second")!.obstacle;
    const third = nodes.get("third")!.obstacle;
    const centerX = (rect: typeof first) => rect.x + rect.w / 2;

    expect(centerX(first)).toBe(centerX(second));
    expect(centerX(second)).toBe(centerX(third));
    expect(first.y).toBeLessThan(second.y);
    expect(second.y).toBeLessThan(third.y);
  });

  it("keeps a genuine child-to-child flow horizontal", () => {
    const doc = logicalGroupDocument();
    doc.edges = [
      { id: "first-second", source: "first", target: "second", style: "solid", kind: "flow" },
      { id: "second-third", source: "second", target: "third", style: "solid", kind: "flow" },
    ];

    const nodes = new Map(layoutDocument(doc).nodes.map((node) => [node.id, node]));
    const first = nodes.get("first")!.obstacle;
    const second = nodes.get("second")!.obstacle;
    const third = nodes.get("third")!.obstacle;

    expect(first.x).toBeLessThan(second.x);
    expect(second.x).toBeLessThan(third.x);
    expect(first.y).toBe(second.y);
    expect(second.y).toBe(third.y);
  });
});
