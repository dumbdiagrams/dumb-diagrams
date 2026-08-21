import { useEffect, useRef, useState } from "react";

import { IconCaret } from "../ui/icons";
import {
  exportDgmFile,
  exportPngFile,
  exportSvgFile,
} from "../state/export-actions";

export function ExportMenu({
  title,
  svg,
  source,
  getPortableSvg,
  onToast,
}: {
  title: string;
  svg: string | null;
  source: string;
  getPortableSvg: () => Promise<string>;
  onToast: (message: string) => void;
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

  const exportTitle = title || "diagram";

  const exportSvg = async () => {
    if (!svg) return;
    const result = await exportSvgFile(exportTitle, getPortableSvg);
    onToast(result.ok ? `Downloaded ${result.filename}` : "SVG export failed.");
    setOpen(false);
  };

  const exportDgm = () => {
    const result = exportDgmFile(source, exportTitle);
    onToast(result.ok ? `Downloaded ${result.filename}` : "Source export failed.");
    setOpen(false);
  };

  const exportPng = async () => {
    if (!svg) return;
    const result = await exportPngFile(exportTitle, getPortableSvg);
    onToast(result.ok ? `Downloaded ${result.filename}` : "PNG export failed.");
    setOpen(false);
  };

  return (
    <div className="export-menu" ref={ref}>
      <button type="button" className="primary-button" onClick={() => void exportSvg()}>
        Download SVG
      </button>
      <button
        type="button"
        className="primary-button caret"
        aria-label="More export formats"
        onClick={() => setOpen((value) => !value)}
      >
        <IconCaret />
      </button>
      {open && (
        <div className="export-dropdown" role="menu">
          <button type="button" onClick={() => void exportSvg()}>SVG image</button>
          <button type="button" onClick={exportDgm}>Source (.dgm)</button>
          <button type="button" onClick={exportPng}>PNG image</button>
        </div>
      )}
    </div>
  );
}
