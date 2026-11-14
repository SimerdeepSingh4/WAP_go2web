import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react";

const STORAGE_KEY = "promotion-theme";
const ThemeContext = createContext(null);
const validTheme = value => value === "dark" ? "dark" : "light";

function readPreference() {
  try { return validTheme(localStorage.getItem(STORAGE_KEY)); }
  catch { return "light"; }
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
  applyTheme(readPreference());
}

export function ThemeProvider({ children }) {
  const [theme, updateTheme] = useState(readPreference);
  const resolvedTheme = theme;

  // A layout effect commits the class within the view-transition snapshot.
  useLayoutEffect(() => { applyTheme(resolvedTheme); }, [resolvedTheme]);

  useEffect(() => {
    const onStorage = event => {
      if (event.storageArea === localStorage && (event.key === STORAGE_KEY || event.key === null)) {
        updateTheme(validTheme(event.newValue));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
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
