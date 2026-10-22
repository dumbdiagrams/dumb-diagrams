import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  SourceDrawer,
  sourceDiagnostic,
  sourceEditorAccessibilityAttributes,
  sourceEditorAccessibilityExtension,
} from "./SourceDrawer";

describe("source editor diagnostics", () => {
  it("converts parser line and column into an editor offset", () => {
    expect(
      sourceDiagnostic("first\nsecond\nthird", {
        message: 'Unexpected character "!"',
        location: { line: 2, column: 2 },
      }),
    ).toEqual({
      message: 'Line 2, column 2: Unexpected character "!"',
      location: { offset: 7, line: 2, column: 2 },
    });
  });

  it("keeps diagnostics without locations unchanged", () => {
    expect(sourceDiagnostic("diagram demo {}", { message: "Unterminated block; expected }" })).toEqual({
      message: "Unterminated block; expected }",
    });
  });

  it("configures the actual CodeMirror contenteditable with an accessible name", () => {
    expect(sourceEditorAccessibilityAttributes(true)).toEqual({
      "aria-label": "Diagram source",
      "aria-describedby": "source-editor-diagnostics",
    });
    expect(sourceEditorAccessibilityExtension(true)).toBeDefined();

    const html = renderToStaticMarkup(
      <SourceDrawer
        source={"diagram demo {\n  grammar aws\n  !\n}"}
        issues={[{ message: 'Unexpected character "!"', location: { line: 3, column: 3 } }]}
        onChange={vi.fn()}
        onCommit={vi.fn()}
        onCopy={vi.fn()}
        onFormat={vi.fn()}
      />,
    );

    expect(html).toContain("Line 3, column 3");
    expect(html).toContain('title="Jump to line 3, column 3"');
  });
});
