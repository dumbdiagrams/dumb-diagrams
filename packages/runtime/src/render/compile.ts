import { getCatalogMap } from "../catalog/index.js";
import { validateDocument, hasErrors } from "../core/index.js";
import type { ValidationIssue } from "../core/index.js";
import { layoutDocument } from "../layout/index.js";
import { err, ok, type Result } from "neverthrow";
import {
  routeEdges,
  attachRoutes,
  ROUTING_BUDGET_WARNING_CODE,
  ROUTING_BUDGET_WARNING_MESSAGE,
} from "../route/index.js";

import { checkInvariants } from "./invariants.js";
import { renderSvg } from "./svg.js";
import { validateEmbeddedAssets } from "./validate-assets.js";

export function compileDiagram(doc: Parameters<typeof layoutDocument>[0]) {
  const catalog = getCatalogMap();
  const issues = [...validateDocument(doc, catalog), ...validateEmbeddedAssets(doc)];
  if (hasErrors(issues)) {
    return { ok: false as const, issues, svg: null, layout: null };
  }

  const layout = layoutDocument(doc);
  const routingWarnings: ValidationIssue[] = [];
  const edges = routeEdges(doc, layout, {
    onBudgetExhausted: () => routingWarnings.push({
      level: "warning",
      code: ROUTING_BUDGET_WARNING_CODE,
      message: ROUTING_BUDGET_WARNING_MESSAGE,
    }),
  });
  const fullLayout = attachRoutes(layout, edges);
  const invariantFailures = checkInvariants(fullLayout);
  const svg = renderSvg(doc, fullLayout, { resolveIconHref: (path) => path });

  return {
    ok: true as const,
    issues: [...issues, ...routingWarnings],
    invariantFailures,
    layout: fullLayout,
    svg,
  };
}

export type CompiledDiagram = Extract<ReturnType<typeof compileDiagram>, { ok: true }>;

export type DiagramValidationError = {
  readonly code: "validation";
  readonly message: string;
  readonly issues: readonly ValidationIssue[];
};

/** Safe boundary for validation failures; warnings and invariants remain success. */
export function compileDiagramResult(
  doc: Parameters<typeof layoutDocument>[0],
): Result<CompiledDiagram, DiagramValidationError> {
  const result = compileDiagram(doc);
  if (!result.ok) {
    return err({
      code: "validation",
      message: "Diagram failed validation",
      issues: result.issues,
    });
  }
  return ok(result);
}
