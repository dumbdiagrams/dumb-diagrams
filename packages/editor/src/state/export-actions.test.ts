import { afterEach, describe, expect, it, vi } from "vitest";

import { createEmptyDocument, type LayoutResult } from "@dumb-diagrams/runtime/core";

import {
  decodeDiagramUrlPayload,
  encodeDiagramUrlPayload,
  createDiagramUrlResult,
  downloadTextResult,
  exportDgmFileResult,
  exportDiagramFile,
  EXPORT_FORMAT_CAPABILITIES,
  filenameWithExtension,
  getExportBounds,
  isExportFormatSupported,
  sanitizeFilename,
  supportsExportSourceOption,
} from "./export-actions";

afterEach(() => {
  vi.unstubAllGlobals();
});

function exportArgs(format: "dgm" | "url" | "svg" | "png" = "dgm") {
  return {
    title: "diagram",
    source: "diagram demo {\n  grammar aws\n}\n",
    doc: createEmptyDocument("demo"),
    layout: {} as LayoutResult,
    selection: [],
    options: {
      format,
      scope: "all" as const,
      size: "diagram" as const,
      appearance: "light" as const,
      transparentBackground: false,
      includeSource: true,
      zoom: 100,
      width: 640,
      height: 480,
      dpi: 100,
      borderWidth: 0,
      grid: false,
    },
    getPortableSvg: vi.fn(async () => "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\"></svg>"),
  };
}

function stubDownload({ click = vi.fn() }: { click?: ReturnType<typeof vi.fn> } = {}) {
  const createObjectURL = vi.fn(() => "blob:export");
  const revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
  vi.stubGlobal("document", { createElement: () => ({ click }) });
  vi.stubGlobal("window", { setTimeout: (callback: () => void) => { callback(); return 0; } });
  return { click, createObjectURL, revokeObjectURL };
}

describe("export filenames", () => {
  it("advertises source embedding only for formats that preserve it", () => {
    expect(Object.entries(EXPORT_FORMAT_CAPABILITIES)
      .filter(([, capabilities]) => capabilities.sourceOption)
      .map(([format]) => format))
      .toEqual(["svg", "html"]);
    expect(supportsExportSourceOption("png")).toBe(false);
    expect(supportsExportSourceOption("pdf")).toBe(false);
    expect(supportsExportSourceOption("gif")).toBe(false);
    expect(supportsExportSourceOption("svg")).toBe(true);
    expect(supportsExportSourceOption("html")).toBe(true);
  });

  it("does not advertise WebP when the browser silently encodes PNG", () => {
    const toDataURL = vi.fn(() => "data:image/png;base64,placeholder");
    vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, toDataURL }) });
    try {
      expect(isExportFormatSupported("webp")).toBe(false);
      expect(isExportFormatSupported("webp")).toBe(false);
      expect(isExportFormatSupported("png")).toBe(true);
      expect(toDataURL).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("removes path-like and unsupported filename characters", () => {
    expect(sanitizeFilename("../My Diagram: v2.dgm")).toBe("My-Diagram-v2.dgm");
    expect(sanitizeFilename("...")).toBe("diagram");
  });

  it("replaces an existing extension with the requested format", () => {
    expect(filenameWithExtension("My diagram.dgm", "svg")).toBe("My-diagram.svg");
    expect(filenameWithExtension("", ".dgm")).toBe("diagram.dgm");
  });

  it("auto-fills selection bounds around the selected live entities", () => {
    const doc = createEmptyDocument("selection-bounds");
    doc.resources.push(
      { id: "source", type: "s3", label: {}, role: "primary", props: {} },
      { id: "target", type: "lambda", label: {}, role: "primary", props: {} },
    );
    doc.edges.push({ id: "flow", source: "source", target: "target", style: "solid" });
    const layout = {
      nodes: [
        { id: "source", type: "resource" as const, icon: { x: 100, y: 120, w: 48, h: 48 }, label: { x: 96, y: 172, w: 56, h: 32 }, obstacle: { x: 96, y: 120, w: 56, h: 84 }, role: "primary" as const, resourceType: "s3", serviceLabel: "S3" },
        { id: "target", type: "resource" as const, icon: { x: 520, y: 120, w: 48, h: 48 }, label: { x: 516, y: 172, w: 56, h: 32 }, obstacle: { x: 512, y: 120, w: 64, h: 84 }, role: "primary" as const, resourceType: "lambda", serviceLabel: "Lambda" },
      ],
      groups: [],
      edges: [{ id: "flow", source: "source", target: "target", points: [{ x: 152, y: 162 }, { x: 512, y: 162 }], style: "solid" as const }],
      width: 800,
      height: 600,
      symmetries: [],
    };

    expect(getExportBounds(doc, layout, [{ kind: "resource", id: "source" }], "selection")).toEqual({
      x: 72,
      y: 96,
      w: 104,
      h: 132,
    });
    expect(getExportBounds(doc, layout, [{ kind: "edge", id: "flow" }], "selection")).toEqual({
      x: 72,
      y: 96,
      w: 528,
      h: 132,
    });
  });
});

