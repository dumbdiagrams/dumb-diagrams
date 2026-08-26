import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cliRoot = join(root, "packages/cli");
const manifest = JSON.parse(readFileSync(join(cliRoot, "package.json"), "utf8"));
const artifactsRoot = join(root, ".artifacts/packed-studio-e2e");
const packagesRoot = join(root, ".artifacts/packages");
const projectRoot = join(artifactsRoot, "project");
const diagramsRoot = join(projectRoot, "diagrams");
const tarball = join(packagesRoot, `create-dumb-diagrams-${manifest.version}.tgz`);
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

rmSync(artifactsRoot, { recursive: true, force: true });
mkdirSync(packagesRoot, { recursive: true });
execFileSync(pnpm, ["--dir", cliRoot, "pack", "--pack-destination", packagesRoot], {
  cwd: root,
  stdio: "inherit",
});
execFileSync(
  npx,
  ["--yes", `--package=${tarball}`, "create-dumb-diagrams", projectRoot, "--yes", "--name", "Packed Studio E2E"],
  { cwd: root, stdio: "inherit", env: { ...process.env, npm_config_yes: "true" } },
);
copyFileSync(join(root, "examples/diagrams/async-docs.dgm"), join(diagramsRoot, "async-docs.dgm"));

const child = spawn(
  npx,
  [
    "--yes",
    `--package=${tarball}`,
    "create-dumb-diagrams",
    "studio",
    diagramsRoot,
    "--no-open",
    "--host",
    "127.0.0.1",
    "--port",
    "5175",
  ],
  { cwd: root, stdio: "inherit", env: { ...process.env, npm_config_yes: "true" } },
);

const stop = (signal) => {
  if (!child.killed) child.kill(signal);
};
process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));
child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
