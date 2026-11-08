import { useEffect, useState } from "react";

import { Modal } from "../ui/Modal";
import { isTabDirty, type WorkspaceTab } from "../state/workspace";

export function RecycleBinModal({
  open,
  tabs,
  getLabel,
  onClose,
  onRestore,
  onRemove,
  onClear,
}: {
  open: boolean;
  tabs: WorkspaceTab[];
  getLabel: (tab: WorkspaceTab) => string;
  onClose: () => void;
  onRestore: (tabId: string) => void;
  onRemove: (tabId: string) => void;
  onClear: () => void;
}) {
  const [contentReady, setContentReady] = useState(false);

  useEffect(() => {
    if (!open) {
      setContentReady(false);
      return;
    }
    const frame = window.requestAnimationFrame(() => setContentReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  return (
    <Modal
      open={open}
      title="Recycle bin"
      subtitle="The latest 10 closed diagrams are kept here for recovery."
      onClose={onClose}
      width={560}
    >
      {!contentReady ? (
        <div className="recycle-bin-loading" role="status">
          <span className="loading-spinner" aria-hidden="true" />
          <strong>Loading recycle bin…</strong>
          <span>Checking your recoverable diagrams</span>
        </div>
      ) : tabs.length === 0 ? (
        <div className="recycle-bin-empty">
          <strong>Recycle bin is empty</strong>
          <span>Closed diagrams that are discarded from the workspace will appear here.</span>
        </div>
      ) : (
        <div className="recycle-bin-modal">
          <div className="recycle-bin-toolbar">
            <span>
              {tabs.length} recoverable diagram{tabs.length === 1 ? "" : "s"}
            </span>
            <button type="button" className="text-button" onClick={onClear}>
              Empty recycle bin
            </button>
          </div>
          <div className="recycle-bin-list" role="list" aria-label="Recoverable diagrams">
            {tabs.map((tab) => {
              const label = getLabel(tab);
              return (
                <div key={tab.id} className="recycle-bin-item" role="listitem">
                  {tab.previewSvg ? (
                    <div
                      className="recycle-bin-preview"
                      role="img"
                      aria-label={`Preview of ${label}`}
                      dangerouslySetInnerHTML={{ __html: tab.previewSvg }}
                    />
                  ) : (
                    <div className="recycle-bin-preview recycle-bin-preview-empty" aria-hidden="true">
                      No preview
                    </div>
                  )}
                  <div className="recycle-bin-item-copy">
                    <strong>{label}</strong>
                    <span>
                      {tab.filename ?? "Untitled diagram"}
                      {isTabDirty(tab) ? " · Unsaved changes" : " · Saved"}
                    </span>
                  </div>
                  <button type="button" className="primary-button" onClick={() => onRestore(tab.id)}>
                    Restore
                  </button>
                  <button type="button" className="text-button" onClick={() => onRemove(tab.id)}>
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
}
