import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { startStudioServer, type StudioServerHandle } from "./studio-server.js";

const handles: StudioServerHandle[] = [];

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => closeServer(handle)));
});

describe("local Studio server", () => {
  it("serves only the static editor bundle on loopback", async () => {
    const { handle } = await createTestServer();
    const launchUrl = new URL(handle.url);
    expect(launchUrl.hostname).toBe("127.0.0.1");
    expect(launchUrl.search).toBe("");

    const index = await fetch(handle.url);
    expect(index.status).toBe(200);
    expect(await index.text()).toContain("Studio test");
    expect(index.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(index.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("does not expose file or project APIs", async () => {
    const { handle } = await createTestServer();
    for (const endpoint of ["api/session", "api/document", "api/files", "api/select", "api/events"]) {
      const response = await fetch(`${handle.url}${endpoint}`);
      expect(response.status, endpoint).toBe(404);
    }
  });

  it("keeps traversal outside the editor root forbidden", async () => {
    const { handle } = await createTestServer();
    const response = await fetch(`${handle.url}%2e%2e%2fsecret.txt`);
    expect(response.status).toBe(403);
  });
});

async function createTestServer(): Promise<{ handle: StudioServerHandle }> {
  const root = mkdtempSync(join(tmpdir(), "dumb-diagrams-studio-"));
  const editorRoot = join(root, "editor");
  mkdirSync(editorRoot);
  writeFileSync(join(editorRoot, "index.html"), "<!doctype html><title>Studio test</title>", "utf8");
  const handle = await startStudioServer({ editorRoot, port: 0 });
  handles.push(handle);
  return { handle };
}

function closeServer(handle: StudioServerHandle): Promise<void> {
  return new Promise((resolve, reject) => {
    handle.server.close((error) => error ? reject(error) : resolve());
  });
}
