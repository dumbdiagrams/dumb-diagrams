import { describe, expect, it } from "vitest";

import { invariantTier } from "@dumb-diagrams/runtime/render";
import {
  hardRoutingWarnings,
  routingReviewFailures,
  routingWarningDelta,
} from "../../scripts/lib/routing-review-policy.mjs";

const warning = {
  file: "example.dgm",
  code: "edge-crossing",
  message: "Edges first and second cross",
};

describe("routing review policy", () => {
  it("rejects a missing matching review", () => {
    expect(routingReviewFailures([warning], [])).toEqual([
      { warning, reason: "missing review" },
    ]);
  });

  it("rejects malformed review collections as missing review evidence", () => {
    expect(routingReviewFailures([warning], [null])).toEqual([
      { warning, reason: "missing review" },
    ]);
    expect(routingReviewFailures([warning], "not an array")).toEqual([
      { warning, reason: "missing review" },
    ]);
  });

  it.each([
    [{ status: "pending", decision: "Still checking" }, "pending"],
    [{ decision: "No status" }, "missing"],
    [{ status: "approved", decision: "Unknown status" }, "approved"],
    [{ status: "reviewed", decision: "   " }, "review decision must be non-empty"],
  ])("rejects an incomplete review (%s)", (review, expected) => {
    const failures = routingReviewFailures([warning], [{ ...warning, ...review }]);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.reason).toContain(expected);
  });

  it("accepts a matching reviewed review with a decision", () => {
    expect(routingReviewFailures([warning], [{
      ...warning,
      status: "reviewed",
      decision: "Accepted after inspecting the rendered diagram.",
    }])).toEqual([]);
  });

  it("never treats hard invariants as reviewable baselines", () => {
    const hard = { ...warning, code: "edge-icon-collision" };
    expect(hardRoutingWarnings([hard], invariantTier)).toEqual([hard]);
    expect(hardRoutingWarnings([warning], invariantTier)).toEqual([]);
  });

  it("reports added and removed warning entries by stable warning identity", () => {
    const added = { ...warning, message: "A new crossing" };
    const { added: actualAdded, removed } = routingWarningDelta([added], [warning]);
    expect(actualAdded).toEqual([added]);
    expect(removed).toEqual([warning]);
  });
});
