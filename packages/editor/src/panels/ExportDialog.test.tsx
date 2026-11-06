import { renderToStaticMarkup } from "react-dom/server";
import { okAsync } from "neverthrow";
import { describe, expect, it, vi } from "vitest";

import { createEmptyDocument, type LayoutResult } from "@dumb-diagrams/runtime/core";

import { ExportDialog } from "./ExportDialog";

const layout = { width: 640, height: 480 } as LayoutResult;

function renderExport(format: "xml" | "svg" | "png") {
  return renderToStaticMarkup(
    <ExportDialog
      open
      initialFormat={format}
      title="Demo"
      source="diagram demo {}"
      doc={createEmptyDocument("demo")}
      layout={layout}
      selection={[]}
      getPortableSvg={vi.fn(() => okAsync("<svg />"))}
      onClose={vi.fn()}
      onToast={vi.fn()}
    />,
  );
}

describe("export capability controls", () => {
  it("hides visual controls for source/data formats", () => {
    const html = renderExport("xml");

    expect(html).not.toContain("What to include");
    expect(html).not.toContain("Appearance");
    expect(html).not.toContain("Advanced");
    expect(html).not.toContain("Transparent background");
    expect(html).not.toContain("Include a copy of my diagram");
  });

  it("keeps visual scope, appearance, and advanced controls for SVG", () => {
    const html = renderExport("svg");

    expect(html).toContain("What to include");
    expect(html).toContain("Appearance");
    expect(html).toContain("Advanced");
    expect(html).toContain("Transparent background");
    expect(html).toContain("Include a copy of my diagram");
    expect(html).not.toContain("raster limit");
    expect(html).not.toContain('max="15728"');
  });

  it("exposes the DPI-adjusted raster axis limit", () => {
    const html = renderExport("png");

    expect(html).toContain('noValidate=""');
    expect(html).toContain('max="15728"');
    expect(html).toContain("raster limit 15728px/axis at 100 dpi");
  });
});
