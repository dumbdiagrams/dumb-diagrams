import { DIAGRAM_LIMITS, normalizeSingleLineText } from "@dumb-diagrams/core";

export function sanitizeFilename(value: string): string {
  const clean = normalizeSingleLineText(value)
    .replace(/[^\p{L}\p{N}_.-]+/gu, "-")
    .replace(/^[._-]+|[._-]+$/g, "") || "diagram";
  return Array.from(clean).slice(0, DIAGRAM_LIMITS.filenameCharacters).join("");
}

export function downloadBlob(blob: Blob, name: string): boolean {
  try {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  } catch {
    return false;
  }
}

export function downloadText(text: string, name: string, mime = "text/plain"): boolean {
  return downloadBlob(new Blob([text], { type: mime }), name);
}

export function filenameWithExtension(value: string, extension: string): string {
  const clean = sanitizeFilename(value).replace(/\.[^/.]+$/, "");
  return `${clean}.${extension.replace(/^\./, "")}`;
}

export interface ExportResult {
  ok: boolean;
  filename: string;
}

export async function exportSvgFile(
  title: string,
  getPortableSvg: () => Promise<string>,
): Promise<ExportResult> {
  const filename = filenameWithExtension(title, "svg");
  try {
    const svg = await getPortableSvg();
    return {
      ok: downloadBlob(new Blob([svg], { type: "image/svg+xml" }), filename),
      filename,
    };
  } catch {
    return { ok: false, filename };
  }
}

export function exportDgmFile(source: string, title: string): ExportResult {
  const filename = filenameWithExtension(title, "dgm");
  return {
    ok: downloadText(source, filename),
    filename,
  };
}

export async function exportPngFile(
  title: string,
  getPortableSvg: () => Promise<string>,
): Promise<ExportResult> {
  const filename = filenameWithExtension(title, "png");
  let svg: string;
  try {
    svg = await getPortableSvg();
  } catch {
    return { ok: false, filename };
  }

  return new Promise((resolve) => {
    const image = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      canvas.getContext("2d")?.drawImage(image, 0, 0);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        resolve({ ok: Boolean(blob && downloadBlob(blob, filename)), filename });
      }, "image/png");
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ ok: false, filename });
    };
    image.src = url;
  });
}
