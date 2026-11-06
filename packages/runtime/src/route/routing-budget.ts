export type RoutingBudgetOptions = {
  maxScorePathCalls?: number;
  maxRouteConflictChecks?: number;
  maxAstarExpansions?: number;
  maxRepairCandidates?: number;
};

export type RoutingDiagnostics = {
  scorePathCalls: number;
  routeConflictChecks: number;
  astarExpansions: number;
  repairCandidates: number;
  exhausted: boolean;
  limits: Required<RoutingBudgetOptions>;
  emergency: {
    scorePathCalls: number;
    visibilityQueries: number;
    visibilityExpansions: number;
    limits: {
      scorePathCalls: number;
      visibilityQueries: number;
      visibilityExpansions: number;
    };
  };
};

export type RoutingOptions = RoutingBudgetOptions & {
  onDiagnostics?: (diagnostics: RoutingDiagnostics) => void;
};

export const ROUTING_BUDGET_WARNING_CODE = "routing-budget";
export const ROUTING_BUDGET_WARNING_MESSAGE =
  "Routing work budget or grid memory limit reached; retained the best available routes.";

type RoutingBudgetKind = keyof Pick<
  RoutingDiagnostics,
  "scorePathCalls" | "routeConflictChecks" | "astarExpansions" | "repairCandidates"
>;

const ROUTING_BUDGET_LIMIT_KEYS: Record<RoutingBudgetKind, keyof Required<RoutingBudgetOptions>> = {
  scorePathCalls: "maxScorePathCalls",
  routeConflictChecks: "maxRouteConflictChecks",
  astarExpansions: "maxAstarExpansions",
  repairCandidates: "maxRepairCandidates",
};

const DEFAULT_ROUTING_BUDGET: Required<RoutingBudgetOptions> = {
  maxScorePathCalls: 60_000,
  maxRouteConflictChecks: 20_000,
  maxAstarExpansions: 2_000_000,
  maxRepairCandidates: 20_000,
};

export const EMERGENCY_ROUTING_LIMITS = {
  scorePathCallsPerEdge: 200,
  visibilityQueries: 64,
  visibilityExpansions: 80_000,
} as const;

export class RoutingBudget {
  readonly limits: Required<RoutingBudgetOptions>;
  readonly counts = {
    scorePathCalls: 0,
    routeConflictChecks: 0,
    astarExpansions: 0,
    repairCandidates: 0,
  };
  exhausted = false;
  private degraded = false;
  private readonly emergencyCounts = { scorePathCalls: 0, visibilityQueries: 0, visibilityExpansions: 0 };
  private readonly emergencyLimits: {
    scorePathCalls: number;
    visibilityQueries: number;
    visibilityExpansions: number;
  };

  constructor(options: RoutingBudgetOptions, complexity: number, emergencyScorePathCallLimit = 200) {
    this.emergencyLimits = {
      scorePathCalls: emergencyScorePathCallLimit,
      visibilityQueries: EMERGENCY_ROUTING_LIMITS.visibilityQueries,
      visibilityExpansions: EMERGENCY_ROUTING_LIMITS.visibilityExpansions,
    };
    const scale = Math.max(1, complexity / 100);
    const scaled = (key: keyof RoutingBudgetOptions, fallback: number, minimum: number) =>
      options[key] ?? Math.max(minimum, Math.floor(fallback / scale));
    this.limits = {
      maxScorePathCalls: scaled("maxScorePathCalls", DEFAULT_ROUTING_BUDGET.maxScorePathCalls, 2_000),
      maxRouteConflictChecks: scaled("maxRouteConflictChecks", DEFAULT_ROUTING_BUDGET.maxRouteConflictChecks, 1_000),
      maxAstarExpansions: scaled("maxAstarExpansions", DEFAULT_ROUTING_BUDGET.maxAstarExpansions, 5_000),
      maxRepairCandidates: scaled("maxRepairCandidates", DEFAULT_ROUTING_BUDGET.maxRepairCandidates, 1_000),
    };
  }

  consume(kind: RoutingBudgetKind): boolean {
    if (this.exhausted) return false;
    const count = ++this.counts[kind];
    if (count > this.limits[ROUTING_BUDGET_LIMIT_KEYS[kind]]) this.exhausted = true;
    return !this.exhausted;
  }

  /** Record a bounded-resource fallback without stopping cheap routing work. */
  markDegraded(): void {
    this.degraded = true;
  }

  /** Count hard-safe last-resort work separately so explicit route limits stay authoritative. */
  recordEmergencyScorePathCall(): boolean {
    if (this.emergencyCounts.scorePathCalls >= this.emergencyLimits.scorePathCalls) {
      this.markDegraded();
      return false;
    }
    this.emergencyCounts.scorePathCalls++;
    return true;
  }

  consumeEmergencyVisibilityQuery(): boolean {
    if (this.emergencyCounts.visibilityQueries >= EMERGENCY_ROUTING_LIMITS.visibilityQueries) return false;
    this.emergencyCounts.visibilityQueries++;
    return true;
  }

  consumeEmergencyVisibilityExpansion(): boolean {
    if (this.emergencyCounts.visibilityExpansions >= EMERGENCY_ROUTING_LIMITS.visibilityExpansions) return false;
    this.emergencyCounts.visibilityExpansions++;
    return true;
  }

  diagnostics(): RoutingDiagnostics {
    return {
      ...this.counts,
      exhausted: this.exhausted || this.degraded,
      limits: { ...this.limits },
      emergency: {
        ...this.emergencyCounts,
        limits: { ...this.emergencyLimits },
      },
    };
  }
}
