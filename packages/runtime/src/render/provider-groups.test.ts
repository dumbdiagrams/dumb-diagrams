import { describe, expect, it } from "vitest";

import manifest from "../catalog/generated/manifest.json" with { type: "json" };
import { layoutDocument } from "../layout/index.js";
import { parseDgmResult } from "../dsl/index.js";
import { resolveProviderGroupColors } from "./provider-group-colors.js";
import { renderSvg } from "./svg.js";

const parseDgm = (source: string) => parseDgmResult(source)._unsafeUnwrap();

function groupStroke(svg: string): string {
  return svg.match(/class="group-border"[^>]*stroke="([^"]+)"/)?.[1] ?? "";
}

describe("provider group rendering", () => {
  it.each([
    ["azure", "azure.vnet", "catalog-icons/azure/", "#50E6FF"],
    ["gcp", "gcp.vpc", "catalog-icons/gcp/", "#4285F4"],
    ["cloud-agnostic", "cloud-agnostic.network", "catalog-icons/cloud-agnostic/", "#8C4FFF"],
  ] as const)("uses %s catalog icons with provider boundary colors", (grammar, type, iconPrefix, stroke) => {
    const doc = parseDgm(`diagram ${grammar.replace(/-/g, "_")} {
  grammar ${grammar}
  flow lr
  ${type} network "Network"
}`);
    const layout = layoutDocument(doc);
    const svg = renderSvg(doc, layout, { resolveIconHref: (path) => path });
    expect(svg).toContain(iconPrefix);
    expect(groupStroke(svg)).toBe(stroke);
    expect(svg).toContain("font-family:Amazon Ember");
  });

  it.each([
    ["azure", "#FF9300"],
    ["gcp", "#4285F4"],
  ] as const)("maps %s account boundaries to provider colors", (grammar, stroke) => {
    const type = grammar === "azure" ? "azure.subscription" : "gcp.project";
    const doc = parseDgm(`diagram ${grammar}_account {
  grammar ${grammar}
  flow lr
  ${type} account "Account" {}
}`);
    const svg = renderSvg(doc, layoutDocument(doc));
    expect(groupStroke(svg)).toBe(stroke);
  });

  it("keeps AWS and cloud-agnostic on the shared architecture palette", () => {
    for (const [grammar, type, stroke] of [
      ["aws", "aws.vpc", "#8C4FFF"],
      ["cloud-agnostic", "cloud-agnostic.region", "#00A4A6"],
    ] as const) {
      const doc = parseDgm(`diagram ${grammar}_palette {
  grammar ${grammar}
  flow lr
  ${type} boundary "Boundary"
}`);
      expect(groupStroke(renderSvg(doc, layoutDocument(doc)))).toBe(stroke);
      expect(resolveProviderGroupColors(grammar, type)).toBeNull();
    }
  });

  it("covers every azure and gcp catalog group type", () => {
    for (const provider of ["azure", "gcp"] as const) {
      const groups = manifest.entries.filter((entry) => entry.provider === provider && entry.assetKind === "group");
      expect(groups.length).toBeGreaterThan(0);
      for (const group of groups) {
        expect(resolveProviderGroupColors(provider, group.type)).not.toBeNull();
      }
    }
  });
});
