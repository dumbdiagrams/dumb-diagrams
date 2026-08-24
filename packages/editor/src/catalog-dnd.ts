import type { CatalogEntry } from "@dumb-diagrams/runtime/catalog";

export const CATALOG_DRAG_MIME = "application/x-dumb-diagrams-catalog";

export type CatalogDragPayload = {
  type: string;
  assetKind?: CatalogEntry["assetKind"];
};

export function serializeCatalogDragPayload(entry: Pick<CatalogEntry, "type" | "assetKind">): string {
  return JSON.stringify({
    type: entry.type,
    assetKind: entry.assetKind,
  } satisfies CatalogDragPayload);
}

export function parseCatalogDragPayload(value: string): CatalogDragPayload | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const payload = parsed as Partial<CatalogDragPayload>;
    if (typeof payload.type !== "string" || !payload.type) return null;
    if (
      payload.assetKind !== undefined &&
      payload.assetKind !== "resource" &&
      payload.assetKind !== "group"
    ) return null;
    return {
      type: payload.type,
      assetKind: payload.assetKind,
    };
  } catch {
    return null;
  }
}
