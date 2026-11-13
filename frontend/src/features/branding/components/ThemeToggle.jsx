import { Moon, Sun } from "lucide-react";
import { useRef } from "react";
import { flushSync } from "react-dom";
import { useTheme } from "@/features/branding/context/ThemeProvider";
import { Button } from "@/components/ui/button";

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const transition = useRef(null);
  const isDark = resolvedTheme === "dark";
  const label = `Switch to ${isDark ? "light" : "dark"} mode`;

  function toggleTheme() {
    if (transition.current) return;
    const nextTheme = isDark ? "light" : "dark";
    if (!document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTheme(nextTheme);
      return;
    }

    const reveal = document.startViewTransition(() => {
      flushSync(() => setTheme(nextTheme));
    });
    transition.current = reveal;
    // A skipped transition still applies the saved theme; consume its rejection.
    reveal.ready.catch(() => {});
    const finish = () => { transition.current = null; };
    reveal.finished.then(finish, finish);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="portal-theme-toggle"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  );
}
