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
import { dirname, join } from "node:path";

import { curatedIds, repoRoot } from "./lib/example-manifest.mjs";
import { copySourceManifest } from "./lib/source-manifest.mjs";

const root = repoRoot();
const cliPackageRoot = join(root, "packages/cli");
const cliDist = join(cliPackageRoot, "dist");
const editorDist = join(root, "packages/editor/dist");
const standaloneEditor = join(cliDist, "studio");
const sourceSnapshot = join(cliDist, "source");
const packagedExamples = join(cliDist, "templates/examples");
const projectTemplatesSource = join(cliPackageRoot, "templates/project");
const projectTemplatesTarget = join(cliDist, "templates/project");
const exampleTemplateSource = join(cliPackageRoot, "templates/examples");
const entry = join(cliDist, "index.js");
const temporaryEntry = join(cliDist, ".index.standalone.js");
const curatedExampleIds = curatedIds();
const curatedExampleFileNames = ["user-prompt.md", "architecture-brief.md", "reference-spec.md", "diagram.dgm"];
const exampleFiles = curatedExampleIds.flatMap((id) => curatedExampleFileNames.map((fileName) => `${id}/${fileName}`));

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
copyFiles(projectTemplatesSource, projectTemplatesTarget, [
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  "diagrams/README.md",
  ".dumbdiagrams/architecture.md",
  ".dumbdiagrams/dgm.md",
  ".dumbdiagrams/instructions.md",
  ".dumbdiagrams/providers/aws.md",
  ".dumbdiagrams/providers/azure.md",
  ".dumbdiagrams/providers/cloud-agnostic.md",
  ".dumbdiagrams/providers/gcp.md",
]);

rmSync(packagedExamples, { recursive: true, force: true });
mkdirSync(packagedExamples, { recursive: true });
copyFiles(exampleTemplateSource, packagedExamples, ["README.md"]);
for (const fileName of exampleFiles) {
  const target = join(packagedExamples, fileName);
  mkdirSync(dirname(target), { recursive: true });
  const source = join(root, "examples", "curated", fileName);
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

console.log("Prepared DumbDiagrams package assets:");
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
  rmSync(sourceSnapshot, { recursive: true, force: true });
  copySourceManifest(root, sourceSnapshot);
  const npmrcSource = existsSync(join(root, ".npmrc"))
    ? join(root, ".npmrc")
    : join(root, "registry.npmrc");
  if (existsSync(npmrcSource)) {
    cpSync(npmrcSource, join(sourceSnapshot, "registry.npmrc"));
  }
  writeFileSync(
    join(sourceSnapshot, "CORRESPONDING_SOURCE.md"),
    `# Corresponding source

This directory contains the source corresponding to the bundled DumbDiagrams
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

function copyFiles(sourceRoot, destinationRoot, files) {
  for (const file of files) {
    const source = join(sourceRoot, file);
    const destination = join(destinationRoot, file);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination);
  }
}
