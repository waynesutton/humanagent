export type ThemeMode = "light" | "dark";

const THEME_STORAGE_KEY = "humanagent-theme";

export function getStoredTheme(): ThemeMode | null {
  const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
  return raw === "dark" || raw === "light" ? raw : null;
}

export function applyTheme(theme: ThemeMode) {
  document.documentElement.setAttribute("data-theme", theme);
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function initializeTheme() {
  const stored = getStoredTheme();
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme: ThemeMode = stored ?? (prefersDark ? "dark" : "light");
  applyTheme(theme);
  return theme;
}
