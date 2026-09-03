import { describe, expect, it } from "vitest";

import { ASSET_BUDGETS, assetBudgetFailures } from "../../scripts/check-asset-budget.mjs";

const branding = Object.fromEntries(Object.entries(ASSET_BUDGETS.branding).map(([path, budget]) => [path, {
  size: budget.maxBytes,
  readablePng: true,
  width: budget.width,
  height: budget.height,
}]));

describe("built asset budget policy", () => {
  it("accepts branding, built bundles, and a prepared distribution at their ceilings", () => {
    expect(assetBudgetFailures({
      branding,
      editor: { jsBytes: ASSET_BUDGETS.editor.jsBytes, cssBytes: ASSET_BUDGETS.editor.cssBytes, largestJsBytes: ASSET_BUDGETS.editor.largestJsBytes },
      preparedDistributionBytes: ASSET_BUDGETS.preparedDistributionBytes,
      tarballBytes: ASSET_BUDGETS.tarballBytes,
    })).toEqual([]);
  });

  it("reports missing and exceeded distribution data", () => {
    const failures = assetBudgetFailures({ branding, editor: { jsBytes: 1, cssBytes: 1, largestJsBytes: 1 } });
    expect(failures).toContain("packages/cli/dist: prepared distribution is missing");
    expect(assetBudgetFailures({ branding, editor: { jsBytes: ASSET_BUDGETS.editor.jsBytes + 1, cssBytes: 1, largestJsBytes: 1 }, preparedDistributionBytes: 1 })).toContain(
      `packages/editor/dist: ${ASSET_BUDGETS.editor.jsBytes + 1} JavaScript bytes exceed the ${ASSET_BUDGETS.editor.jsBytes}-byte budget`,
    );
  });

  it("gates an optional packed tarball when it exists", () => {
    expect(assetBudgetFailures({ branding, editor: { jsBytes: 1, cssBytes: 1, largestJsBytes: 1 }, preparedDistributionBytes: 1, tarballBytes: ASSET_BUDGETS.tarballBytes + 1 })).toContain(
      `npm tarball: ${ASSET_BUDGETS.tarballBytes + 1} bytes exceed the ${ASSET_BUDGETS.tarballBytes}-byte budget`,
    );
  });
});
