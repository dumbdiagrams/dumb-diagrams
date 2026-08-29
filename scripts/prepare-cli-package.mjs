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
const createEntry = join(cliDist, "create.js");
const temporaryEntry = join(cliDist, ".index.standalone.js");
const exampleFiles = [
  "aws-high-availability-web-app.dgm",
  "aws-data-transfer-hub.dgm",
  "bedrock-claims-processing.dgm",
  "image-thumbnail-pipeline.dgm",
  "asynchronous-report-generation.dgm",
  "event-driven-order-fulfillment.dgm",
  "azure-private-app-service.dgm",
  "prompts/aws-high-availability-web-app.md",
  "prompts/aws-data-transfer-hub.md",
  "prompts/bedrock-claims-processing.md",
  "prompts/image-thumbnail-pipeline.md",
  "prompts/asynchronous-report-generation.md",
  "prompts/event-driven-order-fulfillment.md",
  "prompts/azure-private-app-service.md",
  "simple-serverless-web-application/user-prompt.md",
  "simple-serverless-web-application/architecture-brief.md",
  "simple-serverless-web-application/reference-spec.md",
  "simple-serverless-web-application/diagram.dgm",
];

if (!existsSync(entry)) throw new Error("CLI build is missing. Run `pnpm build` before preparing the npm package.");
if (!existsSync(createEntry)) throw new Error("Create CLI build is missing. Run `pnpm build` before preparing the npm package.");
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

// Windows does not replace an existing destination with renameSync. The
// generated bundle is already complete, so remove only the old build output
// immediately before swapping the new one into place.
rmSync(entry, { force: true });
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
    : fileName.startsWith("simple-serverless-web-application/")
      ? join(root, "examples", "pilots", fileName)
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

console.log("Prepared create-dumb-diagrams package assets:");
console.log(`  CLI:    ${entry} (bundled runtime)`);
console.log(`  Studio: ${standaloneEditor}`);
console.log(`  Source: ${sourceSnapshot}`);
console.log(`  Examples: ${packagedExamples}`);
console.log(`  Templates: ${projectTemplatesTarget}`);

function cleanupDistArtifacts(distDir) {
  for (const fileName of readdirSync(distDir)) {
    if (fileName === "index.js" || fileName === "create.js") continue;
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
    "examples/curated-baseline.json",
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
    "packages/website/package.json",
    "packages/website/astro.config.mjs",
    "packages/website/tsconfig.json",
    "packages/website/README.md",
    "packages/brand/package.json",
    "packages/brand/styles.css",
    "packages/brand/README.md",
    "packages/brand/FONT-LICENSES.txt",
  ];
  const directories = [
    "assets/catalog",
    "docs",
    "e2e",
    "e2e-packed",
    "examples/prompts",
    "examples/diagrams",
    "examples/pilots",
    "examples/evaluations",
    "packages/cli/src",
    "packages/cli/templates",
    "packages/editor/src",
    "packages/runtime/src",
    "packages/website/src",
    "packages/website/scripts",
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

This directory contains the source corresponding to the bundled create-dumb-diagrams
CLI and Studio in this npm package.

The vendored catalog source files are included under \`assets/catalog/sources\`
and remain subject to \`ICON-NOTICES.md\`. Rebuild everything with the pinned
package manager:

\`\`\`bash
cp registry.npmrc .npmrc
pnpm install --frozen-lockfile
pnpm build
\`\`\`

The explicit copy must happen before dependency resolution. The \`preinstall\`
hook cannot do this for a clean install because package managers resolve and
download dependencies before running it. npm tarballs cannot ship the
dot-prefixed file directly.

Requires Node.js 24 or newer.
`,
  );
}
