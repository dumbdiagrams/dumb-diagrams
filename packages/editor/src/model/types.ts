/** View state shared by the canvas and the workspace model. */
export interface Viewport {
  panX: number;
  panY: number;
  zoom: number;
}

export type SelectionKind = "resource" | "group" | "edge" | "annotation";

export interface SelectionItem {
  kind: SelectionKind;
  id: string;
}

export type Selection = SelectionItem[];

export function isSelectionItem(value: unknown): value is SelectionItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SelectionItem>;
  return (
    (item.kind === "resource" || item.kind === "group" || item.kind === "edge" || item.kind === "annotation") &&
    typeof item.id === "string"
  );
}
