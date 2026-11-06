import type { DiagramDocument, LayoutResult } from "../core/index.js";
import { getDefaultView } from "../core/index.js";
import { layoutDocument } from "../layout/index.js";
import { attachRoutes, routeEdges, type RoutingDiagnostics, type RoutingOptions } from "../route/index.js";
import { checkInvariants, type InvariantFailure } from "./invariants.js";
import { assessQuality, compareQuality, qualityFindings } from "./quality.js";

export interface AutomaticLayoutOptions {
  routing?: RoutingOptions;
  prepareLayout?: (layout: LayoutResult) => LayoutResult;
  maxInvariantFailures?: number;
}

/** Bounded deterministic selection; source graph and pinned geometry are immutable. */
export function compileAutomaticLayout(doc: DiagramDocument, options: AutomaticLayoutOptions = {}) {
  const attempt = (compoundFlow: boolean) => {
    let placed = layoutDocument(doc, { compoundFlow });
    if (options.prepareLayout) placed = options.prepareLayout(placed);
    let diagnostics: RoutingDiagnostics | undefined;
    const edges = routeEdges(doc, placed, {
      ...options.routing,
      onDiagnostics: (value) => {
        diagnostics = value;
      },
    });
    const layout = attachRoutes(placed, edges);
    const invariantFailures = checkInvariants(layout, { maxFailures: options.maxInvariantFailures ?? 200 });
    // Plain crossings are permitted. Never trade a collision or a shared
    // corridor for fewer crossings when choosing between automatic layouts.
    const quality = assessQuality(
      qualityFindings(
        [],
        invariantFailures.filter((finding) => finding.code !== "edge-crossing"),
      ),
    );
    const crossings = invariantFailures.filter((finding) => finding.code === "edge-crossing").length;
    return { layout, invariantFailures, quality, crossings, diagnostics: diagnostics! };
  };
  let best = attempt(false);
  const attempts = [best];
  const view = getDefaultView(doc);
  const hasPinnedGeometry =
    Object.values(view.places).some((place) => place.pin) || Object.values(view.routes).some((route) => route.pin);
  const hasExplicitBudget = [
    "maxScorePathCalls",
    "maxRouteConflictChecks",
    "maxAstarExpansions",
    "maxRepairCandidates",
  ].some((key) => options.routing?.[key as keyof RoutingOptions] !== undefined);
  // Large/pathological inputs retain one bounded pass. Ordinary diagrams get
  // one topology-aware alternative only when the existing arrangement fails.
  if (
    best.invariantFailures.length &&
    !hasPinnedGeometry &&
    !hasExplicitBudget &&
    doc.resources.length <= 32 &&
    doc.groups.length <= 32 &&
    doc.edges.length <= 48
  ) {
    const alternative = attempt(true);
    attempts.push(alternative);
    const delta = compareQuality(alternative.quality, best.quality);
    if (
      delta < 0 ||
      (delta === 0 &&
        (alternative.crossings < best.crossings ||
          (alternative.crossings === best.crossings && routeLength(alternative.layout) < routeLength(best.layout))))
    )
      best = alternative;
  }
  const diagnostics = {
    ...best.diagnostics,
    exhausted: attempts.some((result) => result.diagnostics.exhausted),
    emergency: {
      scorePathCalls: attempts.reduce((sum, result) => sum + result.diagnostics.emergency.scorePathCalls, 0),
      visibilityQueries: attempts.reduce((sum, result) => sum + result.diagnostics.emergency.visibilityQueries, 0),
      visibilityExpansions: attempts.reduce(
        (sum, result) => sum + result.diagnostics.emergency.visibilityExpansions,
        0,
      ),
      limits: {
        scorePathCalls: attempts.reduce((sum, result) => sum + result.diagnostics.emergency.limits.scorePathCalls, 0),
        visibilityQueries: attempts.reduce(
          (sum, result) => sum + result.diagnostics.emergency.limits.visibilityQueries,
          0,
        ),
        visibilityExpansions: attempts.reduce(
          (sum, result) => sum + result.diagnostics.emergency.limits.visibilityExpansions,
          0,
        ),
      },
    },
    scorePathCalls: attempts.reduce((sum, result) => sum + result.diagnostics.scorePathCalls, 0),
    routeConflictChecks: attempts.reduce((sum, result) => sum + result.diagnostics.routeConflictChecks, 0),
    astarExpansions: attempts.reduce((sum, result) => sum + result.diagnostics.astarExpansions, 0),
    repairCandidates: attempts.reduce((sum, result) => sum + result.diagnostics.repairCandidates, 0),
    limits: {
      maxScorePathCalls: attempts.reduce((sum, result) => sum + result.diagnostics.limits.maxScorePathCalls, 0),
      maxRouteConflictChecks: attempts.reduce(
        (sum, result) => sum + result.diagnostics.limits.maxRouteConflictChecks,
        0,
      ),
      maxAstarExpansions: attempts.reduce((sum, result) => sum + result.diagnostics.limits.maxAstarExpansions, 0),
      maxRepairCandidates: attempts.reduce((sum, result) => sum + result.diagnostics.limits.maxRepairCandidates, 0),
    },
  };
  options.routing?.onDiagnostics?.(diagnostics);
  return {
    layout: best.layout,
    invariantFailures: best.invariantFailures as InvariantFailure[],
    diagnostics,
    // A discarded search does not degrade the successfully retained drawing.
    routingDegraded: best.diagnostics.exhausted,
  };
}

function routeLength(layout: LayoutResult): number {
  return layout.edges.reduce(
    (total, edge) =>
      total +
      edge.points
        .slice(1)
        .reduce(
          (length, point, index) =>
            length + Math.abs(point.x - edge.points[index]!.x) + Math.abs(point.y - edge.points[index]!.y),
          0,
        ),
    0,
  );
}
