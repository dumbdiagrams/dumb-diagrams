import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { collectSourceManifestFiles, copySourceManifest } from "../../scripts/lib/source-manifest.mjs";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("source manifest", () => {
  it("keeps workspace documentation and machine files outside the snapshot", () => {
    const files = collectSourceManifestFiles(resolve(import.meta.dirname, "../.."));

    expect(files).toEqual(expect.arrayContaining([
      "examples/prompts/aws-easy-static-website-delivery.md",
      "tests/fixtures/engine/transfer-hub.dgm",
      "packages/runtime/test-fixtures.ts",
      "playwright.config.ts",
      "playwright.shared.ts",
      "playwright.hosted.config.ts",
      "packages/website/playwright.config.ts",
    ]));
    expect(files).not.toContain("packages/runtime/src/core/fixtures.ts");
    expect(files.filter((file) => file === "dist" || file.startsWith("dist/") || file.includes("/dist/") || file.includes("/node_modules/") || file.startsWith("node_modules/"))).toEqual([]);
    expect(files).toContain("scripts/prepare-cli-package.mjs");
    expect(files).toContain("tests/integration/source-manifest.test.ts");
    expect(files).toContain("docs/RELEASE.md");
    expect(files).toContain("CONTRIBUTING.md");
    expect(files).toContain("SECURITY.md");
    expect(files).toContain("biome.json");
    expect(files.filter((file) => file.startsWith("docs/")).sort()).toEqual([
      "docs/ARCHITECTURE.md",
      "docs/RELEASE.md",
      "docs/STYLE_GUIDE.md",
      "docs/TESTING.md",
    ]);
    expect(files.some((file) => file.endsWith(".DS_Store"))).toBe(false);
  });

  it("copies only declared files and remains usable without a git checkout", () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "source-manifest-fixture-"));
    const relocatedRoot = mkdtempSync(join(tmpdir(), "source-manifest-relocated-"));
    temporaryRoots.push(fixtureRoot, relocatedRoot);

    mkdirSync(join(fixtureRoot, "scripts"), { recursive: true });
    mkdirSync(join(fixtureRoot, "docs"), { recursive: true });
    mkdirSync(join(fixtureRoot, ".git"), { recursive: true });
    writeFileSync(join(fixtureRoot, "README.md"), "readme\n");
    writeFileSync(join(fixtureRoot, "docs/RELEASE.md"), "release notes\n");
    writeFileSync(join(fixtureRoot, "scripts/build.mjs"), "export {}\n");
    writeFileSync(join(fixtureRoot, "docs/local-note.md"), "private note\n");
    writeFileSync(join(fixtureRoot, ".git/config"), "repository metadata\n");

    const manifest = {
      files: ["README.md", "docs/RELEASE.md"],
      directories: [{ path: "scripts", extensions: [".mjs"] }],
    };
    copySourceManifest(fixtureRoot, relocatedRoot, manifest);

    expect(collectSourceManifestFiles(relocatedRoot, manifest)).toEqual([
      "README.md",
      "docs/RELEASE.md",
      "scripts/build.mjs",
    ]);
    expect(existsSync(join(relocatedRoot, "docs/RELEASE.md"))).toBe(true);
    expect(existsSync(join(relocatedRoot, "docs/local-note.md"))).toBe(false);
    expect(existsSync(join(relocatedRoot, ".git/config"))).toBe(false);
  });
});
