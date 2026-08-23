import { build } from "esbuild";
import {
  cpSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cliDist = join(root, "packages/cli/dist");
const editorDist = join(root, "packages/editor/dist");
const standaloneEditor = join(cliDist, "studio");
const entry = join(cliDist, "index.js");
const temporaryEntry = join(cliDist, ".index.standalone.js");

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

console.log("Prepared dumbdiagrams package assets:");
console.log(`  CLI:    ${entry} (bundled runtime)`);
console.log(`  Studio: ${standaloneEditor}`);
