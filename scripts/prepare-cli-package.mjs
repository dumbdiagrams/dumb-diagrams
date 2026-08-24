import { build } from "esbuild";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cliPackageRoot = join(root, "packages/cli");
const cliDist = join(cliPackageRoot, "dist");
const editorDist = join(root, "packages/editor/dist");
const standaloneEditor = join(cliDist, "studio");
const sourceSnapshot = join(cliDist, "source");
const packagedExamples = join(cliDist, "templates/examples");
const projectTemplatesSource = join(cliPackageRoot, "templates");
const projectTemplatesTarget = join(cliDist, "templates");
const exampleTemplateSource = join(cliPackageRoot, "templates/examples");
const exampleSource = join(root, "examples/diagrams");
const entry = join(cliDist, "index.js");
const temporaryEntry = join(cliDist, ".index.standalone.js");
const exampleFiles = [
  "aws-high-availability-web-app.dgm",
  "aws-data-transfer-hub.dgm",
  "bedrock-claims-processing.dgm",
  "prompts/aws-high-availability-web-app.md",
  "prompts/aws-data-transfer-hub.md",
  "prompts/bedrock-claims-processing.md",
];

if (!existsSync(entry)) throw new Error("CLI build is missing. Run `pnpm build` before preparing the npm package.");
if (!existsSync(join(editorDist, "index.html"))) {
  throw new Error("Editor build is missing. Run `pnpm build` before preparing the npm package.");
}

await build({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  outfile: temporaryEntry,
  sourcemap: false,
  legalComments: "none",
});

renameSync(temporaryEntry, entry);
cleanupDistArtifacts(cliDist);

rmSync(standaloneEditor, { recursive: true, force: true });
mkdirSync(standaloneEditor, { recursive: true });
cpSync(editorDist, standaloneEditor, { recursive: true });

rmSync(projectTemplatesTarget, { recursive: true, force: true });
cpSync(projectTemplatesSource, projectTemplatesTarget, { recursive: true });

rmSync(packagedExamples, { recursive: true, force: true });
mkdirSync(packagedExamples, { recursive: true });
cpSync(exampleTemplateSource, packagedExamples, { recursive: true });
for (const fileName of exampleFiles) {
  const target = join(packagedExamples, fileName);
  mkdirSync(dirname(target), { recursive: true });
  const source = fileName.startsWith("prompts/")
    ? join(root, "examples", fileName)
    : join(exampleSource, fileName);
  cpSync(source, target);
}

buildSourceSnapshot();

for (const legalFile of ["LICENSE", "ICON-NOTICES.md"]) {
  const source = join(root, legalFile);
  const packaged = join(cliPackageRoot, legalFile);
  if (!existsSync(packaged) || !readFileSync(source).equals(readFileSync(packaged))) {
    throw new Error(
      `packages/cli/${legalFile} must match the repository ${legalFile}. ` +
      "Update the checked-in package copy before packing.",
    );
  }
}

console.log("Prepared dumbdiagrams package assets:");
console.log(`  CLI:    ${entry} (bundled runtime)`);
console.log(`  Studio: ${standaloneEditor}`);
console.log(`  Source: ${sourceSnapshot}`);
console.log(`  Examples: ${packagedExamples}`);
console.log(`  Templates: ${projectTemplatesTarget}`);

function cleanupDistArtifacts(distDir) {
  for (const fileName of readdirSync(distDir)) {
    if (fileName === "index.js") continue;
    rmSync(join(distDir, fileName), { recursive: true, force: true });
  }
}

function buildSourceSnapshot() {
  const files = [
    ".nvmrc",
    "CHANGELOG.md",
    "ICON-NOTICES.md",
    "LICENSE",
    "README.md",
    "package.json",
    "playwright.config.ts",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "tsconfig.base.json",
    "vitest.config.ts",
    "packages/runtime/package.json",
    "packages/runtime/ROUTING.md",
    "packages/runtime/tsconfig.json",
    "packages/editor/index.html",
    "packages/editor/package.json",
    "packages/editor/tsconfig.json",
    "packages/editor/vite.config.ts",
    "packages/editor/public/LICENSE",
    "packages/editor/public/logo_dumbdiagrams.png",
    "packages/cli/ICON-NOTICES.md",
    "packages/cli/LICENSE",
    "packages/cli/README.md",
    "packages/cli/package.json",
    "packages/cli/tsconfig.json",
  ];
  const directories = [
    "assets/catalog",
    "docs",
    "e2e",
    "examples/prompts",
    "examples/diagrams",
    "packages/cli/src",
    "packages/cli/templates",
    "packages/editor/src",
    "packages/runtime/src",
    "scripts",
  ];

  rmSync(sourceSnapshot, { recursive: true, force: true });
  for (const path of [...files, ...directories]) {
    const target = join(sourceSnapshot, path);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(root, path), target, { recursive: true });
  }
  const npmrcSource = existsSync(join(root, ".npmrc"))
    ? join(root, ".npmrc")
    : join(root, "registry.npmrc");
  if (existsSync(npmrcSource)) {
    cpSync(npmrcSource, join(sourceSnapshot, "registry.npmrc"));
  }
  writeFileSync(
    join(sourceSnapshot, "CORRESPONDING_SOURCE.md"),
    `# Corresponding source

This directory contains the source corresponding to the bundled dumbdiagrams
CLI and Studio in this npm package.

The vendored catalog source files are included under \`assets/catalog/sources\`
and remain subject to \`ICON-NOTICES.md\`. Rebuild everything with the pinned
package manager:

\`\`\`bash
pnpm install --frozen-lockfile
pnpm build
\`\`\`

\`preinstall\` copies \`registry.npmrc\` to \`.npmrc\` automatically (npm tarballs
cannot ship dot-prefixed npmrc files).

Requires Node.js 24 or newer.
`,
  );
}
