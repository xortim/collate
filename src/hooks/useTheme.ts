import { useEffect } from "react";
import { useAppStore } from "@/store";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function applyTheme(isDark: boolean) {
  document.documentElement.classList.toggle("dark", isDark);
  document.documentElement.style.removeProperty("background-color");
}

/**
 * Mount once at the App root. Reads theme from the store, resolves 'system'
 * via matchMedia, and keeps the <html> dark class in sync.
 */
export function useTheme() {
  const theme = useAppStore((s) => s.theme);

  useEffect(() => {
    if (theme !== "system") {
      applyTheme(theme === "dark");
      return;
    }

    const mq = window.matchMedia(DARK_QUERY);
    applyTheme(mq.matches);

    const handler = (e: MediaQueryListEvent) => applyTheme(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);
}
