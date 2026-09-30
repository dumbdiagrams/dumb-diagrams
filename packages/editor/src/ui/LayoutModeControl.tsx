import type { LayoutEditingMode } from "../model/types";

export function LayoutModeControl({ mode, onChange }: {
  mode: LayoutEditingMode;
  onChange: (mode: LayoutEditingMode) => void;
}) {
  return (
    <div className="layout-mode-control" role="group" aria-label="Layout editing mode">
      <button type="button" aria-label="Manual layout" aria-pressed={mode === "manual"}
        title="Keep other items and connector paths in place while editing"
        onClick={() => onChange("manual")}>Manual</button>
      <button type="button" aria-label="Automatic layout" aria-pressed={mode === "automatic"}
        title="Repair the layout after future edits. Items may move; Undo restores the edit."
        onClick={() => onChange("automatic")}>Automatic</button>
    </div>
  );
}
