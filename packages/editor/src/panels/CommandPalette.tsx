import { useEffect, useMemo, useState } from "react";

import { DIAGRAM_LIMITS } from "@dumb-diagrams/core";

import { Modal } from "../ui/Modal";

export interface Command {
  id: string;
  label: string;
  section?: string;
  shortcut?: string;
  disabled?: boolean;
  onSelect: () => void;
}

export function CommandPalette({
  open,
  commands,
  onClose,
}: {
  open: boolean;
  commands: Command[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return commands.filter((command) => !command.disabled && (
      !needle || `${command.label} ${command.section ?? ""}`.toLowerCase().includes(needle)
    ));
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (selectedIndex >= filtered.length) setSelectedIndex(Math.max(0, filtered.length - 1));
  }, [filtered.length, selectedIndex]);

  return (
    <Modal
      open={open}
      title="Command palette"
      subtitle="Search actions across the Studio."
      onClose={onClose}
      className="command-palette-modal"
      width={560}
    >
      <div className="command-palette">
        <input
          data-autofocus
          type="search"
          value={query}
          maxLength={DIAGRAM_LIMITS.searchCharacters}
          placeholder="Search commands"
          aria-label="Search commands"
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setSelectedIndex((current) => Math.min(filtered.length - 1, current + 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setSelectedIndex((current) => Math.max(0, current - 1));
            } else if (event.key === "Enter") {
              event.preventDefault();
              const command = filtered[selectedIndex];
              if (command) {
                command.onSelect();
                onClose();
              }
            }
          }}
        />
        <div className="command-list" role="listbox" aria-label="Commands">
          {filtered.length ? filtered.map((command, index) => (
            <button
              key={command.id}
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
              className={index === selectedIndex ? "is-selected" : ""}
              onMouseEnter={() => setSelectedIndex(index)}
              onClick={() => {
                command.onSelect();
                onClose();
              }}
            >
              <span>
                <strong>{command.label}</strong>
                {command.section && <small>{command.section}</small>}
              </span>
              {command.shortcut && <kbd>{command.shortcut}</kbd>}
            </button>
          )) : (
            <div className="command-empty">No matching commands.</div>
          )}
        </div>
      </div>
    </Modal>
  );
}
