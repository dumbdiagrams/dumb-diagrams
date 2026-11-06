import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyDocument } from "@dumb-diagrams/runtime/core";
import { serializeClipboardResult } from "../model/clipboard";
import { readClipboardSelection, writeClipboardText } from "./clipboard-actions";

const doc = createEmptyDocument("clipboard");
const at = { x: 24, y: 24 };
function payload() {
  const result = serializeClipboardResult(doc, []);
  if (result.isErr()) throw new Error(result.error.message);
  return result.value;
}

afterEach(() => vi.unstubAllGlobals());

describe("browser clipboard workflows", () => {
  it("falls back to Studio copy when system clipboard is denied", async () => {
    vi.stubGlobal("navigator", {
      clipboard: {
        read: vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError")),
        readText: vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError")),
      },
    });
    const result = await readClipboardSelection(doc, at, payload());
    expect(result.isOk() && result.value.usedFallback).toBe(true);
    expect(result.isOk() && result.value.kind).toBe("selection");
  });
  it("tries the internal copy after unrelated system text", async () => {
    vi.stubGlobal("navigator", { clipboard: { readText: vi.fn().mockResolvedValue("ordinary text") } });
    const result = await readClipboardSelection(doc, at, payload());
    expect(result.isOk()).toBe(true);
  });
  it("returns an explicit failure if no valid payload exists", async () => {
    vi.stubGlobal("navigator", { clipboard: { readText: vi.fn().mockResolvedValue("ordinary text") } });
    const result = await readClipboardSelection(doc, at, null);
    expect(result.isErr() && result.error.code).toBe("empty");
  });
  it("captures synchronous browser clipboard failures", async () => {
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText() {
          throw new Error("disabled");
        },
      },
    });
    const result = await writeClipboardText("source");
    expect(result.isErr() && result.error.code).toBe("unavailable");
  });
  it("does not turn a broken raster image into a successful paste", async () => {
    vi.stubGlobal("navigator", {
      clipboard: {
        read: vi
          .fn()
          .mockResolvedValue([
            { types: ["image/png"], getType: async () => new Blob(["broken"], { type: "image/png" }) },
          ]),
      },
    });
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("decode failed")));
    const result = await readClipboardSelection(doc, at, payload());
    expect(result.isErr() && result.error.code).toBe("image");
  });
});
