import "../styles/file-sync.css";
import type { FileSyncStatus } from "../state/file-sync";

type IndicatorStatus = FileSyncStatus | "browser-only";

const messages: Record<IndicatorStatus, { label: string; description: string }> = {
  watching: {
    label: "Live",
    description:
      "Studio matches the linked file. External changes refresh automatically. Click to check for changes now.",
  },
  pending: {
    label: "Updating…",
    description: "Waiting for file changes to settle before refreshing the diagram.",
  },
  conflict: {
    label: "File changed",
    description: "The file changed on disk. Click to review before replacing your unsaved Studio edits.",
  },
  invalid: {
    label: "Waiting…",
    description: "The file is incomplete or invalid. Keeping the current diagram and retrying automatically.",
  },
  unavailable: {
    label: "Disconnected",
    description:
      "The file could not be read. Keeping the current diagram and retrying automatically. Click to retry now.",
  },
  saving: {
    label: "Saving…",
    description: "Saving Studio changes to the linked file. Wait for saving to finish before closing.",
  },
  unsaved: {
    label: "Unsaved",
    description: "Studio has changes that have not reached the linked file. Click to save now.",
  },
  "save-error": {
    label: "Save failed",
    description:
      "Studio changes could not be saved to the file. Your work is kept in the browser. Click to retry Save.",
  },
  "browser-only": {
    label: "Browser only",
    description: "This tab is not linked to a writable file. Use Save As to enable file autosave.",
  },
};

export function FileSyncIndicator({
  status,
  onReload,
  onSave,
  onSaveAs,
}: {
  status: IndicatorStatus;
  onReload: () => void;
  onSave: () => void;
  onSaveAs: () => void;
}) {
  const message = messages[status];
  const needsSave = status === "unsaved" || status === "save-error";
  const browserOnly = status === "browser-only";
  return (
    <button
      type="button"
      className={`file-sync-indicator is-${status}`}
      aria-label={browserOnly ? "Save As" : needsSave ? "Save" : "Reload from disk"}
      disabled={status === "saving"}
      aria-busy={status === "saving"}
      title={message.description}
      onClick={browserOnly ? onSaveAs : needsSave ? onSave : onReload}
    >
      <span className="file-sync-dot" aria-hidden="true" />
      <span role="status" aria-live="polite">
        {message.label}
      </span>
    </button>
  );
}
