import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react";

const STORAGE_KEY = "promotion-theme";
const SYSTEM_QUERY = "(prefers-color-scheme: dark)";
const ThemeContext = createContext(null);
const validTheme = value => ["light", "dark", "system"].includes(value) ? value : "system";

function readPreference() {
  try { return validTheme(localStorage.getItem(STORAGE_KEY)); }
  catch { return "system"; }
}

function getSystemTheme() {
  try {
    return window.matchMedia && window.matchMedia(SYSTEM_QUERY).matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

function resolveTheme(preference, systemTheme) {
  if (preference === "dark") return "dark";
  if (preference === "light") return "light";
  // Default: dark only if browser/OS theme is dark, otherwise light
  return systemTheme === "dark" ? "dark" : "light";
}

function applyTheme(theme) {
  const root = document.documentElement;
  const targetTheme = theme === "dark" ? "dark" : "light";
  root.classList.remove("light", "dark");
  root.classList.add(targetTheme);
  root.style.colorScheme = targetTheme;
}

// Called before React mounts; no script elements are rendered by the provider.
export function initializeTheme() {
  const preference = readPreference();
  applyTheme(resolveTheme(preference, getSystemTheme()));
}

export function ThemeProvider({ children }) {
  const [theme, updateTheme] = useState(readPreference);
  const [systemTheme, setSystemTheme] = useState(getSystemTheme);
  const resolvedTheme = resolveTheme(theme, systemTheme);

  // A layout effect commits the class within the view-transition snapshot.
  useLayoutEffect(() => { applyTheme(resolvedTheme); }, [resolvedTheme]);

  useEffect(() => {
    if (!window.matchMedia) return;
    const media = window.matchMedia(SYSTEM_QUERY);
    const onChange = () => setSystemTheme(media.matches ? "dark" : "light");
    media.addEventListener("change", onChange);
    const onStorage = event => {
      if (event.storageArea === localStorage && (event.key === STORAGE_KEY || event.key === null)) {
        updateTheme(validTheme(event.newValue));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setTheme = useCallback(value => {
    const preference = validTheme(value);
    updateTheme(preference);
    try { localStorage.setItem(STORAGE_KEY, preference); } catch { /* Keep the current session usable when storage is unavailable. */ }
  }, []);
  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
