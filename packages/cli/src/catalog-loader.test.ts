import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadCatalogSvg, readCatalogSvgFile } from "./catalog-loader.js";

describe("catalog SVG loader", () => {
  it("returns a typed error for an unregistered icon", async () => {
    const browserPath = "catalog-icons/missing.svg";
    const result = await loadCatalogSvg(browserPath);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toMatchObject({
        code: "catalog-icon-load-failed",
        browserPath,
        message: "Catalog icon is not registered: catalog-icons/missing.svg",
      });
    }
  });

  it("returns a typed error when the selected icon file cannot be read", async () => {
    const workRoot = mkdtempSync(join(tmpdir(), "dumbdiagrams-catalog-loader-"));
    const unreadablePath = join(workRoot, "icon.svg");
    const browserPath = "catalog-icons/test/unreadable.svg";
    mkdirSync(unreadablePath);
    try {
      const result = await readCatalogSvgFile(browserPath, unreadablePath);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toMatchObject({ code: "catalog-icon-load-failed", browserPath });
        expect(result.error.cause).toBeDefined();
      }
    } finally {
      rmSync(workRoot, { recursive: true, force: true });
    }
  });

  it("reads a selected icon file as SVG text", async () => {
    const workRoot = mkdtempSync(join(tmpdir(), "dumbdiagrams-catalog-loader-"));
    const iconPath = join(workRoot, "icon.svg");
    writeFileSync(iconPath, "<svg />", "utf8");
    try {
      const result = await readCatalogSvgFile("catalog-icons/test/icon.svg", iconPath);

      expect(result._unsafeUnwrap()).toBe("<svg />");
    } finally {
      rmSync(workRoot, { recursive: true, force: true });
    }
  });
});
