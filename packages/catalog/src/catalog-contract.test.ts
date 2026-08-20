import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import manifest from "./generated/manifest.json" with { type: "json" };
import {
  CATALOG,
  getCatalogEntry,
  listCategories,
  listProviders,
} from "./catalog.js";

const ROOT = join(import.meta.dirname, "../../..");

describe("canonical catalog contract", () => {
  it("keeps canonical ids unique without dropping collision sources", () => {
    const ids = manifest.entries.map((entry) => `${entry.provider}:${entry.assetKind}:${entry.type}`);
    expect(new Set(ids).size).toBe(ids.length);
    expect(manifest.collisions.length).toBeGreaterThan(0);
    expect(manifest.entries.filter((entry) => entry.provider === "azure")).toHaveLength(720);
  });

  it("exposes four libraries and keeps legacy provider names as lookup aliases", () => {
    expect(listProviders()).toEqual(["aws", "azure", "gcp", "cloud-agnostic"]);
    expect(getCatalogEntry("generic.user")?.provider).toBe("cloud-agnostic");
    expect(getCatalogEntry("neutral.region")?.groupKind).toBe("region");
  });

  it("uses named GCP product categories and keeps category glyphs non-browsable", () => {
    expect(listCategories("gcp")).toContain("Databases");
    expect(listCategories("gcp")).not.toEqual(["AI Hypercomputer"]);
    expect(manifest.entries.some((entry) => entry.assetKind === "category")).toBe(false);
    expect(manifest.assetFiles.some((asset) => asset.browsable === false)).toBe(true);
  });

  it("stages every referenced source asset with a valid SVG root", () => {
    for (const asset of manifest.assetFiles) {
      const source = join(ROOT, asset.sourcePath);
      expect(existsSync(source), asset.sourcePath).toBe(true);
      expect(readFileSync(source, "utf8")).toMatch(/<svg[\s>]/i);
      expect(CATALOG[manifest.entries.find((entry) => entry.icon.sourceId === asset.sourceId)?.type ?? ""] || asset.browsable === false).toBeTruthy();
    }
  });
});
