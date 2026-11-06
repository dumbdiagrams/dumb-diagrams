import { describe, expect, it } from "vitest";

import { getCatalogEntry, getCatalogMap } from "../catalog/index.js";
import { parseDgmResult } from "../dsl/index.js";
import { PROVIDER_RULES } from "./provider-rules.js";
import { validateDocument } from "./validate.js";

const parseDgm = (source: string) => parseDgmResult(source)._unsafeUnwrap();

const cases = [
  { grammar: "aws", network: "aws.vpc", outside: "aws.dynamodb", inside: "aws.aws-lambda", word: "VPC" },
  {
    grammar: "azure",
    network: "azure.vnet",
    outside: "azure.key-vaults",
    inside: "azure.virtual-machine",
    word: "VNet",
  },
  { grammar: "gcp", network: "gcp.vpc", outside: "gcp.bigquery", inside: "gcp.compute-engine", word: "VPC network" },
  {
    grammar: "cloud-agnostic",
    network: "cloud-agnostic.network",
    outside: "cloud-agnostic.object-storage",
    inside: "cloud-agnostic.server",
    word: "network",
  },
] as const;

function warnings(grammar: string, network: string, type: string) {
  const doc = parseDgm(`diagram rules {
  grammar ${grammar}
  ${network} net "Network" {
    ${type} item
  }
}`);
  return validateDocument(doc, getCatalogMap(), { enforceCatalogRules: false }).filter(
    (issue) => issue.level === "warning",
  );
}

describe("provider network rules", () => {
  it("lists only real catalog types owned by that provider", () => {
    for (const [provider, rules] of Object.entries(PROVIDER_RULES)) {
      for (const type of rules.outsideNetwork) expect(getCatalogEntry(type)?.provider, type).toBe(provider);
    }
  });

  for (const { grammar, network, outside, inside, word } of cases) {
    it(`${grammar}: warns for a managed service inside the ${word}, not for a workload`, () => {
      expect(warnings(grammar, network, outside)).toEqual([
        {
          level: "warning",
          code: "managed-service-in-network",
          message: `${outside} (item) is a managed service; draw it outside the ${word}`,
          id: "item",
        },
      ]);
      expect(warnings(grammar, network, inside)).toEqual([]);
    });
  }

  it("requires the provider's own root boundary instead of cloud-agnostic.cloud", () => {
    for (const [grammar, { rootBoundary }] of Object.entries(PROVIDER_RULES)) {
      expect(getCatalogEntry(rootBoundary)?.assetKind, rootBoundary).toBe("group");
      const codes = (type: string) =>
        validateDocument(
          parseDgm(`diagram rules {\n  grammar ${grammar}\n  ${type} root "Root" {}\n}`),
          getCatalogMap(),
        )
          .map((issue) => issue.code)
          .filter((code) => code === "generic-cloud-boundary");
      expect(codes("cloud-agnostic.cloud"), grammar).toEqual(
        grammar === "cloud-agnostic" ? [] : ["generic-cloud-boundary"],
      );
      expect(codes(rootBoundary), grammar).toEqual([]);
    }
  });
});
