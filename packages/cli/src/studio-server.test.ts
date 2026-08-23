import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createEmptyDocument } from "@dumb-diagrams/core";
import { printDgm } from "@dumb-diagrams/dsl";
import { afterEach, describe, expect, it } from "vitest";

import { startStudioServer, type StudioServerHandle } from "./studio-server.js";

const handles: StudioServerHandle[] = [];

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => closeServer(handle)));
});

describe("local Studio server", () => {
  it("loads and writes a .dgm file through the revision-safe API", async () => {
    const created = await createTestServer();
    if (!created) return;
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
    if (!created) return;
    const { handle, filePath } = created;
    const session = await getJson<{ source: string; revision: string }>(`${handle.url}api/document`);
    writeFileSync(filePath, printDgm(createEmptyDocument("external-edit")), "utf8");
    await new Promise((resolve) => setTimeout(resolve, 140));

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
});

async function createTestServer(): Promise<{ handle: StudioServerHandle; filePath: string } | null> {
  const root = mkdtempSync(join(tmpdir(), "dumb-diagrams-studio-"));
  const editorRoot = join(root, "editor");
  mkdirSync(editorRoot);
  writeFileSync(join(editorRoot, "index.html"), "<!doctype html><title>Studio test</title>", "utf8");
  const filePath = join(root, "architecture.dgm");
  try {
    const handle = await startStudioServer({ filePath, editorRoot, port: 0 });
    handles.push(handle);
    return { handle, filePath };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") return null;
    throw error;
  }
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
