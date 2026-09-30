import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

export type StudioIssue = {
  severity: "error" | "warning";
  message: string;
  elementIds?: string[];
  location?: { line: number; column: number };
};

export function IssueJournal({
  issues,
  onIssueSelect,
}: {
  issues: StudioIssue[];
  onIssueSelect: (issue: StudioIssue) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const listId = "studio-issue-journal";

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    const focusTimer = window.setTimeout(() => itemRefs.current[0]?.focus(), 0);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  if (issues.length === 0) {
    return <span className="status-pill">Valid</span>;
  }

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.length - errorCount;
  const summary = [
    errorCount ? `${errorCount} error${errorCount === 1 ? "" : "s"}` : "",
    warningCount ? `${warningCount} warning${warningCount === 1 ? "" : "s"}` : "",
  ].filter(Boolean).join(", ");
  const countLabel = errorCount && warningCount ? summary : errorCount ? `${errorCount} error${errorCount === 1 ? "" : "s"}` : `${warningCount} warning${warningCount === 1 ? "" : "s"}`;

  const handleIssueKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? issues.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : -1) + issues.length) % issues.length;
    itemRefs.current[nextIndex]?.focus();
  };

  return (
    <div ref={rootRef} className="issue-journal">
      <button
        ref={triggerRef}
        type="button"
        className={`status-pill issue-journal-trigger${errorCount ? " has-errors" : " has-warnings"}`}
        aria-expanded={open}
        aria-controls={listId}
        aria-label={countLabel}
        title="Open diagram warnings and errors"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="issue-journal-mark" aria-hidden="true">!</span>
        {countLabel}
      </button>
      {open && (
        <div id={listId} className="issue-journal-popover" role="menu" aria-label="Diagram issues">
          <div className="issue-journal-summary" role="status">{summary}</div>
          <div className="issue-journal-list">
            {issues.map((issue, index) => (
              <button
                key={`${issue.severity}-${issue.message}-${index}`}
                ref={(element) => { itemRefs.current[index] = element; }}
                type="button"
                role="menuitem"
                className={`issue-journal-item is-${issue.severity}`}
                onClick={() => {
                  setOpen(false);
                  onIssueSelect(issue);
                }}
                onKeyDown={(event) => handleIssueKeyDown(event, index)}
              >
                <span className="issue-journal-item-kind">
                  {issue.severity === "error" ? "Error" : "Warning"}
                </span>
                <span className="issue-journal-item-message">{issue.message}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
