import { createHash } from "node:crypto";
import {
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  watch,
  writeFileSync,
  mkdirSync,
  type FSWatcher,
} from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";

import { createEmptyDocument, hasErrors, validateDocument } from "@dumb-diagrams/runtime/core";
import { getCatalogMap } from "@dumb-diagrams/runtime/catalog";
import { parseDgm, printDgm } from "@dumb-diagrams/runtime/dsl";
import { compileDiagram } from "@dumb-diagrams/runtime/render";

const MAX_REQUEST_BYTES = 1_250_000;
const STUDIO_EXTENSION = ".dgm";
const SSE_HEARTBEAT_INTERVAL_MS = 15_000;
const STUDIO_HOST = "127.0.0.1";

export interface StudioServerOptions {
  filePath: string;
  editorRoot?: string;
  port?: number;
}

export interface StudioServerHandle {
  server: Server;
  url: string;
  filePath: string;
}

interface StudioDocumentPayload {
  source: string;
  revision: string;
  fileName: string;
  filePath: string;
}

interface StudioFileListPayload {
  directory: string;
  activeFileName: string;
  files: string[];
}

interface StudioErrorPayload {
  error: string;
  message: string;
  issues?: Array<{ level: string; message: string }>;
}

/**
 * Start the local Studio bridge. The browser talks to this process over the
 * same origin, so a local file has the same edit surface as browser Studio
 * while remaining a normal, agent-editable source file on disk.
 */
