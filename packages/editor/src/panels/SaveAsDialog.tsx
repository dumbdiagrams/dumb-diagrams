import { forwardRef, memo, useImperativeHandle, useState, type FormEvent, type Ref } from "react";

import { DIAGRAM_LIMITS, characterLength, normalizeSingleLineText } from "@dumb-diagrams/runtime/core";
import { rejectOversizedPaste } from "../ui/text-input";
import { Modal } from "../ui/Modal";

export interface SaveAsDialogHandle {
  open: (filename: string) => void;
}

interface SaveAsDialogProps {
  onSave: (filename: string) => Promise<boolean>;
  onLimitExceeded: () => void;
}

function SaveAsDialogComponent({ onSave, onLimitExceeded }: SaveAsDialogProps, ref: Ref<SaveAsDialogHandle>) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      open: (filename) => {
        setDraft(filename);
        setSaving(false);
        setOpen(true);
      },
    }),
    [],
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const filename = normalizeSingleLineText(draft);
    setDraft(filename);
    setSaving(true);
    try {
      if (await onSave(filename)) setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Save diagram as"
      subtitle="Choose the filename for the new .dgm source."
      onClose={() => setOpen(false)}
      className="save-as-dialog"
      width={440}
    >
      <form className="save-as-form" onSubmit={(event) => void submit(event)}>
        <label htmlFor="save-as-filename">Filename</label>
        <input
          id="save-as-filename"
          data-autofocus
          value={draft}
          maxLength={DIAGRAM_LIMITS.filenameCharacters}
          onChange={(event) => setDraft(event.target.value)}
          onPaste={(event) => rejectOversizedPaste(event, DIAGRAM_LIMITS.filenameCharacters, onLimitExceeded)}
          placeholder="diagram.dgm"
          aria-describedby="save-as-limit"
        />
        <span id="save-as-limit" className="input-limit" aria-live="polite">
          {characterLength(draft)} / {DIAGRAM_LIMITS.filenameCharacters}
        </span>
        <div className="modal-actions">
          <button type="button" className="text-button" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={!draft.trim() || saving}>
            {saving ? "Saving…" : "Save .dgm"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export const SaveAsDialog = memo(forwardRef(SaveAsDialogComponent));
