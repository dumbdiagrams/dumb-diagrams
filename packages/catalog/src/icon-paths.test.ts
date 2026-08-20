import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import manifest from "./generated/manifest.json" with { type: "json" };
import {
  getGroupCatalogEntries,
  listBrowsableAssets,
  listCategories,
  listProviders,
} from "./catalog.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

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
    const region = getGroupCatalogEntries("azure").find((entry) => entry.type === "azure.region");
    const resourceGroup = getGroupCatalogEntries("azure").find(
      (entry) => entry.type === "azure.resource-group",
    );
    expect(region?.iconPath).toBe(
      "azure-icons/Icons/general/10116-icon-service-Region-Management.svg",
    );
    expect(resourceGroup?.iconPath).toBe(
      "azure-icons/Icons/general/10007-icon-service-Resource-Groups.svg",
    );
    expect(existsSync(join(ROOT, region!.iconPath))).toBe(true);
    expect(existsSync(join(ROOT, resourceGroup!.iconPath))).toBe(true);
  });
});
