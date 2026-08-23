import { describe, expect, it } from "vitest";

import { createEmptyDocument } from "@dumb-diagrams/core";

import { filenameWithExtension, getExportBounds, sanitizeFilename } from "./export-actions";

describe("export filenames", () => {
  it("removes path-like and unsupported filename characters", () => {
    expect(sanitizeFilename("../My Diagram: v2.dgm")).toBe("My-Diagram-v2.dgm");
    expect(sanitizeFilename("...")).toBe("diagram");
  });

  it("replaces an existing extension with the requested format", () => {
    expect(filenameWithExtension("My diagram.dgm", "svg")).toBe("My-diagram.svg");
    expect(filenameWithExtension("", ".dgm")).toBe("diagram.dgm");
  });

  it("auto-fills selection bounds around the selected live entities", () => {
    const doc = createEmptyDocument("selection-bounds");
    doc.resources.push(
      { id: "source", type: "s3", label: {}, role: "primary", props: {} },
      { id: "target", type: "lambda", label: {}, role: "primary", props: {} },
    );
    doc.edges.push({ id: "flow", source: "source", target: "target", style: "solid" });
    const layout = {
      nodes: [
        { id: "source", type: "resource" as const, icon: { x: 100, y: 120, w: 48, h: 48 }, label: { x: 96, y: 172, w: 56, h: 32 }, obstacle: { x: 96, y: 120, w: 56, h: 84 }, role: "primary" as const, resourceType: "s3", serviceLabel: "S3" },
        { id: "target", type: "resource" as const, icon: { x: 520, y: 120, w: 48, h: 48 }, label: { x: 516, y: 172, w: 56, h: 32 }, obstacle: { x: 512, y: 120, w: 64, h: 84 }, role: "primary" as const, resourceType: "lambda", serviceLabel: "Lambda" },
      ],
      groups: [],
      edges: [{ id: "flow", source: "source", target: "target", points: [{ x: 152, y: 162 }, { x: 512, y: 162 }], style: "solid" as const }],
      width: 800,
      height: 600,
      symmetries: [],
    };

    expect(getExportBounds(doc, layout, [{ kind: "resource", id: "source" }], "selection")).toEqual({
      x: 72,
      y: 96,
      w: 104,
      h: 132,
    });
    expect(getExportBounds(doc, layout, [{ kind: "edge", id: "flow" }], "selection")).toEqual({
      x: 72,
      y: 96,
      w: 528,
      h: 132,
    });
  });
});
