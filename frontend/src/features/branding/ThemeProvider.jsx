import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react";

const STORAGE_KEY = "promotion-theme";
const SYSTEM_QUERY = "(prefers-color-scheme: dark)";
const ThemeContext = createContext(null);
const validTheme = value => ["light", "dark", "system"].includes(value) ? value : "system";

function readPreference() {
  try { return validTheme(localStorage.getItem(STORAGE_KEY)); }
  catch { return "system"; }
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
  root.style.colorScheme = theme;
}

// Called before React mounts; no script elements are rendered by the provider.
export function initializeTheme() {
  const preference = readPreference();
  applyTheme(preference === "system" ? (window.matchMedia(SYSTEM_QUERY).matches ? "dark" : "light") : preference);
}

export function ThemeProvider({ children }) {
  const [theme, updateTheme] = useState(readPreference);
  const [systemTheme, setSystemTheme] = useState(() => window.matchMedia(SYSTEM_QUERY).matches ? "dark" : "light");
  const resolvedTheme = theme === "system" ? systemTheme : theme;

  // A layout effect commits the class within the view-transition snapshot.
  useLayoutEffect(() => { applyTheme(resolvedTheme); }, [resolvedTheme]);

  useEffect(() => {
    const media = window.matchMedia(SYSTEM_QUERY);
    const onChange = () => setSystemTheme(media.matches ? "dark" : "light");
    onChange();
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
