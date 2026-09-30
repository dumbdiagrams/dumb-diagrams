import { useEffect, useRef, useState } from "react";

import type { SelectionItem } from "../model/types";

export type NavigableEntity = SelectionItem & { label: string };

export function EntityNavigator({
  entities,
  selected,
  onSelect,
  onDelete,
  onFocusCanvas,
}: {
  entities: NavigableEntity[];
  selected: SelectionItem[];
  onSelect: (item: SelectionItem) => void;
  onDelete: (item: SelectionItem) => void;
  onFocusCanvas: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedKey = (item: SelectionItem) => `${item.kind}:${item.id}`;
  const selectedKeys = new Set(selected.map(selectedKey));

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!(target instanceof Node) || !rootRef.current?.contains(target)) setOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  const focusItem = (index: number) => {
    const item = entities[index];
    if (!item) return;
    onSelect(item);
    itemRefs.current[index]?.focus();
  };

  return (
    <div ref={rootRef} className="entity-navigator">
      <button
        type="button"
        className="secondary-button entity-navigator-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="entity-navigator-dialog"
        onClick={() => setOpen((current) => !current)}
      >
        Canvas items
      </button>
      {open && (
        <div
          id="entity-navigator-dialog"
          className="entity-navigator-popover"
          role="dialog"
          aria-label="Canvas items"
        >
          <button
            type="button"
            className="entity-navigator-focus"
            onClick={() => {
              setOpen(false);
              onFocusCanvas();
            }}
          >
            Focus canvas
          </button>
          <div className="entity-navigator-list" role="listbox" aria-label="Editable canvas items">
            {entities.length === 0 ? (
              <span className="entity-navigator-empty">No editable canvas items</span>
            ) : (
              entities.map((item, index) => {
                const selected = selectedKeys.has(selectedKey(item));
                return (
                  <button
                    key={selectedKey(item)}
                    ref={(element) => { itemRefs.current[index] = element; }}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    data-entity-kind={item.kind}
                    className="entity-navigator-item"
                    onClick={() => onSelect(item)}
                    onKeyDown={(event) => {
                      if (event.key === "Delete" || event.key === "Backspace") {
                        event.preventDefault();
                        onDelete(item);
                        return;
                      }
                      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
                      event.preventDefault();
                      const nextIndex = event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? entities.length - 1
                          : (index + (event.key === "ArrowDown" ? 1 : -1) + entities.length) % entities.length;
                      focusItem(nextIndex);
                    }}
                  >
                    <span className="entity-navigator-kind">{item.kind}</span>
                    <span>{item.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
