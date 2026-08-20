import { useEffect, useRef, useState } from "react";

import { IconCaret } from "../ui/icons";

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

  const filename = sanitizeFilename(title || "diagram");

  const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportSvg = async () => {
    if (!svg) return;
    const portable = await getPortableSvg();
    download(new Blob([portable], { type: "image/svg+xml" }), `${filename}.svg`);
    onToast(`Downloaded ${filename}.svg`);
    setOpen(false);
  };

  const exportArch = () => {
    download(new Blob([source], { type: "text/plain" }), `${filename}.arch`);
    onToast(`Downloaded ${filename}.arch`);
    setOpen(false);
  };

  const exportPng = async () => {
    if (!svg) return;
    const portable = await getPortableSvg();
    const image = new Image();
    const url = URL.createObjectURL(new Blob([portable], { type: "image/svg+xml" }));
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(image, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) download(blob, `${filename}.png`);
        URL.revokeObjectURL(url);
        onToast(`Downloaded ${filename}.png`);
        setOpen(false);
      });
    };
    image.src = url;
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
          <button type="button" onClick={exportArch}>Source (.arch)</button>
          <button type="button" onClick={exportPng}>PNG image</button>
        </div>
      )}
    </div>
  );
}

function sanitizeFilename(value: string): string {
  return value.trim().replace(/[^\w.-]+/g, "-").replace(/^-|-$/g, "") || "diagram";
}
