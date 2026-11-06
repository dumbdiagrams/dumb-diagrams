import { createEmptyDocument } from "@dumb-diagrams/runtime/core";
import { INVARIANT_DIAGNOSTICS_TRUNCATED_CODE } from "@dumb-diagrams/runtime/render";
import { describe, expect, it } from "vitest";

import { autoFixRejectionReason, compileDocument, MAX_STUDIO_INVARIANT_FAILURES } from "./diagram-compiler";

describe("Studio compilation memory bounds", () => {
  it("bounds a dense diagram's retained diagnostics and reports omitted findings", () => {
    const doc = createEmptyDocument("dense-diagnostics");
    doc.flow = "lr";
    doc.resources = Array.from({ length: 44 }, (_, index) => ({
      id: `node${index}`,
      type: "cloud-agnostic.actor",
      label: { service: `Node ${index}` },
      role: "primary" as const,
      props: {},
    }));
    doc.edges = doc.resources.flatMap((resource, index) =>
      doc.resources.slice(index + 1).map((target) => ({
        id: `${resource.id}-${target.id}`,
        source: resource.id,
        target: target.id,
        kind: "flow" as const,
        style: "solid" as const,
      })),
    );

    const result = compileDocument(doc, false);
    expect(result.ok).toBe(true);
    expect(result.invariantFailures).toHaveLength(MAX_STUDIO_INVARIANT_FAILURES + 1);
    expect(result.invariantFailures.at(-1)).toMatchObject({
      code: INVARIANT_DIAGNOSTICS_TRUNCATED_CODE,
      message: expect.stringContaining("omitted"),
      elementIds: [],
    });
    expect(JSON.stringify(result.invariantFailures).length).toBeLessThan(100_000);
  });

  it("rejects automatic repair comparisons when either result has incomplete diagnostics", () => {
    const clean = compileDocument(createEmptyDocument("clean"), false);
    const truncated = {
      ...clean,
      invariantFailures: [
        {
          code: INVARIANT_DIAGNOSTICS_TRUNCATED_CODE,
          message: "Additional issues omitted",
          elementIds: [],
        },
      ],
    };
    expect(autoFixRejectionReason(clean, clean)).toBeUndefined();
    expect(autoFixRejectionReason(clean, truncated)).toContain("incomplete");
    expect(autoFixRejectionReason(truncated, clean)).toContain("incomplete");
  });
});
