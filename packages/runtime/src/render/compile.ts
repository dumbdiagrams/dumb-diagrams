import { getCatalogMap } from "../catalog/index.js";
import { validateDocument, hasErrors } from "../core/index.js";
import { layoutDocument } from "../layout/index.js";
import { routeEdges, attachRoutes } from "../route/index.js";

import { checkInvariants } from "./invariants.js";
import { renderSvg } from "./svg.js";

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
  const svg = renderSvg(doc, fullLayout, { resolveIconHref: (path) => path });

  return {
    ok: true as const,
    issues,
    invariantFailures,
    layout: fullLayout,
    svg,
  };
}
