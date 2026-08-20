import { useEffect, useRef, useState } from "react";

import { IconMonitor, IconMoon, IconSun } from "./icons";
import {
  applyTheme,
  getStoredTheme,
  setStoredTheme,
  type ThemePreference,
} from "./theme";

const OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  Icon: typeof IconSun;
}> = [
  { value: "system", label: "System", Icon: IconMonitor },
  { value: "light", label: "Light", Icon: IconSun },
  { value: "dark", label: "Dark", Icon: IconMoon },
];

export function ThemeControl() {
  const [theme, setTheme] = useState<ThemePreference>(() => getStoredTheme());
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    applyTheme(theme);
    setStoredTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const active = OPTIONS.find((option) => option.value === theme) ?? OPTIONS[0];

  return (
    <div className="theme-control" ref={rootRef}>
      <button
        type="button"
        className="icon-button"
        onClick={() => setOpen((value) => !value)}
        title="Theme"
        aria-label="Theme"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <active.Icon />
      </button>
      {open && (
        <div className="theme-menu" role="menu" aria-label="Choose theme">
          {OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitem"
              className={theme === option.value ? "is-active" : ""}
              onClick={() => {
                setTheme(option.value);
                setOpen(false);
              }}
            >
              <option.Icon />
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
