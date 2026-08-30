import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cliRoot = join(root, "packages/cli");
const manifest = JSON.parse(readFileSync(join(cliRoot, "package.json"), "utf8"));
const packagesRoot = join(root, ".artifacts/packages");
const tarball = join(packagesRoot, `create-dumb-diagrams-${manifest.version}.tgz`);
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

mkdirSync(packagesRoot, { recursive: true });
execFileSync(pnpm, ["--dir", cliRoot, "pack", "--pack-destination", packagesRoot], {
  cwd: root,
  stdio: "inherit",
});
const child = spawn(
  npx,
  [
    "--yes",
    `--package=${tarball}`,
    "dumbdiagrams",
    "studio",
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      DUMBDIAGRAMS_STUDIO_NO_OPEN: "1",
      DUMBDIAGRAMS_STUDIO_PORT: "5175",
      npm_config_yes: "true",
    },
  },
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
