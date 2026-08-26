import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "./ErrorBoundary";

describe("UI crash recovery", () => {
  it("renders the editor unchanged while healthy", () => {
    const boundary = new ErrorBoundary({ children: "healthy editor" });
    expect(boundary.render()).toBe("healthy editor");
  });

  it("renders an escaped recovery message and records the component failure", () => {
    const error = new Error("Unexpected <diagram> failure");
    const boundary = new ErrorBoundary({ children: "editor" });
    boundary.state = ErrorBoundary.getDerivedStateFromError(error);
    const html = renderToStaticMarkup(boundary.render());
    expect(html).toContain('role="alert"');
    expect(html).toContain("Reload Studio");
    expect(html).toContain("Unexpected &lt;diagram&gt; failure");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      boundary.componentDidCatch(error, { componentStack: "at App" });
      expect(log).toHaveBeenCalledWith("Dumb Diagrams UI crashed", error, "at App");
    } finally {
      log.mockRestore();
    }
  });
});
