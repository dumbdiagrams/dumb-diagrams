import { Modal } from "../ui/Modal";
import { CreditsNotice } from "./CreditsNotice";

export function HelpModal({
  open,
  onClose,
  onExamples,
}: {
  open: boolean;
  onClose: () => void;
  onExamples: () => void;
}) {
  return (
    <Modal
      open={open}
      title="DumbDiagrams Studio help"
      subtitle="Workflow, shortcuts, and credits."
      onClose={onClose}
      className="help-modal"
      width={700}
    >
      <div className="help-content">
        <section>
          <h3>Source-first workflow</h3>
          <p>
            A <code>.dgm</code> file is the source of truth. Open it from anywhere, edit it in Source or with an agent,
            then return to the canvas.
          </p>
        </section>
        <section>
          <h3>Refine your draft</h3>
          <p>
            Move items on the canvas. Warnings flag overlaps; Auto-fix repairs them, and Undo restores your previous
            edit.
          </p>
        </section>
        <section>
          <h3>Keyboard shortcuts</h3>
          <div className="shortcut-grid">
            <Shortcut keys="⌘/Ctrl+N" label="New diagram" />
            <Shortcut keys="⌘/Ctrl+O" label="Open .dgm" />
            <Shortcut keys="⌘/Ctrl+S" label="Save .dgm" />
            <Shortcut keys="⌘/Ctrl+W" label="Close tab" />
            <Shortcut keys="⌘/Ctrl+K" label="Command palette" />
            <Shortcut keys="⌘/Ctrl+Z" label="Undo" />
            <Shortcut keys="⌘/Ctrl+Shift+Z" label="Redo" />
            <Shortcut keys="V / T" label="Select / text" />
            <Shortcut keys="⌘/Ctrl+G" label="Group selection" />
            <Shortcut keys="⌘/Ctrl+Shift+G" label="Ungroup selection" />
            <Shortcut keys="⌘/Ctrl+C" label="Copy selection" />
            <Shortcut keys="⌘/Ctrl+V" label="Paste selection" />
          </div>
        </section>
        <section className="help-examples-callout">
          <div>
            <h3>Try an example</h3>
            <p>Open a bundled diagram in a fresh tab.</p>
          </div>
          <button type="button" className="text-button" onClick={onExamples}>
            Browse examples
          </button>
        </section>
        <section className="help-about">
          <h3>About</h3>
          <p>
            © 2026 DumbDiagrams contributors. Licensed under AGPL-3.0-only, without warranty.{" "}
            <a href="./LICENSE" target="_blank" rel="noreferrer">
              Full license
            </a>
          </p>
          <CreditsNotice />
        </section>
      </div>
    </Modal>
  );
}

function Shortcut({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="shortcut-row">
      <kbd>{keys}</kbd>
      <span>{label}</span>
    </div>
  );
}
