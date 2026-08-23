import { useEffect, useRef, useState } from "react";

import { EXPORT_FORMATS, type ExportFormat } from "../state/export-actions";
import { IconCaret, IconExport } from "../ui/icons";

export function ExportMenu({
  onOpenExport,
  selectionCount = 0,
}: {
  onOpenExport: (format: ExportFormat) => void;
  selectionCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const choose = (format: ExportFormat) => {
    setOpen(false);
    onOpenExport(format);
  };

  return (
    <div className="export-menu" ref={ref}>
      <button type="button" className="primary-button export-primary" onClick={() => choose("svg")}>
        <IconExport />
        <span>{selectionCount > 0 ? "Export selection" : "Export"}</span>
      </button>
      <button
        type="button"
        className="primary-button caret"
        aria-label="More export formats"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <IconCaret />
      </button>
      {open && (
        <div className="export-dropdown" role="menu" aria-label="Export as">
          <div className="export-dropdown-heading">
            <span>Export as</span>
            {selectionCount > 0 && <small>{selectionCount} selected</small>}
          </div>
          <div className="export-format-list">
            {EXPORT_FORMATS.map((format) => (
              <button
                key={format.value}
                type="button"
                className="export-format-option"
                role="menuitem"
                onClick={() => choose(format.value)}
              >
                <span className="export-format-name">{format.label}</span>
                <span className="export-format-description">{format.description}</span>
              </button>
            ))}
          </div>
          <div className="export-dropdown-footer">
            <span>Choose scope, theme, and dimensions next</span>
          </div>
        </div>
      )}
    </div>
  );
}
