#!/usr/bin/env node

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../packages/editor/dist-hosted/", import.meta.url)));
const port = Number(process.env.HOSTED_STUDIO_PLAYWRIGHT_PORT ?? 49323);
const types = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".png", "image/png"],
]);

const securityHeaders = {
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "content-security-policy": `default-src 'self'; base-uri 'none'; connect-src http://127.0.0.1:${port}/catalog-icons/; font-src 'self' data:; img-src 'self' data: blob:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; frame-ancestors 'none'; form-action 'none'`,
};

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", `http://127.0.0.1:${port}`).pathname);
    let file = resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(`${root}/`)) throw new Error("Path escapes dist");
    const info = await stat(file).catch(() => null);
    if (info?.isDirectory() || pathname.endsWith("/")) file = join(file, "index.html");
    const body = await readFile(file);
    response.writeHead(200, {
      ...securityHeaders,
      "content-type": types.get(extname(file)) ?? "application/octet-stream",
    });
    response.end(body);
  } catch {
    response.writeHead(404, securityHeaders);
    response.end("Not found");
  }
});

server.listen(port, "127.0.0.1");
