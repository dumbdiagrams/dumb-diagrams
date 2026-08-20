import { useEffect, useRef } from "react";

export interface ContextMenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  shortcut?: string;
  danger?: boolean;
  separator?: boolean;
  onSelect?: () => void;
}

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, []);

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: x, top: y }}
      role="menu"
      aria-label="Canvas context menu"
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        item.separator ? (
          <div key={item.id} className="context-menu-separator" role="separator" />
        ) : (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className={`context-menu-item${item.danger ? " is-danger" : ""}`}
            disabled={item.disabled}
            aria-keyshortcuts={item.shortcut}
            onClick={() => {
              if (item.disabled) return;
              item.onSelect?.();
              onClose();
            }}
          >
            <span>{item.label}</span>
            {item.shortcut && <kbd>{item.shortcut}</kbd>}
          </button>
        )
      ))}
    </div>
  );
}
