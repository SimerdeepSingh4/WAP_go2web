import { createContext, useContext } from "react";

export const STORAGE_KEY = "promotion-theme";
export const ThemeContext = createContext(null);
export const validTheme = (value) => (value === "dark" ? "dark" : "light");

export function readPreference() {
  try {
    return validTheme(localStorage.getItem(STORAGE_KEY));
  } catch {
    return "light";
  }
}

export function applyTheme(theme) {
  const root = document.documentElement;
  const targetTheme = theme === "dark" ? "dark" : "light";
  root.classList.remove("light", "dark");
  root.classList.add(targetTheme);
  root.style.colorScheme = targetTheme;
}

// Called before React mounts; no script elements are rendered by the provider.
export function initializeTheme() {
  applyTheme(readPreference());
}

export function useTheme() {
  return useContext(ThemeContext);
}
