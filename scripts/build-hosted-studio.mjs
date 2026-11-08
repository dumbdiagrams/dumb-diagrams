#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = resolve(root, "packages/editor/dist-hosted");
const editor = resolve(root, "packages/editor");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await run(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["catalog:stage"], root);
await run(
  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  ["exec", "vite", "build", "--mode", "hosted", "--outDir", "dist-hosted"],
  editor,
);

// Cloudflare Pages reads this file from the published static output. Keep the
// policy host-only while allowing portable SVG export to fetch bundled catalog
// icons. Host-specific rules avoid allowing connections to another Pages
// tenant while still covering production, branch, and preview hostnames.
const commonHeaders = `/*\n  X-Frame-Options: DENY\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()\n`;
const policy = (connectSource) =>
  `Content-Security-Policy: default-src 'self'; base-uri 'none'; connect-src ${connectSource}; font-src 'self' data:; img-src 'self' data: blob:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; frame-ancestors 'none'; form-action 'none'`;
const headers = `${commonHeaders}
https://studio.dumbdiagrams.com/*
  ${policy("https://studio.dumbdiagrams.com/catalog-icons/")}

https://:project.pages.dev/*
  ${policy("https://:project.pages.dev/catalog-icons/")}

https://:version.:project.pages.dev/*
  ${policy("https://:version.:project.pages.dev/catalog-icons/")}
`;
await writeFile(join(output, "_headers"), headers, "utf8");

function run(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", env: process.env });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${signal ?? code}`));
    });
  });
}
