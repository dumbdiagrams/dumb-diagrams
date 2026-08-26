import { mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { request as httpRequest } from "node:http";

import { createEmptyDocument } from "@dumb-diagrams/runtime/core";
import { printDgm } from "@dumb-diagrams/runtime/dsl";
import { afterEach, describe, expect, it } from "vitest";

import { isLoopbackHost, startStudioServer, type StudioServerHandle } from "./studio-server.js";

const handles: StudioServerHandle[] = [];

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => closeServer(handle)));
});

describe("local Studio server", () => {
  it("recognizes loopback hosts without treating wildcard binds as local", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("127.12.34.56")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("0.0.0.0")).toBe(false);
    expect(isLoopbackHost("192.168.1.12")).toBe(false);
  });

  it("protects a non-loopback bind with a capability token and security headers", async () => {
    const { handle } = await createTestServer("0.0.0.0");
    const launchUrl = new URL(handle.url);
    const token = launchUrl.searchParams.get("token");
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const origin = `http://127.0.0.1:${launchUrl.port}`;

    const rejected = await fetch(`${origin}/api/session`);
    expect(rejected.status).toBe(401);

    const accepted = await fetch(`${origin}/api/session?token=${token}`);
    expect(accepted.status).toBe(200);
    expect(accepted.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(accepted.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("rejects cross-origin and rebound-host access to the loopback API", async () => {
    const { handle } = await createTestServer();
    const endpoint = `${handle.url}api/session`;
    const crossOrigin = await fetch(endpoint, { headers: { Origin: "https://untrusted.example" } });
    expect(crossOrigin.status).toBe(403);
    const reboundStatus = await new Promise<number>((resolve, reject) => {
      const request = httpRequest(endpoint, { headers: { Host: "untrusted.example" } }, (response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      });
      request.on("error", reject);
      request.end();
    });
    expect(reboundStatus).toBe(403);
    const sameOrigin = await fetch(endpoint, { headers: { Origin: new URL(handle.url).origin } });
    expect(sameOrigin.status).toBe(200);
  });

  it("loads and writes a .dgm file through the revision-safe API", async () => {
    const created = await createTestServer();
    const { handle, filePath } = created;
    const session = await getJson<{ source: string; revision: string }>(`${handle.url}api/session`);
    const nextSource = printDgm(createEmptyDocument("updated-diagram"));

    const saved = await fetch(`${handle.url}api/document`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: nextSource, baseRevision: session.revision }),
    });

    expect(saved.status).toBe(200);
    expect(readFileSync(filePath, "utf8")).toBe(nextSource);
    const document = await saved.json() as { revision: string; fileName: string };
    expect(document.revision).not.toBe(session.revision);
    expect(document.fileName).toBe("architecture.dgm");
  });

  it("rejects a stale save after an external edit", async () => {
    const created = await createTestServer();
    const { handle, filePath } = created;
    const session = await getJson<{ source: string; revision: string }>(`${handle.url}api/document`);
    replaceFile(filePath, printDgm(createEmptyDocument("external-edit")));

    const staleSave = await fetch(`${handle.url}api/document`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: session.source, baseRevision: session.revision }),
    });

    expect(staleSave.status).toBe(409);
    const conflict = await staleSave.json() as { error: string; source: string };
    expect(conflict.error).toBe("conflict");
    expect(conflict.source).toContain("external-edit");
  });

  it("keeps streaming changes when an editor atomically replaces the file", async () => {
    const { handle, filePath } = await createTestServer();
    const response = await fetch(`${handle.url}api/events`);
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    if (!reader) return;

    expect(await readSseEvent(reader)).toContain("event: ready");

    replaceFile(filePath, printDgm(createEmptyDocument("first-replacement")));
    const firstChange = await readSseEvent(reader);
    expect(firstChange).toContain("event: document");
    expect(firstChange).toContain("first-replacement");

    replaceFile(filePath, printDgm(createEmptyDocument("second-replacement")));
    const secondChange = await readSseEvent(reader);
    expect(secondChange).toContain("event: document");
    expect(secondChange).toContain("second-replacement");

    await reader.cancel();
  });

  it("lists and selects another diagram in the project folder", async () => {
    const created = await createTestServer();
    const { handle, filePath } = created;
    const secondPath = join(dirname(filePath), "network.dgm");
    const secondSource = printDgm(createEmptyDocument("network-diagram"));
    writeFileSync(secondPath, secondSource, "utf8");

    const files = await getJson<{ files: string[] }>(`${handle.url}api/files`);
    expect(files.files).toEqual(["architecture.dgm", "network.dgm"]);

    const selected = await fetch(`${handle.url}api/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "network.dgm" }),
    });

    expect(selected.status).toBe(200);
    const document = await selected.json() as { source: string; fileName: string; filePath: string };
    expect(document.source).toBe(secondSource);
    expect(document.fileName).toBe("network.dgm");
    expect(document.filePath).toBe(secondPath);
    expect(handle.filePath).toBe(secondPath);
  });
});

async function createTestServer(host?: string): Promise<{ handle: StudioServerHandle; filePath: string }> {
  const root = mkdtempSync(join(tmpdir(), "dumb-diagrams-studio-"));
  const editorRoot = join(root, "editor");
  mkdirSync(editorRoot);
  writeFileSync(join(editorRoot, "index.html"), "<!doctype html><title>Studio test</title>", "utf8");
  const filePath = join(root, "architecture.dgm");
  const handle = await startStudioServer({ filePath, editorRoot, host, port: 0 });
  handles.push(handle);
  return { handle, filePath };
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  expect(response.status).toBe(200);
  return response.json() as Promise<T>;
}

function closeServer(handle: StudioServerHandle): Promise<void> {
  return new Promise((resolve, reject) => {
    handle.server.close((error) => error ? reject(error) : resolve());
  });
}

function replaceFile(filePath: string, source: string): void {
  const replacementPath = `${filePath}.replacement`;
  writeFileSync(replacementPath, source, "utf8");
  renameSync(replacementPath, filePath);
}

async function readSseEvent(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<string> {
  const decoder = new TextDecoder();
  let content = "";
  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error("Timed out waiting for a Studio SSE event.")),
      3_000,
    );
    timeoutHandle.unref();
  });

  try {
    while (!content.includes("\n\n")) {
      const result = await Promise.race([reader.read(), timeout]);
      if (result.done) throw new Error("Studio SSE stream closed before sending an event.");
      content += decoder.decode(result.value, { stream: true });
    }
    return content.slice(0, content.indexOf("\n\n"));
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}
