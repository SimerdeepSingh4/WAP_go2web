import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { applyTheme, readPreference, STORAGE_KEY, ThemeContext, validTheme } from "./theme-context";

export function ThemeProvider({ children }) {
  const [theme, updateTheme] = useState(readPreference);
  const resolvedTheme = theme;

  // A layout effect commits the class within the view-transition snapshot.
  useLayoutEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    const onStorage = (event) => {
      if (event.storageArea === localStorage && (event.key === STORAGE_KEY || event.key === null)) {
        updateTheme(validTheme(event.newValue));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setTheme = useCallback((value) => {
    const preference = validTheme(value);
    updateTheme(preference);
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      /* Keep the current session usable when storage is unavailable. */
    }
  }, []);
  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
