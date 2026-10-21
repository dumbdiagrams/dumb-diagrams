import { mkdirSync, mkdtempSync, unlinkSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_STUDIO_PORT, startStudioServer, type StudioServerHandle } from "./studio-server.js";

const handles: StudioServerHandle[] = [];

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => closeServer(handle)));
});

describe("local Studio server", () => {
  it("returns a typed error when Studio assets are missing", async () => {
    const root = mkdtempSync(join(tmpdir(), "dumb-diagrams-studio-"));
    const editorRoot = join(root, "editor");

    const result = await startStudioServer({ editorRoot, port: 0 });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error).toMatchObject({ code: "missing-assets", editorRoot });
  });

  it("returns a typed error when an explicit port is occupied", async () => {
    const root = mkdtempSync(join(tmpdir(), "dumb-diagrams-studio-"));
    const editorRoot = join(root, "editor");
    mkdirSync(editorRoot);
    writeFileSync(join(editorRoot, "index.html"), "<!doctype html><title>Studio test</title>", "utf8");

    const blocker = createServer();
    await new Promise<void>((resolve, reject) => {
      blocker.once("error", reject);
      blocker.listen(0, "127.0.0.1", () => resolve());
    });
    const address = blocker.address();
    const port = typeof address === "object" && address ? (address as AddressInfo).port : 0;
    expect(port).toBeGreaterThan(0);

    try {
      const result = await startStudioServer({ editorRoot, port });

      expect(result.isErr()).toBe(true);
      if (result.isOk()) {
        await closeServer(result.value);
        return;
      }
      expect(result.error).toMatchObject({ code: "start-failed" });
    } finally {
      await new Promise<void>((resolve, reject) => {
        blocker.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it("falls back to a free port when the default port is taken", async () => {
    const blocker = createServer();
    let blockerListening = false;
    await new Promise<void>((resolve, reject) => {
      blocker.once("error", (error) => {
        if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") resolve();
        else reject(error);
      });
      blocker.listen(DEFAULT_STUDIO_PORT, "127.0.0.1", () => {
        blockerListening = true;
        resolve();
      });
    });
    try {
      const { handle } = await createTestServer({});
      expect(new URL(handle.url).port).not.toBe(String(DEFAULT_STUDIO_PORT));
      expect((await fetch(handle.url)).status).toBe(200);
    } finally {
      if (blockerListening) await closeNetServer(blocker);
    }
  });

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

  it("serves a symlink whose real target stays inside the editor root", async () => {
    const { handle, editorRoot } = await createTestServer();
    symlinkSync("index.html", join(editorRoot, "index-link.html"));

    const response = await fetch(`${handle.url}index-link.html`);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Studio test");
  });

  it("forbids a symlink whose real target is outside the editor root", async () => {
    const { handle, editorRoot, outsideRoot } = await createTestServer();
    writeFileSync(join(outsideRoot, "secret.txt"), "do not serve", "utf8");
    symlinkSync(join(outsideRoot, "secret.txt"), join(editorRoot, "secret.txt"));

    const response = await fetch(`${handle.url}secret.txt`);

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Forbidden");
  });
  it("checks the real target of the history fallback too", async () => {
    const { handle, editorRoot, outsideRoot } = await createTestServer();
    writeFileSync(join(outsideRoot, "secret.html"), "do not serve", "utf8");
    unlinkSync(join(editorRoot, "index.html"));
    symlinkSync(join(outsideRoot, "secret.html"), join(editorRoot, "index.html"));

    const response = await fetch(`${handle.url}missing-page`);

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Forbidden");
  });

});

async function createTestServer(
  options: { port?: number } = { port: 0 },
): Promise<{ handle: StudioServerHandle; editorRoot: string; outsideRoot: string }> {
  const root = mkdtempSync(join(tmpdir(), "dumb-diagrams-studio-"));
  const editorRoot = join(root, "editor");
  const outsideRoot = join(root, "outside");
  mkdirSync(editorRoot);
  mkdirSync(outsideRoot);
  writeFileSync(join(editorRoot, "index.html"), "<!doctype html><title>Studio test</title>", "utf8");
  const result = await startStudioServer({ editorRoot, ...options });
  if (result.isErr()) throw new Error(result.error.message);
  const handle = result.value;
  handles.push(handle);
  return { handle, editorRoot, outsideRoot };
}

function closeServer(handle: StudioServerHandle): Promise<void> {
  return new Promise((resolve, reject) => {
    handle.server.close((error) => error ? reject(error) : resolve());
  });
}

function closeNetServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
