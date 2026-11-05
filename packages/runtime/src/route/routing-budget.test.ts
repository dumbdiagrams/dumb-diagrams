import { describe, expect, it } from "vitest";

import { EMERGENCY_ROUTING_LIMITS, RoutingBudget } from "./routing-budget";

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

  it("keeps emergency hard-safe work separate from an explicit zero A* budget", () => {
    const budget = new RoutingBudget({ maxAstarExpansions: 0 }, 1);

    expect(budget.consume("astarExpansions")).toBe(false);
    expect(budget.consumeEmergencyVisibilityQuery()).toBe(true);
    expect(budget.consumeEmergencyVisibilityExpansion()).toBe(true);
    expect(budget.recordEmergencyScorePathCall()).toBe(true);

    expect(budget.diagnostics()).toMatchObject({
      astarExpansions: 1,
      exhausted: true,
      limits: { maxAstarExpansions: 0 },
      emergency: {
        scorePathCalls: 1,
        visibilityQueries: 1,
        visibilityExpansions: 1,
        limits: {
          scorePathCalls: 200,
          visibilityQueries: EMERGENCY_ROUTING_LIMITS.visibilityQueries,
          visibilityExpansions: EMERGENCY_ROUTING_LIMITS.visibilityExpansions,
        },
      },
    });
  });

  it("bounds emergency exact-visibility queries and expansions independently", () => {
    const budget = new RoutingBudget({}, 1);
    for (let index = 0; index < EMERGENCY_ROUTING_LIMITS.visibilityQueries; index++) {
      expect(budget.consumeEmergencyVisibilityQuery()).toBe(true);
    }
    expect(budget.consumeEmergencyVisibilityQuery()).toBe(false);
    for (let index = 0; index < EMERGENCY_ROUTING_LIMITS.visibilityExpansions; index++) {
      expect(budget.consumeEmergencyVisibilityExpansion()).toBe(true);
    }
    expect(budget.consumeEmergencyVisibilityExpansion()).toBe(false);
    expect(budget.diagnostics().emergency).toMatchObject({
      visibilityQueries: EMERGENCY_ROUTING_LIMITS.visibilityQueries,
      visibilityExpansions: EMERGENCY_ROUTING_LIMITS.visibilityExpansions,
    });
  });

  it("bounds emergency scoring by the configured document-wide cap", () => {
    const budget = new RoutingBudget({}, 1, 2);
    expect(budget.recordEmergencyScorePathCall()).toBe(true);
    expect(budget.recordEmergencyScorePathCall()).toBe(true);
    expect(budget.recordEmergencyScorePathCall()).toBe(false);
    expect(budget.diagnostics().emergency).toMatchObject({
      scorePathCalls: 2,
      limits: { scorePathCalls: 2 },
    });
  });
});
