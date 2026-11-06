import type { DiagramDocument, GroupKind, Point } from "@dumb-diagrams/runtime/core";
import { getDefaultView } from "@dumb-diagrams/runtime/core";
import { getCatalogEntry, type CatalogEntry } from "@dumb-diagrams/runtime/catalog";
import { err, ok, type Result } from "neverthrow";

import { cloneDocument, uniqueId } from "./document-structure";

export interface PlacementCheck {
  ok: boolean;
  reason?: string;
}

export type CatalogInsertionErrorCode = "parent-not-found" | "not-a-group" | "group-kind-mismatch";

export type CatalogInsertionError = {
  readonly code: CatalogInsertionErrorCode;
  readonly message: string;
};

export type CatalogInsertion = { doc: DiagramDocument; id: string };

export function canPlaceCatalogEntry(
  doc: DiagramDocument,
  _entry: CatalogEntry | undefined,
  parentId?: string,
): PlacementCheck {
  if (!parentId) {
    // Catalog containment rules guide generated diagrams. Manual placement is
    // intentionally permissive so users can stage an item before deciding
    // where it belongs; the core validator remains strict by default.
    return { ok: true };
  }
  const parent = doc.groups.find((candidate) => candidate.id === parentId);
  if (!parent) return { ok: false, reason: "The selected parent group no longer exists." };
  return { ok: true };
}

export function addResourceResult(
  doc: DiagramDocument,
  entry: CatalogEntry,
  parent: string | undefined,
  at: Point,
): Result<CatalogInsertion, CatalogInsertionError> {
  const check = canPlaceCatalogEntry(doc, entry, parent);
  if (!check.ok) {
    return err({
      code: "parent-not-found",
      message: check.reason ?? "The selected parent group no longer exists.",
    });
  }
  const next = cloneDocument(doc);
  const id = uniqueId(next, entry.type.split(".").at(-1) ?? "resource");
  next.resources.push({
    id,
    type: entry.type,
    parent,
    label: {},
    role: "primary",
    props: {},
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

export function addGroupResult(
  doc: DiagramDocument,
  kind: GroupKind,
  label: string,
  parent: string | undefined,
  at: Point,
  type?: string,
): Result<CatalogInsertion, CatalogInsertionError> {
  const entry = type ? getCatalogEntry(type) : undefined;
  if (entry) {
    if (entry.assetKind !== "group") {
      return err({
        code: "not-a-group",
        message: `${entry.name} is not a group.`,
      });
    }
    if (entry.groupKind && entry.groupKind !== kind) {
      return err({
        code: "group-kind-mismatch",
        message: `${entry.name} does not support the ${kind} group kind.`,
      });
    }
  }
  const check = canPlaceCatalogEntry(doc, entry, parent);
  if (!check.ok) {
    return err({
      code: "parent-not-found",
      message: check.reason ?? "The selected parent group no longer exists.",
    });
  }
  const next = cloneDocument(doc);
  const id = uniqueId(next, kind.replace("subnet-", "subnet"));
  next.groups.push({ id, kind, type, label, parent, children: [] });
  if (parent) next.groups.find((group) => group.id === parent)?.children.push(id);
  getDefaultView(next).places[id] = {
    x: Math.round(at.x),
    y: Math.round(at.y),
    pin: true,
    manual: true,
  };
  return ok({ doc: next, id });
}
