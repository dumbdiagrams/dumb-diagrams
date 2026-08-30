import { describe, expect, it } from "vitest";

import { layoutDocument } from "../layout/index.js";
import { parseDgm } from "../dsl/index.js";
import { renderSvg } from "./svg.js";

describe("provider group rendering", () => {
  it.each([
    ["azure", "azure.vnet", "catalog-icons/azure/"],
    ["gcp", "gcp.vpc", "catalog-icons/gcp/"],
    ["cloud-agnostic", "cloud-agnostic.network", "catalog-icons/cloud-agnostic/"],
  ] as const)("uses %s catalog icons with AWS visual conventions", (grammar, type, iconPrefix) => {
    const doc = parseDgm(`diagram ${grammar.replace(/-/g, "_")} {
  grammar ${grammar}
  flow lr
  ${type} network "Network"
}`);
    const layout = layoutDocument(doc);
    const svg = renderSvg(doc, layout, { resolveIconHref: (path) => path });
    expect(svg).toContain(iconPrefix);
    expect(svg).toContain('stroke="#8C4FFF"');
    expect(svg).toContain("font-family:Amazon Ember");
  });
});
