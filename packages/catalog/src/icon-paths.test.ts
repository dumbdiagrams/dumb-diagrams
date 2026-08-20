import { existsSync } from "node:fs";
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

  it("resolves icons for every browsable service and group", () => {
    const missing: string[] = [];
    for (const provider of listProviders()) {
      for (const mode of ["resources", "groups"] as const) {
        for (const entry of listBrowsableAssets(provider, mode)) {
          if (!existsSync(join(ROOT, entry.iconPath))) {
            missing.push(`${provider}/${mode}: ${entry.type} -> ${entry.iconPath}`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
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
