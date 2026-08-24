import { Modal } from "../ui/Modal";

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
      subtitle="A visual editor for deterministic, agent-friendly diagrams."
      onClose={onClose}
      className="help-modal"
      width={700}
    >
      <div className="help-content">
        <section>
          <h3>Source-first workflow</h3>
          <p>
            The <code>.dgm</code> source is the portable source of truth. Edit it in the Source tool,
            import it from a repository, or let an LLM update it and then reload the visual result.
          </p>
          <p>
            Run <code>dumbdiagrams studio diagrams</code> for a local project workflow, or pass one
            `.dgm` path directly. Studio lets you select among files in that folder, writes the
            selected file directly, watches for edits from an agent or another editor, and asks
            before replacing a newer disk revision.
          </p>
          <p>
            Keep one diagram per file. For a new request, create a new `.dgm` under <code>diagrams/</code>;
            edit an existing file only when the user explicitly names it.
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
            <Shortcut keys="V / C / T" label="Select / connector / text" />
            <Shortcut keys="⌘/Ctrl+C" label="Copy selection" />
            <Shortcut keys="⌘/Ctrl+V" label="Paste selection" />
          </div>
        </section>
        <section className="help-examples-callout">
          <div>
            <h3>Need a starting point?</h3>
            <p>Browse the bundled diagram examples and open one in a fresh tab.</p>
          </div>
          <button type="button" className="text-button" onClick={onExamples}>Browse examples</button>
        </section>
        <section className="help-about">
          <h3>About</h3>
          <p>Dumb Diagrams Studio · deterministic diagrams for people and LLMs.</p>
          <p>
            Copyright © 2026 DumbDiagrams contributors. This program is free
            software under the GNU AGPL v3 and comes without warranty. You may
            redistribute and modify it under that license.{" "}
            <a href="./LICENSE" target="_blank" rel="noreferrer">View license</a>.
          </p>
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
