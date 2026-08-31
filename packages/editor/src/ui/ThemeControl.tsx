import { useEffect, useState } from "react";

import { IconMoon, IconSun } from "./icons";
import {
  applyTheme,
  getStoredTheme,
  setStoredTheme,
  type ThemePreference,
} from "./theme";

export function ThemeControl() {
  const [theme, setTheme] = useState<ThemePreference>(() => getStoredTheme());

  useEffect(() => {
    applyTheme(theme);
    setStoredTheme(theme);
  }, [theme]);

  const nextTheme: ThemePreference = theme === "light" ? "dark" : "light";
  const Icon = theme === "light" ? IconSun : IconMoon;

  return (
    <div className="theme-control">
      <button
        type="button"
        className="icon-button"
        onClick={() => setTheme(nextTheme)}
        title={`Switch to ${nextTheme} theme`}
        aria-label="Theme"
        aria-pressed={theme === "dark"}
      >
        <Icon />
      </button>
    </div>
  );
}
