import type { DiagramDocument, Point } from "@dumb-diagrams/runtime/core";
import { getDefaultView } from "@dumb-diagrams/runtime/core";
import { getCatalogEntry } from "@dumb-diagrams/runtime/catalog";
import { err, ok, type Result } from "neverthrow";

import { cloneDocument, uniqueId } from "./document-structure";

export type CustomResourceErrorCode = "parent-not-found" | "asset-not-found";

export type CustomResourceError = {
  readonly code: CustomResourceErrorCode;
  readonly message: string;
};

export type CustomResourceInsertion = { doc: DiagramDocument; id: string };

export function addCustomResourceResult(
  doc: DiagramDocument,
  assetId: string,
  label: string,
  parent: string | undefined,
  at: Point,
): Result<CustomResourceInsertion, CustomResourceError> {
  if (!doc.assets?.some((asset) => asset.id === assetId)) {
    return err({ code: "asset-not-found", message: "The custom resource icon asset no longer exists." });
  }
  if (parent && !doc.groups.some((group) => group.id === parent)) {
    return err({ code: "parent-not-found", message: "The selected parent group no longer exists." });
  }
  const next = cloneDocument(doc);
  const id = uniqueId(next, "custom");
  next.resources.push({
    id,
    type: getCatalogEntry("cloud-agnostic.server")?.type ?? "cloud-agnostic.server",
    parent,
    // Keep the custom name in the service label; the fallback catalog type is "Server".
    label: { service: label },
    role: "primary",
    props: { iconAsset: assetId },
  });
  if (parent) next.groups.find((group) => group.id === parent)?.children.push(id);
  getDefaultView(next).places[id] = {
    x: Math.round(at.x),
    y: Math.round(at.y),
    pin: true,
    manual: true,
  };
  return ok({ doc: next, id });
}
