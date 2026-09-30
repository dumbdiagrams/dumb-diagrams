import { existsSync, readFileSync, realpathSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";

const STUDIO_HOST = "127.0.0.1";

export interface StudioServerOptions {
  editorRoot?: string;
  port?: number;
}

export interface StudioServerHandle {
  server: Server;
  url: string;
}

/**
 * Start the local Studio bridge. The bridge only serves the static editor
 * bundle; files are opened and saved directly by the browser.
 */
export async function startStudioServer(
  options: StudioServerOptions = {},
): Promise<StudioServerHandle> {
  const configuredEditorRoot = resolveStudioEditorRoot(options.editorRoot);
  if (!existsSync(join(configuredEditorRoot, "index.html"))) {
    throw new Error(
      `Studio assets are missing at ${configuredEditorRoot}. Build the editor first with ` +
      "pnpm --filter @dumb-diagrams/editor build.",
    );
  }
  // Resolve the bundle root once so a symlinked editor directory is supported
  // while every request is checked against the directory actually served.
  const editorRoot = realpathSync(configuredEditorRoot);

  const server = createServer((request, response) => {
    applySecurityHeaders(response);
    serveEditorAsset(editorRoot, request, response);
  });
  const address = await listen(server, options.port ?? 4788);
  const resolvedPort = typeof address === "object" && address ? address.port : options.port ?? 4788;
  return {
    server,
    url: `http://${STUDIO_HOST}:${resolvedPort}/`,
  };
}

export function resolveStudioEditorRoot(explicitRoot?: string): string {
  const moduleRoot = resolve(fileURLToPath(new URL(".", import.meta.url)));
  const candidates = [
    explicitRoot,
    resolve(moduleRoot, "studio"),
    resolve(moduleRoot, "../../editor/dist"),
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => existsSync(join(candidate, "index.html"))) ?? candidates[0]!;
}

function serveEditorAsset(editorRoot: string, request: IncomingMessage, response: ServerResponse): void {
  const requestUrl = new URL(request.url ?? "/", `http://${STUDIO_HOST}`);
  if (requestUrl.pathname.startsWith("/api/")) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" });
    response.end("Method Not Allowed");
    return;
  }

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(requestUrl.pathname);
  } catch {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Bad Request");
    return;
  }
  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  const candidate = resolve(editorRoot, relativePath);
  if (!isPathInsideRoot(editorRoot, candidate)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  // Vite history fallback keeps client-side routes useful without exposing
  // any filesystem outside the bundled editor root.
  let target: string;
  try {
    target = realpathSync(existsSync(candidate) ? candidate : join(editorRoot, "index.html"));
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  if (!isPathInsideRoot(editorRoot, target)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }
  try {
    const body = readFileSync(target);
    response.writeHead(200, {
      "Cache-Control": target.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable",
      "Content-Type": contentTypeFor(target),
      "Content-Length": body.byteLength,
    });
    if (request.method === "HEAD") response.end();
    else response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

function isPathInsideRoot(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function contentTypeFor(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".html": return "text/html; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".svg": return "image/svg+xml";
    case ".png": return "image/png";
    case ".json": return "application/json; charset=utf-8";
    case ".woff": return "font/woff";
    case ".woff2": return "font/woff2";
    default: return "application/octet-stream";
  }
}

function applySecurityHeaders(response: ServerResponse): void {
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self' data:; " +
      "frame-ancestors 'none'; img-src 'self' data: blob:; object-src 'none'; " +
      "script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:",
  );
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
}

function listen(server: Server, port: number): Promise<ReturnType<Server["address"]>> {
  return new Promise((resolvePromise, rejectPromise) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      rejectPromise(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolvePromise(server.address());
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, STUDIO_HOST);
  });
}
