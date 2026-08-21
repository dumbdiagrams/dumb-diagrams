import { useEffect, useRef, useState, type ComponentType, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { IconCaret } from "./icons";

export interface TopMenuItem {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  onSelect?: () => void;
  submenu?: TopMenuItem[];
}

export function TopMenu({
  label,
  items,
  Icon,
  iconOnly = false,
}: {
  label: string;
  items: TopMenuItem[];
  Icon?: ComponentType<{ width?: number; height?: number }>;
  iconOnly?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const submenuRefs = useRef(new Map<string, Array<HTMLButtonElement | null>>());
  const [open, setOpen] = useState(false);

  const refsForMenu = (submenuFor?: string) => {
    if (!submenuFor) return itemRefs.current;
    const refs = submenuRefs.current.get(submenuFor) ?? [];
    submenuRefs.current.set(submenuFor, refs);
    return refs;
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    window.setTimeout(() => {
      const first = itemRefs.current.find((item) => item && !item.disabled);
      first?.focus();
    }, 0);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const focusSibling = (refs: Array<HTMLButtonElement | null>, index: number, direction: 1 | -1) => {
    const enabled = refs
      .map((item, itemIndex) => item && !item.disabled ? itemIndex : -1)
      .filter((itemIndex) => itemIndex >= 0);
    if (!enabled.length) return;
    const current = enabled.indexOf(index);
    const next = enabled[(current + direction + enabled.length) % enabled.length]!;
    refs[next]?.focus();
  };

  const handleItemKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    item: TopMenuItem,
    index: number,
    refs: Array<HTMLButtonElement | null>,
    submenuFor?: string,
  ) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusSibling(refs, index, 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusSibling(refs, index, -1);
    } else if (event.key === "Home") {
      event.preventDefault();
      refs.find((candidate) => candidate && !candidate.disabled)?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      [...refs].reverse().find((candidate) => candidate && !candidate.disabled)?.focus();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (item.submenu) return;
      if (!item.disabled) {
        item.onSelect?.();
        close();
      }
    } else if (event.key === "ArrowRight" && item.submenu) {
      event.preventDefault();
      refsForMenu(item.id).find((candidate) => candidate && !candidate.disabled)?.focus();
    } else if (event.key === "ArrowLeft" && submenuFor) {
      event.preventDefault();
      menuRef.current?.querySelector<HTMLButtonElement>(
        `[data-submenu-for="${CSS.escape(submenuFor)}"] > button`,
      )?.focus();
    }
  };

  const renderItems = (menuItems: TopMenuItem[], submenuFor?: string) => {
    const submenu = Boolean(submenuFor);
    const refs = refsForMenu(submenuFor);
    return (
    <div
      className={submenu ? "top-menu-submenu" : "top-menu-dropdown"}
      role="menu"
      aria-label={submenu ? `${label} ${menuItems[0]?.id ?? "submenu"}` : label}
    >
      {menuItems.map((item, index) => {
        if (item.separator) {
          return <div key={item.id} className="top-menu-separator" role="separator" />;
        }
        const hasSubmenu = Boolean(item.submenu?.length);
        return (
          <div
            key={item.id}
            className="top-menu-item-wrap"
            data-submenu-for={hasSubmenu ? item.id : undefined}
            onPointerEnter={(event) => {
              if (!hasSubmenu) return;
              const target = event.currentTarget.querySelector<HTMLButtonElement>("button");
              target?.focus();
            }}
          >
            <button
              ref={(element) => {
                refs[index] = element;
              }}
              type="button"
              role="menuitem"
              className={`top-menu-item${item.danger ? " is-danger" : ""}`}
              disabled={item.disabled}
              aria-label={item.label}
              aria-keyshortcuts={item.shortcut}
              aria-haspopup={hasSubmenu ? "menu" : undefined}
              onClick={() => {
                if (item.disabled || hasSubmenu) return;
                item.onSelect?.();
                close();
              }}
              onKeyDown={(event) => handleItemKeyDown(event, item, index, refs, submenuFor)}
            >
              <span>{item.label}</span>
              {item.shortcut && <kbd>{item.shortcut}</kbd>}
              {hasSubmenu && <IconCaret className="top-menu-caret" />}
            </button>
            {hasSubmenu && renderItems(item.submenu!, item.id)}
          </div>
        );
      })}
    </div>
    );
  };

  return (
    <div ref={rootRef} className="top-menu">
      <button
        ref={triggerRef}
        type="button"
        className={`top-menu-trigger${iconOnly ? " top-menu-trigger-icon-only" : ""}`}
        aria-label={iconOnly ? label : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || (!open && (event.key === "Enter" || event.key === " "))) {
            event.preventDefault();
            setOpen(true);
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            close();
          }
        }}
      >
        {Icon && <Icon width={16} height={16} />}
        <span className={iconOnly ? "sr-only" : undefined}>{label}</span>
      </button>
      {open && <div ref={menuRef}>{renderItems(items)}</div>}
    </div>
  );
}
