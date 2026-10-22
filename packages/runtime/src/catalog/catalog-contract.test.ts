import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import manifest from "./generated/manifest.json" with { type: "json" };
import { CATALOG, getCatalogEntry, listCategories, listProviders } from "./catalog.js";

const ROOT = join(import.meta.dirname, "../../../..");

describe("canonical catalog contract", () => {
  it("keeps canonical ids unique without dropping collision sources", () => {
    const ids = manifest.entries.map((entry) => entry.type);
    expect(new Set(ids).size).toBe(ids.length);
    expect(manifest.collisions.length).toBeGreaterThan(0);
    expect(manifest.entries.filter((entry) => entry.provider === "azure")).toHaveLength(720);
  });

  it("exposes four libraries and no pre-release type names", () => {
    expect(listProviders()).toEqual(["aws", "azure", "gcp", "cloud-agnostic"]);
    for (const legacy of ["generic.user", "neutral.region", "aws.lambda", "cloud-agnostic.logical"]) {
      expect(getCatalogEntry(legacy)).toBeUndefined();
    }
  });

  it("keeps cloud-agnostic groups distinct from similarly named resources", () => {
    const cloudGroup = getCatalogEntry("cloud-agnostic.cloud");
    expect(cloudGroup).toMatchObject({ assetKind: "group", groupKind: "cloud" });
    expect(getCatalogEntry("cloud-agnostic.boundary")).toMatchObject({
      assetKind: "group",
      groupKind: "logical",
      allowRoot: true,
    });
    expect(getCatalogEntry("cloud-agnostic.cloud-resource")).toMatchObject({
      assetKind: "resource",
      name: "Cloud Resource",
    });
  });

  it("uses the brand boundary palette for cloud-agnostic group tiles", () => {
    const expectedColors: Record<string, string> = {
      "cloud-agnostic.cloud": "#163964",
      "cloud-agnostic.account": "#E7157B",
      "cloud-agnostic.region": "#00A4A6",
      "cloud-agnostic.zone": "#00A4A6",
      "cloud-agnostic.network": "#8C4FFF",
      "cloud-agnostic.subnet": "#147EBA",
      "cloud-agnostic.security-group": "#879196",
      "cloud-agnostic.cluster": "#879196",
      "cloud-agnostic.datacenter": "#879196",
      "cloud-agnostic.boundary": "#879196",
      "cloud-agnostic.trust-boundary": "#E7157B",
    };

    for (const [type, color] of Object.entries(expectedColors)) {
      const entry = getCatalogEntry(type)!;
      expect(entry.assetKind, type).toBe("group");
      expect(readFileSync(join(ROOT, entry.icon.sourcePath), "utf8"), type).toContain(`fill="${color}"`);
    }
  });

  it("uses official AWS service colors for compute and workflow group tiles", () => {
    const expectedColors: Record<string, string> = {
      "aws.auto-scaling-group": "#ED7100",
      "aws.ec2-instance-contents": "#ED7100",
      "aws.elastic-beanstalk-container": "#ED7100",
      "aws.spot-fleet": "#ED7100",
      "aws.step-functions-workflow": "#E7157B",
    };

    for (const [type, color] of Object.entries(expectedColors)) {
      const entry = getCatalogEntry(type)!;
      expect(entry.assetKind, type).toBe("group");
      expect(readFileSync(join(ROOT, entry.icon.sourcePath), "utf8"), type).toContain(`fill="${color}"`);
    }
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
      expect(
        CATALOG[manifest.entries.find((entry) => entry.icon.sourceId === asset.sourceId)?.type ?? ""] ||
          asset.browsable === false,
      ).toBeTruthy();
    }
  });
});
