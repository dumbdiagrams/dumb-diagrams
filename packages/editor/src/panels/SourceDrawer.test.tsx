import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SourceDrawer, sourceDiagnostic } from "./SourceDrawer";

describe("source editor diagnostics", () => {
  it("converts parser character offsets into line and column context", () => {
    expect(sourceDiagnostic("first\nsecond\nthird", "Unexpected character \"!\" at character 8")).toEqual({
      message: "Line 2, column 2: Unexpected character \"!\" at character 8",
      location: { offset: 7, line: 2, column: 2 },
    });
  });

  it("keeps diagnostics without offsets unchanged", () => {
    expect(sourceDiagnostic("diagram demo {}", "Unterminated block; expected }")).toEqual({
      message: "Unterminated block; expected }",
    });
  });

  it("gives the CodeMirror source editor an accessible name", () => {
    const html = renderToStaticMarkup(
      <SourceDrawer
        source={'diagram demo {\n  grammar aws\n  !\n}'}
        issues={[{ message: 'Unexpected character "!" at character 31' }]}
        onChange={vi.fn()}
        onCommit={vi.fn()}
        onCopy={vi.fn()}
        onFormat={vi.fn()}
      />,
    );

    expect(html).toContain('aria-label="Diagram source"');
    expect(html).toContain("Line 3, column 2");
    expect(html).toContain('title="Jump to line 3, column 2"');
  });
});
