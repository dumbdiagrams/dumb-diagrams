import { getCatalogMap } from "@dumb-diagrams/catalog";
import { validateDocument, hasErrors } from "@dumb-diagrams/core";
import { layoutDocument } from "@dumb-diagrams/layout";
import { routeEdges, attachRoutes } from "@dumb-diagrams/route";

import { checkInvariants } from "./invariants.js";
import { renderSvgWithDefs } from "./node.js";

export function compileDiagram(doc: Parameters<typeof layoutDocument>[0]) {
  const catalog = getCatalogMap();
  const issues = validateDocument(doc, catalog);
  if (hasErrors(issues)) {
    return { ok: false as const, issues, svg: null, layout: null };
  }

  const layout = layoutDocument(doc);
  const edges = routeEdges(doc, layout);
  const fullLayout = attachRoutes(layout, edges);
  const invariantFailures = checkInvariants(fullLayout);
  const svg = renderSvgWithDefs(doc, fullLayout);

  return {
    ok: true as const,
    issues,
    invariantFailures,
    layout: fullLayout,
    svg,
  };
}
