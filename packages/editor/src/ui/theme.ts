export type ThemePreference = "light" | "dark";

const STORAGE_KEY = "dumb-diagrams-theme";

export function getStoredTheme(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return "light";
}

export function setStoredTheme(theme: ThemePreference): void {
  localStorage.setItem(STORAGE_KEY, theme);
}

export function applyTheme(theme: ThemePreference): void {
  document.documentElement.setAttribute("data-theme", theme);
}

export function initTheme(): ThemePreference {
  const theme = getStoredTheme();
  applyTheme(theme);
  return theme;
}
