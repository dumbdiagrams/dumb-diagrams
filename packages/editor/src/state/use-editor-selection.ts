import { useState } from "react";
import type { DiagramDocument, LayoutResult, Rect } from "@dumb-diagrams/runtime/core";
import { getDefaultView } from "@dumb-diagrams/runtime/core";
import type { Selection, SelectionItem } from "../model/types";
import { marqueeSelection, mergeSelection, type SelectionMode } from "../interactions/selection-targeting";

export function useEditorSelection() {
  const [selection, setSelection] = useState<Selection>([]);
  const selectItem = (item: SelectionItem, mode: SelectionMode) => {
    setSelection((current) => mergeSelection(current, [item], mode));
  };
  const selectMarquee = (doc: DiagramDocument, layout: LayoutResult, rect: Rect, mode: SelectionMode) => {
    const hits = marqueeSelection(doc, layout, getDefaultView(doc), rect);
    setSelection((current) => mergeSelection(current, hits, mode));
  };
  const selectInserted = (item: SelectionItem) => setSelection([item]);
  const resetSelection = () => setSelection([]);
  return { selection, setSelection, selectItem, selectMarquee, selectInserted, resetSelection };
}
