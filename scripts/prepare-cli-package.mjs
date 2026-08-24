import { build } from "esbuild";
import {
  cpSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cliDist = join(root, "packages/cli/dist");
const editorDist = join(root, "packages/editor/dist");
const standaloneEditor = join(cliDist, "studio");
const packagedExamples = join(cliDist, "templates/examples");
const exampleTemplateSource = join(root, "packages/cli/templates/examples");
const exampleSource = join(root, "examples/src");
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
  target: "node18",
  outfile: temporaryEntry,
  sourcemap: false,
  legalComments: "none",
});

renameSync(temporaryEntry, entry);
rmSync(standaloneEditor, { recursive: true, force: true });
mkdirSync(standaloneEditor, { recursive: true });
cpSync(editorDist, standaloneEditor, { recursive: true });
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

console.log("Prepared dumbdiagrams package assets:");
console.log(`  CLI:    ${entry} (bundled runtime)`);
console.log(`  Studio: ${standaloneEditor}`);
console.log(`  Examples: ${packagedExamples}`);
