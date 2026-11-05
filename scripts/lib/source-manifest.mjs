import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, extname, join, normalize, sep } from "node:path";

// Files required to rebuild the workspace and the source trees that contain
// implementation and reviewed inputs. Directory rules are deliberately
// extension-limited so local notes and generated machine files do not become
// part of the corresponding-source snapshot.
export const SOURCE_MANIFEST = Object.freeze({
  files: Object.freeze([
    ".nvmrc",
    "CHANGELOG.md",
    "CONTRIBUTING.md",
    "ICON-NOTICES.md",
    "LICENSE",
    "README.md",
    "SECURITY.md",
    "biome.json",
    "eslint.results.config.mjs",
    "assets/catalog/README.md",
    "assets/catalog/collisions.json",
    "assets/catalog/sources.lock.json",
    "docs/ARCHITECTURE.md",
    "docs/RELEASE.md",
    "docs/STYLE_GUIDE.md",
    "docs/TESTING.md",
    "examples/layout-contracts.json",
    "examples/routing-warnings.json",
    "package.json",
    "playwright.config.ts",
    "playwright.packed.config.ts",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "tsconfig.base.json",
    "vitest.config.ts",
    "packages/runtime/package.json",
    "packages/runtime/ROUTING.md",
    "packages/runtime/tsconfig.json",
    "packages/runtime/test-fixtures.ts",
    "packages/runtime/src/catalog/generated/manifest.json",
    "packages/editor/index.html",
    "packages/editor/package.json",
    "packages/editor/tsconfig.json",
    "packages/editor/vite.config.ts",
    "packages/editor/public/LICENSE",
    "packages/editor/public/favicon.png",
    "packages/editor/public/logo_dumbdiagrams.png",
    "packages/cli/ICON-NOTICES.md",
    "packages/cli/LICENSE",
    "packages/cli/README.md",
    "packages/cli/package.json",
    "packages/cli/tsconfig.json",
    "packages/brand/package.json",
    "packages/brand/fonts.ts",
    "packages/brand/styles.css",
    "packages/brand/README.md",
    "packages/brand/FONT-LICENSES.txt",
    "packages/website/package.json",
    "packages/website/astro.config.mjs",
    "packages/website/tsconfig.json",
    "packages/website/README.md",
  ]),
  directories: Object.freeze([
    { path: "assets/catalog/sources", extensions: [".ai", ".pdf", ".png", ".svg"] },
    { path: "e2e", extensions: [".ts"] },
    { path: "e2e-packed", extensions: [".ts"] },
    {
      path: "examples/curated",
      fileNames: ["architecture-brief.md", "diagram.dgm", "reference-spec.md", "user-prompt.md", "requirements.json"],
    },
    {
      path: "examples/evaluations",
      fileNames: [
        "curated-aws.json",
        "curated-providers.json",
        "detailed.dgm",
        "detailed.md",
        "expected.json",
        "normal.dgm",
        "normal.md",
        "vague.dgm",
        "vague.md",
        "requirements.json",
        "diagram.dgm",
        "normal.requirements.json",
        "detailed.requirements.json",
        "vague.requirements.json",
        "README.md",
      ],
    },
    {
      path: "examples/diagrams",
      fileNames: [
        "async-docs.dgm",
        "transfer-hub.dgm",
        "async-docs.requirements.json",
        "transfer-hub.requirements.json",
      ],
    },
    {
      path: "examples/review-candidates",
      fileNames: [
        "architecture-brief.md",
        "diagram.dgm",
        "reference-spec.md",
        "user-prompt.md",
        "requirements.json",
        "README.md",
      ],
    },
    { path: "examples/reviewed", extensions: [".json", ".dgm", ".md", ".svg"] },
    { path: "examples/model-runs", extensions: [".json", ".dgm", ".md", ".svg"] },
    { path: "packages/cli/src", extensions: [".ts"] },
    { path: "packages/cli/templates", extensions: [".md", ".json"] },
    { path: "packages/editor/src", extensions: [".css", ".ts", ".tsx"] },
    { path: "packages/runtime/src", extensions: [".ts"] },
    {
      path: "packages/website/src",
      extensions: [".astro", ".css", ".dgm", ".json", ".md", ".mdx", ".mjs", ".png", ".svg", ".ts"],
    },
    { path: "packages/website/scripts", extensions: [".mjs"] },
    { path: "scripts", extensions: [".json", ".mjs"] },
    { path: "tests/compat", extensions: [".dgm", ".svg", ".ts"] },
    { path: "tests/fixtures/automatic-quality", extensions: [".dgm", ".json", ".md"] },
    { path: "tests/integration", extensions: [".svg", ".ts"] },
  ]),
});

/** Return sorted, root-relative files selected by a source manifest. */
export function collectSourceManifestFiles(sourceRoot, manifest = SOURCE_MANIFEST) {
  const files = new Set();
  for (const file of manifest.files ?? []) {
    addFile(sourceRoot, file, files);
  }
  for (const rule of manifest.directories ?? []) {
    walkDirectory(sourceRoot, rule, files);
  }
  return [...files].sort();
}

/** Copy exactly the files selected by a source manifest into a destination. */
export function copySourceManifest(sourceRoot, destinationRoot, manifest = SOURCE_MANIFEST) {
  for (const file of collectSourceManifestFiles(sourceRoot, manifest)) {
    const source = join(sourceRoot, file);
    const destination = join(destinationRoot, file);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination);
  }
}

function addFile(sourceRoot, file, files) {
  const normalized = normalizeManifestPath(file);
  const source = join(sourceRoot, normalized);
  if (!existsSync(source) || !lstatSync(source).isFile()) {
    throw new Error(`Source manifest file is missing: ${normalized}`);
  }
  files.add(normalized);
}

function walkDirectory(sourceRoot, rule, files) {
  const normalizedDirectory = normalizeManifestPath(rule.path);
  const extensions = new Set(rule.extensions ?? []);
  const absoluteDirectory = join(sourceRoot, normalizedDirectory);
  if (!existsSync(absoluteDirectory) || !lstatSync(absoluteDirectory).isDirectory()) {
    throw new Error(`Source manifest directory is missing: ${normalizedDirectory}`);
  }
  for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const relativePath = join(normalizedDirectory, entry.name);
    if (entry.isDirectory()) {
      walkDirectory(sourceRoot, { ...rule, path: relativePath }, files);
    } else if (entry.isFile() && ruleMatches(entry, extensions, rule.fileNames)) {
      addFile(sourceRoot, relativePath, files);
    }
  }
}

function ruleMatches(entry, extensions, fileNames = undefined) {
  return extensions.has(extname(entry.name).toLowerCase()) || fileNames?.includes(entry.name);
}

function normalizeManifestPath(file) {
  const normalized = normalize(file).split(sep).join("/");
  if (
    !normalized ||
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    normalized.startsWith("/")
  ) {
    throw new Error(`Source manifest path must be relative: ${file}`);
  }
  return normalized;
}
