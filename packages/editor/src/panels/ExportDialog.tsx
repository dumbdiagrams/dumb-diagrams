import { useEffect, useMemo, useState } from "react";

import type { DiagramDocument, LayoutResult } from "@dumb-diagrams/runtime/core";

import type { Selection } from "../editor-model";
import {
  EXPORT_FORMATS,
  isExportFormatSupported,
  exportDiagramFile,
  exportFormat,
  getExportBounds,
  type ExportAppearance,
  type ExportFormat,
  type ExportOptions,
  type ExportScope,
  type ExportSize,
} from "../state/export-actions";
import { Modal } from "../ui/Modal";

const VISUAL_FORMATS = new Set<ExportFormat>(["png", "jpeg", "webp", "gif", "svg", "pdf", "html"]);

export function ExportDialog({
  open,
  initialFormat,
  title,
  source,
  doc,
  layout,
  selection,
  getPortableSvg,
  onClose,
  onToast,
}: {
  open: boolean;
  initialFormat: ExportFormat;
  title: string;
  source: string;
  doc: DiagramDocument;
  layout: LayoutResult;
  selection: Selection;
  getPortableSvg: () => Promise<string>;
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const hasSelection = selection.length > 0;
  const [format, setFormat] = useState<ExportFormat>(initialFormat);
  const [scope, setScope] = useState<ExportScope>(hasSelection ? "selection" : "all");
  const [size, setSize] = useState<ExportSize>(hasSelection ? "selection" : "diagram");
  const [appearance, setAppearance] = useState<ExportAppearance>("light");
  const [transparentBackground, setTransparentBackground] = useState(false);
  const [includeSource, setIncludeSource] = useState(true);
  const [zoom, setZoom] = useState(100);
  const canvasWidth = layout.canvasBounds?.w ?? layout.width;
  const canvasHeight = layout.canvasBounds?.h ?? layout.height;
  const [customWidth, setCustomWidth] = useState(Math.ceil(canvasWidth));
  const [customHeight, setCustomHeight] = useState(Math.ceil(canvasHeight));
  const [dpi, setDpi] = useState(100);
  const [borderWidth, setBorderWidth] = useState(0);
  const [shadow, setShadow] = useState(false);
  const [grid, setGrid] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const nextScope = selection.length > 0 ? "selection" : "all";
    const currentTheme = document.documentElement.dataset.theme;
    setFormat(initialFormat);
    setScope(nextScope);
    setSize(nextScope === "selection" ? "selection" : "diagram");
    setAppearance(currentTheme === "dark" ? "dark" : "light");
    setTransparentBackground(false);
    setIncludeSource(true);
    setZoom(100);
    setCustomWidth(Math.ceil(canvasWidth));
    setCustomHeight(Math.ceil(canvasHeight));
    setDpi(100);
    setBorderWidth(0);
    setShadow(false);
    setGrid(false);
  }, [canvasHeight, canvasWidth, initialFormat, open, selection.length]);

  const bounds = useMemo(
    () => getExportBounds(doc, layout, selection, scope),
    [doc, layout, scope, selection],
  );
  const automaticWidth = Math.max(1, Math.round(bounds.w * zoom / 100));
  const automaticHeight = Math.max(1, Math.round(bounds.h * zoom / 100));
  const width = size === "custom" ? customWidth : automaticWidth;
  const height = size === "custom" ? customHeight : automaticHeight;
  const formatDetails = exportFormat(format);
  const visualFormat = VISUAL_FORMATS.has(format);

  const setNumeric = (setter: (value: number) => void, value: string, minimum: number) => {
    const parsed = Number(value);
    setter(Number.isFinite(parsed) ? Math.max(minimum, Math.round(parsed)) : minimum);
  };

  const submit = async () => {
    if (exporting) return;
    const options: ExportOptions = {
      format,
      scope: hasSelection ? scope : "all",
      size,
      appearance,
      transparentBackground,
      includeSource,
      zoom: Math.max(1, zoom),
      width: Math.max(1, width),
      height: Math.max(1, height),
      dpi: Math.max(36, dpi),
      borderWidth: Math.max(0, borderWidth),
      shadow,
      grid,
    };
    setExporting(true);
    try {
      const result = await exportDiagramFile({
        title: title || "diagram",
        source,
        doc,
        layout,
        selection,
        options,
        getPortableSvg,
      });
      onToast(result.ok ? `Downloaded ${result.filename}` : `${formatDetails.label} export failed.`);
      if (result.ok) onClose();
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`Export ${formatDetails.label}`}
      subtitle="Choose what to include, then tune the finish for your audience."
      onClose={onClose}
      className="export-dialog"
      width={760}
    >
      <form
        className="export-dialog-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <section className="export-dialog-section export-format-section">
          <div className="export-section-heading">
            <div>
              <h3>Export as</h3>
              <p>Pick a format, then use the same export studio for every output.</p>
            </div>
            <span className="export-file-extension">.{formatDetails.extension}</span>
          </div>
          <label className="export-select-label">
            <span>Format</span>
            <select value={format} onChange={(event) => setFormat(event.target.value as ExportFormat)}>
              {EXPORT_FORMATS.filter((candidate) => isExportFormatSupported(candidate.value)).map((candidate) => (
                <option key={candidate.value} value={candidate.value}>
                  {candidate.label} — {candidate.description}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="export-dialog-section">
          <div className="export-section-heading">
            <div>
              <h3>What to include</h3>
              <p>Moving items updates the live artboard; these bounds are filled from that current layout.</p>
            </div>
          </div>
          <div className="export-scope-grid">
            <button
              type="button"
              className={`export-choice-card ${scope === "all" ? "selected" : ""}`}
              onClick={() => {
                setScope("all");
                if (size !== "custom") setSize("diagram");
              }}
            >
              <span className="export-choice-kicker">Canvas</span>
              <strong>Entire diagram</strong>
              <span>{Math.ceil(canvasWidth)} × {Math.ceil(canvasHeight)} px</span>
            </button>
            <button
              type="button"
              className={`export-choice-card ${scope === "selection" ? "selected" : ""}`}
              disabled={!hasSelection}
              onClick={() => {
                setScope("selection");
                if (size !== "custom") setSize("selection");
              }}
            >
              <span className="export-choice-kicker">Focused view</span>
              <strong>Selection only</strong>
              <span>{hasSelection ? `${selection.length} item${selection.length === 1 ? "" : "s"} selected` : "Select items on the canvas first"}</span>
            </button>
          </div>
        </section>

        <section className="export-dialog-section export-appearance-section">
          <div className="export-section-heading">
            <div>
              <h3>Appearance</h3>
              <p>{visualFormat ? "Make the exported canvas match the way you present it." : "Appearance is applied when this format supports a visual canvas."}</p>
            </div>
          </div>
          <div className="export-appearance-row">
            <div className="export-segmented" role="group" aria-label="Appearance">
              {(["light", "dark"] as const).map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  className={appearance === candidate ? "selected" : ""}
                  onClick={() => setAppearance(candidate)}
                >
                  {candidate === "light" ? "Light" : "Dark"}
                </button>
              ))}
            </div>
            <label className="export-check-row">
              <input
                type="checkbox"
                checked={transparentBackground}
                onChange={(event) => setTransparentBackground(event.target.checked)}
              />
              <span>Transparent background</span>
            </label>
            <label className="export-check-row">
              <input
                type="checkbox"
                checked={includeSource}
                onChange={(event) => setIncludeSource(event.target.checked)}
              />
              <span>Include a copy of my diagram</span>
            </label>
          </div>
        </section>

        <details className="export-advanced">
          <summary>
            <span>Advanced</span>
            <span className="export-advanced-summary">{width} × {height}px · {dpi} dpi</span>
          </summary>
          <div className="export-advanced-grid">
            <label className="export-input-label">
              <span>Zoom</span>
              <div className="export-input-with-suffix"><input type="number" min={25} max={400} value={zoom} onChange={(event) => setNumeric(setZoom, event.target.value, 25)} /><b>%</b></div>
            </label>
            <label className="export-input-label">
              <span>Size</span>
              <select
                value={size}
                onChange={(event) => {
                  const next = event.target.value as ExportSize;
                  setSize(next);
                  if (next === "diagram") setScope("all");
                  if (next === "selection" && hasSelection) setScope("selection");
                }}
              >
                <option value="diagram">Entire diagram</option>
                <option value="selection" disabled={!hasSelection}>Selection</option>
                <option value="custom">Custom dimensions</option>
              </select>
            </label>
            <label className="export-input-label">
              <span>Width</span>
              <div className="export-input-with-suffix"><input type="number" min={1} value={width} readOnly={size !== "custom"} onChange={(event) => { setSize("custom"); setNumeric(setCustomWidth, event.target.value, 1); }} /><b>px</b></div>
            </label>
            <label className="export-input-label">
              <span>Height</span>
              <div className="export-input-with-suffix"><input type="number" min={1} value={height} readOnly={size !== "custom"} onChange={(event) => { setSize("custom"); setNumeric(setCustomHeight, event.target.value, 1); }} /><b>px</b></div>
            </label>
            <label className="export-input-label">
              <span>DPI</span>
              <select value={dpi} onChange={(event) => setNumeric(setDpi, event.target.value, 36)}>
                <option value={72}>72 dpi</option>
                <option value={100}>100 dpi</option>
                <option value={150}>150 dpi</option>
                <option value={300}>300 dpi</option>
              </select>
            </label>
            <label className="export-input-label">
              <span>Border width</span>
              <div className="export-input-with-suffix"><input type="number" min={0} value={borderWidth} onChange={(event) => setNumeric(setBorderWidth, event.target.value, 0)} /><b>px</b></div>
            </label>
          </div>
          <div className="export-advanced-checks">
            <label className="export-check-row"><input type="checkbox" checked={shadow} onChange={(event) => setShadow(event.target.checked)} /><span>Shadow</span></label>
            <label className="export-check-row"><input type="checkbox" checked={grid} onChange={(event) => setGrid(event.target.checked)} /><span>Grid</span></label>
          </div>
        </details>

        <div className="export-dialog-footer">
          <div className="export-dimension-note">
            <span className="export-status-dot" />
            Auto-filled from {scope === "selection" ? "your selection" : "the full canvas"}: <strong>{width} × {height}px</strong>
          </div>
          <div className="modal-actions">
            <button type="button" className="text-button" onClick={onClose} disabled={exporting}>Cancel</button>
            <button type="submit" className="primary-button" disabled={exporting}>
              {exporting ? "Preparing…" : `Export ${formatDetails.label}`}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
