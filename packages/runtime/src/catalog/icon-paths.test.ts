import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import manifest from "./generated/manifest.json" with { type: "json" };
import {
  listAssets,
  listBrowsableAssets,
  listCategories,
  listProviders,
} from "./catalog.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

function walkSvgFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((item) => {
    const file = join(root, item.name);
    if (item.isDirectory()) return walkSvgFiles(file);
    return item.name.toLowerCase().endsWith(".svg") ? [file] : [];
  });
}

const SOURCE_ICON_LIBRARIES = [
  {
    provider: "aws" as const,
    root: "assets/catalog/sources/aws",
    include: (file: string) =>
      (file.includes("Architecture-Service-Icons_07312026") && file.endsWith("_64.svg")) ||
      (file.includes("Resource-Icons_07312026") && file.endsWith("_48.svg")),
    kinds: ["resource"],
    excluded: [],
  },
  {
    provider: "azure" as const,
    root: "assets/catalog/sources/azure/Icons",
    include: () => true,
    kinds: ["resource"],
    excluded: [],
  },
  {
    provider: "gcp" as const,
    root: "assets/catalog/sources/gcp/Unique Icons",
    include: () => true,
    kinds: ["resource"],
    excluded: [],
  },
  {
    provider: "cloud-agnostic" as const,
    root: "assets/catalog/sources/cloud-agnostic",
    include: () => true,
    kinds: ["resource", "group"],
    // Legacy generic glyphs remain resolvable but are intentionally absent
    // from the agent/Studio-facing catalog. `cloud-agnostic.boundary` is the
    // only general-purpose logical container exposed for new diagrams.
    excluded: [
      "assets/catalog/sources/cloud-agnostic/custom.svg",
      "assets/catalog/sources/cloud-agnostic/logical.svg",
    ],
  },
] as const;

describe("catalog icon previews", () => {
  it("resolves every manifest icon path to an existing file", () => {
    const missing = manifest.entries
      .filter((entry) => !existsSync(join(ROOT, entry.iconPath)))
      .map((entry) => `${entry.type} -> ${entry.iconPath}`);
    expect(missing).toEqual([]);
  });

  it("resolves every browser icon path to a staged public asset", () => {
    const problems: string[] = [];
    for (const asset of manifest.assetFiles) {
      const staged = join(ROOT, "packages/editor/public", asset.browserPath);
      if (!existsSync(staged)) {
        problems.push(`${asset.sourceId} -> missing ${asset.browserPath}`);
        continue;
      }
      const contents = readFileSync(staged);
      if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(contents.toString("utf8"))) {
        problems.push(`${asset.sourceId} -> malformed staged SVG`);
      }
      const hash = createHash("sha256").update(contents).digest("hex");
      if (hash !== asset.sha256) problems.push(`${asset.sourceId} -> staged hash drift`);
    }
    expect(problems).toEqual([]);
  });

  it("maps every browsable cloud entry to its exact staged icon", () => {
    const assetsBySourceId = new Map(manifest.assetFiles.map((asset) => [asset.sourceId, asset]));
    const browserPaths = new Set<string>();
    const problems: string[] = [];
    for (const provider of listProviders()) {
      for (const mode of ["resources", "groups"] as const) {
        for (const entry of listBrowsableAssets(provider, mode)) {
          const asset = assetsBySourceId.get(entry.icon.sourceId);
          if (!asset) {
            problems.push(`${provider}/${mode}: ${entry.type} -> missing asset record`);
            continue;
          }
          if (!entry.browserPath || entry.browserPath !== asset.browserPath) {
            problems.push(`${provider}/${mode}: ${entry.type} -> browser path mismatch`);
          }
          if (browserPaths.has(entry.browserPath)) {
            problems.push(`${provider}/${mode}: ${entry.type} -> duplicate browser path`);
          }
          browserPaths.add(entry.browserPath);
          if (!existsSync(join(ROOT, "packages/editor/public", entry.browserPath))) {
            problems.push(`${provider}/${mode}: ${entry.type} -> missing staged icon`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("does not expose Azure export prefixes in service labels", () => {
    const azureResources = listBrowsableAssets("azure", "resources");
    const malformed = azureResources.filter(
      (entry) => /^\d+\s|icon service/i.test(entry.name),
    );
    expect(malformed.map((entry) => entry.name)).toEqual([]);
    expect(
      azureResources
        .filter((entry) => entry.name === "Service Group Relationships")
        .length,
    ).toBeGreaterThan(0);
  });

  it.each(SOURCE_ICON_LIBRARIES)(
    "keeps the $provider catalog inventory in sync with its source library",
    ({ provider, root, include, kinds, excluded }) => {
      const excludedPaths = new Set<string>(excluded);
      const catalogKinds = new Set<string>(kinds);
      const sourcePaths = walkSvgFiles(join(ROOT, root))
        .filter(include)
        .map((file) => relative(ROOT, file).replaceAll("\\", "/"))
        .filter((file) => !excludedPaths.has(file))
        .sort();
      const catalogPaths = manifest.entries
        .filter(
          (entry) =>
            entry.provider === provider &&
            catalogKinds.has(entry.assetKind) &&
            entry.canonical !== false &&
            entry.browsable !== false,
        )
        .map((entry) => entry.iconPath)
        .sort();

      expect(catalogPaths).toEqual(sourcePaths);
    },
  );

  it("does not leave a canonical browsable entry without a real staged icon", () => {
    const assetsBySourceId = new Map(manifest.assetFiles.map((asset) => [asset.sourceId, asset]));
    const problems: string[] = [];
    for (const entry of manifest.entries) {
      if (entry.canonical === false || entry.browsable === false) continue;
      const asset = assetsBySourceId.get(entry.icon.sourceId);
      if (!asset) {
        problems.push(`${entry.type} -> missing asset record`);
        continue;
      }
      const staged = join(ROOT, "packages/editor/public", asset.browserPath);
      if (!existsSync(staged)) {
        problems.push(`${entry.type} -> missing ${asset.browserPath}`);
        continue;
      }
      if (statSync(staged).size === 0) problems.push(`${entry.type} -> empty ${asset.browserPath}`);
    }
    expect(problems).toEqual([]);
  });

  it("does not expose empty resource categories", () => {
    for (const provider of listProviders()) {
      for (const category of listCategories(provider, "resources")) {
        const count = listBrowsableAssets(provider, "resources").filter(
          (entry) => entry.category === category,
        ).length;
        expect(count, `${provider}/${category}`).toBeGreaterThan(0);
      }
    }
  });

  it("includes fixed azure group icons", () => {
    const groups = listAssets("azure", { assetKind: "group" });
    const region = groups.find((entry) => entry.type === "azure.region");
    const resourceGroup = groups.find(
      (entry) => entry.type === "azure.resource-group",
    );
    expect(region?.iconPath).toBe(
      "assets/catalog/sources/azure/Icons/general/10116-icon-service-Region-Management.svg",
    );
    expect(resourceGroup?.iconPath).toBe(
      "assets/catalog/sources/azure/Icons/general/10007-icon-service-Resource-Groups.svg",
    );
    expect(existsSync(join(ROOT, region!.iconPath))).toBe(true);
    expect(existsSync(join(ROOT, resourceGroup!.iconPath))).toBe(true);
  });
});
