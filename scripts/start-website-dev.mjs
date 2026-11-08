#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
execFileSync(pnpm, ["catalog:stage"], { cwd: root, stdio: "inherit" });
const studio = spawn(
  pnpm,
  [
    "--dir",
    "packages/editor",
    "exec",
    "vite",
    "--host",
    "127.0.0.1",
    "--port",
    "49323",
    "--strictPort",
    "--mode",
    "hosted",
  ],
  { cwd: root, stdio: "inherit" },
);
const website = spawn(pnpm, ["exec", "astro", "dev", "--host", "127.0.0.1"], {
  cwd: resolve(root, "packages/website"),
  stdio: "inherit",
});

const children = [studio, website];
let stopping = false;
const stop = (code = 0, signal = "SIGTERM") => {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (!child.pid) continue;
    child.kill(signal);
  }
};
process.once("SIGINT", () => stop(0, "SIGINT"));
process.once("SIGTERM", () => stop());
for (const child of children) {
  child.once("error", (error) => {
    console.error(error);
    stop(1);
  });
  child.once("exit", (code, signal) => {
    if (!stopping) stop(code ?? (signal ? 1 : 0));
  });
}