export async function startStudioServer(
  options: StudioServerOptions,
): Promise<StudioServerHandle> {
  const port = options.port ?? 4788;
  let documentPath = resolve(options.filePath);
  ensureDocument(documentPath);
  const projectDirectory = dirname(documentPath);

  const editorRoot = resolveStudioEditorRoot(options.editorRoot);
  if (!existsSync(join(editorRoot, "index.html"))) {
    throw new Error(
      `Studio assets are missing at ${editorRoot}. Build the editor first with ` +
      "pnpm --filter @dumb-diagrams/editor build.",
    );
  }

  let currentSource = readFileSync(documentPath, "utf8");
  let currentRevision = revisionFor(currentSource);
  let documentPresent = true;
  let watcher: FSWatcher | null = null;
  let watchTimer: NodeJS.Timeout | null = null;
  let watcherRestartTimer: NodeJS.Timeout | null = null;
  let shuttingDown = false;
  const clients = new Set<ServerResponse>();
  const heartbeat = setInterval(() => {
    for (const client of clients) {
      try {
        client.write(": heartbeat\n\n");
      } catch {
        clients.delete(client);
      }
    }
  }, SSE_HEARTBEAT_INTERVAL_MS);
  heartbeat.unref();

  const closeWatcher = () => {
    watcher?.close();
    watcher = null;
  };

  const readPayload = (): StudioDocumentPayload => ({
    source: currentSource,
    revision: currentRevision,
    fileName: basename(documentPath),
    filePath: documentPath,
  });

  const sendEvent = (event: string, payload: unknown) => {
    const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of clients) {
      try {
        client.write(message);
      } catch {
        clients.delete(client);
      }
    }
  };

  const syncFromDisk = (announce: boolean): boolean => {
    try {
      const nextSource = readFileSync(documentPath, "utf8");
      const nextRevision = revisionFor(nextSource);
      const recovered = !documentPresent;
      documentPresent = true;
      if (nextRevision === currentRevision && !recovered) return true;
      currentSource = nextSource;
      currentRevision = nextRevision;
      if (announce) sendEvent("document", readPayload());
      return true;
    } catch {
      const wasPresent = documentPresent;
      documentPresent = false;
      if (announce && wasPresent) {
        sendEvent("document-missing", {
          fileName: basename(documentPath),
          filePath: documentPath,
        });
      }
      return false;
    }
  };

  const startWatcher = () => {
    if (watcherRestartTimer) {
      clearTimeout(watcherRestartTimer);
      watcherRestartTimer = null;
    }
    closeWatcher();
    watcher = watch(projectDirectory, { persistent: false }, (_eventType, filename) => {
      if (filename && String(filename) !== basename(documentPath)) return;
      if (watchTimer) clearTimeout(watchTimer);
      watchTimer = setTimeout(() => {
        watchTimer = null;
        syncFromDisk(true);
      }, 80);
    });
    watcher.once("error", () => {
      // API reads and SSE reconnects always refresh from disk, so the browser
      // can recover even if the operating-system watcher itself is interrupted.
      closeWatcher();
      if (shuttingDown) return;
      watcherRestartTimer = setTimeout(() => {
        watcherRestartTimer = null;
        startWatcher();
        syncFromDisk(true);
      }, 250);
      watcherRestartTimer.unref();
    });
  };

  startWatcher();

  const server = createServer(async (request, response) => {
    applySecurityHeaders(response);
    try {
      await routeRequest(request, response);
    } catch (error) {
      sendJson(response, 500, {
        error: "server_error",
        message: error instanceof Error ? error.message : "Studio request failed.",
      } satisfies StudioErrorPayload);
    }
  });

  let address: ReturnType<Server["address"]>;
  try {
    address = await listen(server, port);
  } catch (error) {
    shuttingDown = true;
    clearInterval(heartbeat);
    if (watcherRestartTimer) clearTimeout(watcherRestartTimer);
    closeWatcher();
    throw error;
  }
  const resolvedPort = typeof address === "object" && address ? address.port : port;
  const browserUrl = new URL(`http://${STUDIO_HOST}:${resolvedPort}/`);
  const url = browserUrl.toString();

  server.on("close", () => {
    shuttingDown = true;
    if (watchTimer) clearTimeout(watchTimer);
    if (watcherRestartTimer) clearTimeout(watcherRestartTimer);
    clearInterval(heartbeat);
    closeWatcher();
    for (const client of clients) client.end();
    clients.clear();
  });

  return {
    server,
    url,
    get filePath() {
      return documentPath;
    },
  };

  async function routeRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const requestUrl = new URL(request.url ?? "/", `http://${STUDIO_HOST}`);
    const pathname = requestUrl.pathname;

    if (pathname.startsWith("/api/")) {
      const requestOrigin = `http://${request.headers.host ?? `${STUDIO_HOST}:${resolvedPort}`}`;
      const requestHost = new URL(requestOrigin).hostname;
      if (
        !isLoopbackHost(requestHost) ||
        (request.headers.origin !== undefined && request.headers.origin !== requestOrigin) ||
        request.headers["sec-fetch-site"] === "cross-site"
      ) {
        sendJson(response, 403, {
          error: "forbidden_origin",
          message: "Studio API requests must come from this Studio origin.",
        } satisfies StudioErrorPayload);
        return;
      }
    }

    if (pathname === "/api/session" && request.method === "GET") {
      if (!syncFromDisk(false)) {
        sendMissingDocument(response);
        return;
      }
      sendJson(response, 200, {
        mode: "file",
        projectRoot: dirname(documentPath),
        document: basename(documentPath),
        ...readPayload(),
      });
      return;
    }

    if (pathname === "/api/document" && request.method === "GET") {
      if (!syncFromDisk(false)) {
        sendMissingDocument(response);
        return;
      }
      sendJson(response, 200, readPayload());
      return;
    }

    if (pathname === "/api/files" && request.method === "GET") {
      const payload: StudioFileListPayload = {
        directory: projectDirectory,
        activeFileName: basename(documentPath),
        files: listProjectFiles(projectDirectory),
      };
      sendJson(response, 200, payload);
      return;
    }

    if (pathname === "/api/select" && request.method === "POST") {
      let body: Record<string, unknown>;
      try {
        body = await readJson(request);
      } catch (error) {
        sendJson(response, 400, {
          error: "invalid_request",
          message: error instanceof Error ? error.message : "Request body is not valid JSON.",
        } satisfies StudioErrorPayload);
        return;
      }
      if (typeof body.filename !== "string") {
        sendJson(response, 400, {
          error: "invalid_filename",
          message: "Expected a .dgm filename.",
        } satisfies StudioErrorPayload);
        return;
      }
      const normalizedFilename = normalizeFilename(body.filename);
      if (!normalizedFilename) {
        sendJson(response, 400, {
          error: "invalid_filename",
          message: `Filename must be a simple ${STUDIO_EXTENSION} file name.`,
        } satisfies StudioErrorPayload);
        return;
      }
      if (!listProjectFiles(projectDirectory).includes(normalizedFilename)) {
        sendJson(response, 404, {
          error: "file_not_found",
          message: `${normalizedFilename} is not a project diagram in ${projectDirectory}.`,
        } satisfies StudioErrorPayload);
        return;
      }

      const nextPath = join(projectDirectory, normalizedFilename);
      const nextSource = readFileSync(nextPath, "utf8");
      const validation = validateSource(nextSource);
      if (!validation.ok) {
        sendJson(response, 422, {
          error: "invalid_source",
          message: "The selected diagram has source errors.",
          issues: validation.issues,
        } satisfies StudioErrorPayload);
        return;
      }

      documentPath = nextPath;
      currentSource = nextSource;
      currentRevision = revisionFor(nextSource);
      documentPresent = true;
      startWatcher();
      sendJson(response, 200, readPayload());
      return;
    }

    if (pathname === "/api/document" && request.method === "PUT") {
      let body: Record<string, unknown>;
      try {
        body = await readJson(request);
      } catch (error) {
        sendJson(response, 400, {
          error: "invalid_request",
          message: error instanceof Error ? error.message : "Request body is not valid JSON.",
        } satisfies StudioErrorPayload);
        return;
      }
      const source = body.source;
      const baseRevision = body.baseRevision;
      const requestedFilename = body.filename;
      if (typeof source !== "string" || typeof baseRevision !== "string") {
        sendJson(response, 400, {
          error: "invalid_request",
          message: "Expected source and baseRevision.",
        } satisfies StudioErrorPayload);
        return;
      }
      if (Buffer.byteLength(source, "utf8") > MAX_REQUEST_BYTES) {
        sendJson(response, 413, {
          error: "source_too_large",
          message: "The diagram source is larger than the Studio limit.",
        } satisfies StudioErrorPayload);
        return;
      }
      if (!syncFromDisk(false)) {
        sendMissingDocument(response);
        return;
      }
      if (baseRevision !== currentRevision) {
        sendJson(response, 409, {
          error: "conflict",
          message: "The diagram changed on disk before this save.",
          ...readPayload(),
        });
        return;
      }

      const validation = validateSource(source);
      if (!validation.ok) {
        sendJson(response, 422, {
          error: "invalid_source",
          message: "Fix the source errors before saving.",
          issues: validation.issues,
        } satisfies StudioErrorPayload);
        return;
      }

      let nextPath = documentPath;
      if (requestedFilename !== undefined) {
        if (typeof requestedFilename !== "string") {
          sendJson(response, 400, {
            error: "invalid_filename",
            message: "Filename must be a string.",
          } satisfies StudioErrorPayload);
          return;
        }
        const normalizedFilename = normalizeFilename(requestedFilename);
        if (!normalizedFilename) {
          sendJson(response, 400, {
            error: "invalid_filename",
            message: `Filename must be a simple ${STUDIO_EXTENSION} file name.`,
          } satisfies StudioErrorPayload);
          return;
        }
        nextPath = join(dirname(documentPath), normalizedFilename);
        if (nextPath !== documentPath && existsSync(nextPath)) {
          sendJson(response, 409, {
            error: "file_exists",
            message: `${normalizedFilename} already exists. Choose another name.`,
          } satisfies StudioErrorPayload);
          return;
        }
      }

      atomicWrite(nextPath, source);
      documentPath = nextPath;
      currentSource = source;
      currentRevision = revisionFor(source);
      documentPresent = true;
      startWatcher();
      const payload = readPayload();
      sendEvent("document", payload);
      sendJson(response, 200, payload);
      return;
    }

    if (pathname === "/api/events" && request.method === "GET") {
      const hasDocument = syncFromDisk(false);
      response.writeHead(200, {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
      });
      if (hasDocument) {
        response.write(`event: ready\ndata: ${JSON.stringify(readPayload())}\n\n`);
      } else {
        response.write(`event: document-missing\ndata: ${JSON.stringify({
          fileName: basename(documentPath),
          filePath: documentPath,
        })}\n\n`);
      }
      clients.add(response);
      request.on("close", () => clients.delete(response));
      return;
    }

    if (pathname.startsWith("/api/")) {
      sendJson(response, 404, { error: "not_found", message: "Studio API route not found." });
      return;
    }

    serveEditorAsset(editorRoot, pathname, response);
  }

  function sendMissingDocument(response: ServerResponse): void {
    sendJson(response, 404, {
      error: "document_missing",
      message: `${basename(documentPath)} is no longer available on disk.`,
    } satisfies StudioErrorPayload);
  }
}

