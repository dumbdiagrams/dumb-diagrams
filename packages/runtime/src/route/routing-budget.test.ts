import { describe, expect, it } from "vitest";

import { RoutingBudget } from "./routing-budget";

describe("RoutingBudget", () => {
  it("uses explicit limits and reports the operation that exhausted the budget", () => {
    const budget = new RoutingBudget({ maxScorePathCalls: 1 }, 1);

    expect(budget.consume("scorePathCalls")).toBe(true);
    expect(budget.consume("scorePathCalls")).toBe(false);
    expect(budget.diagnostics()).toMatchObject({
      scorePathCalls: 2,
      exhausted: true,
      limits: { maxScorePathCalls: 1 },
    });
  });

  it("scales defaults for complex documents without dropping below safe minimums", () => {
    const budget = new RoutingBudget({}, 10_000);

    expect(budget.limits).toEqual({
      maxScorePathCalls: 2_000,
      maxRouteConflictChecks: 1_000,
      maxAstarExpansions: 20_000,
      maxRepairCandidates: 1_000,
    });
  });

  it("reports degraded routing without stopping the remaining cheap work", () => {
    const budget = new RoutingBudget({}, 1);

    budget.markDegraded();

    expect(budget.exhausted).toBe(false);
    expect(budget.diagnostics().exhausted).toBe(true);
    expect(budget.consume("scorePathCalls")).toBe(true);
  });
});
