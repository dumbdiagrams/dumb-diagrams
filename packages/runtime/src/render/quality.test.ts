import { describe, expect, it } from "vitest";

import type { ValidationIssue } from "../core/index.js";
import type { InvariantFailure } from "./invariants.js";
import {
  assessQuality,
  compareQuality,
  isQualityImproved,
  qualityFindings,
  qualityHardRegressionReason,
  qualityRegressionReason,
} from "./quality.js";

describe("diagram quality assessment", () => {
  it("classifies hard collisions ahead of soft crossings", () => {
    const hard: InvariantFailure = {
      code: "edge-icon-collision",
      message: "Edge a passes through icon of b",
      elementIds: ["a", "b"],
    };
    const soft: InvariantFailure = {
      code: "edge-crossing",
      message: "Edges a and c cross",
      elementIds: ["a", "c"],
    };
    const hardOnly = assessQuality(qualityFindings([], [hard]));
    const softOnly = assessQuality(qualityFindings([], [soft]));
    expect(compareQuality(hardOnly, softOnly)).toBeGreaterThan(0);
    expect(compareQuality(softOnly, hardOnly)).toBeLessThan(0);
  });

  it("treats routing failures as hard warnings", () => {
    const routing: ValidationIssue = {
      level: "warning",
      code: "routing",
      message: "Unable to route",
    };
    const quality = assessQuality(qualityFindings([routing], []));
    expect(quality.warnings).toBe(1);
    expect(quality.clean).toBe(false);
  });

  it("rejects regressions that introduce new findings", () => {
    const baseline = qualityFindings([], [{
      code: "edge-crossing",
      message: "Edges a and b cross",
      elementIds: ["a", "b"],
    }]);
    const candidate = qualityFindings([], [
      {
        code: "edge-crossing",
        message: "Edges a and b cross",
        elementIds: ["a", "b"],
      },
      {
        code: "edge-icon-collision",
        message: "Edge a passes through icon of c",
        elementIds: ["a", "c"],
      },
    ]);
    expect(qualityRegressionReason(baseline, candidate)).toBe(
      "Edge a passes through icon of c",
    );
    expect(qualityHardRegressionReason(baseline, candidate)).toBe(
      "Edge a passes through icon of c",
    );
  });

  it("allows trading soft findings when quality improves", () => {
    const baseline = qualityFindings([], [{
      code: "edge-crossing",
      message: "Edges a and b cross",
      elementIds: ["a", "b"],
    }]);
    const candidate = qualityFindings([], [{
      code: "edge-corridor-overlap",
      message: "Edges a and b share a corridor outside a fan-out stem",
      elementIds: ["a", "b"],
    }]);
    expect(qualityRegressionReason(baseline, candidate)).toBe(
      "Edges a and b share a corridor outside a fan-out stem",
    );
    expect(qualityHardRegressionReason(baseline, candidate)).toBeUndefined();
  });
});
