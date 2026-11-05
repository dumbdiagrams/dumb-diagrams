import type { LayoutResult } from "../core/index.js";
import { describe, expect, it } from "vitest";

import { checkInvariants, INVARIANT_DIAGNOSTICS_TRUNCATED_CODE } from "./invariants.js";

function crossingLayout(): LayoutResult {
  const horizontal = [10, 20, 30].map((y, index) => ({
    id: `horizontal-${index}`,
    source: `h-source-${index}`,
    target: `h-target-${index}`,
    points: [
      { x: 0, y },
      { x: 40, y },
    ],
    style: "solid" as const,
  }));
  const vertical = [10, 20, 30].map((x, index) => ({
    id: `vertical-${index}`,
    source: `v-source-${index}`,
    target: `v-target-${index}`,
    points: [
      { x, y: 0 },
      { x, y: 40 },
    ],
    style: "solid" as const,
  }));
  return {
    nodes: [],
    groups: [],
    edges: [...horizontal, ...vertical],
    width: 40,
    height: 40,
    symmetries: [],
  };
}

describe("checkInvariants diagnostic limits", () => {
  it("reports a required edge that has no visible geometry", () => {
    for (const points of [
      [],
      [{ x: 1, y: 1 }],
      [
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ],
    ]) {
      const layout = crossingLayout();
      layout.edges = [{ id: "missing", source: "a", target: "b", style: "solid", points }];
      expect(checkInvariants(layout)).toEqual([
        {
          code: "edge-route-missing",
          message: "Edge missing has no visible route",
          elementIds: ["missing", "a", "b"],
        },
      ]);
    }
  });
  it("returns no findings for a clean layout, including with a limit", () => {
    const layout: LayoutResult = {
      nodes: [],
      groups: [],
      edges: [],
      width: 0,
      height: 0,
      symmetries: [],
    };

    expect(checkInvariants(layout)).toEqual([]);
    expect(checkInvariants(layout, { maxFailures: 0 })).toEqual([]);
  });

  it("keeps the complete ordered result by default and at an exact limit", () => {
    const layout = crossingLayout();
    const complete = checkInvariants(layout);

    expect(complete).toHaveLength(9);
    expect(checkInvariants(layout, { maxFailures: complete.length })).toEqual(complete);
    expect(checkInvariants(layout, { maxFailures: Number.NaN })).toEqual(complete);
    expect(checkInvariants(layout, { maxFailures: Number.POSITIVE_INFINITY })).toEqual(complete);
    expect(checkInvariants(layout, { maxFailures: -1 })).toEqual(complete);
  });

  it("retains the first failures and appends one exact truncation summary", () => {
    const layout = crossingLayout();
    const complete = checkInvariants(layout);
    const limited = checkInvariants(layout, { maxFailures: 2 });

    expect(limited).toHaveLength(3);
    expect(limited.slice(0, 2)).toEqual(complete.slice(0, 2));
    expect(limited[2]).toEqual({
      code: INVARIANT_DIAGNOSTICS_TRUNCATED_CODE,
      message: "Invariant diagnostics truncated: 7 additional failures omitted",
      elementIds: [],
    });
  });
});
