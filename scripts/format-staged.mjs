import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const biome = require.resolve("@biomejs/biome/bin/biome");
const stagedPaths = git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"])
  .toString("utf8")
  .split("\0")
  .filter(isBiomeFile);

let formattedCount = 0;
for (const path of stagedPaths) {
  const stagedContent = git(["show", `:${path}`]);
  const formattedContent = format(path, stagedContent);
  if (formattedContent.equals(stagedContent)) continue;

  const indexEntry = git(["ls-files", "--stage", "-z", "--", path]).toString("utf8").split("\0")[0];
  const tab = indexEntry.indexOf("\t");
  const [mode, , stage] = indexEntry.slice(0, tab).split(" ");
  if (!mode || stage !== "0") throw new Error(`Cannot update the staged entry for ${path}`);

  const objectId = git(["hash-object", "-w", "--stdin"], formattedContent).toString("utf8").trim();
  git(["update-index", "--cacheinfo", `${mode},${objectId},${path}`]);

  if (existsSync(join(root, path)) && readFileSync(join(root, path)).equals(stagedContent)) {
    writeFileSync(join(root, path), formattedContent);
  }
  formattedCount++;
}

if (formattedCount) {
  console.log(`Formatted ${formattedCount} staged file${formattedCount === 1 ? "" : "s"} with Biome.`);
}

function isBiomeFile(path) {
  return (
    path === "package.json" ||
    /^packages\/[^/]+\/package\.json$/.test(path) ||
    /^packages\/[^/]+\/src\/.*\.(ts|tsx)$/.test(path) ||
    /^scripts\/.*\.(js|mjs)$/.test(path)
  );
}

function format(path, content) {
  const result = spawnSync(process.execPath, [biome, "format", `--stdin-file-path=${path}`], {
    cwd: root,
    input: content,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Biome could not format ${path}: ${result.stderr.toString("utf8")}`);
  }
  return result.stdout;
}

function git(args, input) {
  return execFileSync("git", args, { cwd: root, input, maxBuffer: 32 * 1024 * 1024 });
}
