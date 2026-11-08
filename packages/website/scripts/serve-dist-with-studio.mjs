#!/usr/bin/env node

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const website = spawn(process.execPath, [resolve(root, "packages/website/scripts/serve-dist.mjs")], {
  stdio: "inherit",
});
const studio = spawn(process.execPath, [resolve(root, "scripts/serve-hosted-studio.mjs")], {
  stdio: "inherit",
});

const children = [website, studio];
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
