import { Modal } from "../ui/Modal";

export function ProjectFilesModal({
  open,
  files,
  activeFileName,
  loading,
  openingFileName,
  error,
  onClose,
  onRefresh,
  onOpen,
}: {
  open: boolean;
  files: string[];
  activeFileName: string;
  loading: boolean;
  openingFileName: string | null;
  error: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onOpen: (fileName: string) => void;
}) {
  return (
    <Modal
      open={open}
      title="Project diagrams"
      subtitle="Choose a .dgm source from this project’s diagrams folder."
      onClose={onClose}
      width={560}
    >
      <div className="project-files-modal">
        <div className="project-files-toolbar">
          <span>
            {files.length} diagram{files.length === 1 ? "" : "s"} available
          </span>
          <button type="button" className="text-button" onClick={onRefresh} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {error && <div className="project-files-error" role="alert">{error}</div>}

        {loading && files.length === 0 ? (
          <div className="project-files-empty" role="status">
            <span className="loading-spinner" aria-hidden="true" />
            <strong>Loading project diagrams…</strong>
          </div>
        ) : files.length === 0 ? (
          <div className="project-files-empty">
            <strong>No project diagrams yet</strong>
            <span>Ask your coding agent to create a new .dgm file in this folder.</span>
          </div>
        ) : (
          <div className="project-files-list" role="list" aria-label="Project diagrams">
            {files.map((fileName) => {
              const active = fileName === activeFileName;
              const opening = fileName === openingFileName;
              return (
                <button
                  key={fileName}
                  type="button"
                  className={`project-file-item${active ? " is-active" : ""}`}
                  disabled={openingFileName !== null}
                  onClick={() => onOpen(fileName)}
                >
                  <span className="project-file-item-copy">
                    <strong>{fileName}</strong>
                    <span>{active ? "Currently open" : "Open this source file"}</span>
                  </span>
                  <span className="project-file-item-action">
                    {opening ? "Opening…" : active ? "Open" : "Select"}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <p className="project-files-hint">
          New diagrams should be separate files. Use Save As… on the connected diagram or ask your agent to create one in the project folder.
        </p>
      </div>
    </Modal>
  );
}
