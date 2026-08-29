import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { IssueJournal } from "./IssueJournal";

describe("Studio issue journal", () => {
  it("renders a Valid status when there are no issues", () => {
    const html = renderToStaticMarkup(
      <IssueJournal issues={[]} onIssueSelect={vi.fn()} />,
    );

    expect(html).toContain('class="status-pill"');
    expect(html).toContain(">Valid</span>");
    expect(html).not.toContain("issue-journal-trigger");
  });

  it("renders an accessible issue count and severity summary", () => {
    const html = renderToStaticMarkup(
      <IssueJournal
        issues={[
          { severity: "error", message: "Source cannot be parsed" },
          { severity: "warning", message: "Edge crosses an icon", elementIds: ["e1", "node"] },
        ]}
        onIssueSelect={vi.fn()}
      />,
    );

    expect(html).toContain('type="button"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="studio-issue-journal"');
    expect(html).toContain('aria-label="1 error, 1 warning"');
    expect(html).toContain("issue-journal-trigger has-errors");
    expect(html).toContain(">1 error, 1 warning</button>");
  });

  it("uses severity labels for homogeneous journals", () => {
    const html = renderToStaticMarkup(<IssueJournal issues={[{ severity: "warning", message: "Crossing" }]} onIssueSelect={vi.fn()} />);
    expect(html).toContain('aria-label="1 warning"');
    expect(html).toContain(">1 warning</button>");
  });
});
