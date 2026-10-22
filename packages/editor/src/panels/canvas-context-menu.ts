import type { DiagramDocument } from "@dumb-diagrams/runtime/core";
import { canGroupSelection } from "../model/grouping";
import type { Selection } from "../model/types";
import { sendToFront, sendToBack, setLocked } from "../editor-model";
import type { ContextMenuItem } from "./ContextMenu";

export function buildContextMenuItems(
  selection: Selection,
  doc: DiagramDocument,
  actions: {
    onCopy: () => void;
    onCut: () => void;
    onPaste: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onGroup: () => void;
    onDeleteGroup: () => void;
    onFitGroup: () => void;
    onUngroup: () => void;
    onDeleteGroupAndContents: () => void;
    onMutate: (change: (doc: DiagramDocument) => DiagramDocument) => void;
  },
): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];
  const hasSelection = selection.length > 0;

  if (hasSelection) {
    items.push(
      {
        id: "copy",
        label: "Copy",
        shortcut: "⌘C / Ctrl+C",
        onSelect: actions.onCopy,
      },
      {
        id: "cut",
        label: "Cut",
        shortcut: "⌘X / Ctrl+X",
        onSelect: actions.onCut,
      },
      {
        id: "duplicate",
        label: "Duplicate",
        shortcut: "⌘D / Ctrl+D",
        onSelect: actions.onDuplicate,
      },
      { id: "selection-divider", label: "", separator: true },
    );
  }

  items.push({
    id: "paste",
    label: "Paste image or selection",
    shortcut: "⌘V / Ctrl+V",
    onSelect: actions.onPaste,
  });

  if (!hasSelection) return items;

  if (canGroupSelection(doc, selection)) {
    items.push({
      id: "group",
      label: "Group",
      shortcut: "⌘G / Ctrl+G",
      onSelect: actions.onGroup,
    });
  }

  if (selection.length === 1) {
    const item = selection[0]!;
    const view = doc.views[0];
    const place = item.kind === "annotation" ? view?.annotations?.[item.id] : view?.places[item.id];
    const locked = Boolean(place?.locked);

    items.push({ id: "object-divider", label: "", separator: true });
    items.push({
      id: "front",
      label: "Bring to front",
      onSelect: () => actions.onMutate((next) => sendToFront(next, item.id)),
    });
    items.push({
      id: "back",
      label: "Send to back",
      onSelect: () => actions.onMutate((next) => sendToBack(next, item.id)),
    });
    items.push({
      id: "lock",
      label: locked ? "Unlock position" : "Lock position",
      onSelect: () =>
        actions.onMutate((next) =>
          setLocked(next, item.kind as "resource" | "group" | "edge" | "annotation", item.id, !locked),
        ),
    });

    if (item.kind === "group") {
      items.push({ id: "group-actions-divider", label: "", separator: true });
      items.push({
        id: "fit-group-to-contents",
        label: "Fit to contents",
        onSelect: actions.onFitGroup,
      });
      items.push({
        id: "ungroup",
        label: "Ungroup",
        shortcut: "⌘⇧G / Ctrl+Shift+G",
        onSelect: actions.onUngroup,
      });
      items.push({
        id: "delete-group",
        label: "Delete group",
        onSelect: actions.onDeleteGroup,
      });
      items.push({
        id: "delete-group-and-contents",
        label: "Delete group and contents",
        danger: true,
        onSelect: actions.onDeleteGroupAndContents,
      });
    }
  }

  // A single selected group has explicit boundary actions above. Omitting a
  // second generic Delete keeps destructive subtree deletion intentional.
  if (!(selection.length === 1 && selection[0]?.kind === "group")) {
    items.push({ id: "delete-divider", label: "", separator: true });
    items.push({
      id: "delete",
      label:
        selection.length > 1
          ? `Delete ${selection.length} items`
          : selection[0]?.kind === "edge"
            ? "Delete connector"
            : "Delete",
      shortcut: "⌫ / Delete",
      danger: true,
      onSelect: actions.onDelete,
    });
  }

  return items;
}