describe("diagram URL payloads", () => {
  it("round-trips UTF-8 source through a URL-safe payload", () => {
    const source = "diagram résumé {\n  grammar aws\n}\n";
    const encoded = encodeDiagramUrlPayload(source);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    expect(encoded.payload).not.toMatch(/[+/=]/);
    expect(decodeDiagramUrlPayload(encoded.payload)).toEqual({ ok: true, source });
  });

  it("rejects malformed and oversized URL payloads", () => {
    expect(decodeDiagramUrlPayload("not valid!")).toMatchObject({ ok: false, code: "malformed" });
    expect(decodeDiagramUrlPayload("A".repeat(Math.ceil((1024 * 1024) / 3) * 4 + 1)))
      .toMatchObject({ ok: false, code: "oversize" });
    const oversized = encodeDiagramUrlPayload("x".repeat(1024 * 1024 + 1));
    expect(oversized).toMatchObject({ ok: false, code: "oversize" });
  });
});

describe("typed diagram exports", () => {
  it("returns a typed source-download failure for the save fallback", () => {
    stubDownload({ click: vi.fn(() => { throw new Error("blocked"); }) });

    const result = downloadTextResult("source", "diagram.dgm");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe("download");
  });

  it("returns a typed URL failure for an oversized source", () => {
    const result = createDiagramUrlResult("x".repeat(1024 * 1024 + 1));

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe("url");
  });

  it("returns a typed receipt for the source export fallback", () => {
    stubDownload();

    const result = exportDgmFileResult("source", "diagram");

    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toEqual({ filename: "diagram.dgm", format: "dgm" });
  });

  it("returns a receipt for a successful source download", async () => {
    const download = stubDownload();
    const result = await exportDiagramFile(exportArgs("dgm"));

    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toEqual({ filename: "diagram.dgm", format: "dgm" });
    expect(download.click).toHaveBeenCalledOnce();
    expect(download.revokeObjectURL).toHaveBeenCalledWith("blob:export");
  });

  it("classifies portable SVG preparation failures", async () => {
    stubDownload();
    const args = exportArgs("svg");
    args.getPortableSvg.mockRejectedValue(new Error("compiler failed"));

    const result = await exportDiagramFile(args);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe("portable-svg-preparation");
  });

  it("classifies rasterization image-load failures", async () => {
    class BrokenImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onerror?.()); }
    }
    stubDownload();
    vi.stubGlobal("Image", BrokenImage);

    const result = await exportDiagramFile(exportArgs("png"));

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe("rasterization");
  });

  it("classifies missing canvas contexts", async () => {
    class LoadedImage {
      width = 10;
      height = 10;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    stubDownload();
    vi.stubGlobal("Image", LoadedImage);
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => null }) });

    const result = await exportDiagramFile(exportArgs("png"));

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe("canvas-context");
  });

  it.each(["null callback", "throwing callback"]) ("classifies canvas.toBlob %s as encoding failures", async (mode) => {
    class LoadedImage {
      width = 10;
      height = 10;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    const context = { fillRect: vi.fn(), drawImage: vi.fn() };
    stubDownload();
    vi.stubGlobal("Image", LoadedImage);
    vi.stubGlobal("document", {
      createElement: () => ({
        getContext: () => context,
        toBlob: (callback: BlobCallback) => {
          if (mode === "null callback") callback(null);
          else throw new Error("encoder failed");
        },
      }),
    });

    const result = await exportDiagramFile(exportArgs("png"));

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe("encoding");
  });

  it("classifies blob encoding failures", async () => {
    stubDownload();
    vi.stubGlobal("Blob", class BrokenBlob { constructor() { throw new Error("quota"); } });

    const result = await exportDiagramFile(exportArgs("dgm"));

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe("encoding");
  });

  it("classifies browser download rejection and still revokes its URL", async () => {
    const download = stubDownload({ click: vi.fn(() => { throw new Error("blocked"); }) });

    const result = await exportDiagramFile(exportArgs("dgm"));

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe("download");
    expect(download.revokeObjectURL).toHaveBeenCalledWith("blob:export");
  });

  it("classifies URL encoding failures", async () => {
    const args = exportArgs("url");
    args.source = "x".repeat(1024 * 1024 + 1);

    const result = await exportDiagramFile(args);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe("url");
  });
});