export function resolveStudioEditorRoot(explicitRoot?: string): string {
  const moduleRoot = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    explicitRoot,
    resolve(moduleRoot, "studio"),
    resolve(moduleRoot, "../../editor/dist"),
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => existsSync(join(candidate, "index.html"))) ?? candidates[0]!;
}

function ensureDocument(filePath: string): void {
  if (extname(filePath).toLowerCase() !== STUDIO_EXTENSION) {
    throw new Error(`Studio expects a ${STUDIO_EXTENSION} source file: ${filePath}`);
  }
  if (existsSync(filePath)) return;
  mkdirSync(dirname(filePath), { recursive: true });
  const id = basename(filePath, STUDIO_EXTENSION).replace(/[^a-zA-Z0-9_-]+/g, "-") || "untitled-diagram";
  writeFileSync(filePath, printDgm(createEmptyDocument(id)), "utf8");
}

function validateSource(source: string):
  | { ok: true }
  | { ok: false; issues: Array<{ level: string; message: string }> } {
  try {
    const doc = parseDgm(source);
    const issues = validateDocument(doc, getCatalogMap(), { enforceCatalogRules: false });
    if (hasErrors(issues)) {
      return { ok: false, issues: issues.map(({ level, message }) => ({ level, message })) };
    }
    const compilation = compileDiagram(doc);
    if (!compilation.ok) {
      return {
        ok: false,
        issues: compilation.issues.map(({ level, message }) => ({ level, message })),
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      issues: [{ level: "error", message: error instanceof Error ? error.message : "Unable to parse source." }],
    };
  }
}

function normalizeFilename(filename: string): string | null {
  const trimmed = filename.trim();
  if (!trimmed || basename(trimmed) !== trimmed) return null;
  const withExtension = extname(trimmed) ? trimmed : `${trimmed}${STUDIO_EXTENSION}`;
  if (extname(withExtension).toLowerCase() !== STUDIO_EXTENSION) return null;
  return withExtension;
}

function listProjectFiles(directory: string): string[] {
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(STUDIO_EXTENSION))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

function atomicWrite(filePath: string, source: string): void {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temporaryPath, source, "utf8");
    renameSync(temporaryPath, filePath);
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
}

