import type { DiagramDocument, GroupKind, LayoutResult, Point } from "@dumb-diagrams/runtime/core";
import { getCatalogEntry, type CatalogEntry } from "@dumb-diagrams/runtime/catalog";
import { addGroupResult, addResourceResult } from "../model/catalog-placement";
import type { Selection, SelectionItem } from "../model/types";
import { leftStagingInsertionPoint, snapPoint } from "../grid";
import { parseCatalogDragPayload } from "../catalog-dnd";

export type CatalogPlacement = { parent: string | undefined; at: Point };
type CatalogContext = { doc: DiagramDocument; layout: LayoutResult; selection: Selection; snapToGrid: boolean };
type CatalogActionsOptions = {
  context: CatalogContext | null;
  commit: (doc: DiagramDocument) => boolean;
  selectInserted: (item: SelectionItem) => void;
  notify: (message: string) => void;
};

export function insertionPoint(layout: LayoutResult, parent?: string): Point {
  const group = parent ? layout.groups.find((candidate) => candidate.id === parent) : undefined;
  return group
    ? {
        x: group.content.x + Math.max(24, group.content.w / 2 - 40),
        y: group.content.y + Math.max(24, group.content.h / 2 - 40),
      }
    : { x: Math.max(48, layout.width / 2 - 40), y: Math.max(48, layout.height / 2 - 40) };
}

/** Resolve catalog placement and publish before selecting the inserted entity. */
export function createCatalogActions({ context, commit, selectInserted, notify }: CatalogActionsOptions) {
  const insert = (entry: CatalogEntry, kind?: GroupKind, requested?: CatalogPlacement) => {
    if (!context) return;
    try {
      const primary = context.selection[0];
      const parent = requested ? requested.parent : primary?.kind === "group" ? primary.id : undefined;
      const at =
        requested?.at ??
        snapPoint(
          parent
            ? insertionPoint(context.layout, parent)
            : leftStagingInsertionPoint(context.doc, context.layout, kind ? 360 : 240),
          context.snapToGrid,
        );
      const result = kind
        ? addGroupResult(context.doc, kind, entry.name, parent, at, entry.type)
        : addResourceResult(context.doc, entry, parent, at);
      if (result.isErr()) {
        notify(result.error.message);
        return;
      }
      if (!commit(result.value.doc)) return;
      selectInserted({ kind: kind ? "group" : "resource", id: result.value.id });
    } catch (cause) {
      console.error("Catalog insertion failed", cause);
      notify("Catalog insertion failed unexpectedly. Your diagram was not changed.");
    }
  };
  const addBoundary = () => {
    const entry = getCatalogEntry("cloud-agnostic.boundary");
    if (!entry) {
      notify("That catalog item is no longer available.");
      return;
    }
    insert({ ...entry, name: "Boundary" }, "logical");
  };
  const drop = (payloadText: string, point: Point) => {
    if (!context) return;
    const payload = parseCatalogDragPayload(payloadText);
    if (!payload) return;
    const entry = getCatalogEntry(payload.type);
    if (!entry || (payload.assetKind && payload.assetKind !== entry.assetKind)) {
      notify("That catalog item is no longer available.");
      return;
    }
    const parent = [...context.layout.groups]
      .filter(
        ({ content }) =>
          point.x >= content.x &&
          point.x <= content.x + content.w &&
          point.y >= content.y &&
          point.y <= content.y + content.h,
      )
      .sort((a, b) => a.content.w * a.content.h - b.content.w * b.content.h)[0]?.id;
    insert(entry, entry.assetKind === "group" ? ((entry.groupKind as GroupKind) ?? "logical") : undefined, {
      parent,
      at: snapPoint(point, context.snapToGrid),
    });
  };
  return {
    addCatalogResource: (entry: CatalogEntry, placement?: CatalogPlacement) => insert(entry, undefined, placement),
    addCatalogGroup: (entry: CatalogEntry, kind: GroupKind, placement?: CatalogPlacement) =>
      insert(entry, kind, placement),
    addBoundary,
    drop,
  };
}