function revisionFor(source: string): string {
  return `sha256:${createHash("sha256").update(source).digest("hex")}`;
}

function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolvePromise, rejectPromise) => {
    let bytes = 0;
    let raw = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > MAX_REQUEST_BYTES) {
        rejectPromise(new Error("Request body is too large."));
        request.destroy();
        return;
      }
      raw += chunk;
    });
    request.on("end", () => {
      try {
        const value: unknown = JSON.parse(raw || "{}");
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          rejectPromise(new Error("Request body must be a JSON object."));
          return;
        }
        resolvePromise(value as Record<string, unknown>);
      } catch {
        rejectPromise(new Error("Request body is not valid JSON."));
      }
    });
    request.on("error", rejectPromise);
  });
}

function serveEditorAsset(editorRoot: string, pathname: string, response: ServerResponse): void {
  const decodedPath = decodeURIComponent(pathname);
  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  const candidate = resolve(editorRoot, relativePath);
  const rootPrefix = `${editorRoot.endsWith("/") ? editorRoot : `${editorRoot}/`}`;
  const isInsideRoot = candidate === editorRoot || candidate.startsWith(rootPrefix);
  const target = isInsideRoot && existsSync(candidate) ? candidate : join(editorRoot, "index.html");
  if (!isInsideRoot && relativePath !== "index.html") {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }
  try {
    const body = readFileSync(target);
    response.writeHead(200, {
      "Cache-Control": target.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable",
      "Content-Type": contentTypeFor(target),
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
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

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "0:0:0:0:0:0:0:1" ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized);
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
